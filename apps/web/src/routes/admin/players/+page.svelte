<script lang="ts">
  import {
    DeleteAdminPlayerRouteV2,
    GoodAdminPlayerDelete,
    GoodAdminPlayerUpdate,
    MakeAdminPlayerCaptainRouteV2,
    Permissions,
    SetAdminPlayerBannedRouteV2,
    SetAdminPlayerTeamRouteV2,
    type AdminPlayerRole,
    type AdminPlayerStatus,
  } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { apiRequest, showApiError } from '$lib/api'
  import {
    clearFilter,
    createFilter,
    type MultiFilter,
  } from '$lib/filters/core'
  import type { ValueFilterFamily } from '$lib/filters/ui'
  import {
    invalidateAdminPlayerQueries,
    useAdminPlayersInfinite,
  } from '$lib/query/admin'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import { toast } from '$lib/toast'
  import Card from '$lib/ui/card.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { createAsyncAction } from '$lib/utils/async-action.svelte'
  import { copyText } from '$lib/utils/clipboard'
  import { hasPermissions } from '$lib/utils/permissions'
  import { createConfirmState } from '../confirm-state.svelte'
  import ConfirmDialog from '../profile/confirm-dialog.svelte'
  import MoveDialog from './move-dialog.svelte'
  import { roleFilterFamily, statusFilterFamily } from './players-families'
  import {
    filtersMatchNothing,
    playerFingerprint,
    playerName,
    playerQueryParams,
    type AdminPlayer,
    type PlayerFilters,
  } from './players-model'
  import PlayersTable from './players-table.svelte'

  const queryClient = useQueryClient()
  const configQuery = useClientConfig()
  const currentUserQuery = useCurrentUser()

  const clientConfig = $derived(configQuery.data)
  const canWrite = $derived(
    hasPermissions(currentUserQuery.data, Permissions.usersWrite)
  )
  const canManageTeams = $derived(
    canWrite && hasPermissions(currentUserQuery.data, Permissions.challsRead)
  )

  let roleFilter = $state<MultiFilter<AdminPlayerRole>>(createFilter())
  let statusFilter = $state<MultiFilter<AdminPlayerStatus>>(createFilter())
  let search = $state('')
  let debouncedSearch = $state('')

  $effect(() => {
    const next = search
    const timeout = setTimeout(() => (debouncedSearch = next), 400)
    return () => clearTimeout(timeout)
  })

  const families = [
    roleFilterFamily(roleFilter),
    statusFilterFamily(statusFilter),
  ]
  function filterFor(family: ValueFilterFamily): MultiFilter<unknown> {
    return (
      family.id === 'role' ? roleFilter : statusFilter
    ) as MultiFilter<unknown>
  }
  function clearAllFilters() {
    clearFilter(roleFilter)
    clearFilter(statusFilter)
  }
  const filters = $derived<PlayerFilters>({
    roles: roleFilter,
    statuses: statusFilter,
  })
  const hasActiveFilters = $derived(
    roleFilter.selected.length > 0 || statusFilter.selected.length > 0
  )
  const matchesNothing = $derived(filtersMatchNothing(filters))

  const playersQuery = useAdminPlayersInfinite(
    () => playerQueryParams(filters, debouncedSearch),
    () => canWrite && !matchesNothing
  )
  const revealAfterLoading = playersQuery.isPending

  const rows = $derived<AdminPlayer[]>(
    matchesNothing
      ? []
      : (playersQuery.data?.pages.flatMap(page => page.players) ?? [])
  )
  const fingerprint = $derived(playerFingerprint(filters, debouncedSearch))

  const showError = $derived(
    !!playersQuery.error && !playersQuery.data && !matchesNothing
  )
  const showLoading = $derived(
    !clientConfig ||
      (!matchesNothing && playersQuery.isPending && !playersQuery.data)
  )

  const busyAction = createAsyncAction<string>()
  const confirmState = createConfirmState()
  let moveTarget = $state<AdminPlayer | null>(null)

  async function update(
    player: AdminPlayer,
    request: () => Promise<{ kind: string; message: string; data?: unknown }>,
    successMessage: string,
    errorMessage: string,
    goodKind: string = GoodAdminPlayerUpdate.kind
  ): Promise<boolean> {
    let ok = false
    await busyAction.run(
      async () => {
        const response = await request()
        if (response.kind === goodKind) {
          toast.success(successMessage)
          invalidateAdminPlayerQueries(queryClient)
          ok = true
        } else {
          showApiError(response)
        }
      },
      { key: player.id, errorMessage }
    )
    return ok
  }

  function makeCaptain(player: AdminPlayer) {
    const name = playerName(player)
    confirmState.request({
      title: 'Make captain',
      message: `${name} becomes captain of ${player.team?.name}, and the current captain becomes a member.`,
      confirmLabel: 'Make captain',
      destructive: false,
      run: () =>
        update(
          player,
          () => apiRequest(MakeAdminPlayerCaptainRouteV2, { id: player.id }),
          `${name} is now captain of ${player.team?.name}.`,
          `Failed to make ${name} captain`
        ),
    })
  }

  async function move(player: AdminPlayer, team: { id: string; name: string }) {
    const name = playerName(player)
    const moved = await update(
      player,
      () =>
        apiRequest(SetAdminPlayerTeamRouteV2, {
          id: player.id,
          teamId: team.id,
        }),
      `${name} moved to ${team.name}.`,
      `Failed to move ${name}`
    )
    if (moved) moveTarget = null
  }

  function removeFromTeam(player: AdminPlayer) {
    const name = playerName(player)
    confirmState.request({
      title: 'Remove from team',
      message: `${name} leaves ${player.team?.name}. The team keeps its solves${player.isCaptain ? ', and its longest-serving member becomes captain' : ''}.`,
      confirmLabel: 'Remove',
      destructive: true,
      run: () =>
        update(
          player,
          () =>
            apiRequest(SetAdminPlayerTeamRouteV2, {
              id: player.id,
              teamId: null,
            }),
          `${name} removed from ${player.team?.name}.`,
          `Failed to remove ${name} from their team`
        ),
    })
  }

  function setBanned(player: AdminPlayer, banned: boolean) {
    const name = playerName(player)
    return update(
      player,
      () => apiRequest(SetAdminPlayerBannedRouteV2, { id: player.id, banned }),
      `${name} ${banned ? 'banned' : 'unbanned'}.`,
      `Failed to ${banned ? 'ban' : 'unban'} ${name}`
    )
  }

  function toggleBan(player: AdminPlayer) {
    if (player.banned) {
      setBanned(player, false)
      return
    }
    const name = playerName(player)
    confirmState.request({
      title: 'Ban player',
      message: `${name} is signed out and can't sign in again with this Discord account until you unban them. They stay on ${player.team ? player.team.name : 'no team'}, and their team's solves and score are unaffected.`,
      confirmLabel: 'Ban player',
      destructive: true,
      run: () => setBanned(player, true),
    })
  }

  function deletePlayer(player: AdminPlayer) {
    const name = playerName(player)
    confirmState.request({
      title: 'Delete player',
      message: `This deletes ${name}'s account and signs them out. Their team keeps its solves. If they sign in with Discord again, they start with a new account and no team.`,
      confirmLabel: 'Delete player',
      destructive: true,
      run: () =>
        update(
          player,
          () => apiRequest(DeleteAdminPlayerRouteV2, { id: player.id }),
          `${name} deleted.`,
          `Failed to delete ${name}`,
          GoodAdminPlayerDelete.kind
        ),
    })
  }
</script>

<svelte:head>
  {#if clientConfig}
    <title>Players | {clientConfig.ctfName}</title>
  {/if}
</svelte:head>

<players-page>
  {#if !canWrite}
    <players-status>
      <Card title="Player management unavailable">
        <p>Your account needs the manage-teams permission to view players.</p>
      </Card>
    </players-status>
  {:else if showLoading}
    <players-status>
      <Spinner />
    </players-status>
  {:else if showError}
    <players-status>
      <Card title="Failed to load players">
        <p>{playersQuery.error?.message ?? 'Something went wrong.'}</p>
      </Card>
    </players-status>
  {:else}
    <players-reveal data-reveal={revealAfterLoading || undefined}>
      <PlayersTable
        {rows}
        bind:search
        {families}
        {filterFor}
        {hasActiveFilters}
        onClearAll={clearAllFilters}
        fetching={playersQuery.isFetching && !playersQuery.isFetchingNextPage}
        {fingerprint}
        startTime={clientConfig?.startTime}
        hasNextPage={!matchesNothing && (playersQuery.hasNextPage ?? false)}
        isFetchingNextPage={playersQuery.isFetchingNextPage}
        onLoadMore={() => playersQuery.fetchNextPage()}
        {canManageTeams}
        busyId={busyAction.key}
        onCopyDiscordId={discordId => copyText(discordId, 'Discord ID copied.')}
        onMakeCaptain={makeCaptain}
        onMove={player => (moveTarget = player)}
        onRemoveFromTeam={removeFromTeam}
        onBan={toggleBan}
        onDelete={deletePlayer}
      />
    </players-reveal>
  {/if}
</players-page>

<MoveDialog
  player={moveTarget}
  moving={moveTarget !== null && busyAction.key === moveTarget.id}
  onClose={() => (moveTarget = null)}
  onMove={move}
/>

<ConfirmDialog
  open={confirmState.current !== null}
  onOpenChange={(open: boolean) => {
    if (!open) confirmState.cancel()
  }}
  title={confirmState.current?.title ?? ''}
  message={confirmState.current?.message ?? ''}
  confirmLabel={confirmState.current?.confirmLabel ?? 'Confirm'}
  destructive={confirmState.current?.destructive ?? false}
  onConfirm={confirmState.confirm}
/>

<style>
  players-reveal {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }

  players-page {
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

  players-status {
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
</style>
