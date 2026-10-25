import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// An individual participant signed in with Discord. Teams stay in `users`.
export const players = pgTable(
  'players',
  {
    id: text().primaryKey().notNull(),
    discordId: text('discord_id').notNull(),
    discordUsername: text('discord_username').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    teamId: text('team_id'),
    isCaptain: boolean('is_captain').notNull().default(false),
    // banned players can't sign in, and their sessions stop working
    banned: boolean().notNull().default(false),
    joinedTeamAt: timestamp('joined_team_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    unique('players_discord_id_key').on(table.discordId),
    index('players_team_id_index').using(
      'btree',
      table.teamId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.teamId],
      foreignColumns: [users.id],
      name: 'players_team_id_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ]
)
