import { config } from '@rctf/config'
import { settings, type DatabaseClient, type EditableSettings } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import {
  ADMIN_PERMISSIONS,
  normalizeSponsorIcons,
  PageAccess,
} from '@rctf/types'
import { eq } from 'drizzle-orm'
import type { TypedRedis } from '../cache/scripts'

const VALUE_ID = 'value-0'
const RESOLVED_SETTINGS_CACHE_KEY = 'settings:resolved'
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
  const data = row?.data ?? {}
  return data.sponsors
    ? { ...data, sponsors: data.sponsors.map(normalizeSponsorIcons) }
    : data
}

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
    await setCachedResolvedSettings(redis, resolveSettings(updated))
  }

  return updated
}

export function getConfigDefaults(): EditableSettings {
  return {
    ctfName: config.ctfName,
    homeContent: config.homeContent,
    startTime: config.startTime,
    endTime: config.endTime,
    scoreboardFreezeTime: config.scoreboardFreezeTime,
    teamCreationEnabled: config.teamCreationEnabled,
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

const getCachedResolvedSettings = async (
  redis: TypedRedis
): Promise<ResolvedSettings | undefined> => {
  const cached = await redis.get(RESOLVED_SETTINGS_CACHE_KEY)
  if (!cached) {
    return undefined
  }

  try {
    const entry = JSON.parse(cached) as Partial<CachedResolvedSettings>
    if (
      entry.version !== 1 ||
      entry.defaultsSignature !== getConfigDefaultsSignature() ||
      !entry.resolved
    ) {
      await redis.del(RESOLVED_SETTINGS_CACHE_KEY)
      return undefined
    }

    return entry.resolved
  } catch {
    await redis.del(RESOLVED_SETTINGS_CACHE_KEY)
    return undefined
  }
}

const setCachedResolvedSettings = async (
  redis: TypedRedis,
  resolved: ResolvedSettings
): Promise<void> => {
  const entry: CachedResolvedSettings = {
    version: 1,
    defaultsSignature: getConfigDefaultsSignature(),
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
  await redis.del(RESOLVED_SETTINGS_CACHE_KEY)
}

export async function getResolvedSettings(
  db: DatabaseClient,
  redis?: TypedRedis
): Promise<ResolvedSettings> {
  if (redis) {
    const cached = await getCachedResolvedSettings(redis)
    if (cached) {
      return cached
    }
  }

  const resolved = resolveSettings(await getSettings(db))
  if (redis) {
    await setCachedResolvedSettings(redis, resolved)
  }
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
// The freeze lifts automatically once the competition ends.
export const getScoreboardFreezeCutoff = (
  timing: FreezeTiming,
  now: number = Date.now()
): number | null => {
  const freezeTime = timing.scoreboardFreezeTime
  if (freezeTime === null || freezeTime === undefined) {
    return null
  }
  if (
    freezeTime >= timing.endTime ||
    now < freezeTime ||
    now >= timing.endTime
  ) {
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
