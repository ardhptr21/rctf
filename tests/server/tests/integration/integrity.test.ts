import { config } from '@rctf/config'
import {
  challengeDownloads,
  challenges,
  createDatabase,
  integrityCases,
  integritySignals,
  settings,
  submissions,
} from '@rctf/db'
import {
  BadBody,
  BadIntegrityCaseNotFound,
  BadPerms,
  GoodAdminIntegrityCase,
  GoodAdminIntegrityCases,
  GoodAdminIntegrityCaseUpdate,
  GoodAdminSettings,
  GoodAdminSettingsUpdate,
  GoodChallengeDownload,
  IntegrityCaseStatus,
  IntegritySeverity,
  IntegritySignalKind,
  Permissions,
  SubmissionKind,
  SubmissionResult,
  type IntegritySettings,
} from '@rctf/types'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { and, eq, inArray } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  scanAttempt,
  type IntegrityAttempt,
} from '../../../../apps/api/src/services/integrity'
import { alertNewSignals } from '../../../../apps/api/src/services/integrity/alerts'
import {
  getCaseDetail,
  recordSignals,
} from '../../../../apps/api/src/services/integrity/cases'
import { pairKey } from '../../../../apps/api/src/services/integrity/score'
import {
  invalidateResolvedSettingsCache,
  resolveSettings,
  updateSettings,
} from '../../../../apps/api/src/services/settings'
import { createRedis } from '../../../../apps/api/src/util/redis'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db
const HOUR = 60 * 60 * 1000

let app: Hono<any>
let adminToken: string
let challengeId: string
const cleanups: Array<() => Promise<void>> = []
const log = { error: mock(() => {}) } as any

const defaults: IntegritySettings = {
  detectors: {
    flagSharing: true,
    sharedIp: true,
    duplicateProof: true,
    duplicateAiLink: true,
    solvedWithoutDownload: true,
    unlistedAiLink: true,
    mixedAiSource: false,
  },
  sharedIpWindowHours: 24,
  ipAllowlist: [],
  alerts: false,
}

const useSettings = async (overrides: Partial<IntegritySettings> = {}) =>
  updateSettings(
    getDb(),
    { integrity: { ...defaults, ...overrides } },
    await createRedis()
  )

const newTeam = async (perms = 0) => {
  const team = await generateRealTestUser(perms)
  cleanups.push(team.cleanup)
  return team.user.id
}

// a past submission by another team, as the detectors will find it
const logSubmission = (
  teamId: string,
  fields: { ip?: string; details?: Record<string, unknown>; at?: number }
) =>
  getDb()
    .insert(submissions)
    .values({
      id: crypto.randomUUID(),
      kind: SubmissionKind.FLAG,
      challengeId,
      userId: teamId,
      ip: fields.ip ?? 'unknown',
      result: SubmissionResult.INCORRECT,
      details: fields.details ?? {},
      createdAt: new Date(fields.at ?? Date.now()).toISOString(),
    })

const attempt = (
  teamId: string,
  overrides: Partial<IntegrityAttempt> = {}
): IntegrityAttempt => ({
  teamId,
  challengeId,
  ip: 'unknown',
  flag: 'flag{nope}',
  aiLinks: [],
  proof: null,
  solved: false,
  cheatedFrom: null,
  ...overrides,
})

const scan = async (a: IntegrityAttempt) =>
  scanAttempt(getDb(), await createRedis(), log, a)

const caseFor = async (a: string, b: string | null) => {
  const [row] = await getDb()
    .select()
    .from(integrityCases)
    .where(eq(integrityCases.pairKey, pairKey(a, b)))
  return row ? getCaseDetail(getDb(), row.id) : undefined
}

const adminGet = (path: string, token = adminToken) =>
  request(app, path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

const adminPut = (path: string, body: unknown) =>
  request(app, path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  })

beforeAll(async () => {
  app = await getApp()
  const admin = await newTeam(
    Permissions.usersWrite | Permissions.challsRead | Permissions.settingsWrite
  )
  adminToken = await generateAuthToken(admin)
  const challenge = await generateChallenge()
  cleanups.push(challenge.cleanup)
  challengeId = challenge.challenge.id
})

afterEach(async () => {
  const redis = await createRedis()
  await getDb().delete(settings).where(eq(settings.id, 'value-0'))
  await invalidateResolvedSettingsCache(redis)
})

afterAll(async () => {
  await getDb().delete(integrityCases)
  for (const cleanup of cleanups.reverse()) {
    await cleanup()
  }
})

describe('integrity detectors', () => {
  test('duplicate solver proofs open a case, once per piece of evidence', async () => {
    await useSettings()
    const [a, b] = [await newTeam(), await newTeam()]
    const proof = { sha256: crypto.randomUUID(), name: 'solve.py' }
    await logSubmission(b, { details: { proof } })

    await scan(attempt(a, { proof }))
    await scan(attempt(a, { proof }))

    const kase = await caseFor(a, b)
    expect(kase?.signals).toHaveLength(1)
    expect(kase?.signals[0]).toMatchObject({
      kind: IntegritySignalKind.DUPLICATE_PROOF,
      severity: IntegritySeverity.HIGH,
      evidence: proof,
    })
    expect(kase?.score).toBe(10)
  })

  test('duplicate AI links are found, but "no ai" is not', async () => {
    await useSettings()
    const [a, b] = [await newTeam(), await newTeam()]
    const link = `https://chatgpt.com/share/${crypto.randomUUID()}`
    await logSubmission(b, { details: { aiLinks: [link, 'no ai'] } })

    await scan(attempt(a, { aiLinks: ['No AI', link] }))
    const kase = await caseFor(a, b)
    expect(kase?.signals.map(s => [s.kind, s.evidence])).toEqual([
      [IntegritySignalKind.DUPLICATE_AI_LINK, { link }],
    ])

    const [c, d] = [await newTeam(), await newTeam()]
    await logSubmission(d, { details: { aiLinks: ['no ai'] } })
    await scan(attempt(c, { aiLinks: ['no ai'] }))
    expect(await caseFor(c, d)).toBeUndefined()
  })

  test('shared IPs respect the window and the allow-list', async () => {
    const [a, b, c] = [await newTeam(), await newTeam(), await newTeam()]
    await logSubmission(b, { ip: '198.51.100.20' })
    await logSubmission(c, { ip: '198.51.100.20', at: Date.now() - 48 * HOUR })

    await useSettings({ ipAllowlist: ['198.51.100.0/24'] })
    await scan(attempt(a, { ip: '198.51.100.20' }))
    expect(await caseFor(a, b)).toBeUndefined()

    await useSettings()
    await scan(attempt(a, { ip: '198.51.100.20' }))
    expect((await caseFor(a, b))?.signals[0]?.kind).toBe(
      IntegritySignalKind.SHARED_IP
    )
    // outside the 24 hour window
    expect(await caseFor(a, c)).toBeUndefined()
  })

  test('flag sharing links the two teams', async () => {
    await useSettings()
    const [a, b] = [await newTeam(), await newTeam()]
    await scan(attempt(a, { cheatedFrom: b, flag: 'flag{b-only}' }))
    expect((await caseFor(b, a))?.signals[0]).toMatchObject({
      kind: IntegritySignalKind.FLAG_SHARING,
      evidence: { flag: 'flag{b-only}' },
    })
  })

  test('admin teams are never scanned or matched', async () => {
    await useSettings()
    const admin = await newTeam(Permissions.challsRead)
    const player = await newTeam()
    const proof = { sha256: crypto.randomUUID(), name: 'solve.py' }

    await logSubmission(player, { details: { proof } })
    await scan(attempt(admin, { proof }))
    expect(await caseFor(admin, player)).toBeUndefined()

    const other = await newTeam()
    const adminProof = { sha256: crypto.randomUUID(), name: 'x.py' }
    await logSubmission(admin, { details: { proof: adminProof } })
    await scan(attempt(other, { proof: adminProof }))
    expect(await caseFor(other, admin)).toBeUndefined()
  })

  test('detectors switched off in settings record nothing', async () => {
    const [a, b] = [await newTeam(), await newTeam()]
    const proof = { sha256: crypto.randomUUID(), name: 'solve.py' }
    await logSubmission(b, { details: { proof } })
    await useSettings({
      detectors: { ...defaults.detectors, duplicateProof: false },
    })
    await scan(attempt(a, { proof }))
    expect(await caseFor(a, b)).toBeUndefined()
  })

  test('a second kind of signal raises the score', async () => {
    await useSettings()
    const [a, b] = [await newTeam(), await newTeam()]
    const proof = { sha256: crypto.randomUUID(), name: 'solve.py' }
    const link = `https://claude.ai/share/${crypto.randomUUID()}`
    await logSubmission(b, { details: { proof, aiLinks: [link] } })
    await scan(attempt(a, { proof, aiLinks: [link] }))
    expect((await caseFor(a, b))?.score).toBe(21)
  })
})

describe('integrity routes', () => {
  const openCase = async () => {
    await useSettings()
    const [a, b] = [await newTeam(), await newTeam()]
    await scan(attempt(a, { cheatedFrom: b }))
    return (await caseFor(a, b))!
  }

  test('list, read and resolve a case', async () => {
    const kase = await openCase()

    const open = await expectResponse(
      await adminGet(
        '/api/v2/admin/integrity/cases?status=open&limit=100&offset=0'
      ),
      GoodAdminIntegrityCases
    )
    expect(open.data.cases.map((c: any) => c.id)).toContain(kase.id)

    const detail = await expectResponse(
      await adminGet(`/api/v2/admin/integrity/cases/${kase.id}`),
      GoodAdminIntegrityCase
    )
    expect(detail.data.signals).toHaveLength(1)
    expect(detail.data.kinds).toEqual([IntegritySignalKind.FLAG_SHARING])

    await expectResponse(
      await adminPut(`/api/v2/admin/integrity/cases/${kase.id}`, {
        status: IntegrityCaseStatus.DISMISSED,
        note: 'Same team, two accounts merged.',
      }),
      GoodAdminIntegrityCaseUpdate
    )
    const dismissed = await expectResponse(
      await adminGet(
        '/api/v2/admin/integrity/cases?status=dismissed&limit=100&offset=0'
      ),
      GoodAdminIntegrityCases
    )
    const row = dismissed.data.cases.find((c: any) => c.id === kase.id)
    expect(row?.note).toBe('Same team, two accounts merged.')
    expect(row?.resolvedAt).not.toBeNull()
  })

  test('rejects unknown cases and non-admins', async () => {
    await expectResponse(
      await adminGet(`/api/v2/admin/integrity/cases/${crypto.randomUUID()}`),
      BadIntegrityCaseNotFound
    )
    const player = await newTeam()
    await expectResponse(
      await adminGet(
        '/api/v2/admin/integrity/cases?status=open&limit=10&offset=0',
        await generateAuthToken(player)
      ),
      BadPerms
    )
  })
})

describe('integrity alerts', () => {
  test('alert new signals at or above the minimum, except on dismissed cases', async () => {
    const [a, b] = [await newTeam(), await newTeam()]
    const sendMarkdown = mock(async (_message: string) => {})
    const provider = {
      sendMarkdown,
      escapeText: (text: string) => text,
      escapeUrl: (text: string) => text,
    } as any

    const recorded = await recordSignals(getDb(), [
      {
        kind: IntegritySignalKind.FLAG_SHARING,
        severity: IntegritySeverity.HIGH,
        teamId: a,
        otherTeamId: b,
        challengeId,
        evidence: { flag: 'flag{x}' },
        fingerprint: 'flag',
      },
      {
        kind: IntegritySignalKind.SHARED_IP,
        severity: IntegritySeverity.MEDIUM,
        teamId: a,
        otherTeamId: b,
        challengeId: null,
        evidence: { ip: '192.0.2.1' },
        fingerprint: '192.0.2.1',
      },
    ])
    expect(recorded).toHaveLength(2)

    const options = {
      providers: [provider],
      minSeverity: IntegritySeverity.HIGH,
    }
    await alertNewSignals(getDb(), recorded, options)
    expect(sendMarkdown).toHaveBeenCalledTimes(1)
    expect(sendMarkdown.mock.calls[0]![0]).toContain('Flag sharing')
    expect(sendMarkdown.mock.calls[0]![0]).toContain(
      `/admin/integrity?case=${recorded[0]!.case.id}`
    )

    sendMarkdown.mockClear()
    await alertNewSignals(
      getDb(),
      recorded.map(entry => ({
        ...entry,
        case: { ...entry.case, status: IntegrityCaseStatus.DISMISSED },
      })),
      options
    )
    expect(sendMarkdown).not.toHaveBeenCalled()
  })
})

describe('cheat detection settings', () => {
  test('round-trip through the admin settings API', async () => {
    const integrity = {
      ...defaults,
      detectors: { ...defaults.detectors, sharedIp: false },
      ipAllowlist: ['10.0.0.0/8', '2001:db8::/32'],
    }
    const updated = await expectResponse(
      await adminPut('/api/v2/admin/settings', { data: { integrity } }),
      GoodAdminSettingsUpdate
    )
    expect(updated.data.overrides.integrity).toEqual(integrity)
    expect(updated.data.integrityAlertsConfigured).toBe(false)

    const read = await expectResponse(
      await adminGet('/api/v2/admin/settings'),
      GoodAdminSettings
    )
    expect(read.data.overrides.integrity).toEqual(integrity)
    expect(read.data.defaults.integrity.detectors.sharedIp).toBe(true)
  })

  test('rejects an invalid allow-list entry', async () => {
    await expectResponse(
      await adminPut('/api/v2/admin/settings', {
        data: { integrity: { ...defaults, ipAllowlist: ['not-an-ip'] } },
      }),
      BadBody
    )
  })

  test('allowed AI link patterns are a submission setting', async () => {
    const aiLinkPatterns = ['^https://chatgpt\\.com/share/']
    const updated = await expectResponse(
      await adminPut('/api/v2/admin/settings', { data: { aiLinkPatterns } }),
      GoodAdminSettingsUpdate
    )
    expect(updated.data.overrides.aiLinkPatterns).toEqual(aiLinkPatterns)
    expect(updated.data.overrides.integrity).toBeUndefined()

    await expectResponse(
      await adminPut('/api/v2/admin/settings', {
        data: { aiLinkPatterns: ['^https://([a-z'] },
      }),
      BadBody
    )
  })
})

describe('integrity scan on submit', () => {
  test('a v2 flag submission is scanned in the background', async () => {
    // test requests all come from one IP, which isn't the point here
    await useSettings({
      detectors: { ...defaults.detectors, sharedIp: false },
    })
    const [a, b] = [await newTeam(), await newTeam()]
    const proof = new File([`print(${crypto.randomUUID()})`], 'solve.py')
    const submit = async (teamId: string) => {
      const form = new FormData()
      form.append('flag', 'flag{wrong}')
      form.append('proof', proof)
      return request(app, `/api/v2/challs/${challengeId}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await generateAuthToken(teamId)}`,
        },
        body: form,
      })
    }

    await submit(b)
    await submit(a)
    let kase
    for (let i = 0; i < 40 && !kase; i++) {
      await Bun.sleep(50)
      kase = await caseFor(a, b)
    }
    expect(kase?.kinds).toEqual([IntegritySignalKind.DUPLICATE_PROOF])

    const signals = await getDb()
      .select()
      .from(integritySignals)
      .where(inArray(integritySignals.caseId, [kase!.id]))
    expect(signals).toHaveLength(1)
  })
})

describe('single-team detectors', () => {
  // a challenge with one attachment, made public for the download route
  const challengeWithFile = async () => {
    const generated = await generateChallenge()
    cleanups.push(generated.cleanup)
    const url = `https://files.example/${crypto.randomUUID()}/chall.zip`
    const { flag: _flag, id, ...data } = generated.challenge
    await getDb()
      .update(challenges)
      .set({ data: { ...data, files: [{ name: 'chall.zip', url }] } })
      .where(eq(challenges.id, id))
    return { id, url }
  }

  const recordDownload = async (teamId: string, id: string, url: string) =>
    request(app, `/api/v2/challs/${id}/downloads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await generateAuthToken(teamId)}`,
      },
      body: JSON.stringify({ url }),
    })

  test('a solve without downloading the attachment is flagged', async () => {
    await useSettings()
    const chall = await challengeWithFile()
    const [lazy, careful] = [await newTeam(), await newTeam()]

    await expectResponse(
      await recordDownload(careful, chall.id, chall.url),
      GoodChallengeDownload
    )
    await scan(attempt(careful, { challengeId: chall.id, solved: true }))
    expect(await caseFor(careful, null)).toBeUndefined()

    // wrong flags don't count, only solves
    await scan(attempt(lazy, { challengeId: chall.id }))
    expect(await caseFor(lazy, null)).toBeUndefined()

    await scan(attempt(lazy, { challengeId: chall.id, solved: true }))
    expect((await caseFor(lazy, null))?.signals[0]).toMatchObject({
      kind: IntegritySignalKind.SOLVED_WITHOUT_DOWNLOAD,
      challenge: { id: chall.id },
      evidence: { files: 1 },
    })
  })

  test('challenges without attachments are never flagged', async () => {
    await useSettings()
    const team = await newTeam()
    await scan(attempt(team, { solved: true }))
    expect(await caseFor(team, null)).toBeUndefined()
  })

  test('the download route only records the challenge attachments, once', async () => {
    const chall = await challengeWithFile()
    const team = await newTeam()
    await expectResponse(
      await recordDownload(team, chall.id, 'https://evil.example/x'),
      BadBody
    )
    for (let i = 0; i < 2; i++) {
      await expectResponse(
        await recordDownload(team, chall.id, chall.url),
        GoodChallengeDownload
      )
    }
    const rows = await getDb()
      .select()
      .from(challengeDownloads)
      .where(
        and(
          eq(challengeDownloads.teamId, team),
          eq(challengeDownloads.challengeId, chall.id)
        )
      )
    expect(rows.map(row => row.fileUrl)).toEqual([chall.url])
  })

  test('AI links outside the allowed patterns are flagged', async () => {
    const team = await newTeam()
    const allowed = 'https://ChatGPT.com/share/abc'
    const unlisted = `https://example.com/chat/${crypto.randomUUID()}`

    // no patterns set: nothing to compare against
    await useSettings()
    await scan(attempt(team, { aiLinks: [unlisted] }))
    expect(await caseFor(team, null)).toBeUndefined()

    // the patterns are a submission setting, not a cheat detection one
    await updateSettings(
      getDb(),
      { aiLinkPatterns: ['^https://chatgpt\\.com/share/', 'deepseek\\.com/'] },
      await createRedis()
    )
    await scan(attempt(team, { aiLinks: [allowed, unlisted, 'no ai'] }))
    const kase = await caseFor(team, null)
    expect(kase?.signals.map(s => [s.kind, s.severity, s.evidence])).toEqual([
      [
        IntegritySignalKind.UNLISTED_AI_LINK,
        IntegritySeverity.HIGH,
        { link: unlisted },
      ],
    ])
  })

  test('settings saved before these detectors existed get their defaults', () => {
    const {
      solvedWithoutDownload: _a,
      unlistedAiLink: _b,
      mixedAiSource: _c,
      ...older
    } = defaults.detectors
    const resolved = resolveSettings({
      integrity: { ...defaults, detectors: older } as IntegritySettings,
    })
    expect(resolved.integrity.detectors.solvedWithoutDownload).toBe(true)
    expect(resolved.integrity.detectors.unlistedAiLink).toBe(true)
    expect(resolved.integrity.detectors.sharedIp).toBe(true)
    // the one detector that starts off
    expect(resolved.integrity.detectors.mixedAiSource).toBe(false)
  })
})

describe('mixed AI source detector', () => {
  // only this detector, so nothing else lands in the team's case
  const onlyMixedAiSource = () =>
    useSettings({
      detectors: {
        flagSharing: false,
        sharedIp: false,
        duplicateProof: false,
        duplicateAiLink: false,
        solvedWithoutDownload: false,
        unlistedAiLink: false,
        mixedAiSource: true,
      },
    })

  // logs a submission with these links, then scans it, as a submission does
  let minute = 0
  const submitLinks = async (team: string, aiLinks: string[]) => {
    await logSubmission(team, {
      details: { aiLinks },
      at: Date.now() - 1000 * HOUR + ++minute * 60_000,
    })
    await scan(attempt(team, { aiLinks }))
  }

  const signalsFor = async (team: string) =>
    (await caseFor(team, null))?.signals.map(s => [
      s.kind,
      s.severity,
      s.evidence,
    ]) ?? []

  test('flags the site that differs from the usual one', async () => {
    await onlyMixedAiSource()
    const team = await newTeam()
    for (let i = 0; i < 4; i++) {
      await submitLinks(team, [`https://chatgpt.com/share/${i}`])
    }
    expect(await signalsFor(team)).toEqual([])

    await submitLinks(team, ['https://chat.deepseek.com/s/odd'])
    // scanning again records nothing new
    await scan(attempt(team, { aiLinks: ['https://chatgpt.com/share/0'] }))

    expect(await signalsFor(team)).toEqual([
      [
        IntegritySignalKind.MIXED_AI_SOURCE,
        IntegritySeverity.MEDIUM,
        {
          source: 'deepseek.com',
          usualSource: 'chatgpt.com',
          sourceCount: 1,
          usualCount: 4,
          link: 'https://chat.deepseek.com/s/odd',
        },
      ],
    ])
    const kase = await caseFor(team, null)
    expect(kase?.signals[0]?.challenge?.id ?? null).toBe(challengeId)
  })

  test('a tie goes to the site used first', async () => {
    await onlyMixedAiSource()
    const team = await newTeam()
    await submitLinks(team, ['https://claude.ai/share/a'])
    await submitLinks(team, ['https://gemini.google.com/share/b'])

    expect(
      (await signalsFor(team)).map(([, , evidence]) => evidence)
    ).toMatchObject([{ source: 'gemini.google.com', usualSource: 'claude.ai' }])
  })

  test('aliases, repeats, "no ai" and other teams do not count', async () => {
    await onlyMixedAiSource()
    const [team, other] = [await newTeam(), await newTeam()]
    await submitLinks(other, ['https://chat.deepseek.com/s/theirs'])
    await submitLinks(team, [
      'https://chatgpt.com/share/a',
      'https://www.ChatGPT.com/share/b',
    ])
    await submitLinks(team, ['https://chat.openai.com/share/c', 'no ai'])
    await submitLinks(team, ['no ai'])

    expect(await signalsFor(team)).toEqual([])
  })

  test('is off by default', async () => {
    await useSettings()
    const team = await newTeam()
    await submitLinks(team, ['https://chatgpt.com/share/a'])
    await submitLinks(team, ['https://chat.deepseek.com/s/b'])

    expect(
      (await signalsFor(team)).filter(
        ([kind]) => kind === IntegritySignalKind.MIXED_AI_SOURCE
      )
    ).toEqual([])
  })
})
