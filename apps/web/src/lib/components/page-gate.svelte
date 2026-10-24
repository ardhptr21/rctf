<script lang="ts">
  import type { AccessControlledPage } from '@rctf/types'
  import type { Snippet } from 'svelte'
  import { IconSignIn, IconWarningCircle } from '$lib/icons'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import Button from '$lib/ui/button.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import StatusCard from '$lib/ui/status-card.svelte'
  import { decidePageGate } from '$lib/utils/page-gate'

  type Props = {
    page: `${AccessControlledPage}`
    title: string
    children: Snippet
  }

  const { page, title, children }: Props = $props()

  const userQuery = useCurrentUser()
  const configQuery = useClientConfig()

  const isPending = $derived(userQuery.isLoading || configQuery.isLoading)
  const gate = $derived(
    decidePageGate(configQuery.data?.pageAccess[page], userQuery.data)
  )
</script>

{#if isPending}
  <gate-status>
    <Spinner />
  </gate-status>
{:else if gate === 'loggedOut'}
  <gate-status>
    <StatusCard
      icon={IconSignIn}
      title="Login required"
      subtitle={`You need to be logged in to view the ${title.toLowerCase()}.`}
    >
      <Button href="/login">Login</Button>
    </StatusCard>
  </gate-status>
{:else if gate === 'noPerms'}
  <gate-status>
    <StatusCard
      icon={IconWarningCircle}
      title="Access denied"
      subtitle={`The ${title.toLowerCase()} is only available to administrators.`}
    >
      <Button href="/">Home</Button>
    </StatusCard>
  </gate-status>
{:else}
  {@render children()}
{/if}

<style>
  gate-status {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: var(--space-l);
  }
</style>
