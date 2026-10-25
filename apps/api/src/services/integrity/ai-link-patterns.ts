import { compileAiLinkPattern } from '@rctf/types'

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
