import { config } from '@rctf/config'
import type { DiscordProfile } from './players'

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_CDN = 'https://cdn.discordapp.com'

interface TokenResponse {
  access_token: string
  token_type: string
}

interface DiscordUser {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
}

export type DiscordLoginResult =
  | { ok: true; profile: DiscordProfile }
  | { ok: false; error: 'badDiscordCode' | 'badDiscordGuild' }

export const discordRedirectUri = (): string =>
  new URL('/login/discord', config.origin).toString()

const avatarUrl = (user: DiscordUser): string | null =>
  user.avatar
    ? `${DISCORD_CDN}/avatars/${user.id}/${user.avatar}.png?size=128`
    : null

// Exchanges an OAuth code for the Discord profile, enforcing the guild gate.
export const exchangeDiscordCode = async (
  code: string
): Promise<DiscordLoginResult> => {
  const discord = config.discord!

  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: discord.clientId,
      client_secret: discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: discordRedirectUri(),
    }),
  })

  if (tokenResponse.status === 400 || tokenResponse.status === 401) {
    return { ok: false, error: 'badDiscordCode' }
  }
  if (!tokenResponse.ok) {
    throw new Error(
      `Discord token exchange failed: ${tokenResponse.status}: ${await tokenResponse.text()}`
    )
  }

  const { access_token: accessToken } =
    (await tokenResponse.json()) as TokenResponse
  const headers = { Authorization: `Bearer ${accessToken}` }

  const userResponse = await fetch(`${DISCORD_API}/users/@me`, { headers })
  if (!userResponse.ok) {
    throw new Error(`Discord user lookup failed: ${userResponse.status}`)
  }
  const user = (await userResponse.json()) as DiscordUser

  if (discord.requiredGuildId) {
    const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers,
    })
    if (!guildsResponse.ok) {
      throw new Error(`Discord guild lookup failed: ${guildsResponse.status}`)
    }
    const guilds = (await guildsResponse.json()) as Array<{ id: string }>
    if (!guilds.some(guild => guild.id === discord.requiredGuildId)) {
      return { ok: false, error: 'badDiscordGuild' }
    }
  }

  return {
    ok: true,
    profile: {
      discordId: user.id,
      discordUsername: user.username,
      displayName: user.global_name,
      avatarUrl: avatarUrl(user),
    },
  }
}
