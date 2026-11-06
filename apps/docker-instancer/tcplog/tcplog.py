"""Logging TCP proxy that sits between Traefik and a challenge's TCP port.

Traefik terminates the player's TLS and connects here with a PROXY protocol
header carrying the player's address. Each connection is piped to the
challenge unchanged, and one JSON line describing it is printed to stdout:
who connected, when, for how long, how many bytes went each way and the first
TCPLOG_MAX_BYTES of each direction. Vector ships those lines to rCTF.

Lines are printed while a connection is open (at most every
TCPLOG_FLUSH_SECONDS, when something changed) and once more when it closes;
all lines for a connection share its `id`, and the last one has `open: false`.

Configured from the environment:
  TCPLOG_ROUTES       JSON list of {"listen": port, "target": "host:port", "host": public hostname}
  TCPLOG_MAX_BYTES    bytes kept per direction, default 16384
  TCPLOG_FLUSH_SECONDS  default 30
"""

import asyncio
import base64
import contextlib
import ipaddress
import json
import os
import signal
import struct
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime


PROXY_V2_SIGNATURE = b'\r\n\r\n\x00\r\nQUIT\n'
PROXY_V1_PREFIX = b'PROXY '
PROXY_V1_MAX = 107
PROXY_V1_END = bytes([13, 10])
HEADER_TIMEOUT_SECONDS = 5
CONNECT_TIMEOUT_SECONDS = 5
READ_SIZE = 65536
PROXY_CMD_PROXY = 0x01
PROXY_TCP4 = 0x11
PROXY_TCP6 = 0x21
PROXY_TCP4_LEN = 12
PROXY_TCP6_LEN = 36
IN = 'in'
OUT = 'out'


@dataclass
class Route:
    listen: int
    target_host: str
    target_port: int
    host: str


@dataclass
class Session:
    host: str
    client_ip: str
    client_port: int | None
    max_bytes: int
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    started: float = field(default_factory=time.time)
    started_mono: float = field(default_factory=time.monotonic)
    bytes_in: int = 0
    bytes_out: int = 0
    kept: dict[str, int] = field(default_factory=lambda: {IN: 0, OUT: 0})
    truncated: bool = False
    error: str | None = None
    # [direction, ms offset, bytes]; consecutive data in one direction is merged
    chunks: list[list] = field(default_factory=list)
    changed: bool = True

    def record(self, direction: str, data: bytes) -> None:
        if direction == IN:
            self.bytes_in += len(data)
        else:
            self.bytes_out += len(data)
        self.changed = True

        room = self.max_bytes - self.kept[direction]
        if room <= 0:
            self.truncated = True
            return
        if len(data) > room:
            data = data[:room]
            self.truncated = True
        self.kept[direction] += len(data)

        if self.chunks and self.chunks[-1][0] == direction:
            self.chunks[-1][2] += data
            return
        offset = round((time.monotonic() - self.started_mono) * 1000)
        self.chunks.append([direction, offset, bytearray(data)])

    def to_line(self, *, is_open: bool) -> str:
        return json.dumps(
            {
                'kind': 'tcp-session',
                'id': self.id,
                'host': self.host,
                'clientIp': self.client_ip,
                'clientPort': self.client_port,
                'startedAt': datetime.fromtimestamp(self.started, UTC).isoformat(timespec='milliseconds'),
                'durationMs': round((time.monotonic() - self.started_mono) * 1000),
                'bytesIn': self.bytes_in,
                'bytesOut': self.bytes_out,
                'truncated': self.truncated,
                'open': is_open,
                'error': self.error,
                'transcript': [
                    {'dir': direction, 't': offset, 'data': base64.b64encode(bytes(data)).decode()}
                    for direction, offset, data in self.chunks
                ],
            },
            separators=(',', ':'),
        )


def emit(line: str) -> None:
    sys.stdout.write(line + '\n')
    sys.stdout.flush()


def parse_routes(raw: str) -> list[Route]:
    routes: list[Route] = []
    for item in json.loads(raw):
        target_host, _, target_port = str(item['target']).rpartition(':')
        routes.append(
            Route(
                listen=int(item['listen']),
                target_host=target_host,
                target_port=int(target_port),
                host=str(item['host']),
            )
        )
    if not routes:
        msg = 'TCPLOG_ROUTES is empty'
        raise ValueError(msg)
    return routes


def parse_proxy_v2(header: bytes, body: bytes) -> tuple[str, int] | None:
    """Source address from a PROXY v2 header; None for LOCAL or unknown families."""
    command = header[12] & 0x0F
    family = header[13]
    if command != PROXY_CMD_PROXY:  # LOCAL: health checks and the like
        return None
    if family == PROXY_TCP4 and len(body) >= PROXY_TCP4_LEN:  # TCP over IPv4
        src = ipaddress.IPv4Address(body[0:4])
        (port,) = struct.unpack('!H', body[8:10])
        return str(src), port
    if family == PROXY_TCP6 and len(body) >= PROXY_TCP6_LEN:  # TCP over IPv6
        src = ipaddress.IPv6Address(body[0:16])
        (port,) = struct.unpack('!H', body[32:34])
        return str(src.ipv4_mapped or src), port
    return None


def parse_proxy_v1(line: bytes) -> tuple[str, int] | None:
    parts = line.decode('ascii', 'replace').strip().split(' ')
    if len(parts) != 6 or parts[1] not in {'TCP4', 'TCP6'}:  # noqa: PLR2004
        return None
    try:
        return str(ipaddress.ip_address(parts[2])), int(parts[4])
    except ValueError:
        return None


async def read_proxy_header(reader: asyncio.StreamReader) -> tuple[tuple[str, int] | None, bytes]:
    """The player's address from Traefik's PROXY header, and any bytes read past it.

    Bytes that turn out not to be a header are returned, to be forwarded as
    data, so a missing header never corrupts the stream.
    """
    try:
        start = await asyncio.wait_for(reader.readexactly(12), HEADER_TIMEOUT_SECONDS)
    except TimeoutError:
        # nothing consumed: the reader keeps what arrived
        return None, b''
    except asyncio.IncompleteReadError as err:
        return None, err.partial

    if start == PROXY_V2_SIGNATURE:
        rest = await reader.readexactly(4)
        (length,) = struct.unpack('!H', rest[2:4])
        body = await reader.readexactly(length)
        return parse_proxy_v2(start + rest, body), b''

    if start.startswith(PROXY_V1_PREFIX):
        line = start
        while not line.endswith(PROXY_V1_END) and len(line) < PROXY_V1_MAX:
            line += await reader.readexactly(1)
        return parse_proxy_v1(line), b''

    return None, start


async def pipe(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    session: Session,
    direction: str,
) -> None:
    try:
        while data := await reader.read(READ_SIZE):
            session.record(direction, data)
            writer.write(data)
            await writer.drain()
    except (ConnectionError, OSError):
        pass
    finally:
        with contextlib.suppress(OSError, RuntimeError):
            if writer.can_write_eof():
                writer.write_eof()


class Proxy:
    def __init__(self, max_bytes: int, flush_seconds: float) -> None:
        self.max_bytes = max_bytes
        self.flush_seconds = flush_seconds
        self.open: dict[str, Session] = {}

    async def handle(self, route: Route, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info('peername') or ('', None)
        try:
            source, leftover = await read_proxy_header(reader)
        except (asyncio.IncompleteReadError, ConnectionError, OSError):
            writer.close()
            return
        client_ip, client_port = source or (peer[0], peer[1])
        session = Session(host=route.host, client_ip=client_ip, client_port=client_port, max_bytes=self.max_bytes)
        self.open[session.id] = session

        upstream_writer: asyncio.StreamWriter | None = None
        try:
            upstream_reader, upstream_writer = await asyncio.wait_for(
                asyncio.open_connection(route.target_host, route.target_port), CONNECT_TIMEOUT_SECONDS
            )
            if leftover:
                session.record(IN, leftover)
                upstream_writer.write(leftover)
            await asyncio.gather(
                pipe(reader, upstream_writer, session, IN),
                pipe(upstream_reader, writer, session, OUT),
            )
        except (TimeoutError, OSError) as err:
            session.error = f'could not reach the challenge: {err.__class__.__name__}'
        finally:
            for w in (writer, upstream_writer):
                if w is not None:
                    with contextlib.suppress(OSError, RuntimeError):
                        w.close()
            self.open.pop(session.id, None)
            emit(session.to_line(is_open=False))

    async def flush_open(self) -> None:
        while True:
            await asyncio.sleep(self.flush_seconds)
            self.flush_changed()

    def flush_changed(self) -> None:
        for session in list(self.open.values()):
            if session.changed:
                session.changed = False
                emit(session.to_line(is_open=True))

    def flush_all_open(self) -> None:
        # the instance is stopping: record what the open connections did so far
        for session in list(self.open.values()):
            session.error = session.error or 'instance stopped'
            emit(session.to_line(is_open=False))
        self.open.clear()


async def main() -> None:
    routes = parse_routes(os.environ['TCPLOG_ROUTES'])
    proxy = Proxy(
        max_bytes=int(os.environ.get('TCPLOG_MAX_BYTES', '16384')),
        flush_seconds=float(os.environ.get('TCPLOG_FLUSH_SECONDS', '30')),
    )

    servers = []
    for route in routes:

        async def handler(r: asyncio.StreamReader, w: asyncio.StreamWriter, route: Route = route) -> None:
            await proxy.handle(route, r, w)

        servers.append(await asyncio.start_server(handler, '0.0.0.0', route.listen))

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    flusher = asyncio.create_task(proxy.flush_open())
    await stop.wait()
    flusher.cancel()
    proxy.flush_all_open()
    for server in servers:
        server.close()


if __name__ == '__main__':
    asyncio.run(main())
