<script lang="ts">
  import { IconWarningCircle, IconX } from '$lib/icons'
  import { useCurrentUser } from '$lib/query/user'

  const userQuery = useCurrentUser()
  const team = $derived(userQuery.data)

  // hidden until the next page load, so the team still sees it on return
  let dismissed = $state(false)
</script>

{#if team?.banned && !dismissed}
  <banned-notice role="status">
    <IconWarningCircle aria-hidden="true" />
    <notice-text>
      <strong>{team.name} has been banned</strong>
      <span>
        Your team can't view challenges or submit flags, and doesn't appear
        on the scoreboard. Contact the organizers if you think this is a
        mistake.
      </span>
    </notice-text>
    <button
      type="button"
      aria-label="Dismiss"
      onclick={() => (dismissed = true)}
    >
      <IconX aria-hidden="true" />
    </button>
  </banned-notice>
{/if}

<style>
  banned-notice {
    position: fixed;
    inset-block-end: 1rem;
    inset-inline: 1rem;
    z-index: var(--layer-nav);
    display: flex;
    align-items: flex-start;
    gap: var(--space-2xs);

    padding: var(--space-xs) var(--space-s);
    color: var(--foreground-l1);
    background: color-mix(
      in srgb,
      var(--foreground-destructive) 14%,
      var(--background-l2)
    );
    border: 2px solid
      color-mix(in srgb, var(--foreground-destructive) 45%, transparent);
    border-radius: var(--radius-lg);
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.3);

    /* bottom-left on wide screens, clear of the challenge submit form */
    @media (width >= 48rem) {
      inset-inline-end: auto;
      inline-size: 24rem;
    }

    > :global(svg) {
      flex-shrink: 0;
      inline-size: 1.25rem;
      block-size: 1.25rem;
      margin-block-start: 0.125rem;
      color: var(--foreground-destructive);
    }
  }

  notice-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3xs);
    min-inline-size: 0;

    strong {
      overflow-wrap: anywhere;
      color: var(--foreground-destructive);
      font-weight: 600;
    }

    span {
      font-size: var(--step--1);
      color: var(--foreground-l2);
    }
  }

  button {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    inline-size: 1.75rem;
    block-size: 1.75rem;
    color: var(--foreground-l3);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;

    &:hover {
      color: var(--foreground-l1);
      background: var(--background-l4);
    }

    &:focus-visible {
      outline: 2px solid var(--ring);
    }
  }
</style>
