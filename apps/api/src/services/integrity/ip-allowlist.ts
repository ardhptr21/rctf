import { parseIpRule } from '@rctf/types'
import { BlockList, isIP } from 'node:net'

let cached: { key: string; list: BlockList } | null = null

const buildList = (rules: readonly string[]): BlockList => {
  const list = new BlockList()
  for (const rule of rules) {
    // rules are validated when settings are saved; skip anything else
    const parsed = parseIpRule(rule)
    if (parsed) list.addSubnet(parsed.address, parsed.prefix, parsed.family)
  }
  return list
}

// Whether `ip` falls inside one of the allow-listed IPs or ranges. The list
// is rebuilt only when the rules change.
export const isAllowlistedIp = (
  rawIp: string,
  rules: readonly string[]
): boolean => {
  // dual-stack servers report IPv4 clients as ::ffff:a.b.c.d
  const ip = rawIp.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '')
  const family = isIP(ip)
  if (family === 0 || rules.length === 0) return false

  const key = rules.join('\n')
  if (cached?.key !== key) {
    cached = { key, list: buildList(rules) }
  }
  return cached.list.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}
