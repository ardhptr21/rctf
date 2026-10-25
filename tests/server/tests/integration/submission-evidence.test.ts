import { config } from '@rctf/config'
import {
  createDatabase,
  settings,
  submissionProofs,
  submissions,
  users,
} from '@rctf/db'
import {
  BadAiLinks,
  BadFlag,
  BadPerms,
  BadProofFileSize,
  BadProofRequired,
  BadTeamBanned,
  GoodChallengesV2,
  GoodFlag,
  GoodSubmissionProof,
  Permissions,
  validateAiLinks,
} from '@rctf/types'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { and, desc, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  invalidateResolvedSettingsCache,
  updateSettings,
} from '../../../../apps/api/src/services/settings'
import { invalidateUserCache } from '../../../../apps/api/src/cache/auth-cache'
import { createRedis } from '../../../../apps/api/src/util/redis'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

const getDb = () => createDatabase(config.database.sql).db

let app: Hono<any>
let team: Awaited<ReturnType<typeof generateRealTestUser>>
let admin: Awaited<ReturnType<typeof generateRealTestUser>>
const cleanups: Array<() => Promise<void>> = []

const setRequired = async (requireSubmissionEvidence: boolean) => {
  await updateSettings(
    getDb(),
    { requireSubmissionEvidence },
    await createRedis()
  )
}

const resetSettings = async () => {
  await getDb().delete(settings).where(eq(settings.id, 'value-0'))
  await invalidateResolvedSettingsCache(await createRedis())
}

const newChallenge = async () => {
  const generated = await generateChallenge()
  cleanups.push(generated.cleanup)
  return generated.challenge
}

const proofFile = (content = `print("solve ${crypto.randomUUID()}")`) =>
  new File([content], 'solve.py', { type: 'text/x-python' })

const submitV2 = async (
  challengeId: string,
  fields: { flag: string; aiLinks?: string[]; proof?: File }
) => {
  const form = new FormData()
  form.append('flag', fields.flag)
  for (const link of fields.aiLinks ?? []) {
    form.append('aiLinks', link)
  }
  if (fields.proof) {
    form.append('proof', fields.proof)
  }
  return request(app, `/api/v2/challs/${challengeId}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await generateAuthToken(team.user.id)}`,
    },
    body: form,
  })
}

const latestSubmission = (challengeId: string) =>
  getDb()
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.challengeId, challengeId),
        eq(submissions.userId, team.user.id)
      )
    )
    .orderBy(desc(submissions.createdAt))
    .limit(1)
    .then(rows => rows[0]!)

beforeAll(async () => {
  app = await getApp()
  team = await generateRealTestUser()
  admin = await generateRealTestUser(
    Permissions.usersWrite | Permissions.challsRead
  )
})

afterEach(async () => {
  await resetSettings()
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
})

afterAll(async () => {
  await getDb().delete(submissionProofs)
  await team.cleanup()
  await admin.cleanup()
})

describe('validateAiLinks', () => {
  test('accepts http(s) links or exactly "no ai"', () => {
    expect(validateAiLinks(['https://chatgpt.com/share/abc'])).toBeNull()
    expect(
      validateAiLinks(['https://a.example/1', 'http://b.example/2'])
    ).toBeNull()
    expect(validateAiLinks(['no ai'])).toBeNull()
    expect(validateAiLinks(['  No AI  '])).toBeNull()
  })

  test('rejects empty, mixed, non-URL and too many entries', () => {
    expect(validateAiLinks([])).not.toBeNull()
    expect(validateAiLinks(['  '])).not.toBeNull()
    expect(validateAiLinks(['no ai', 'https://a.example'])).not.toBeNull()
    expect(validateAiLinks(['chatgpt'])).not.toBeNull()
    expect(validateAiLinks(['ftp://a.example/x'])).not.toBeNull()
    expect(
      validateAiLinks(
        Array.from({ length: 11 }, (_, i) => `https://a.example/${i}`)
      )
    ).not.toBeNull()
  })
})

describe('flag submission evidence', () => {
  test('a correct flag keeps the AI links and proof', async () => {
    await setRequired(true)
    const challenge = await newChallenge()
    const links = ['https://chatgpt.com/share/1', 'https://claude.ai/share/2']

    await expectResponse(
      await submitV2(challenge.id, {
        flag: challenge.flag,
        aiLinks: links,
        proof: proofFile(),
      }),
      GoodFlag
    )

    const row = await latestSubmission(challenge.id)
    expect(row.result).toBe('correct')
    expect(row.details.aiLinks).toEqual(links)
    expect(row.details.proof).toMatchObject({ name: 'solve.py' })
  })

  test('a wrong flag still keeps the AI links and proof', async () => {
    await setRequired(true)
    const challenge = await newChallenge()

    await expectResponse(
      await submitV2(challenge.id, {
        flag: 'flag{wrong}',
        aiLinks: ['no ai'],
        proof: proofFile(),
      }),
      BadFlag
    )

    const row = await latestSubmission(challenge.id)
    expect(row.result).toBe('incorrect')
    expect(row.details.aiLinks).toEqual(['no ai'])
    const proof = row.details.proof as { sha256: string }
    const stored = await getDb()
      .select()
      .from(submissionProofs)
      .where(eq(submissionProofs.sha256, proof.sha256))
    expect(stored).toHaveLength(1)
  })

  test('the same file is stored once', async () => {
    await setRequired(true)
    const challenge = await newChallenge()
    const content = `same file ${crypto.randomUUID()}`

    for (let i = 0; i < 2; i++) {
      await expectResponse(
        await submitV2(challenge.id, {
          flag: `flag{wrong-${i}}`,
          aiLinks: ['no ai'],
          proof: proofFile(content),
        }),
        BadFlag
      )
    }

    const sha256 = new Bun.SHA256().update(content).digest('hex')
    const logged = await getDb()
      .select({ details: submissions.details })
      .from(submissions)
      .where(eq(submissions.challengeId, challenge.id))
    expect(logged).toHaveLength(2)
    for (const row of logged) {
      expect((row.details.proof as { sha256: string }).sha256).toBe(sha256)
    }
    const stored = await getDb()
      .select()
      .from(submissionProofs)
      .where(eq(submissionProofs.sha256, sha256))
    expect(stored).toHaveLength(1)
  })

  test('rejects missing or invalid AI links', async () => {
    await setRequired(true)
    const challenge = await newChallenge()

    for (const aiLinks of [
      [],
      ['not a link'],
      ['no ai', 'https://a.example'],
    ]) {
      await expectResponse(
        await submitV2(challenge.id, {
          flag: challenge.flag,
          aiLinks,
          proof: proofFile(),
        }),
        BadAiLinks
      )
    }
  })

  test('rejects a missing proof', async () => {
    await setRequired(true)
    const challenge = await newChallenge()
    await expectResponse(
      await submitV2(challenge.id, {
        flag: challenge.flag,
        aiLinks: ['no ai'],
      }),
      BadProofRequired
    )
  })

  test('rejects a proof over the size limit', async () => {
    await setRequired(true)
    const challenge = await newChallenge()
    const body = await expectResponse(
      await submitV2(challenge.id, {
        flag: challenge.flag,
        aiLinks: ['no ai'],
        proof: new File([new Uint8Array(config.maxProofSize + 1)], 'huge.bin'),
      }),
      BadProofFileSize
    )
    expect(body.data.maxSize).toBe(config.maxProofSize)
  })

  test('the v1 JSON route is blocked while evidence is required', async () => {
    const challenge = await newChallenge()
    const submitV1 = async () =>
      request(app, `/api/v1/challs/${challenge.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await generateAuthToken(team.user.id)}`,
        },
        body: JSON.stringify({ flag: challenge.flag }),
      })

    await setRequired(true)
    await expectResponse(await submitV1(), BadProofRequired)

    await setRequired(false)
    await expectResponse(await submitV1(), GoodFlag)
  })

  test('evidence is optional when the requirement is off', async () => {
    await setRequired(false)
    const challenge = await newChallenge()
    await expectResponse(
      await submitV2(challenge.id, { flag: challenge.flag }),
      GoodFlag
    )
  })
})

describe('admin proof download', () => {
  test('returns the original file to admins only', async () => {
    await setRequired(true)
    const challenge = await newChallenge()
    const content = `print("admin can read ${crypto.randomUUID()}")`
    await submitV2(challenge.id, {
      flag: 'flag{wrong}',
      aiLinks: ['no ai'],
      proof: proofFile(content),
    })
    const row = await latestSubmission(challenge.id)
    const path = `/api/v2/admin/submissions/${row.id}/proof`

    const body = await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await generateAuthToken(admin.user.id)}`,
        },
      }),
      GoodSubmissionProof
    )
    expect(body.data.name).toBe('solve.py')
    expect(Buffer.from(body.data.data, 'base64').toString()).toBe(content)

    await expectResponse(
      await request(app, path, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await generateAuthToken(team.user.id)}`,
        },
      }),
      BadPerms
    )
  })
})

describe('banned teams', () => {
  test('v2 says the team is banned; v1 keeps answering badPerms', async () => {
    const challenge = await newChallenge()
    const setBanned = (banned: boolean) =>
      getDb().update(users).set({ banned }).where(eq(users.id, team.user.id))

    await setBanned(true)
    try {
      await expectResponse(
        await submitV2(challenge.id, { flag: challenge.flag }),
        BadTeamBanned
      )
      await expectResponse(
        await request(app, `/api/v1/challs/${challenge.id}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await generateAuthToken(team.user.id)}`,
          },
          body: JSON.stringify({ flag: challenge.flag }),
        }),
        BadPerms
      )
    } finally {
      await setBanned(false)
    }
  })

  test('a banned team cannot load challenges or their solvers', async () => {
    const challenge = await newChallenge()
    const setBanned = (banned: boolean) =>
      getDb().update(users).set({ banned }).where(eq(users.id, team.user.id))
    const get = async (path: string) =>
      request(app, path, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await generateAuthToken(team.user.id)}`,
        },
      })

    await setBanned(true)
    await invalidateUserCache(await createRedis(), team.user.id)
    try {
      await expectResponse(await get('/api/v2/challs'), BadTeamBanned)
      await expectResponse(await get('/api/v1/challs'), BadTeamBanned)
      await expectResponse(
        await get(`/api/v2/challs/${challenge.id}/solves?limit=10&offset=0`),
        BadTeamBanned
      )
    } finally {
      await setBanned(false)
      await invalidateUserCache(await createRedis(), team.user.id)
    }
    await expectResponse(await get('/api/v2/challs'), GoodChallengesV2)
  })
})
