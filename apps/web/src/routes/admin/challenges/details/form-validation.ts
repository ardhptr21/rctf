import {
  ChallengeScoringKind,
  logarithmicDecay,
  MAX_DECAY_SOLVES,
  UpdateChallengeRouteV2,
} from '@rctf/types'
import type { InlineArgs } from '$lib/api'
import {
  DEFAULT_FLAG_PROVIDER,
  staticFlagValue,
  type EditorFlagEntry,
  type EditorForm,
} from '../model/editor-state'

function isBlankFlagEntry(entry: EditorFlagEntry): boolean {
  return (
    entry.provider === DEFAULT_FLAG_PROVIDER &&
    staticFlagValue(entry).trim() === ''
  )
}

export interface FormErrors {
  name?: string
  category?: string
  author?: string
  description?: string
  flag?: string
  secret?: string
  decay?: string
  hints?: string
}

// a logarithmic decay starts here until the admin picks a value
export const DEFAULT_DECAY = 20

export const MAX_HINTS = 20
export const MAX_HINT_LENGTH = 10_000

const isBlankHint = (hint: string) => hint.trim() === ''

export function formErrors(form: EditorForm): FormErrors {
  const errors: FormErrors = {}
  if (form.name.trim() === '') errors.name = 'Name is required'
  if (form.category.trim() === '') errors.category = 'Category is required'
  if (form.author.trim() === '') errors.author = 'Author is required'
  if (form.description.trim() === '') {
    errors.description = 'Description is required'
  }
  if (form.scoring.kind === ChallengeScoringKind.DYNAMIC) {
    if (form.scoring.source.secret.trim() === '') {
      errors.secret = 'Webhook secret is required'
    }
  } else {
    if (form.flags.every(isBlankFlagEntry)) {
      errors.flag = 'At least one flag is required'
    }
    const decay = form.scoring.decay
    if (
      decay !== undefined &&
      (!Number.isInteger(decay) || decay < 1 || decay > MAX_DECAY_SOLVES)
    ) {
      errors.decay = `Decay must be a whole number from 1 to ${MAX_DECAY_SOLVES.toLocaleString()}`
    }
  }
  const longHint = form.hints.findIndex(hint => hint.length > MAX_HINT_LENGTH)
  if (longHint !== -1) {
    errors.hints = `Hint ${longHint + 1} is longer than ${MAX_HINT_LENGTH.toLocaleString()} characters`
  }
  return errors
}

export function hasFormErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0
}

export function detailsTabInvalid(errors: FormErrors): boolean {
  return Boolean(
    errors.name ||
    errors.category ||
    errors.author ||
    errors.description ||
    errors.flag
  )
}

export function hintsTabInvalid(errors: FormErrors): boolean {
  return Boolean(errors.hints)
}

export function scoringTabInvalid(errors: FormErrors): boolean {
  return Boolean(errors.secret || errors.decay)
}

// The value after a few solve counts, for the editor's preview: the first
// solve, the middle of the curve, and where it reaches the minimum.
export function decayPreview(
  minPoints: number,
  maxPoints: number,
  decay: number
): { solves: number; points: number }[] {
  const counts = [1, 2, Math.ceil(decay / 2) + 1, decay, decay + 1]
  return [...new Set(counts)]
    .sort((a, b) => a - b)
    .map(solves => ({
      solves,
      points: logarithmicDecay({ minPoints, maxPoints, solves, decay }),
    }))
}

export function scoringKindLocked(totalSolves: number): boolean {
  return totalSolves > 0
}

export function releaseTimeToInput(ts: number | null): string {
  if (ts === null) return ''
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function inputToReleaseTime(value: string): number | null {
  if (value === '') return null
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? null : ts
}

export function buildSavePayload(
  form: EditorForm,
  id: string
): InlineArgs<typeof UpdateChallengeRouteV2> {
  const isDynamic = form.scoring.kind === ChallengeScoringKind.DYNAMIC
  return {
    id,
    data: {
      name: form.name,
      category: form.category,
      author: form.author,
      description: form.description,
      flags: isDynamic
        ? []
        : form.flags.filter(entry => !isBlankFlagEntry(entry)),
      points: { min: form.pointsMin, max: form.pointsMax },
      tiebreakEligible: form.tiebreakEligible,
      sortWeight: form.sortWeight || undefined,
      tags: form.tags,
      // empty hints are dropped rather than shown to players
      hints: form.hints.filter(hint => !isBlankHint(hint)),
      files: form.files,
      instancerConfig: form.instancerConfig,
      adminBotConfig: form.adminBotConfig.enabled
        ? { code: form.adminBotConfig.code }
        : null,
      hidden: form.hidden,
      releaseTime: form.releaseTime,
      scoring: form.scoring,
    },
  }
}
