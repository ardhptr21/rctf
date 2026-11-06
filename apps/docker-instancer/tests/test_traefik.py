import orjson
import pytest

from instancer.core.config import config
from instancer.core.instancer.const import ContainerLabels
from instancer.core.instancer.traefik import expose_ports, extract_exposes, tcplog_proxy
from instancer.protocol import types as protocol


def make_exposes(tcp_kind: protocol.ExposeKind = protocol.ExposeKind.TCP) -> dict[str, list[protocol.InstancerExpose]]:
    def expose(kind: protocol.ExposeKind, prefix: str, port: int) -> protocol.InstancerExpose:
        return protocol.InstancerExpose.model_validate(
            {'kind': kind, 'hostPrefix': prefix, 'containerName': 'app', 'containerPort': port}
        )

    return {'app': [expose(tcp_kind, 'shell', 1337), expose(protocol.ExposeKind.HTTP, 'web', 80)]}


def tcp_labels(labels: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in labels.items() if key.startswith('traefik.tcp.')}


def test_direct_routing_puts_tcp_labels_on_the_container() -> None:
    labels: dict[str, str] = {}
    expose_ports(labels, 'app', make_exposes(), 'abc123', 'ti-abc123-routing-0', [0, 1])
    assert labels['traefik.enable'] == 'true'
    assert tcp_labels(labels)


def test_proxy_routing_moves_tcp_labels_to_the_proxy() -> None:
    exposes = make_exposes()
    labels: dict[str, str] = {}
    _, endpoints = expose_ports(labels, 'app', exposes, 'abc123', 'ti-abc123-routing-0', [0, 1], tcp_via_proxy=True)

    # the container keeps its HTTP route and its endpoints, but no TCP route
    assert not tcp_labels(labels)
    assert labels['traefik.enable'] == 'true'
    assert [endpoint.kind for endpoint in endpoints] == [protocol.ExposeKind.TCP_SSL, protocol.ExposeKind.HTTP]
    assert [endpoint for _, endpoint in extract_exposes(labels)] == endpoints

    proxy_labels, routes = tcplog_proxy('app', exposes, 'abc123', 'ti-abc123-routing-0', 'ti-chall-app-abc123')
    router = 'ti-abc123-app-0'
    host = 'shell-abc123.instances.example.com'
    assert proxy_labels[f'traefik.tcp.routers.{router}.rule'] == f'HostSNI(`{host}`)'
    assert proxy_labels[f'traefik.tcp.routers.{router}.tls'] == 'true'
    assert proxy_labels[f'traefik.tcp.services.{router}.loadbalancer.server.port'] == '10000'
    assert proxy_labels[f'traefik.tcp.services.{router}.loadbalancer.serversTransport'] == 'tcplog@file'
    assert f'traefik.tcp.services.{router}.loadbalancer.proxyProtocol.version' not in proxy_labels
    assert proxy_labels['traefik.docker.network'] == 'ti-abc123-routing-0'
    assert routes == [{'listen': 10000, 'target': 'ti-chall-app-abc123:1337', 'host': host}]
    assert orjson.loads(orjson.dumps(routes)) == routes


def test_proxy_without_servers_transport_uses_the_service_label(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, 'TCPLOG_SERVERS_TRANSPORT', '')
    proxy_labels, _ = tcplog_proxy('app', make_exposes(protocol.ExposeKind.TCP_SSL), 'abc123', 'net', 'target')
    service = 'traefik.tcp.services.ti-abc123-app-0.loadbalancer'
    assert proxy_labels[f'{service}.proxyProtocol.version'] == '2'
    assert f'{service}.serversTransport' not in proxy_labels


def test_tcp_only_container_is_left_out_of_traefik() -> None:
    exposes = {'app': make_exposes()['app'][:1]}
    labels: dict[str, str] = {}
    expose_ports(labels, 'app', exposes, 'abc123', 'ti-abc123-routing-0', [0], tcp_via_proxy=True)
    assert 'traefik.enable' not in labels
    assert labels[ContainerLabels.EXPOSED_HOSTNAMES] == 'shell-abc123.instances.example.com'


def test_no_tcp_exposes_means_no_proxy() -> None:
    exposes = {'app': make_exposes()['app'][1:]}
    assert tcplog_proxy('app', exposes, 'abc123', 'net', 'target') == ({}, [])
