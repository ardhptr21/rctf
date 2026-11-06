<script lang="ts">
  import { IconArrowClockwise, IconCaretRight, IconSearch } from '$lib/icons'
  import {
    useAdminInstance,
    useAdminInstanceRequestsInfinite,
  } from '$lib/query/admin'
  import Button from '$lib/ui/button.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { getCategoryConfig } from '$lib/utils/categories'
  import { formatLocalTime } from '$lib/utils/time'
  import {
    endpointLabel,
    formatBytes,
    formatDurationMs,
    formatLifetime,
    hasHttpEndpoint,
    hasTcpEndpoint,
    requestDetails,
    STATUS_CLASS_FILTERS,
    STATUS_HINT,
    STATUS_LABEL,
    statusClassTone,
    statusTone,
  } from './instances-model'
  import SessionsSection from './sessions-section.svelte'

  type Props = {
    instanceId: string | null
    onClose: () => void
  }

  let { instanceId, onClose }: Props = $props()

  const detailQuery = useAdminInstance(() => instanceId)
  const detail = $derived(detailQuery.data)
  const instance = $derived(detail?.instance)

  // each log shows where it can have entries: TCP connections for tcp-ssl
  // endpoints, HTTP requests for HTTP ones (and for anything else)
  const showSessions = $derived(
    !!instance &&
      !!detail &&
      (hasTcpEndpoint(instance) || detail.sessions.total > 0)
  )
  const showRequests = $derived(
    !!instance &&
      !!detail &&
      (hasHttpEndpoint(instance) ||
        detail.requests.total > 0 ||
        !hasTcpEndpoint(instance))
  )

  let clientIp = $state('')
  let statusClass = $state<number | null>(null)
  let pathSearch = $state('')
  let debouncedPath = $state('')

  $effect(() => {
    const next = pathSearch
    const timeout = setTimeout(() => (debouncedPath = next.trim()), 400)
    return () => clearTimeout(timeout)
  })

  // start fresh for each instance the panel opens for
  $effect(() => {
    void instanceId
    clientIp = ''
    statusClass = null
    pathSearch = ''
    debouncedPath = ''
  })

  const requestsQuery = useAdminInstanceRequestsInfinite(
    () => instanceId,
    () => ({
      ...(clientIp ? { clientIp } : {}),
      ...(statusClass !== null ? { statusClass } : {}),
      ...(debouncedPath ? { path: debouncedPath.slice(0, 200) } : {}),
    })
  )
  const requests = $derived(
    requestsQuery.data?.pages.flatMap(result => result.requests) ?? []
  )
  const matching = $derived(requestsQuery.data?.pages[0]?.total ?? 0)
  const filtered = $derived(
    clientIp !== '' || statusClass !== null || debouncedPath !== ''
  )
  const now = $derived(Date.now())

  // newest requests and the totals above them; any filters stay as they are
  const refreshing = $derived(requestsQuery.isFetching)
  const refresh = () => {
    void detailQuery.refetch()
    void requestsQuery.refetch()
  }

  // the request whose details are shown, one at a time
  let expandedId = $state<string | null>(null)
  const toggle = (id: string) => {
    expandedId = expandedId === id ? null : id
  }

  $effect(() => {
    void instanceId
    expandedId = null
  })
</script>

<Dialog
  open={instanceId !== null}
  onOpenChange={open => {
    if (!open) onClose()
  }}
  title={instance
    ? `${instance.team.name} · ${instance.challenge.category} / ${instance.challenge.name}`
    : 'Instance'}
  maxInlineSize="min(64rem, 94vw)"
>
  {#snippet children()}
    {#if !detail || !instance}
      <panel-status>
        {#if detailQuery.isError}
          <p>{detailQuery.error?.message ?? 'Failed to load the instance.'}</p>
        {:else}
          <Spinner />
        {/if}
      </panel-status>
    {:else}
      <panel-body>
        <facts>
          <fact>
            <label-text>Status</label-text>
            <status-badge
              data-tone={statusTone(instance.status)}
              title={STATUS_HINT[instance.status]}
              >{STATUS_LABEL[instance.status]}</status-badge
            >
          </fact>
          <fact>
            <label-text>Team</label-text>
            <a href="/admin/profile/{instance.team.id}">{instance.team.name}</a>
            {#if instance.player}
              <muted>by {instance.player.name ?? 'Deleted player'}</muted>
            {/if}
          </fact>
          <fact>
            <label-text>Challenge</label-text>
            <span
              data-category-color={getCategoryConfig(
                instance.challenge.category
              ).color}
              class="challenge"
            >
              <span data-part="category">{instance.challenge.category} /</span>
              <span data-part="name">{instance.challenge.name}</span>
            </span>
          </fact>
          <fact>
            <label-text>Started</label-text>
            <span>{formatLocalTime(Date.parse(instance.startedAt))}</span>
          </fact>
          <fact>
            <label-text>Ended</label-text>
            <span
              >{instance.endedAt
                ? formatLocalTime(Date.parse(instance.endedAt))
                : '—'}</span
            >
          </fact>
          <fact>
            <label-text>Lifetime</label-text>
            <span
              >{formatLifetime(
                instance.startedAt,
                instance.endedAt,
                now
              )}{instance.extendCount > 0
                ? ` · extended ${instance.extendCount}×`
                : ''}</span
            >
          </fact>
          <fact>
            <label-text>Started from</label-text>
            <code>{instance.ip}</code>
          </fact>
          <fact data-wide>
            <label-text>Endpoints</label-text>
            {#each instance.endpoints as endpoint (endpoint.host + endpoint.port)}
              <code>{endpoint.kind} · {endpointLabel(endpoint)}</code>
            {:else}
              <muted>None</muted>
            {/each}
          </fact>
        </facts>

        {#if showSessions}
          <SessionsSection
            {instanceId}
            summary={detail.sessions}
            onRefresh={() => void detailQuery.refetch()}
          />
        {/if}

        {#if showRequests}
          <section-title>HTTP requests</section-title>
          <summary-row>
            <stat><strong>{detail.requests.total}</strong> requests</stat>
            <stat><strong>{detail.requests.uniqueIps}</strong> IPs</stat>
            {#each Object.entries(detail.requests.statusClasses) as [label, count] (label)}
              <stat data-tone={statusClassTone(Number(label[0]) * 100)}
                ><strong>{count}</strong> {label}</stat
              >
            {/each}
            {#if detail.requests.lastAt}
              <muted
                >last {formatLocalTime(
                  Date.parse(detail.requests.lastAt)
                )}</muted
              >
            {/if}
          </summary-row>
          {#if detail.requests.kept < detail.requests.total}
            <note
              >Showing the newest {detail.requests.kept} of {detail.requests
                .total} requests; older ones are no longer kept.</note
            >
          {/if}

          <filter-row>
            <search-field>
              <IconSearch aria-hidden="true" />
              <input
                type="search"
                placeholder="Path contains..."
                aria-label="Filter by path"
                bind:value={pathSearch}
              />
            </search-field>
            <class-tabs role="tablist" aria-label="Status class">
              {#each STATUS_CLASS_FILTERS as option (option.label)}
                <button
                  type="button"
                  role="tab"
                  aria-selected={statusClass === option.value}
                  data-selected={statusClass === option.value || undefined}
                  onclick={() => (statusClass = option.value)}
                >
                  {option.label}
                </button>
              {/each}
            </class-tabs>
            {#if clientIp}
              <ip-chip>
                IP {clientIp}
                <button
                  type="button"
                  aria-label="Show all IPs"
                  onclick={() => (clientIp = '')}>×</button
                >
              </ip-chip>
            {/if}
            <Button
              class="refresh"
              size="sm"
              variant="secondary"
              disabled={refreshing}
              onclick={refresh}
            >
              {#if refreshing}<Spinner />{:else}<IconArrowClockwise
                  aria-hidden="true"
                />{/if}
              Refresh
            </Button>
          </filter-row>

          <requests-table>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Client IP</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Time taken</th>
                </tr>
              </thead>
              <tbody>
                {#each requests as request (request.id)}
                  {@const open = expandedId === request.id}
                  {@const localTime = formatLocalTime(Date.parse(request.at))}
                  <tr
                    class="request"
                    data-open={open || undefined}
                    tabindex="0"
                    aria-expanded={open}
                    aria-controls="request-{request.id}"
                    title={open ? 'Hide details' : 'Show details'}
                    onclick={() => toggle(request.id)}
                    onkeydown={event => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggle(request.id)
                      }
                    }}
                  >
                    <td>
                      <time-cell>
                        <IconCaretRight aria-hidden="true" data-caret />
                        {localTime}
                      </time-cell>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ip"
                        title="Only this IP"
                        onclick={event => {
                          event.stopPropagation()
                          clientIp = request.clientIp
                        }}>{request.clientIp}</button
                      >
                    </td>
                    <td>{request.method}</td>
                    <td class="path"><code>{request.path}</code></td>
                    <td>
                      <status-code data-tone={statusClassTone(request.status)}
                        >{request.status}</status-code
                      >
                    </td>
                    <td>{formatBytes(request.bytes)}</td>
                    <td>{formatDurationMs(request.durationMs)}</td>
                  </tr>
                  {#if open}
                    <tr class="details" id="request-{request.id}">
                      <td colspan="7">
                        <dl>
                          {#each requestDetails(request, localTime) as detail (detail.label)}
                            <dt>{detail.label}</dt>
                            <dd>
                              {#if detail.code}<code>{detail.value}</code
                                >{:else}{detail.value}{/if}
                            </dd>
                          {/each}
                        </dl>
                      </td>
                    </tr>
                  {/if}
                {:else}
                  <tr>
                    <td colspan="7" class="empty">
                      {requestsQuery.isPending
                        ? 'Loading requests...'
                        : filtered
                          ? 'No requests match these filters.'
                          : 'No requests reached this instance.'}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </requests-table>
          <table-foot>
            <muted
              >{requests.length} of {matching}{filtered
                ? ' matching'
                : ''}</muted
            >
            {#if requestsQuery.hasNextPage}
              <Button
                size="sm"
                variant="secondary"
                disabled={requestsQuery.isFetchingNextPage}
                onclick={() => requestsQuery.fetchNextPage()}
              >
                {#if requestsQuery.isFetchingNextPage}<Spinner />{/if}
                Load more
              </Button>
            {/if}
          </table-foot>
        {/if}
      </panel-body>
    {/if}
  {/snippet}
</Dialog>

<style>
  panel-status {
    display: flex;
    justify-content: center;
    padding: var(--space-l);
    color: var(--foreground-l3);
  }

  panel-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--space-xs) var(--space-s);
  }

  fact {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-inline-size: 0;
    font-size: var(--step--1);

    &[data-wide] {
      grid-column: 1 / -1;
    }

    a {
      color: var(--foreground-l1);

      &:hover {
        text-decoration: underline;
      }
    }

    > span,
    > code {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  label-text {
    color: var(--foreground-l4);
    font-size: var(--step--2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .challenge {
    display: inline-flex;
    gap: var(--space-3xs);

    [data-part='category'] {
      color: var(--category-foreground-l1);
    }

    [data-part='name'] {
      color: var(--category-foreground-l0);
    }
  }

  section-title {
    padding-block-start: var(--space-2xs);
    color: var(--foreground-l1);
    font-weight: 600;
    border-block-start: 2px solid var(--border);
  }

  summary-row,
  filter-row,
  table-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs);
  }

  table-foot {
    justify-content: space-between;
  }

  filter-row :global(.refresh) {
    margin-inline-start: auto;
  }

  stat {
    padding: 0.125rem var(--space-2xs);
    color: var(--foreground-l2);
    font-size: var(--step--1);
    background: var(--background-l3);
    border-radius: var(--radius-md);

    strong {
      color: var(--foreground-l1);
      font-variant-numeric: tabular-nums;
    }

    &[data-tone='success'] strong {
      color: var(--foreground-success);
    }
    &[data-tone='info'] strong {
      color: var(--foreground-sky-l1);
    }
    &[data-tone='warning'] strong {
      color: var(--foreground-yellow-l1);
    }
    &[data-tone='danger'] strong {
      color: var(--foreground-destructive);
    }
  }

  note {
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  search-field {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
    inline-size: 14rem;
    block-size: 2rem;
    padding-inline: 0.5rem;
    color: var(--foreground-l3);
    background: var(--background-l3);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);

    &:focus-within {
      border-color: var(--ring);
    }

    input {
      flex: 1;
      min-inline-size: 0;
      color: var(--foreground-l1);
      background: transparent;
      border: none;
      outline: none;
    }
  }

  class-tabs {
    display: flex;
    gap: var(--space-3xs);
    padding: 0.125rem;
    background: var(--background-l3);
    border-radius: var(--radius-md);

    button {
      padding: 0.25rem var(--space-xs);
      color: var(--foreground-l3);
      font-size: var(--step--1);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;

      &:hover {
        color: var(--foreground-l1);
      }

      &[data-selected] {
        color: var(--foreground-l0);
        background: var(--background-l5);
      }
    }
  }

  ip-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3xs);
    padding: 0.125rem var(--space-2xs);
    font-size: var(--step--1);
    background: var(--background-l4);
    border-radius: var(--radius-md);

    button {
      color: var(--foreground-l3);
      background: transparent;
      border: none;
      cursor: pointer;
    }
  }

  requests-table {
    display: block;
    max-block-size: 24rem;
    overflow: auto;
    border: 2px solid var(--border);
    border-radius: var(--radius-md);

    table {
      inline-size: 100%;
      font-size: var(--step--1);
      font-variant-numeric: tabular-nums;
      border-collapse: collapse;
    }

    th,
    td {
      padding: var(--space-3xs) var(--space-2xs);
      text-align: start;
      white-space: nowrap;
    }

    th {
      position: sticky;
      inset-block-start: 0;
      color: var(--foreground-l3);
      font-weight: 600;
      background: var(--background-l3);
    }

    td {
      color: var(--foreground-l2);
    }

    tbody tr + tr td {
      border-block-start: 1px solid var(--border);
    }

    .path {
      max-inline-size: 26rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty {
      padding: var(--space-m);
      color: var(--foreground-l3);
      text-align: center;
    }

    .request {
      cursor: pointer;

      &:hover td,
      &[data-open] td {
        background: var(--background-l3);
      }

      &:focus-visible {
        outline: 2px solid var(--foreground-l2);
        outline-offset: -2px;
      }
    }

    time-cell {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3xs);

      :global([data-caret]) {
        flex: none;
        color: var(--foreground-l3);
        transition: rotate 120ms ease;
      }
    }

    .request[data-open] time-cell :global([data-caret]) {
      rotate: 90deg;
    }

    .details td {
      padding: var(--space-xs) var(--space-s);
      white-space: normal;
      background: var(--background-l2);
      border-block-start: none;
    }

    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--space-3xs) var(--space-s);
      margin: 0;
    }

    dt {
      color: var(--foreground-l3);
    }

    dd {
      margin: 0;
      color: var(--foreground-l1);
      overflow-wrap: anywhere;

      code {
        white-space: pre-wrap;
        word-break: break-all;
      }
    }
  }

  .ip {
    padding: 0;
    color: var(--foreground-l2);
    font: inherit;
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover {
      color: var(--foreground-l1);
      text-decoration: underline;
    }
  }

  status-code {
    font-weight: 600;

    &[data-tone='success'] {
      color: var(--foreground-success);
    }
    &[data-tone='info'] {
      color: var(--foreground-sky-l1);
    }
    &[data-tone='warning'] {
      color: var(--foreground-yellow-l1);
    }
    &[data-tone='danger'] {
      color: var(--foreground-destructive);
    }
  }

  status-badge {
    align-self: flex-start;
    padding: 0.125rem var(--space-2xs);
    font-weight: 500;
    border-radius: var(--radius-md);

    &[data-tone='success'] {
      color: var(--foreground-success);
      background: var(--background-success);
    }
    &[data-tone='info'] {
      color: var(--foreground-sky-l1);
      background: color-mix(in srgb, var(--foreground-sky-l1) 14%, transparent);
    }
    &[data-tone='muted'] {
      color: var(--foreground-l2);
      background: var(--background-l4);
    }
    &[data-tone='warning'] {
      color: var(--foreground-yellow-l1);
      background: color-mix(
        in srgb,
        var(--foreground-yellow-l1) 14%,
        transparent
      );
    }
    &[data-tone='danger'] {
      color: var(--foreground-destructive);
      background: var(--background-destructive);
    }
  }

  muted {
    color: var(--foreground-l4);
    font-size: var(--step--1);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--step--1);
  }
</style>
