<script lang="ts">
  import { FilterAdminUsersRouteV2, GoodAdminUsersV2 } from '@rctf/types'
  import { createQuery, keepPreviousData } from '@tanstack/svelte-query'
  import { apiRequest } from '$lib/api'
  import { IconSearch } from '$lib/icons'
  import { unwrapData } from '$lib/query/core'
  import Avatar from '$lib/ui/avatar.svelte'
  import Button from '$lib/ui/button.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import type { AdminPlayer } from './players-model'
  import { playerName } from './players-model'

  type Props = {
    player: AdminPlayer | null
    moving: boolean
    onClose: () => void
    onMove: (player: AdminPlayer, team: { id: string; name: string }) => void
  }

  let { player, moving, onClose, onMove }: Props = $props()

  let search = $state('')
  let debouncedSearch = $state('')
  let selected = $state<{ id: string; name: string } | null>(null)

  $effect(() => {
    const next = search
    const timeout = setTimeout(() => (debouncedSearch = next.trim()), 300)
    return () => clearTimeout(timeout)
  })

  // start fresh for every player the dialog opens for
  $effect(() => {
    void player?.id
    search = ''
    debouncedSearch = ''
    selected = null
  })

  const teamsQuery = createQuery(() => ({
    queryKey: ['admin', 'users', 'move-search', debouncedSearch] as const,
    queryFn: async () =>
      unwrapData(
        await apiRequest(FilterAdminUsersRouteV2, {
          limit: 8,
          offset: 0,
          ...(debouncedSearch ? { search: debouncedSearch.slice(0, 100) } : {}),
        }),
        GoodAdminUsersV2
      ),
    enabled: player !== null,
    placeholderData: keepPreviousData,
  }))

  const teams = $derived(
    (teamsQuery.data?.users ?? []).filter(team => team.id !== player?.team?.id)
  )
</script>

<Dialog
  open={player !== null}
  onOpenChange={open => {
    if (!open) onClose()
  }}
  title="Move to team"
  description={player
    ? `Choose a team for ${playerName(player)}. Their solves stay with their current team.`
    : ''}
>
  {#snippet children({ closeProps })}
    <move-body>
      <search-field>
        <IconSearch aria-hidden="true" />
        <input
          type="search"
          placeholder="Search teams..."
          aria-label="Search teams"
          bind:value={search}
        />
        {#if teamsQuery.isFetching}<Spinner />{/if}
      </search-field>

      <team-options role="listbox" aria-label="Teams">
        {#each teams as team (team.id)}
          <button
            type="button"
            role="option"
            aria-selected={selected?.id === team.id}
            data-selected={selected?.id === team.id || undefined}
            disabled={team.banned}
            onclick={() => (selected = { id: team.id, name: team.name })}
          >
            <Avatar src={team.avatarUrl} name={team.name} />
            <span>{team.name}</span>
            {#if team.banned}<option-note>Banned</option-note>{/if}
          </button>
        {:else}
          <empty-note>
            {teamsQuery.isPending ? 'Loading teams...' : 'No teams found'}
          </empty-note>
        {/each}
      </team-options>

      <move-actions>
        <Button {...closeProps} variant="secondary">Cancel</Button>
        <Button
          disabled={!selected || moving}
          onclick={() => {
            if (player && selected) onMove(player, selected)
          }}
        >
          {#if moving}<Spinner />{/if}
          {selected ? `Move to ${selected.name}` : 'Move'}
        </Button>
      </move-actions>
    </move-body>
  {/snippet}
</Dialog>

<style>
  move-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  search-field {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
    block-size: 2.25rem;
    padding-inline: 0.5rem;
    color: var(--foreground-l3);
    background: var(--background-l4);
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

  team-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    max-block-size: 18rem;
    overflow-y: auto;

    button {
      --avatar-size: 1.75rem;
      --avatar-radius: var(--radius-md);
      display: flex;
      align-items: center;
      gap: var(--space-2xs);
      min-inline-size: 0;
      padding: var(--space-3xs) var(--space-2xs);
      color: var(--foreground-l1);
      text-align: start;
      background: var(--background-l3);
      border: 2px solid transparent;
      border-radius: var(--radius-md);
      cursor: pointer;

      span {
        flex: 1;
        min-inline-size: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
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

      &:disabled {
        cursor: default;
        opacity: 0.5;
      }
    }
  }

  option-note,
  empty-note {
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  empty-note {
    padding: var(--space-2xs);
    text-align: center;
  }

  move-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2xs);
  }
</style>
