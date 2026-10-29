import { compileAiLinkPattern, isNoAi } from '@rctf/types'

let cached: { key: string; patterns: RegExp[] } | null = null

// Whether `link` matches at least one allowed AI link pattern. The patterns
// are compiled once per change of the setting.
export const matchesAiLinkPatterns = (
  link: string,
  patterns: readonly string[]
): boolean => {
  const key = patterns.join('\n')
  if (cached?.key !== key) {
    cached = {
      key,
      // patterns are validated when settings are saved; skip anything else
      patterns: patterns.flatMap(pattern => {
        const compiled = compileAiLinkPattern(pattern)
        return compiled ? [compiled] : []
      }),
    }
  }
  return cached.patterns.some(pattern => pattern.test(link))
}

// hosts of one assistant that count as the same source
const SOURCE_ALIASES: Record<string, string> = {
  'chat.openai.com': 'chatgpt.com',
  'chat.deepseek.com': 'deepseek.com',
  'bard.google.com': 'gemini.google.com',
}

// The site an AI link points to, such as `chatgpt.com`, or null for
// "no ai" and anything that isn't a web link.
export const aiLinkSource = (link: string): string | null => {
  const trimmed = link.trim()
  if (trimmed === '' || isNoAi(trimmed)) return null
  let host: string
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    host = url.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  if (host === '') return null
  return SOURCE_ALIASES[host] ?? host
}
