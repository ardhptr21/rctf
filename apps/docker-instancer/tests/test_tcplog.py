import asyncio
import base64
import json
import socket
import struct

import pytest

from tcplog import tcplog


def proxy_v2_header(ip: str, port: int) -> bytes:
    body = socket.inet_aton(ip) + socket.inet_aton('10.0.0.2') + struct.pack('!HH', port, 1337)
    return tcplog.PROXY_V2_SIGNATURE + bytes([0x21, 0x11]) + struct.pack('!H', len(body)) + body


async def start_echo() -> tuple[asyncio.Server, int]:
    async def echo(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.write(b'hello\n')
        await writer.drain()
        while data := await reader.read(1024):
            writer.write(data.upper())
            await writer.drain()
        writer.close()

    server = await asyncio.start_server(echo, '127.0.0.1', 0)
    return server, server.sockets[0].getsockname()[1]


async def start_proxy(target_port: int, max_bytes: int = 16384) -> tuple[asyncio.Server, int]:
    proxy = tcplog.Proxy(max_bytes=max_bytes, flush_seconds=60)
    route = tcplog.Route(listen=0, target_host='127.0.0.1', target_port=target_port, host='chall-abc.example.com')

    async def handler(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        await proxy.handle(route, r, w)

    server = await asyncio.start_server(handler, '127.0.0.1', 0)
    return server, server.sockets[0].getsockname()[1]


@pytest.fixture
def lines(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    captured: list[dict] = []
    monkeypatch.setattr(tcplog, 'emit', lambda line: captured.append(json.loads(line)))
    return captured


def transcript(entry: dict) -> list[tuple[str, bytes]]:
    return [(chunk['dir'], base64.b64decode(chunk['data'])) for chunk in entry['transcript']]


def kept(entry: dict, direction: str) -> bytes:
    return b''.join(data for d, data in transcript(entry) if d == direction)


async def converse(port: int, prefix: bytes, payload: bytes) -> bytes:
    reader, writer = await asyncio.open_connection('127.0.0.1', port)
    writer.write(prefix)
    assert await reader.readline() == b'hello\n'
    writer.write(payload)
    await writer.drain()
    reply = await reader.readexactly(len(payload))
    writer.close()
    await writer.wait_closed()
    return reply


async def wait_for_lines(lines: list[dict], count: int) -> None:
    for _ in range(200):
        if len(lines) >= count:
            return
        await asyncio.sleep(0.01)


def test_forwards_bytes_and_records_the_player(lines: list[dict]) -> None:
    async def run() -> None:
        echo, echo_port = await start_echo()
        server, port = await start_proxy(echo_port)
        assert await converse(port, proxy_v2_header('203.0.113.7', 40000), b'flag\n') == b'FLAG\n'
        await wait_for_lines(lines, 1)
        server.close()
        echo.close()

    asyncio.run(run())

    assert len(lines) == 1
    entry = lines[0]
    assert entry['kind'] == 'tcp-session'
    assert entry['host'] == 'chall-abc.example.com'
    assert entry['clientIp'] == '203.0.113.7'
    assert entry['clientPort'] == 40000
    assert entry['open'] is False
    assert entry['error'] is None
    assert entry['bytesIn'] == 5
    assert entry['bytesOut'] == 11
    assert entry['truncated'] is False
    assert transcript(entry) == [('out', b'hello\n'), ('in', b'flag\n'), ('out', b'FLAG\n')]


def test_without_a_proxy_header_the_data_is_still_forwarded(lines: list[dict]) -> None:
    async def run() -> None:
        echo, echo_port = await start_echo()
        server, port = await start_proxy(echo_port)
        # 12+ bytes that are not a PROXY header must reach the challenge as data
        reader, writer = await asyncio.open_connection('127.0.0.1', port)
        writer.write(b'not a proxy header\n')
        assert await reader.readline() == b'hello\n'
        assert await reader.readexactly(19) == b'NOT A PROXY HEADER\n'
        writer.close()
        await wait_for_lines(lines, 1)
        server.close()
        echo.close()

    asyncio.run(run())
    assert lines[0]['clientIp'] == '127.0.0.1'
    assert kept(lines[0], 'in') == b'not a proxy header\n'


def test_transcript_is_capped_per_direction(lines: list[dict]) -> None:
    async def run() -> None:
        echo, echo_port = await start_echo()
        server, port = await start_proxy(echo_port, max_bytes=8)
        assert await converse(port, proxy_v2_header('198.51.100.1', 1), b'abcdefghijkl') == b'ABCDEFGHIJKL'
        await wait_for_lines(lines, 1)
        server.close()
        echo.close()

    asyncio.run(run())
    entry = lines[0]
    assert entry['truncated'] is True
    assert entry['bytesIn'] == 12
    assert entry['bytesOut'] == 18
    assert kept(entry, 'in') == b'abcdefgh'
    assert kept(entry, 'out') == b'hello\nAB'


def test_unreachable_challenge_is_logged(lines: list[dict]) -> None:
    async def run() -> None:
        probe = socket.socket()
        probe.bind(('127.0.0.1', 0))
        dead_port = probe.getsockname()[1]
        probe.close()
        server, port = await start_proxy(dead_port)
        reader, writer = await asyncio.open_connection('127.0.0.1', port)
        writer.write(proxy_v2_header('192.0.2.5', 2))
        await writer.drain()
        assert await reader.read() == b''
        writer.close()
        await wait_for_lines(lines, 1)
        server.close()

    asyncio.run(run())
    assert lines[0]['clientIp'] == '192.0.2.5'
    assert lines[0]['error'].startswith('could not reach the challenge')


def test_open_connections_are_flushed_while_open_and_on_stop(lines: list[dict]) -> None:
    session = tcplog.Session(host='h', client_ip='1.2.3.4', client_port=5, max_bytes=100)
    proxy = tcplog.Proxy(max_bytes=100, flush_seconds=60)
    proxy.open[session.id] = session
    session.record('in', b'id\n')

    proxy.flush_changed()
    proxy.flush_changed()  # nothing changed since: no second line
    assert [entry['open'] for entry in lines] == [True]

    proxy.flush_all_open()
    assert [entry['open'] for entry in lines] == [True, False]
    assert lines[1]['error'] == 'instance stopped'
    assert lines[0]['id'] == lines[1]['id']


def test_parse_proxy_v1_and_routes() -> None:
    assert tcplog.parse_proxy_v1(b'PROXY TCP4 203.0.113.9 10.0.0.1 5555 1337\r\n') == ('203.0.113.9', 5555)
    assert tcplog.parse_proxy_v1(b'PROXY UNKNOWN\r\n') is None
    routes = tcplog.parse_routes('[{"listen": 10000, "target": "svc:1337", "host": "a.example.com"}]')
    assert routes == [tcplog.Route(listen=10000, target_host='svc', target_port=1337, host='a.example.com')]
