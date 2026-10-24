import type { DatabaseClient, Player } from '@rctf/db'
import { players } from '@rctf/db'
import { takeUnique } from '@rctf/db/util'
import { eq } from 'drizzle-orm'
import type { TypedRedis } from '../cache/scripts'

const PLAYER_CACHE_TTL = 30_000
const playerCacheKey = (playerId: string) => `player:${playerId}`

export const getPlayer = async (
  db: DatabaseClient,
  playerId: string
): Promise<Player | undefined> =>
  db.select().from(players).where(eq(players.id, playerId)).then(takeUnique)

export const getCachedPlayer = async (
  db: DatabaseClient,
  redis: TypedRedis,
  playerId: string
): Promise<Player | undefined> => {
  const cached = await redis.get(playerCacheKey(playerId))
  if (cached) {
    try {
      return JSON.parse(cached) as Player
    } catch {
      await redis.del(playerCacheKey(playerId))
    }
  }

  const player = await getPlayer(db, playerId)
  if (player) {
    await redis.set(
      playerCacheKey(playerId),
      JSON.stringify(player),
      'PX',
      PLAYER_CACHE_TTL
    )
  }
  return player
}

export const invalidatePlayerCache = async (
  redis: TypedRedis,
  playerIds: string[]
): Promise<void> => {
  if (playerIds.length > 0) {
    await redis.del(...playerIds.map(playerCacheKey))
  }
}

export type DiscordProfile = {
  discordId: string
  discordUsername: string
  displayName: string | null
  avatarUrl: string | null
}

// Creates the player on first login and refreshes their Discord profile after.
export const upsertDiscordPlayer = async (
  db: DatabaseClient,
  redis: TypedRedis,
  profile: DiscordProfile
): Promise<Player> => {
  const [player] = await db
    .insert(players)
    .values({ id: crypto.randomUUID(), ...profile })
    .onConflictDoUpdate({
      target: players.discordId,
      set: {
        discordUsername: profile.discordUsername,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
    })
    .returning()
  await invalidatePlayerCache(redis, [player!.id])
  return player!
}
