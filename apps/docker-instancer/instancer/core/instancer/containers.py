import asyncio
import shlex

import orjson
from aiodocker import Docker, DockerError
from aiodocker.containers import DockerContainer

from instancer.core.config import config
from instancer.core.instancer.const import ContainerLabels, get_search_filters
from instancer.core.instancer.interpolation import interpolate_environment
from instancer.core.instancer.traefik import expose_ports, tcplog_proxy
from instancer.core.instancer.volumes import parse_volume_mounts
from instancer.protocol import types as protocol
from instancer.util.logger import logger
from instancer.util.nanos import parse_memory_bytes, parse_nano_sec


def merge(left: dict[str, str], right: dict[str, str]) -> dict[str, str]:
    left.update(right)
    return left


def container_name(challenge_integration_id: str, svc_name: str, instance_id: str) -> str:
    return f'{config.PREFIX}-{challenge_integration_id}-{svc_name}-{instance_id}'


def sh(command: str | list[str] | None) -> list[str] | None:
    if not command:
        return None
    if isinstance(command, list):
        return command
    return shlex.split(command)


async def create_container(  # noqa: PLR0913
    docker: Docker,
    challenge_integration_id: str,
    exposes: dict[str, list[protocol.InstancerExpose]],
    networks_created: dict[str, str],
    volumes_created: dict[str, str],
    common_labels: dict[str, str],
    svc_name: str,
    container: protocol.Service,
    routing_network: str | None,
    global_indices: list[int],
    env_context: dict[str, str],
    *,
    tcp_via_proxy: bool = False,
) -> tuple[DockerContainer, list[protocol.RCTFInstanceDetails.Endpoint]]:
    labels = common_labels.copy()
    instance_id = common_labels[ContainerLabels.INSTANCE_ID]
    actual_svc_name = container_name(challenge_integration_id, svc_name, instance_id)

    _, exposed = expose_ports(
        labels, svc_name, exposes, instance_id, routing_network, global_indices, tcp_via_proxy=tcp_via_proxy
    )

    endpoints_config: dict[str, dict] = {networks_created[network]: {} for network in container.networks}
    volume_mounts = parse_volume_mounts(container.volumes, volumes_created)
    if routing_network:
        endpoints_config[routing_network] = {}

    logger.info(f'Spinning up container {actual_svc_name=}')
    return (
        await docker.containers.create(
            config={
                'Image': container.image,
                'Hostname': container.hostname or svc_name.replace('_', '-'),
                'Env': [f'{k}={v}' for k, v in interpolate_environment(container.environment, env_context).items()],
                'Cmd': sh(container.command),
                'Entrypoint': sh(container.entrypoint),
                'WorkingDir': container.working_dir,
                'User': container.user,
                'NetworkingConfig': {
                    'EndpointsConfig': endpoints_config,
                },
                'ExposedPorts': {port: {} for port in container.expose},
                'Healthcheck': {
                    'Test': container.healthcheck.test,
                    'Interval': parse_nano_sec(container.healthcheck.interval),
                    'Timeout': parse_nano_sec(container.healthcheck.timeout),
                    'Retries': container.healthcheck.retries,
                    'StartPeriod': parse_nano_sec(container.healthcheck.start_period),
                }
                if container.healthcheck
                else None,
                'Labels': merge(container.labels, labels),
                'HostConfig': {
                    'NetworkMode': container.network_mode or ('bridge' if endpoints_config else 'none'),
                    'Mounts': volume_mounts or None,
                    'Dns': container.dns,
                    'DnsOptions': container.dns_opt,
                    'DnsSearch': container.dns_search,
                    'ExtraHosts': container.extra_hosts,
                    'Tmpfs': container.tmpfs,
                    'ShmSize': parse_memory_bytes(container.shm_size) if container.shm_size else None,
                    'ReadonlyRootfs': container.read_only,
                    'Privileged': container.privileged,
                    'SecurityOpt': container.security_opt,
                    'CapAdd': container.cap_add,
                    'CapDrop': container.cap_drop,
                    'Memory': parse_memory_bytes(container.mem_limit),
                    'MemorySwap': parse_memory_bytes(container.mem_limit),
                    'NanoCpus': int(container.cpus * 1e9),
                    'PidsLimit': container.pids_limit,
                    'Ulimits': [
                        {
                            'Name': name,
                            'Soft': ulimit.soft,
                            'Hard': ulimit.hard,
                        }
                        for name, ulimit in container.ulimits.items()
                    ],
                    'Sysctls': container.sysctls or None,
                    'RestartPolicy': {
                        'Name': container.restart,
                    },
                },
            },
            name=actual_svc_name,
        ),
        exposed,
    )


async def create_tcplog_container(
    docker: Docker,
    challenge_integration_id: str,
    exposes: dict[str, list[protocol.InstancerExpose]],
    common_labels: dict[str, str],
    svc_name: str,
    routing_network: str,
) -> DockerContainer | None:
    """The logging proxy Traefik routes a container's tcp-ssl exposes through.

    It lives only on the container's routing network, so it can reach nothing
    but that container, and it carries the instance's labels, so stopping or
    pruning the instance removes it with the rest. None when the container has
    no tcp-ssl exposes.
    """
    instance_id = common_labels[ContainerLabels.INSTANCE_ID]
    target = container_name(challenge_integration_id, svc_name, instance_id)
    traefik_labels, routes = tcplog_proxy(svc_name, exposes, instance_id, routing_network, target)
    if not routes:
        return None

    name = f'{target}-tcplog'
    logger.info(f'Spinning up tcplog proxy {name=}')
    return await docker.containers.create(
        config={
            'Image': config.TCPLOG_IMAGE,
            'Env': [
                f'TCPLOG_ROUTES={orjson.dumps(routes).decode()}',
                f'TCPLOG_MAX_BYTES={config.TCPLOG_MAX_BYTES}',
                f'TCPLOG_FLUSH_SECONDS={config.TCPLOG_FLUSH_SECONDS}',
            ],
            'Labels': {**common_labels, **traefik_labels, ContainerLabels.TCPLOG: 'true'},
            'NetworkingConfig': {'EndpointsConfig': {routing_network: {}}},
            'HostConfig': {
                'NetworkMode': routing_network,
                'ReadonlyRootfs': True,
                'CapDrop': ['ALL'],
                'SecurityOpt': ['no-new-privileges'],
                'Memory': parse_memory_bytes(config.TCPLOG_MEM_LIMIT),
                'MemorySwap': parse_memory_bytes(config.TCPLOG_MEM_LIMIT),
                'NanoCpus': int(0.25 * 1e9),
                'PidsLimit': 32,
                # stdout is what Vector ships; keep Docker's copy small
                'LogConfig': {'Type': 'json-file', 'Config': {'max-size': '10m', 'max-file': '2'}},
            },
        },
        name=name,
    )


async def get_containers(
    docker: Docker,
    challenge_name: str,
    team_id: str,
    *,
    limit: int | None = None,
    running_only: bool = False,
) -> list[DockerContainer]:
    kwargs: dict[str, int] = {}
    if limit is not None:
        kwargs['limit'] = limit
    try:
        return await docker.containers.list(
            all=not running_only,
            filters=get_search_filters(challenge_name, team_id),
            **kwargs,
        )
    except DockerError as err:
        logger.opt(exception=err).error(f'Error getting containers: {challenge_name=} {team_id=}')
        return []


async def instance_exists(docker: Docker, challenge_name: str, team_id: str) -> bool:
    return bool(await get_containers(docker, challenge_name, team_id))


async def cleanup_containers(containers: list[DockerContainer]) -> None:
    if not containers:
        return

    await asyncio.gather(*[container.delete(force=True) for container in containers], return_exceptions=True)
