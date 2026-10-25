<script lang="ts">
  import { IntegrityCaseStatus, Permissions } from '@rctf/types'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { useAdminIntegrityCasesInfinite } from '$lib/query/admin'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import Card from '$lib/ui/card.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { hasPermissions } from '$lib/utils/permissions'
  import { formatLocalTime } from '$lib/utils/time'
  import AdminTable from '../admin-table.svelte'
  import CasePanel from './case-panel.svelte'
  import {
    KIND_LABEL,
    PAGE_SIZE,
    riskBand,
    ROW_HEIGHT,
    STATUS_TABS,
    type IntegrityCase,
  } from './integrity-model'

  const configQuery = useClientConfig()
  const userQuery = useCurrentUser()
  const clientConfig = $derived(configQuery.data)
  const canReview = $derived(
    hasPermissions(
      userQuery.data,
      Permissions.usersWrite | Permissions.challsRead
    )
  )

  let status = $state(IntegrityCaseStatus.OPEN)
  const casesQuery = useAdminIntegrityCasesInfinite(
    () => ({ status, limit: PAGE_SIZE }),
    () => canReview
  )
  const rows = $derived(
    casesQuery.data?.pages.flatMap(result => result.cases) ?? []
  )
  const revealAfterLoading = casesQuery.isPending

  // the open case lives in the URL, so alert links can point straight at it
  const openCaseId = $derived(page.url.searchParams.get('case'))

  function openCase(id: string | null) {
    const url = new URL(page.url)
    if (id) url.searchParams.set('case', id)
    else url.searchParams.delete('case')
    goto(url, { replaceState: true, noScroll: true, keepFocus: true })
  }
</script>

<svelte:head>
  {#if clientConfig}
    <title>Integrity | {clientConfig.ctfName}</title>
  {/if}
</svelte:head>

{#snippet toolbar()}
  <integrity-toolbar>
    <status-tabs role="tablist" aria-label="Case status">
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
    {#if casesQuery.isFetching && !casesQuery.isFetchingNextPage}
      <Spinner />
    {/if}
  </integrity-toolbar>
{/snippet}

{#snippet header()}
  <cases-head>
    <th-cell>Teams</th-cell>
    <th-cell>Risk</th-cell>
    <th-cell>Signals</th-cell>
    <th-cell>Last signal</th-cell>
  </cases-head>
{/snippet}

{#snippet row(kase: IntegrityCase, index: number)}
  <cases-row
    role="button"
    tabindex="0"
    data-even={index % 2 === 0 || undefined}
    onclick={() => openCase(kase.id)}
    onkeydown={(e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openCase(kase.id)
      }
    }}
  >
    <cell>
      <case-teams>
        {#each [kase.team, kase.otherTeam] as team, teamIndex (teamIndex)}
          {#if team}
            {#if teamIndex > 0}<muted>and</muted>{/if}
            <team-name data-banned={team.banned || undefined}
              >{team.name}</team-name
            >
          {/if}
        {/each}
      </case-teams>
    </cell>
    <cell>
      <risk-badge data-band={riskBand(kase.score)}>{kase.score}</risk-badge>
    </cell>
    <cell>
      <kind-chips>
        {#each kase.kinds as kind (kind)}
          <kind-chip>{KIND_LABEL[kind]}</kind-chip>
        {/each}
        <muted>({kase.signalCount})</muted>
      </kind-chips>
    </cell>
    <cell><time>{formatLocalTime(kase.lastSignalAt)}</time></cell>
  </cases-row>
{/snippet}

{#snippet emptyState()}
  <empty-state>
    <strong>No {status} cases</strong>
    <p>
      {status === IntegrityCaseStatus.OPEN
        ? 'Suspicious activity found on flag submissions shows up here.'
        : 'Cases you review move here.'}
    </p>
  </empty-state>
{/snippet}

<integrity-page>
  {#if !canReview}
    <page-status>
      <Card title="Integrity unavailable">
        <p>
          Reviewing cases needs both the manage-teams and read-challenges
          permissions.
        </p>
      </Card>
    </page-status>
  {:else if !clientConfig || (casesQuery.isPending && !casesQuery.data)}
    <page-status><Spinner /></page-status>
  {:else if casesQuery.isError && !casesQuery.data}
    <page-status>
      <Card title="Failed to load cases">
        <p>{casesQuery.error?.message ?? 'Something went wrong.'}</p>
      </Card>
    </page-status>
  {:else}
    <page-reveal data-reveal={revealAfterLoading || undefined}>
      <AdminTable
        {rows}
        rowHeight={ROW_HEIGHT}
        headerHeight={42}
        minTableWidth={900}
        fingerprint={status}
        hasNextPage={casesQuery.hasNextPage ?? false}
        isFetchingNextPage={casesQuery.isFetchingNextPage}
        onLoadMore={() => casesQuery.fetchNextPage()}
        filtered={false}
        {toolbar}
        {header}
        {row}
        {emptyState}
      />
    </page-reveal>
  {/if}
</integrity-page>

<CasePanel caseId={openCaseId} onClose={() => openCase(null)} />

<style>
  integrity-page {
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

  integrity-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-2xs);
    border-block-end: 2px solid var(--border);
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

  cases-head,
  cases-row {
    display: grid;
    grid-template-columns: minmax(18rem, 1.6fr) 6rem minmax(16rem, 1.4fr) 12rem;
    inline-size: 100%;
  }

  cases-head {
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

  cases-row {
    min-block-size: 3rem;
    background: var(--background-l1);
    cursor: pointer;

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

    &:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }
  }

  cell {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    padding-inline: var(--space-2xs);
    overflow: hidden;
  }

  case-teams {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    gap: var(--space-3xs);
  }

  team-name {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--foreground-l1);
    white-space: nowrap;
    text-overflow: ellipsis;

    &[data-banned] {
      color: var(--foreground-destructive);
      text-decoration: line-through;
    }
  }

  risk-badge {
    padding: 0.125rem var(--space-2xs);
    color: var(--risk-color);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--risk-color) 14%, transparent);
    border-radius: var(--radius-md);

    &[data-band='low'] {
      --risk-color: var(--foreground-l2);
    }
    &[data-band='medium'] {
      --risk-color: var(--foreground-yellow-l1);
    }
    &[data-band='high'] {
      --risk-color: var(--foreground-destructive);
    }
  }

  kind-chips {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    gap: var(--space-3xs);
    overflow: hidden;
  }

  kind-chip {
    flex-shrink: 0;
    padding: 0 var(--space-3xs);
    color: var(--foreground-l2);
    font-size: var(--step--2);
    background: var(--background-l4);
    border-radius: var(--radius-sm);
  }

  muted {
    color: var(--foreground-l4);
    font-size: var(--step--1);
  }

  time {
    color: var(--foreground-l2);
    font-variant-numeric: tabular-nums;
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
