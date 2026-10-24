const STATE_KEY = 'discordOauthState'
const NEXT_KEY = 'discordOauthNext'

export function discordRedirectUri(origin: string): string {
  return new URL('/login/discord', origin).toString()
}

export function buildDiscordAuthorizeUrl(params: {
  clientId: string
  origin: string
  requireGuild: boolean
  state: string
}): string {
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', discordRedirectUri(params.origin))
  url.searchParams.set(
    'scope',
    params.requireGuild ? 'identify guilds' : 'identify'
  )
  url.searchParams.set('state', params.state)
  url.searchParams.set('prompt', 'none')
  return url.toString()
}

// remembers the CSRF state and post-login path across the Discord redirect
export function startDiscordLogin(next: string | null): string {
  const state = crypto.randomUUID()
  try {
    sessionStorage.setItem(STATE_KEY, state)
    if (next) {
      sessionStorage.setItem(NEXT_KEY, next)
    } else {
      sessionStorage.removeItem(NEXT_KEY)
    }
  } catch {}
  return state
}

export function finishDiscordLogin(state: string | null): {
  valid: boolean
  next: string | null
} {
  let expected: string | null = null
  let next: string | null = null
  try {
    expected = sessionStorage.getItem(STATE_KEY)
    next = sessionStorage.getItem(NEXT_KEY)
    sessionStorage.removeItem(STATE_KEY)
    sessionStorage.removeItem(NEXT_KEY)
  } catch {}
  return { valid: !!state && state === expected, next }
}
