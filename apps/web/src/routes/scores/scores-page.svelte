<script lang="ts">
  import { Permissions } from '@rctf/types'
  import CtfNotStarted from '$lib/components/ctf-not-started.svelte'
  import { IconFlagBanner, IconSearch, IconTrophy } from '$lib/icons'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import EmptyState from '$lib/ui/empty-state.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { hasPermissions } from '$lib/utils/permissions'
  import FreezeBanner from './freeze-banner.svelte'
  import ScoresLeaderboard from './leaderboard/leaderboard.svelte'
  import { createScoresData } from './model/data.svelte'
  import { createScoresRouteState } from './model/url-state.svelte'
  import ScoresScreenshotContainer from './screenshot/screenshot-container.svelte'
  import ScoresToolbar from './toolbar/toolbar.svelte'

  const configQuery = useClientConfig()
  const ctfName = $derived(configQuery.data?.ctfName)
  const divisions = $derived(configQuery.data?.divisions ?? {})
  const startTime = $derived(configQuery.data?.startTime ?? 0)

  const urlState = createScoresRouteState()

  const userQuery = useCurrentUser()
  const canViewLive = $derived(
    hasPermissions(userQuery.data, Permissions.leaderboardRead)
  )
  const freezeTime = $derived(configQuery.data?.scoreboardFreezeTime ?? null)

  let now = $state(Date.now())
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 15_000)
    return () => clearInterval(timer)
  })

  // mirrors the server: frozen from the freeze time until an admin clears it
  const isFrozen = $derived(
    freezeTime !== null &&
      now >= freezeTime &&
      freezeTime < (configQuery.data?.endTime ?? 0)
  )
  let liveRequested = $state(false)
  const live = $derived(isFrozen && canViewLive && liveRequested)

  const data = createScoresData({
    division: () => urlState.division,
    search: () => urlState.search,
    sortMode: () => urlState.sortMode,
    focusedChallengeId: () => urlState.focusedChallengeId,
    showTop3Context: () => urlState.showTop3Context,
    showSelfContext: () => urlState.showSelfContext,
    live: () => live,
  })

  const revealAfterLoading = data.isLoading

  const endTime = $derived(configQuery.data?.endTime ?? null)

  let screenshotOpen = $state(false)

  const focusFetching = $derived(
    !!urlState.focusedChallengeId &&
      data.entries.length === 0 &&
      (data.hasNextPage || data.isFetchingNextPage)
  )
</script>

<svelte:head>
  {#if ctfName}
    <title>Scores | {ctfName}</title>
  {/if}
</svelte:head>

{#if data.isNotStarted}
  <CtfNotStarted />
{:else}
  <scores-page>
    {#if isFrozen && freezeTime !== null}
      <FreezeBanner
        {freezeTime}
        {canViewLive}
        {live}
        onLiveChange={value => (liveRequested = value)}
      />
    {/if}
    <ScoresToolbar
      {data}
      {urlState}
      {divisions}
      onScreenshot={() => (screenshotOpen = true)}
    />

    {#if data.isLoading || focusFetching}
      <scores-leaderboard-slot>
        <Spinner />
      </scores-leaderboard-slot>
    {:else if data.loadError && data.entries.length === 0}
      <scores-leaderboard-slot>
        <EmptyState
          icon={IconTrophy}
          title="Couldn't load the scoreboard"
          subtitle={data.loadError.message}
        />
      </scores-leaderboard-slot>
    {:else if data.entries.length > 0}
      <scores-frame data-reveal={revealAfterLoading || undefined}>
        <ScoresLeaderboard {data} {urlState} {divisions} {startTime} />
      </scores-frame>
    {:else}
      <scores-leaderboard-slot>
        {#if urlState.focusedChallengeId}
          <EmptyState
            icon={IconFlagBanner}
            title="No solves"
            subtitle="No matching teams have solved this challenge."
          />
        {:else if urlState.search}
          <EmptyState
            icon={IconSearch}
            title="No teams found"
            subtitle="Try a different search term."
          />
        {:else}
          <EmptyState
            icon={IconTrophy}
            title="No scores yet"
            subtitle="Check back once teams start solving."
          />
        {/if}
      </scores-leaderboard-slot>
    {/if}

    {#if screenshotOpen}
      <ScoresScreenshotContainer
        open={screenshotOpen}
        onOpenChange={open => (screenshotOpen = open)}
        {urlState}
        ctfName={ctfName ?? ''}
        {startTime}
        {endTime}
      />
    {/if}
  </scores-page>
{/if}

<style>
  scores-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    block-size: calc(100dvh - var(--header-height));
    max-block-size: calc(100dvh - var(--header-height));
    overflow: hidden;
    padding-block-end: 1rem;
  }

  scores-frame {
    display: flex;
    flex: 1;
    justify-content: center;
    min-block-size: 0;
    max-inline-size: 100%;
    padding-inline: 1rem;

    @media (width >= 48rem) {
      padding-inline: 2.25rem;
    }
  }

  scores-leaderboard-slot {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-block-size: 0;
  }
</style>
