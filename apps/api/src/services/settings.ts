import { config } from '@rctf/config'
import { settings, type DatabaseClient, type EditableSettings } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import {
  ADMIN_PERMISSIONS,
  normalizeSponsorIcons,
  PageAccess,
  type IntegritySettings,
} from '@rctf/types'
import { eq } from 'drizzle-orm'
import type { TypedRedis } from '../cache/scripts'

const VALUE_ID = 'value-0'
export const RESOLVED_SETTINGS_CACHE_KEY = 'settings:resolved'
// bumped after every settings write; a cache entry built from an older
// generation is ignored, so a reader that loaded the settings just before a
// write can't put the old values back into the cache
export const SETTINGS_GENERATION_KEY = 'settings:generation'
const RESOLVED_SETTINGS_CACHE_TTL = 60_000

export type SettingsPatch = {
  [K in keyof EditableSettings]?: EditableSettings[K] | null
}

export type ResolvedSettings = ReturnType<typeof resolveSettings>
export type CompetitionTiming = Pick<ResolvedSettings, 'startTime' | 'endTime'>
export type FreezeTiming = Pick<
  ResolvedSettings,
  'startTime' | 'endTime' | 'scoreboardFreezeTime'
>

type CachedResolvedSettings = {
  version: 1
  defaultsSignature: string
  generation: string
  resolved: ResolvedSettings
}

export async function getSettings(
  db: DatabaseClient
): Promise<EditableSettings> {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.id, VALUE_ID))
    .then(takeUnique)
  const data = splitEvidenceSetting(row?.data ?? {})
  return data.sponsors
    ? { ...data, sponsors: data.sponsors.map(normalizeSponsorIcons) }
    : data
}

// Settings saved before AI links and the solver proof could be required
// separately have one setting for both; it becomes the two, and is written
// back that way on the next save.
const splitEvidenceSetting = (data: EditableSettings): EditableSettings => {
  if (data.requireSubmissionEvidence === undefined) return data
  const { requireSubmissionEvidence: both, ...rest } = data
  return {
    ...rest,
    requireAiLinks: rest.requireAiLinks ?? both,
    requireSolverProof: rest.requireSolverProof ?? both,
  }
}

const configRequiresAiLinks = (): boolean =>
  config.requireAiLinks ?? config.requireSubmissionEvidence

const configRequiresSolverProof = (): boolean =>
  config.requireSolverProof ?? config.requireSubmissionEvidence

export function patchSettings(
  current: EditableSettings,
  patch: SettingsPatch
): EditableSettings {
  const updated: EditableSettings = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete updated[key as keyof EditableSettings]
    } else if (value !== undefined) {
      ;(updated as Record<string, unknown>)[key] = value
    }
  }

  return updated
}

export async function updateSettings(
  db: DatabaseClient,
  patch: SettingsPatch,
  redis?: TypedRedis
): Promise<EditableSettings> {
  const current = await getSettings(db)
  const updated = patchSettings(current, patch)

  await db
    .insert(settings)
    .values({ id: VALUE_ID, data: updated })
    .onConflictDoUpdate({
      target: settings.id,
      set: { data: updated },
    })

  if (redis) {
    // the bump must follow the write: see SETTINGS_GENERATION_KEY
    const generation = String(await redis.incr(SETTINGS_GENERATION_KEY))
    await setCachedResolvedSettings(redis, resolveSettings(updated), generation)
  }

  return updated
}

const integrityDefaults = (): IntegritySettings => ({
  detectors: { ...config.integrity.detectors },
  sharedIpWindowHours: config.integrity.sharedIpWindowHours,
  ipAllowlist: [...config.integrity.ipAllowlist],
  alerts: config.integrity.alerts,
})

// settings saved before a detector existed don't mention it, so it falls
// back to its default instead of reading as off
const resolveIntegrity = (
  saved: Partial<IntegritySettings> | undefined
): IntegritySettings => {
  const defaults = integrityDefaults()
  if (!saved) return defaults
  return {
    ...defaults,
    ...saved,
    detectors: { ...defaults.detectors, ...saved.detectors },
  }
}

export const integrityAlertsConfigured = (): boolean =>
  config.integrity.alertDestinations.length > 0

export function getConfigDefaults(): EditableSettings {
  return {
    ctfName: config.ctfName,
    homeContent: config.homeContent,
    startTime: config.startTime,
    endTime: config.endTime,
    scoreboardFreezeTime: config.scoreboardFreezeTime,
    teamCreationEnabled: config.teamCreationEnabled,
    maxTeamSize: config.maxTeamSize,
    requireAiLinks: configRequiresAiLinks(),
    requireSolverProof: configRequiresSolverProof(),
    aiLinkPatterns: config.aiLinkPatterns,
    integrity: integrityDefaults(),
    pageAccess: config.pageAccess,
    sponsors: config.sponsors,
    meta: config.meta,
    faviconUrl: config.faviconUrl,
    logoLightUrl: config.logoLightUrl,
    logoDarkUrl: config.logoDarkUrl,
  }
}

export function resolveSettings(overrides: EditableSettings) {
  return {
    ctfName: overrides.ctfName ?? config.ctfName,
    homeContent: overrides.homeContent ?? config.homeContent,
    startTime: overrides.startTime ?? config.startTime,
    endTime: overrides.endTime ?? config.endTime,
    scoreboardFreezeTime:
      overrides.scoreboardFreezeTime ?? config.scoreboardFreezeTime ?? null,
    teamCreationEnabled:
      overrides.teamCreationEnabled ?? config.teamCreationEnabled,
    maxTeamSize: overrides.maxTeamSize ?? config.maxTeamSize,
    requireAiLinks: overrides.requireAiLinks ?? configRequiresAiLinks(),
    requireSolverProof:
      overrides.requireSolverProof ?? configRequiresSolverProof(),
    aiLinkPatterns: overrides.aiLinkPatterns ?? config.aiLinkPatterns,
    // the admin form always saves the whole object, so it replaces the
    // config defaults as a unit
    integrity: resolveIntegrity(overrides.integrity),
    pageAccess: {
      challenges:
        overrides.pageAccess?.challenges ??
        config.pageAccess?.challenges ??
        PageAccess.Public,
      scores:
        overrides.pageAccess?.scores ??
        config.pageAccess?.scores ??
        PageAccess.Public,
    },
    sponsors: overrides.sponsors ?? config.sponsors,
    meta: {
      description: overrides.meta?.description ?? config.meta.description,
      imageUrl: overrides.meta?.imageUrl ?? config.meta.imageUrl,
    },
    faviconUrl: overrides.faviconUrl ?? config.faviconUrl ?? null,
    logoLightUrl: (overrides.logoLightUrl ?? config.logoLightUrl) || null,
    logoDarkUrl: (overrides.logoDarkUrl ?? config.logoDarkUrl) || null,
  }
}

const getConfigDefaultsSignature = (): string =>
  JSON.stringify(getConfigDefaults())

// Returns the cached settings when they belong to the current generation,
// along with that generation for a reader that has to load and cache them.
const getCachedResolvedSettings = async (
  redis: TypedRedis
): Promise<{ resolved?: ResolvedSettings; generation: string }> => {
  const [cached, storedGeneration] = await Promise.all([
    redis.get(RESOLVED_SETTINGS_CACHE_KEY),
    redis.get(SETTINGS_GENERATION_KEY),
  ])
  const generation = storedGeneration ?? '0'
  if (!cached) {
    return { generation }
  }

  try {
    const entry = JSON.parse(cached) as Partial<CachedResolvedSettings>
    if (
      entry.version !== 1 ||
      entry.defaultsSignature !== getConfigDefaultsSignature() ||
      !entry.resolved
    ) {
      await redis.del(RESOLVED_SETTINGS_CACHE_KEY)
      return { generation }
    }

    // written by a reader that loaded the settings before the last write
    if (entry.generation !== generation) {
      return { generation }
    }

    return { resolved: entry.resolved, generation }
  } catch {
    await redis.del(RESOLVED_SETTINGS_CACHE_KEY)
    return { generation }
  }
}

const setCachedResolvedSettings = async (
  redis: TypedRedis,
  resolved: ResolvedSettings,
  generation: string
): Promise<void> => {
  const entry: CachedResolvedSettings = {
    version: 1,
    defaultsSignature: getConfigDefaultsSignature(),
    generation,
    resolved,
  }

  await redis.set(
    RESOLVED_SETTINGS_CACHE_KEY,
    JSON.stringify(entry),
    'PX',
    RESOLVED_SETTINGS_CACHE_TTL
  )
}

export const invalidateResolvedSettingsCache = async (
  redis: TypedRedis
): Promise<void> => {
  await redis.incr(SETTINGS_GENERATION_KEY)
  await redis.del(RESOLVED_SETTINGS_CACHE_KEY)
}

export async function getResolvedSettings(
  db: DatabaseClient,
  redis?: TypedRedis
): Promise<ResolvedSettings> {
  if (!redis) {
    return resolveSettings(await getSettings(db))
  }

  // the generation is read before the database, so values loaded before a
  // concurrent write are cached under the old generation and then ignored
  const { resolved: cached, generation } =
    await getCachedResolvedSettings(redis)
  if (cached) {
    return cached
  }

  const resolved = resolveSettings(await getSettings(db))
  await setCachedResolvedSettings(redis, resolved, generation)
  return resolved
}

export async function getCompetitionTiming(
  db: DatabaseClient,
  redis?: TypedRedis
): Promise<CompetitionTiming> {
  const { startTime, endTime } = await getResolvedSettings(db, redis)
  return { startTime, endTime }
}

// Returns the solve cutoff (unix ms) while the scoreboard is frozen, or null.
// The freeze stays on after the competition ends, until an admin clears it.
export const getScoreboardFreezeCutoff = (
  timing: FreezeTiming,
  now: number = Date.now()
): number | null => {
  const freezeTime = timing.scoreboardFreezeTime
  if (freezeTime === null || freezeTime === undefined) {
    return null
  }
  if (freezeTime >= timing.endTime || now < freezeTime) {
    return null
  }
  return freezeTime
}

export const isAdminUser = (
  user: { perms: number } | undefined | null
): boolean => !!user && (user.perms & ADMIN_PERMISSIONS) !== 0

// Cutoff to apply when `viewer` reads other users' solves; admins see live data.
export async function getFreezeCutoffForViewer(
  db: DatabaseClient,
  redis: TypedRedis | undefined,
  viewer: { perms: number } | undefined | null
): Promise<number | null> {
  if (isAdminUser(viewer)) {
    return null
  }
  return getScoreboardFreezeCutoff(await getResolvedSettings(db, redis))
}
