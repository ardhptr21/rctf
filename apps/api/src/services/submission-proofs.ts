import { submissionProofs, type DatabaseClient } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import type { FileField } from '@rctf/types'
import { eq } from 'drizzle-orm'

export type StoredProof = { sha256: string; name: string; size: number }

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

// Stores a proof file once per content hash and returns its reference.
export const storeSubmissionProof = async (
  db: DatabaseClient,
  file: FileField
): Promise<StoredProof> => {
  const data = Buffer.from(await file.arrayBuffer())
  const sha256 = new Bun.SHA256().update(data).digest('hex')

  await db
    .insert(submissionProofs)
    .values({
      sha256,
      data,
      size: data.length,
      contentType: file.type || DEFAULT_CONTENT_TYPE,
    })
    .onConflictDoNothing({ target: submissionProofs.sha256 })

  return { sha256, name: file.name, size: data.length }
}

export const getSubmissionProof = (db: DatabaseClient, sha256: string) =>
  db
    .select()
    .from(submissionProofs)
    .where(eq(submissionProofs.sha256, sha256))
    .then(takeUnique)
