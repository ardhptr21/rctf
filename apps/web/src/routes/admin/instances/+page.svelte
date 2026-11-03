<script lang="ts">
  import { Permissions } from '@rctf/types'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { IconSearch, IconX } from '$lib/icons'
  import { useAdminInstancesInfinite } from '$lib/query/admin'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import Card from '$lib/ui/card.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { getCategoryConfig } from '$lib/utils/categories'
  import { hasPermissions } from '$lib/utils/permissions'
  import { formatCtfOffset, formatLocalTime } from '$lib/utils/time'
  import AdminTable from '../admin-table.svelte'
  import InstancePanel from './instance-panel.svelte'
  import {
    endpointLabel,
    formatLifetime,
    instanceQueryParams,
    ROW_HEIGHT,
    STATUS_HINT,
    STATUS_LABEL,
    STATUS_TABS,
    statusTone,
    type AdminInstance,
    type StatusTab,
  } from './instances-model'

  const configQuery = useClientConfig()
  const userQuery = useCurrentUser()
  const clientConfig = $derived(configQuery.data)
  const canView = $derived(
    hasPermissions(
      userQuery.data,
      Permissions.usersWrite | Permissions.challsRead
    )
  )

  let status = $state<StatusTab>('all')
  let category = $state<string | null>(null)
  let search = $state('')
  let debouncedSearch = $state('')

  $effect(() => {
    const next = search
    const timeout = setTimeout(() => (debouncedSearch = next), 400)
    return () => clearTimeout(timeout)
  })

  // a team's profile links here with ?team=<id>
  const teamId = $derived(page.url.searchParams.get('team'))

  // the open instance lives in the URL, so it can be linked to
  const openInstanceId = $derived(page.url.searchParams.get('instance'))

  function openInstance(id: string | null) {
    const url = new URL(page.url)
    if (id) url.searchParams.set('instance', id)
    else url.searchParams.delete('instance')
    goto(url, { replaceState: true, noScroll: true, keepFocus: true })
  }

  function clearTeam() {
    const url = new URL(page.url)
    url.searchParams.delete('team')
    goto(url, { replaceState: true, noScroll: true, keepFocus: true })
  }

  const filters = $derived({
    status,
    category,
    teamId,
    search: debouncedSearch,
  })

  const instancesQuery = useAdminInstancesInfinite(
    () => instanceQueryParams(filters),
    () => canView
  )
  const firstPage = $derived(instancesQuery.data?.pages[0])
  const rows = $derived(
    instancesQuery.data?.pages.flatMap(result => result.instances) ?? []
  )
  const teamName = $derived(
    teamId
      ? (rows.find(row => row.team.id === teamId)?.team.name ?? null)
      : null
  )
  const revealAfterLoading = instancesQuery.isPending

  // running instances show how long they've been up
  let now = $state(Date.now())
  $effect(() => {
    const interval = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(interval)
  })

  const fingerprint = $derived(JSON.stringify(filters))
  const filtered = $derived(
    status !== 'all' ||
      category !== null ||
      teamId !== null ||
      debouncedSearch.trim() !== ''
  )
</script>

<svelte:head>
  {#if clientConfig}
    <title>Instances | {clientConfig.ctfName}</title>
  {/if}
</svelte:head>

{#snippet toolbar()}
  <instances-toolbar>
    <toolbar-row>
      <search-field>
        <IconSearch aria-hidden="true" />
        <input
          type="search"
          placeholder="Search teams or players..."
          aria-label="Search teams or players"
          bind:value={search}
        />
      </search-field>
      <status-tabs role="tablist" aria-label="Instance status">
        {#each STATUS_TABS as tab (tab.value)}
          <button
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            data-selected={status === tab.value || undefined}
            onclick={() => (status = tab.value)}
          >
            {tab.label}
          </button>
        {/each}
      </status-tabs>
      {#if instancesQuery.isFetching && !instancesQuery.isFetchingNextPage}
        <Spinner />
      {/if}
    </toolbar-row>

    {#if firstPage}
      <toolbar-row>
        <summary-text>
          {firstPage.total} instance{firstPage.total === 1 ? '' : 's'} by
          {firstPage.teams} team{firstPage.teams === 1 ? '' : 's'}
        </summary-text>
        {#if teamId}
          <filter-chip>
            Team: {teamName ?? 'this team'}
            <button
              type="button"
              aria-label="Show all teams"
              onclick={clearTeam}
            >
              <IconX aria-hidden="true" />
            </button>
          </filter-chip>
        {/if}
        <category-counts aria-label="Instances per category">
          {#if category !== null}
            <button type="button" onclick={() => (category = null)}>
              All categories
            </button>
          {/if}
          {#each firstPage.categories as entry (entry.category)}
            <button
              type="button"
              data-category-color={getCategoryConfig(entry.category).color}
              data-selected={category === entry.category || undefined}
              aria-pressed={category === entry.category}
              onclick={() =>
                (category =
                  category === entry.category ? null : entry.category)}
            >
              <span>{entry.category || 'deleted'}</span>
              <strong>{entry.count}</strong>
            </button>
          {/each}
        </category-counts>
      </toolbar-row>
    {/if}
  </instances-toolbar>
{/snippet}

{#snippet header()}
  <instances-head>
    <th-cell>Started</th-cell>
    <th-cell>Team</th-cell>
    <th-cell>Challenge</th-cell>
    <th-cell>Status</th-cell>
    <th-cell>Ended</th-cell>
    <th-cell>Lifetime</th-cell>
    <th-cell>Extends</th-cell>
    <th-cell>Requests</th-cell>
    <th-cell>Endpoint</th-cell>
    <th-cell>IP</th-cell>
  </instances-head>
{/snippet}

{#snippet row(instance: AdminInstance, index: number)}
  {@const startedAt = Date.parse(instance.startedAt)}
  {@const offset = formatCtfOffset(startedAt, clientConfig?.startTime)}
  <instances-row
    role="button"
    tabindex="0"
    data-even={index % 2 === 0 || undefined}
    onclick={() => openInstance(instance.id)}
    onkeydown={(event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openInstance(instance.id)
      }
    }}
  >
    <cell title={`UTC ${new Date(startedAt).toISOString()}`}>
      <stacked>
        <span>{formatLocalTime(startedAt)}</span>
        {#if offset}<muted>{offset}</muted>{/if}
      </stacked>
    </cell>
    <cell>
      <stacked>
        <a
          href="/admin/profile/{instance.team.id}"
          onclick={event => event.stopPropagation()}>{instance.team.name}</a
        >
        {#if instance.player}
          <muted title={instance.player.username ?? undefined}
            >{instance.player.name ?? 'Deleted player'}</muted
          >
        {/if}
      </stacked>
    </cell>
    <cell>
      <a
        class="challenge"
        href="/challenges?challenge={instance.challenge.id}"
        onclick={event => event.stopPropagation()}
        data-category-color={getCategoryConfig(instance.challenge.category)
          .color}
      >
        <span data-part="category">{instance.challenge.category} /</span>
        <span data-part="name">{instance.challenge.name}</span>
      </a>
    </cell>
    <cell>
      <status-badge
        data-tone={statusTone(instance.status)}
        title={STATUS_HINT[instance.status]}
        >{STATUS_LABEL[instance.status]}</status-badge
      >
    </cell>
    <cell>
      {#if instance.endedAt}
        <span title={`UTC ${new Date(instance.endedAt).toISOString()}`}
          >{formatLocalTime(Date.parse(instance.endedAt))}</span
        >
      {:else}
        <muted>—</muted>
      {/if}
    </cell>
    <cell
      ><span>{formatLifetime(instance.startedAt, instance.endedAt, now)}</span
      ></cell
    >
    <cell><span>{instance.extendCount}</span></cell>
    <cell><span>{instance.requestCount}</span></cell>
    <cell>
      {#if instance.endpoints.length > 0}
        <code title={instance.endpoints.map(endpointLabel).join('\n')}
          >{endpointLabel(instance.endpoints[0]!)}{instance.endpoints.length > 1
            ? ` +${instance.endpoints.length - 1}`
            : ''}</code
        >
      {:else}
        <muted>—</muted>
      {/if}
    </cell>
    <cell><code>{instance.ip}</code></cell>
  </instances-row>
{/snippet}

{#snippet emptyState()}
  <empty-state>
    <strong>No instances</strong>
    <p>
      {filtered
        ? 'Nothing matches these filters.'
        : 'Instances teams start from challenge pages show up here.'}
    </p>
  </empty-state>
{/snippet}

<instances-page>
  {#if !canView}
    <page-status>
      <Card title="Instances unavailable">
        <p>
          Viewing instances needs both the manage-teams and read-challenges
          permissions.
        </p>
      </Card>
    </page-status>
  {:else if !clientConfig || (instancesQuery.isPending && !instancesQuery.data)}
    <page-status><Spinner /></page-status>
  {:else if instancesQuery.isError && !instancesQuery.data}
    <page-status>
      <Card title="Failed to load instances">
        <p>{instancesQuery.error?.message ?? 'Something went wrong.'}</p>
      </Card>
    </page-status>
  {:else}
    <page-reveal data-reveal={revealAfterLoading || undefined}>
      <AdminTable
        {rows}
        rowHeight={ROW_HEIGHT}
        headerHeight={42}
        minTableWidth={1430}
        {fingerprint}
        hasNextPage={instancesQuery.hasNextPage ?? false}
        isFetchingNextPage={instancesQuery.isFetchingNextPage}
        onLoadMore={() => instancesQuery.fetchNextPage()}
        {filtered}
        {toolbar}
        {header}
        {row}
        {emptyState}
      />
    </page-reveal>
  {/if}
</instances-page>

<InstancePanel instanceId={openInstanceId} onClose={() => openInstance(null)} />

<style>
  instances-page {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    block-size: calc(100dvh - var(--header-height));
    max-block-size: calc(100dvh - var(--header-height));
    padding: 0 1rem 1rem;
    overflow: hidden;

    @media (width >= 48rem) {
      padding-inline: 2.25rem;
    }
  }

  page-reveal {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }

  page-status {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: var(--space-l);

    :global(ui-card) {
      inline-size: 100%;
      max-inline-size: 28rem;
    }

    p {
      color: var(--foreground-l3);
    }
  }

  instances-toolbar {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-2xs);
    border-block-end: 2px solid var(--border);
  }

  toolbar-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  search-field {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
    inline-size: 16rem;
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

      &::placeholder {
        color: var(--foreground-l4);
      }
    }
  }

  status-tabs {
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

      &:focus-visible {
        outline: 2px solid var(--ring);
      }
    }
  }

  summary-text {
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  filter-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3xs);
    padding: 0.125rem 0.25rem 0.125rem var(--space-2xs);
    color: var(--foreground-l1);
    font-size: var(--step--1);
    background: var(--background-l4);
    border-radius: var(--radius-md);

    button {
      display: flex;
      padding: 0.125rem;
      color: var(--foreground-l3);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;

      &:hover {
        color: var(--foreground-l1);
      }
    }
  }

  category-counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);

    button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3xs);
      padding: 0.125rem var(--space-2xs);
      color: var(--category-foreground-l1, var(--foreground-l2));
      font-size: var(--step--1);
      background: var(--background-l3);
      border: 2px solid transparent;
      border-radius: var(--radius-md);
      cursor: pointer;

      strong {
        color: var(--category-foreground-l0, var(--foreground-l1));
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      &:hover {
        background: var(--background-l4);
      }

      &[data-selected] {
        border-color: var(--ring);
      }

      &:focus-visible {
        outline: 2px solid var(--ring);
      }
    }
  }

  instances-head,
  instances-row {
    display: grid;
    grid-template-columns:
      10rem minmax(12rem, 1.2fr) minmax(12rem, 1.2fr) 7rem 9rem 6.5rem
      4.5rem 5.5rem minmax(14rem, 1.4fr) 9rem;
    inline-size: 100%;
  }

  instances-head {
    block-size: 100%;
    background: var(--background-l2);
    border-block-end: 2px solid var(--border);
  }

  th-cell {
    display: flex;
    align-items: center;
    padding-inline: var(--space-2xs);
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  instances-row {
    min-block-size: 3rem;
    background: var(--background-l1);
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }

    &[data-even] {
      background: color-mix(
        in srgb,
        var(--background-l2) 55%,
        var(--background-l1)
      );
    }

    &:hover {
      background: var(--background-l3);
    }
  }

  cell {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    padding-inline: var(--space-2xs);
    overflow: hidden;
    color: var(--foreground-l2);
    font-size: var(--step--1);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;

    > span,
    code {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  stacked {
    display: flex;
    min-inline-size: 0;
    flex-direction: column;

    > * {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    a {
      color: var(--foreground-l1);
      font-size: var(--step-0);

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .challenge {
    display: inline-flex;
    min-inline-size: 0;
    gap: var(--space-3xs);
    overflow: hidden;

    [data-part='category'] {
      flex-shrink: 0;
      color: var(--category-foreground-l1);
    }

    [data-part='name'] {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--category-foreground-l0);
      text-overflow: ellipsis;
    }

    &:hover [data-part='name'] {
      text-decoration: underline;
    }
  }

  status-badge {
    padding: 0.125rem var(--space-2xs);
    font-size: var(--step--1);
    font-weight: 500;
    border-radius: var(--radius-md);

    &[data-tone='success'] {
      color: var(--foreground-success);
      background: var(--background-success);
    }

    &[data-tone='info'] {
      color: var(--foreground-blue-l1);
      background: color-mix(
        in srgb,
        var(--foreground-blue-l1) 14%,
        transparent
      );
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
    color: var(--foreground-l2);
    font-family: var(--font-mono);
    font-size: var(--step--1);
  }

  empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    align-items: center;
    text-align: center;

    strong {
      color: var(--foreground-l1);
      font-weight: 500;
    }

    p {
      color: var(--foreground-l3);
      font-size: var(--step--1);
    }
  }
</style>
