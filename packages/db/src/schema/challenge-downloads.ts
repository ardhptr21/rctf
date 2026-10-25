import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

// The first time each team downloaded each attachment, reported by the
// challenge page since files are served straight from the upload host.
// Cheat detection uses it to spot solves without a download.
export const challengeDownloads = pgTable(
  'challenge_downloads',
  {
    teamId: text('team_id').notNull(),
    challengeId: text('challenge_id').notNull(),
    fileUrl: text('file_url').notNull(),
    downloadedAt: timestamp('downloaded_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
  },
  table => [
    primaryKey({
      name: 'challenge_downloads_pkey',
      columns: [table.teamId, table.challengeId, table.fileUrl],
    }),
  ]
)
