import {
  IntegritySeverity,
  IntegritySignalKind,
  isAiLinkPattern,
  isIpRule,
  parseIpRule,
} from '@rctf/types'
import { describe, expect, test } from 'bun:test'
import {
  aiLinkSource,
  matchesAiLinkPatterns,
} from '../../../../apps/api/src/services/integrity/ai-link-patterns'
import { isAllowlistedIp } from '../../../../apps/api/src/services/integrity/ip-allowlist'
import {
  caseScore,
  orderPair,
  pairKey,
  severityAtLeast,
} from '../../../../apps/api/src/services/integrity/score'

const { HIGH, MEDIUM, LOW } = IntegritySeverity
const { FLAG_SHARING, SHARED_IP, DUPLICATE_PROOF } = IntegritySignalKind

describe('caseScore', () => {
  test('is zero without signals', () => {
    expect(caseScore([])).toBe(0)
  })

  test('sums severity weights for one kind', () => {
    expect(
      caseScore([
        { kind: SHARED_IP, severity: MEDIUM },
        { kind: SHARED_IP, severity: MEDIUM },
      ])
    ).toBe(8)
  })

  test('raises the score by half for each extra kind', () => {
    expect(
      caseScore([
        { kind: DUPLICATE_PROOF, severity: HIGH },
        { kind: SHARED_IP, severity: MEDIUM },
      ])
    ).toBe(21)
    expect(
      caseScore([
        { kind: DUPLICATE_PROOF, severity: HIGH },
        { kind: SHARED_IP, severity: MEDIUM },
        { kind: FLAG_SHARING, severity: LOW },
      ])
    ).toBe(30)
  })
})

describe('severityAtLeast', () => {
  test('orders low < medium < high', () => {
    expect(severityAtLeast(HIGH, MEDIUM)).toBe(true)
    expect(severityAtLeast(MEDIUM, MEDIUM)).toBe(true)
    expect(severityAtLeast(LOW, MEDIUM)).toBe(false)
  })
})

describe('team pairs', () => {
  test('put the smaller id first so both directions share a case', () => {
    expect(orderPair('b', 'a')).toEqual(['a', 'b'])
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
    expect(pairKey('a', null)).toBe('a:')
  })
})

describe('IP rules', () => {
  test('accept IPs and CIDR ranges for both families', () => {
    for (const rule of [
      '10.0.0.1',
      '10.0.0.0/8',
      '0.0.0.0/0',
      '2001:db8::1',
      '2001:db8::/32',
    ]) {
      expect(isIpRule(rule)).toBe(true)
    }
    expect(parseIpRule('10.0.0.1')).toEqual({
      address: '10.0.0.1',
      prefix: 32,
      family: 'ipv4',
    })
  })

  test('reject anything else', () => {
    for (const rule of [
      '',
      'localhost',
      '256.0.0.1',
      '10.0.0.0/33',
      '2001:db8::/129',
      '10.0.0.0/8/1',
      '10.0.0.0/x',
    ]) {
      expect(isIpRule(rule)).toBe(false)
    }
  })

  test('match addresses inside allow-listed ranges', () => {
    const rules = ['203.0.113.0/24', '2001:db8::/32']
    expect(isAllowlistedIp('203.0.113.7', rules)).toBe(true)
    expect(isAllowlistedIp('::ffff:203.0.113.7', rules)).toBe(true)
    expect(isAllowlistedIp('2001:db8::42', rules)).toBe(true)
    expect(isAllowlistedIp('198.51.100.1', rules)).toBe(false)
    expect(isAllowlistedIp('unknown', rules)).toBe(false)
    expect(isAllowlistedIp('203.0.113.7', [])).toBe(false)
  })
})

describe('AI link patterns', () => {
  const patterns = ['^https://chatgpt\\.com/share/', 'deepseek\\.com/']

  test('match links regardless of case', () => {
    expect(
      matchesAiLinkPatterns('https://ChatGPT.com/share/abc', patterns)
    ).toBe(true)
    expect(
      matchesAiLinkPatterns('https://chat.deepseek.com/a/chat/s/1', patterns)
    ).toBe(true)
    expect(matchesAiLinkPatterns('https://example.com/chat', patterns)).toBe(
      false
    )
  })

  test('only valid, non-empty regular expressions are accepted', () => {
    expect(isAiLinkPattern('^https://claude\\.ai/share/')).toBe(true)
    expect(isAiLinkPattern('')).toBe(false)
    expect(isAiLinkPattern('^https://([a-z')).toBe(false)
    expect(isAiLinkPattern('x'.repeat(501))).toBe(false)
  })
})

describe('aiLinkSource', () => {
  test('is the site, with www. dropped and aliases merged', () => {
    expect(aiLinkSource('https://chatgpt.com/share/abc')).toBe('chatgpt.com')
    expect(aiLinkSource(' https://WWW.ChatGPT.com/share/abc ')).toBe(
      'chatgpt.com'
    )
    expect(aiLinkSource('https://chat.openai.com/share/abc')).toBe(
      'chatgpt.com'
    )
    expect(aiLinkSource('https://chat.deepseek.com/s/abc')).toBe('deepseek.com')
    expect(aiLinkSource('https://bard.google.com/share/abc')).toBe(
      'gemini.google.com'
    )
    expect(aiLinkSource('https://claude.ai/share/abc')).toBe('claude.ai')
  })

  test('is null for "no ai" and anything that is not a web link', () => {
    expect(aiLinkSource('no ai')).toBeNull()
    expect(aiLinkSource('')).toBeNull()
    expect(aiLinkSource('chatgpt')).toBeNull()
    expect(aiLinkSource('javascript:alert(1)')).toBeNull()
  })
})
