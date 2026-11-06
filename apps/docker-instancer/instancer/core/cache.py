from contextlib import asynccontextmanager, suppress
from typing import TYPE_CHECKING

from redis import asyncio as redis_lib
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import LockError

from .config import config


if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


redis = redis_lib.from_url(
    config.cache_connection_url,
    encoding='utf-8',
    decode_responses=True,
    retry_on_timeout=True,
    retry=Retry(ExponentialBackoff(cap=1), 3),
)


@asynccontextmanager
async def instance_lock(challenge: str, team_id: str) -> AsyncGenerator[bool]:
    lock = redis.lock(
        f'{config.PREFIX}:locks:instance:{challenge}:{team_id}',
        timeout=config.REDIS_LOCK_TIMEOUT_SECONDS,
        blocking_timeout=config.REDIS_LOCK_BLOCKING_TIMEOUT_SECONDS,
    )

    acquired = await lock.acquire(blocking=True)
    try:
        yield acquired
    finally:
        if acquired:
            with suppress(LockError):
                await lock.release()


def _stopping_key(challenge: str, team_id: str) -> str:
    return f'{config.PREFIX}:stopping:{challenge}:{team_id}'


@asynccontextmanager
async def instance_stopping(challenge: str, team_id: str) -> AsyncGenerator[None]:
    """Marks an instance as being stopped while its containers go away.

    Stopping takes a few seconds, and meanwhile some containers have exited
    while others still run; status checks report that as stopping, not as an
    error. The marker expires on its own if the instancer dies mid-stop.
    """
    key = _stopping_key(challenge, team_id)
    await redis.set(key, '1', ex=config.DOCKER_STOP_TIMEOUT_SECONDS + 60)
    try:
        yield
    finally:
        await redis.delete(key)


async def is_instance_stopping(challenge: str, team_id: str) -> bool:
    return bool(await redis.exists(_stopping_key(challenge, team_id)))


def _expiration_key(instance_id: str) -> str:
    return f'{config.PREFIX}:expiration:{instance_id}'


async def get_instance_expiration(instance_id: str) -> int | None:
    value = await redis.get(_expiration_key(instance_id))
    return int(value) if value else None


async def set_instance_expiration(instance_id: str, expires_at_ms: int, now_ms: int) -> None:
    ttl_seconds = max(1, ((expires_at_ms - now_ms) // 1000) + 120)
    await redis.set(_expiration_key(instance_id), str(expires_at_ms), ex=ttl_seconds)


async def delete_instance_expiration(instance_id: str) -> None:
    await redis.delete(_expiration_key(instance_id))
