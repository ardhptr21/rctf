import { z } from 'zod/mini'
import { BadAiLinks } from '../responses/submission-evidence'

export const NO_AI = 'no ai'
export const MAX_AI_LINKS = 10
export const MAX_AI_LINK_LENGTH = 2048

export const isNoAi = (value: string): boolean =>
  value.trim().toLowerCase() === NO_AI

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Returns a message describing what is wrong with the AI links, or null.
export const validateAiLinks = (links: readonly string[]): string | null => {
  const entries = links.map(link => link.trim()).filter(Boolean)
  if (entries.length === 0) {
    return 'Add at least one AI link or check the "I didn\'t use AI".'
  }
  if (entries.length > MAX_AI_LINKS) {
    return `Add at most ${MAX_AI_LINKS} AI links.`
  }
  if (entries.some(isNoAi)) {
    return entries.length === 1
      ? null
      : '"no ai" cannot be combined with other links.'
  }
  for (const entry of entries) {
    if (entry.length > MAX_AI_LINK_LENGTH || !isHttpUrl(entry)) {
      return `"${entry.slice(0, 80)}" is not a valid http(s) link.`
    }
  }
  return null
}

// Form fields arrive as a single string or, when repeated, as an array.
export const AiLinksSchema = z
  .pipe(
    z.transform((value: unknown) =>
      (Array.isArray(value) ? value : value === undefined ? [] : [value])
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
    ),
    z.array(z.string())
  )
  .check(
    z.refine((links: string[]) => validateAiLinks(links) === null, {
      message: 'Invalid AI links',
      params: { response: BadAiLinks },
    })
  )
  .check(
    z.describe(
      'Links to the AI conversations used, or exactly `no ai`. Repeat the field for more links (max 10).'
    )
  )

export const MAX_AI_LINK_PATTERN_LENGTH = 500

// Allowed AI link patterns are JavaScript regular expressions, matched
// without regard to case.
export const compileAiLinkPattern = (pattern: string): RegExp | null => {
  if (pattern.length > MAX_AI_LINK_PATTERN_LENGTH) return null
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

export const isAiLinkPattern = (pattern: string): boolean =>
  pattern.trim() !== '' && compileAiLinkPattern(pattern) !== null

export const AiLinkPatternsSchema = z
  .array(
    z.string().check(
      z.refine(isAiLinkPattern, {
        message: 'must be a valid regular expression',
      })
    )
  )
  .check(z.maxLength(50))
  .check(
    z.describe(
      'Regular expressions for allowed AI links, matched without regard to case. Cheat detection records links matching none of them; an empty list turns that check off.'
    )
  )
