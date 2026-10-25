import { challengeDownloads, type DatabaseClient } from '@rctf/db'
import { getChallenge } from './challenges'

export type DownloadResult = 'recorded' | 'unknownChallenge' | 'unknownFile'

// Records a team's first download of one of a challenge's attachments.
// Only URLs listed on the challenge are kept, so the table can't be filled
// with arbitrary links.
export const recordChallengeDownload = async (
  db: DatabaseClient,
  params: { teamId: string; challengeId: string; url: string }
): Promise<DownloadResult> => {
  const challenge = await getChallenge(db, params.challengeId)
  if (!challenge) return 'unknownChallenge'
  if (!challenge.data.files.some(file => file.url === params.url)) {
    return 'unknownFile'
  }

  await db
    .insert(challengeDownloads)
    .values({
      teamId: params.teamId,
      challengeId: params.challengeId,
      fileUrl: params.url,
    })
    .onConflictDoNothing()
  return 'recorded'
}
