<script lang="ts">
  import { IconClock } from '$lib/icons'
  import Button from '$lib/ui/button.svelte'
  import { formatLocalTime } from '$lib/utils/time'

  interface Props {
    freezeTime: number
    canViewLive: boolean
    live: boolean
    onLiveChange: (live: boolean) => void
  }

  let { freezeTime, canViewLive, live, onLiveChange }: Props = $props()
</script>

<freeze-banner role="status">
  <IconClock aria-hidden="true" />
  <span>
    {#if live}
      Showing live standings. Teams see the scoreboard frozen at
      {formatLocalTime(freezeTime)}.
    {:else}
      The scoreboard has been frozen since {formatLocalTime(freezeTime)}. Final
      standings are revealed when the CTF ends.
    {/if}
  </span>
  {#if canViewLive}
    <Button size="sm" variant="outline" onclick={() => onLiveChange(!live)}>
      {live ? 'Show frozen' : 'Show live'}
    </Button>
  {/if}
</freeze-banner>

<style>
  freeze-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs);
    margin-inline: 1rem;
    margin-block-end: var(--space-2xs);
    padding: var(--space-2xs) var(--space-xs);
    color: var(--foreground-l1);
    background: var(--background-l2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: var(--step--1);

    @media (width >= 48rem) {
      margin-inline: 2.25rem;
    }

    span {
      flex: 1;
      min-inline-size: 12rem;
    }

    :global(svg) {
      flex-shrink: 0;
      opacity: 0.7;
    }
  }
</style>
