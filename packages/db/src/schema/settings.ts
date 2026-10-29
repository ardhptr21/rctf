import type { IntegritySettings, PageAccess } from '@rctf/types'
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'

export interface EditableSponsor {
  name: string
  icon?: string
  iconLight?: string
  iconDark?: string
  description: string
  url?: string
}

export interface EditableSettings {
  ctfName?: string
  homeContent?: string
  startTime?: number
  endTime?: number
  scoreboardFreezeTime?: number
  teamCreationEnabled?: boolean
  maxTeamSize?: number
  requireAiLinks?: boolean
  requireSolverProof?: boolean
  // the older single setting for both; getSettings turns it into the two
  // above, so nothing else reads it
  requireSubmissionEvidence?: boolean
  aiLinkPatterns?: string[]
  integrity?: IntegritySettings
  pageAccess?: {
    challenges?: PageAccess
    scores?: PageAccess
  }
  sponsors?: EditableSponsor[]
  meta?: {
    description?: string
    imageUrl?: string
  }
  faviconUrl?: string
  logoLightUrl?: string
  logoDarkUrl?: string
}

export const settings = pgTable('settings', {
  id: text().primaryKey().notNull(),
  data: jsonb().$type<EditableSettings>().notNull(),
})
