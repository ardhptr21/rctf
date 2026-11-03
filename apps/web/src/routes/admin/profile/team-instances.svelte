<script lang="ts">
  import { useAdminInstancesInfinite } from '$lib/query/admin'
  import Button from '$lib/ui/button.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { getCategoryConfig } from '$lib/utils/categories'
  import { formatLocalTime } from '$lib/utils/time'
  import {
    endpointLabel,
    formatLifetime,
    instanceQueryParams,
    STATUS_HINT,
    STATUS_LABEL,
    statusTone,
  } from '../instances/instances-model'

  type Props = { teamId: string }

  let { teamId }: Props = $props()

  const instancesQuery = useAdminInstancesInfinite(() =>
    instanceQueryParams({
      status: 'all',
      category: null,
      teamId,
      search: '',
    })
  )
  const firstPage = $derived(instancesQuery.data?.pages[0])
  const instances = $derived(
    instancesQuery.data?.pages.flatMap(result => result.instances) ?? []
  )
  const now = Date.now()
</script>

<team-instances>
  {#if instancesQuery.isPending}
    <list-status><Spinner /></list-status>
  {:else if instancesQuery.isError}
    <list-status>
      {instancesQuery.error?.message ?? 'Failed to load instances.'}
    </list-status>
  {:else if instances.length === 0}
    <list-status>This team hasn't started any instances.</list-status>
  {:else}
    <list-head>
      <span>
        {firstPage?.total} instance{firstPage?.total === 1 ? '' : 's'}
        {#if firstPage && firstPage.categories.length > 0}
          ·
          {firstPage.categories
            .map(entry => `${entry.category || 'deleted'} ${entry.count}`)
            .join(' · ')}
        {/if}
      </span>
      <Button
        size="sm"
        variant="ghost"
        href="/admin/instances?team={encodeURIComponent(teamId)}"
      >
        Open in Instances
      </Button>
    </list-head>
    <ul>
      {#each instances as instance (instance.id)}
        <li>
          <entry-main>
            <a
              class="challenge"
              href="/challenges?challenge={instance.challenge.id}"
              data-category-color={getCategoryConfig(
                instance.challenge.category
              ).color}
            >
              <span data-part="category">{instance.challenge.category} /</span>
              <span data-part="name">{instance.challenge.name}</span>
            </a>
            <status-badge
              data-tone={statusTone(instance.status)}
              title={STATUS_HINT[instance.status]}
              >{STATUS_LABEL[instance.status]}</status-badge
            >
          </entry-main>
          <entry-meta>
            <span>
              {formatLocalTime(Date.parse(instance.startedAt))}
              {#if instance.endedAt}
                → {formatLocalTime(Date.parse(instance.endedAt))}
              {/if}
            </span>
            <span
              >{formatLifetime(instance.startedAt, instance.endedAt, now)}</span
            >
            {#if instance.extendCount > 0}
              <span>extended {instance.extendCount}×</span>
            {/if}
            {#if instance.player}
              <span>by {instance.player.name ?? 'Deleted player'}</span>
            {/if}
            {#if instance.endpoints[0]}
              <code>{endpointLabel(instance.endpoints[0])}</code>
            {/if}
          </entry-meta>
        </li>
      {/each}
    </ul>
    {#if instancesQuery.hasNextPage}
      <Button
        variant="secondary"
        size="sm"
        disabled={instancesQuery.isFetchingNextPage}
        onclick={() => instancesQuery.fetchNextPage()}
      >
        {#if instancesQuery.isFetchingNextPage}<Spinner />{/if}
        Load more
      </Button>
    {/if}
  {/if}
</team-instances>

<style>
  team-instances {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  list-status {
    display: flex;
    justify-content: center;
    padding: var(--space-l);
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xs);
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    padding: var(--space-2xs) var(--space-xs);
    background: var(--background-l2);
    border-radius: var(--radius-md);
  }

  entry-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xs);
    min-inline-size: 0;
  }

  entry-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs) var(--space-xs);
    color: var(--foreground-l3);
    font-size: var(--step--1);
    font-variant-numeric: tabular-nums;
  }

  code {
    font-family: var(--font-mono);
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
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &:hover [data-part='name'] {
      text-decoration: underline;
    }
  }

  status-badge {
    flex-shrink: 0;
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
</style>
