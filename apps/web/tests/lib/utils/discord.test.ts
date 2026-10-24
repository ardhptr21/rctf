import {
  buildDiscordAuthorizeUrl,
  discordRedirectUri,
  finishDiscordLogin,
  startDiscordLogin,
} from '$lib/utils/discord'
import { beforeEach, describe, expect, it } from 'bun:test'

const store = new Map<string, string>()
globalThis.sessionStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => void store.set(key, value),
  removeItem: key => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size
  },
}

describe('buildDiscordAuthorizeUrl', () => {
  it('requests only the identify scope by default', () => {
    const url = new URL(
      buildDiscordAuthorizeUrl({
        clientId: '123',
        origin: 'https://ctf.example',
        requireGuild: false,
        state: 'abc',
      })
    )
    expect(url.origin).toBe('https://discord.com')
    expect(url.searchParams.get('client_id')).toBe('123')
    expect(url.searchParams.get('scope')).toBe('identify')
    expect(url.searchParams.get('state')).toBe('abc')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://ctf.example/login/discord'
    )
  })

  it('adds the guilds scope when a server is required', () => {
    const url = new URL(
      buildDiscordAuthorizeUrl({
        clientId: '123',
        origin: 'https://ctf.example',
        requireGuild: true,
        state: 'abc',
      })
    )
    expect(url.searchParams.get('scope')).toBe('identify guilds')
  })

  it('derives the redirect URI from the origin', () => {
    expect(discordRedirectUri('http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/login/discord'
    )
  })
})

describe('Discord login state', () => {
  beforeEach(() => store.clear())

  it('accepts the state it issued and returns the next path once', () => {
    const state = startDiscordLogin('/scores')
    expect(finishDiscordLogin(state)).toEqual({ valid: true, next: '/scores' })
    expect(finishDiscordLogin(state).valid).toBe(false)
  })

  it('rejects a mismatched or missing state', () => {
    startDiscordLogin(null)
    expect(finishDiscordLogin('forged').valid).toBe(false)
    expect(finishDiscordLogin(null).valid).toBe(false)
  })
})
