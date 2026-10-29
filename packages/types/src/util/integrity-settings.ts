import { z } from 'zod/mini'
import { example } from './example'

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

const isIpv6 = (value: string): boolean => {
  if (!value.includes(':')) return false
  try {
    // the URL parser validates bracketed IPv6 hosts in browsers and Bun alike
    return new URL(`http://[${value}]/`).hostname.length > 0
  } catch {
    return false
  }
}

// An IP address, or a CIDR range like `10.0.0.0/8` or `2001:db8::/32`.
export const parseIpRule = (
  value: string
): { address: string; prefix: number; family: 'ipv4' | 'ipv6' } | null => {
  const [address = '', prefixText, extra] = value.trim().split('/')
  if (extra !== undefined) return null
  const family = IPV4.test(address) ? 'ipv4' : isIpv6(address) ? 'ipv6' : null
  if (!family) return null

  const maxPrefix = family === 'ipv4' ? 32 : 128
  if (prefixText === undefined) {
    return { address, prefix: maxPrefix, family }
  }
  if (!/^\d{1,3}$/.test(prefixText)) return null
  const prefix = Number(prefixText)
  return prefix <= maxPrefix ? { address, prefix, family } : null
}

export const isIpRule = (value: string): boolean => parseIpRule(value) !== null

export const IntegritySettingsSchema = z.object({
  detectors: z
    .object({
      flagSharing: example(z.boolean(), true).check(
        z.describe('Record dynamic flags submitted by another team.')
      ),
      sharedIp: example(z.boolean(), true).check(
        z.describe('Record different teams submitting from the same IP.')
      ),
      duplicateProof: example(z.boolean(), true).check(
        z.describe('Record the same solver-proof file used by several teams.')
      ),
      duplicateAiLink: example(z.boolean(), true).check(
        z.describe('Record the same AI link used by several teams.')
      ),
      // added later: settings saved before then don't have them
      solvedWithoutDownload: z
        ._default(z.boolean(), true)
        .check(
          z.describe(
            'Record solves of challenges with attachments that the team never downloaded.'
          )
        ),
      unlistedAiLink: z
        ._default(z.boolean(), true)
        .check(
          z.describe(
            'Record AI links that match none of the allowed AI link patterns (`aiLinkPatterns`).'
          )
        ),
      // off unless turned on, unlike the other detectors
      mixedAiSource: z
        ._default(z.boolean(), false)
        .check(
          z.describe(
            "Record AI links from a different site than the team's usual one."
          )
        ),
    })
    .check(z.describe('Which detectors run on flag submissions.')),
  sharedIpWindowHours: example(
    z.int().check(z.gte(1)).check(z.lte(720)),
    24
  ).check(z.describe('How far back shared-IP matching looks, in hours.')),
  ipAllowlist: example(
    z
      .array(
        z.string().check(
          z.refine(isIpRule, {
            message: 'must be an IP address or CIDR range',
          })
        )
      )
      .check(z.maxLength(200)),
    ['10.0.0.0/8']
  ).check(
    z.describe(
      'IPs or CIDR ranges ignored by shared-IP detection, such as a venue network.'
    )
  ),
  alerts: example(z.boolean(), true).check(
    z.describe('Send alerts for new signals when destinations are configured.')
  ),
})

export type IntegritySettings = z.infer<typeof IntegritySettingsSchema>
