<script lang="ts">
  import { AdminPlayerRole } from '@rctf/types'
  import type { MultiFilter } from '$lib/filters/core'
  import FilterBar from '$lib/filters/filter-bar.svelte'
  import type { ValueFilterFamily } from '$lib/filters/ui'
  import {
    IconCrown,
    IconGavel,
    IconSearch,
    IconSignOut,
    IconTrash,
    IconUsersThree,
  } from '$lib/icons'
  import Avatar from '$lib/ui/avatar.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import type { IconComponent } from '$lib/utils/categories'
  import { formatCtfOffset, formatLocalTime } from '$lib/utils/time'
  import AdminTable from '../admin-table.svelte'
  import {
    playerName,
    playerRole,
    roleLabel,
    ROW_HEIGHT,
    type AdminPlayer,
  } from './players-model'

  type Props = {
    rows: AdminPlayer[]
    search: string
    families: ValueFilterFamily[]
    filterFor: (family: ValueFilterFamily) => MultiFilter<unknown>
    hasActiveFilters: boolean
    onClearAll: () => void
    fetching: boolean
    fingerprint: string
    startTime: number | null | undefined
    hasNextPage: boolean
    isFetchingNextPage: boolean
    onLoadMore: () => void
    canManageTeams: boolean
    busyId: string | null
    onCopyDiscordId: (discordId: string) => void
    onMakeCaptain: (player: AdminPlayer) => void
    onMove: (player: AdminPlayer) => void
    onRemoveFromTeam: (player: AdminPlayer) => void
    onBan: (player: AdminPlayer) => void
    onDelete: (player: AdminPlayer) => void
  }

  let {
    rows,
    search = $bindable(),
    families,
    filterFor,
    hasActiveFilters,
    onClearAll,
    fetching,
    fingerprint,
    startTime,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    canManageTeams,
    busyId,
    onCopyDiscordId,
    onMakeCaptain,
    onMove,
    onRemoveFromTeam,
    onBan,
    onDelete,
  }: Props = $props()

  let tip = $state<{
    label: string
    x: number
    y: number
    place: 'top' | 'bottom'
  } | null>(null)

  function handleTipMove(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null
    const el = target?.closest<HTMLElement>('[data-tip]')
    const label = el?.dataset.tip
    if (!el || !label) {
      tip = null
      return
    }
    const rect = el.getBoundingClientRect()
    const place = rect.top < 72 ? 'bottom' : 'top'
    tip = {
      label,
      x: rect.left + rect.width / 2,
      y: place === 'top' ? rect.top : rect.bottom,
      place,
    }
  }

  function roleTone(role: AdminPlayerRole) {
    switch (role) {
      case AdminPlayerRole.CAPTAIN:
        return 'accent'
      case AdminPlayerRole.MEMBER:
        return 'success'
      case AdminPlayerRole.NO_TEAM:
        return 'warning'
    }
  }
</script>

{#snippet toolbar()}
  <players-toolbar>
    <search-field>
      <IconSearch aria-hidden="true" />
      <input
        type="search"
        placeholder="Search players, Discord ID or team..."
        aria-label="Search players, Discord ID or team"
        bind:value={search}
      />
    </search-field>
    <FilterBar
      {families}
      {filterFor}
      {hasActiveFilters}
      {onClearAll}
      {fetching}
    />
  </players-toolbar>
{/snippet}

{#snippet header()}
  <players-head>
    <th-cell>Player</th-cell>
    <th-cell>Discord ID</th-cell>
    <th-cell>Team</th-cell>
    <th-cell>Role</th-cell>
    <th-cell>Joined team</th-cell>
    <th-cell>First sign-in</th-cell>
    <th-cell>Actions</th-cell>
  </players-head>
{/snippet}

{#snippet timeCell(timestamp: number | null, label: string)}
  {#if timestamp === null}
    <muted>-</muted>
  {:else}
    {@const offset = formatCtfOffset(timestamp, startTime)}
    <time-cell data-tip={`${label} · ${new Date(timestamp).toISOString()}`}>
      <local>{formatLocalTime(timestamp)}</local>
      {#if offset}<offset-label>{offset}</offset-label>{/if}
    </time-cell>
  {/if}
{/snippet}

{#snippet action(opts: {
  label: string
  icon: IconComponent
  onclick: () => void
  destructive?: boolean
  disabled?: boolean
})}
  {@const Icon = opts.icon}
  <button
    type="button"
    data-tip={opts.label}
    data-tone={opts.destructive ? 'danger' : undefined}
    aria-label={opts.label}
    disabled={opts.disabled}
    onclick={opts.onclick}
  >
    <Icon aria-hidden="true" />
  </button>
{/snippet}

{#snippet row(player: AdminPlayer, index: number)}
  {@const role = playerRole(player)}
  {@const busy = busyId === player.id}
  {@const name = playerName(player)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <players-row
    data-even={index % 2 === 0 || undefined}
    data-banned={player.banned || undefined}
    onpointermove={handleTipMove}
    onpointerleave={() => (tip = null)}
  >
    <cell>
      <player-cell>
        <avatar-slot><Avatar src={player.avatarUrl} {name} /></avatar-slot>
        <player-names>
          <strong
            >{name}{#if player.banned}<tag data-tone="danger">Banned</tag
              >{/if}</strong
          >
          <span>@{player.discordUsername}</span>
        </player-names>
      </player-cell>
    </cell>
    <cell>
      <copy-button data-tip="Copy Discord ID">
        <button type="button" onclick={() => onCopyDiscordId(player.discordId)}
          >{player.discordId}</button
        >
      </copy-button>
    </cell>
    <cell>
      {#if player.team}
        <team-cell>
          <a
            href={canManageTeams && !player.team.isAdmin
              ? `/admin/profile/${player.team.id}`
              : `/profile/${player.team.id}`}>{player.team.name}</a
          >
          {#if player.team.isAdmin}<tag data-tone="accent">Admin</tag>{/if}
          {#if player.team.banned}<tag data-tone="danger">Banned</tag>{/if}
        </team-cell>
      {:else}
        <muted>No team</muted>
      {/if}
    </cell>
    <cell>
      <role-cell data-tone={roleTone(role)}>
        <role-dot aria-hidden="true"></role-dot>
        <span>{roleLabel(role)}</span>
      </role-cell>
    </cell>
    <cell>{@render timeCell(player.joinedTeamAt, 'Joined team')}</cell>
    <cell>{@render timeCell(player.createdAt, 'First sign-in')}</cell>
    <cell>
      <row-actions>
        {#if busy}
          <busy-slot><Spinner /></busy-slot>
        {:else}
          {#if role === AdminPlayerRole.MEMBER}
            {@render action({
              label: 'Make captain',
              icon: IconCrown,
              onclick: () => onMakeCaptain(player),
            })}
          {/if}
          {@render action({
            label: player.team ? 'Move to another team' : 'Add to a team',
            icon: IconUsersThree,
            onclick: () => onMove(player),
          })}
          {#if player.team}
            {@render action({
              label: 'Remove from team',
              icon: IconSignOut,
              destructive: true,
              onclick: () => onRemoveFromTeam(player),
            })}
          {/if}
          {@render action({
            label: player.banned ? 'Unban player' : 'Ban player',
            icon: IconGavel,
            destructive: !player.banned,
            onclick: () => onBan(player),
          })}
          {#if !player.banned}
            {@render action({
              label: 'Delete player',
              icon: IconTrash,
              destructive: true,
              onclick: () => onDelete(player),
            })}
          {/if}
        {/if}
      </row-actions>
    </cell>
  </players-row>
{/snippet}

{#snippet emptyState(filtered: boolean)}
  <empty-state>
    {#if filtered}
      <strong>No players match these filters</strong>
      <p>Adjust the search or filters to widen the results.</p>
    {:else}
      <strong>No players yet</strong>
      <p>Players appear here after they first sign in with Discord.</p>
    {/if}
  </empty-state>
{/snippet}

<table-region>
  <AdminTable
    {rows}
    rowHeight={ROW_HEIGHT}
    headerHeight={42}
    overscan={12}
    minTableWidth={1212}
    {fingerprint}
    {hasNextPage}
    {isFetchingNextPage}
    {onLoadMore}
    filtered={hasActiveFilters || search.trim().length > 0}
    {toolbar}
    {header}
    {row}
    {emptyState}
  />

  {#if tip}
    <players-tooltip
      aria-hidden="true"
      data-place={tip.place}
      style:left={`${tip.x}px`}
      style:top={`${tip.y}px`}
    >
      {tip.label}
    </players-tooltip>
  {/if}
</table-region>

<style>
  table-region {
    display: block;
    block-size: 100%;
    inline-size: 100%;
  }

  players-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs);
    border-block-end: 2px solid var(--border);
  }

  search-field {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
    flex-shrink: 0;
    inline-size: min(20rem, 46vw);
    block-size: 2rem;
    padding-inline: 0.5rem;
    color: var(--foreground-l3);
    background: var(--background-l4);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);

    :global(svg) {
      flex-shrink: 0;
      inline-size: 0.875rem;
      block-size: 0.875rem;
    }

    &:focus-within {
      border-color: var(--ring);
    }

    input {
      min-inline-size: 0;
      flex: 1;
      color: var(--foreground-l1);
      background: transparent;
      border: none;
      outline: none;
      font-size: var(--step--1);

      &::placeholder {
        color: var(--foreground-l4);
      }
    }
  }

  players-head,
  players-row {
    display: grid;
    grid-template-columns:
      minmax(14rem, 1.3fr) 13rem minmax(12rem, 1fr) 7rem 12rem 12rem
      10rem;
    inline-size: 100%;
    user-select: none;
  }

  players-head {
    block-size: 100%;
    border-block-end: 2px solid var(--border);
    background: var(--background-l2);
  }

  th-cell {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    padding-inline: var(--space-2xs);
    block-size: 2.5rem;
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  players-row {
    align-items: stretch;
    min-block-size: 3rem;
    background: var(--background-l1);

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

    &[data-banned] player-cell {
      opacity: 0.7;
    }
  }

  cell {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    padding-inline: var(--space-2xs);
    overflow: hidden;
  }

  player-cell {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    gap: var(--space-2xs);

    avatar-slot {
      --avatar-size: 2rem;
      --avatar-radius: var(--radius-md);
      display: flex;
      flex-shrink: 0;
    }
  }

  player-names {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    line-height: 1.2;

    strong,
    span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    strong {
      display: flex;
      align-items: center;
      gap: var(--space-3xs);
      color: var(--foreground-l1);
      font-weight: 500;
    }

    span {
      color: var(--foreground-l3);
      font-size: var(--step--2);
    }
  }

  copy-button {
    display: flex;
    min-inline-size: 0;

    button {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--foreground-l2);
      font-family: var(--font-mono);
      font-size: var(--step--1);
      background: transparent;
      border: none;
      white-space: nowrap;
      text-overflow: ellipsis;
      cursor: pointer;

      &:hover {
        color: var(--foreground-l1);
        text-decoration: underline;
      }
    }
  }

  team-cell {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    gap: var(--space-3xs);

    a {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--foreground-l1);
      white-space: nowrap;
      text-overflow: ellipsis;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  tag {
    flex-shrink: 0;
    padding: 0 var(--space-3xs);
    font-size: var(--step--2);
    border-radius: var(--radius-sm);

    &[data-tone='accent'] {
      color: var(--foreground-accent);
      background: var(--background-accent);
    }

    &[data-tone='danger'] {
      color: var(--foreground-destructive);
      background: color-mix(
        in srgb,
        var(--foreground-destructive) 14%,
        transparent
      );
    }
  }

  role-cell {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);

    role-dot {
      flex-shrink: 0;
      inline-size: 0.5rem;
      block-size: 0.5rem;
      border-radius: 50%;
      background: var(--tone-color);
    }

    &[data-tone='accent'] {
      --tone-color: var(--foreground-accent);
      color: var(--foreground-accent);
    }
    &[data-tone='success'] {
      --tone-color: var(--foreground-success);
      color: var(--foreground-success);
    }
    &[data-tone='warning'] {
      --tone-color: var(--foreground-yellow-l1);
      color: var(--foreground-yellow-l1);
    }
  }

  muted {
    color: var(--foreground-l4);
  }

  time-cell {
    display: flex;
    min-inline-size: 0;
    align-items: baseline;
    gap: var(--space-3xs);

    local {
      flex-shrink: 0;
      color: var(--foreground-l1);
      font-variant-numeric: tabular-nums;
    }

    offset-label {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--foreground-l3);
      font-size: var(--step--2);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
  }

  row-actions button,
  busy-slot {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    inline-size: 2rem;
    block-size: 2rem;
    border-radius: var(--radius-md);

    :global(svg) {
      inline-size: 1rem;
      block-size: 1rem;
    }
  }

  row-actions button {
    color: var(--foreground-l2);
    background: var(--background-l4);
    border: 2px solid transparent;
    cursor: pointer;

    &:hover {
      color: var(--foreground-l1);
      background: var(--background-l5);
    }

    &[data-tone='danger'] {
      color: var(--foreground-destructive);

      &:hover {
        background: color-mix(
          in srgb,
          var(--foreground-destructive) 16%,
          var(--background-l4)
        );
      }
    }

    &:focus-visible {
      outline: 2px solid var(--ring);
    }

    &:disabled {
      pointer-events: none;
      opacity: 0.6;
    }
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

  players-tooltip {
    position: fixed;
    z-index: var(--layer-popover);
    display: block;
    max-inline-size: 22rem;
    padding: var(--space-3xs) var(--space-2xs);
    color: var(--foreground-l1);
    background: var(--background-l2);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--step--1);
    white-space: nowrap;
    pointer-events: none;
    translate: -50% calc(-100% - 0.5rem);

    &[data-place='bottom'] {
      translate: -50% 0.5rem;
    }
  }
</style>
