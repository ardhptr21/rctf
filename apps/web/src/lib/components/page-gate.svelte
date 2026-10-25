<script lang="ts">
  import type { AccessControlledPage } from '@rctf/types'
  import type { Snippet } from 'svelte'
  import {
    IconGavel,
    IconSignIn,
    IconUsersThree,
    IconWarningCircle,
  } from '$lib/icons'
  import { useClientConfig } from '$lib/query/config'
  import { usePlayerSelf } from '$lib/query/team'
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

  const playerQuery = usePlayerSelf()

  const isPending = $derived(
    userQuery.isLoading || configQuery.isLoading || playerQuery.isLoading
  )
  const gate = $derived(
    decidePageGate(configQuery.data?.pageAccess[page], userQuery.data, {
      page,
      noTeam: !!playerQuery.data && !playerQuery.data.team,
    })
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
{:else if gate === 'noTeam'}
  <gate-status>
    <StatusCard
      icon={IconUsersThree}
      title="Join a team first"
      subtitle={`You need to be on a team to view the ${title.toLowerCase()}. Create a team or join one with its team token.`}
    >
      <Button href="/team">Create or join a team</Button>
    </StatusCard>
  </gate-status>
{:else if gate === 'banned'}
  <gate-status>
    <StatusCard
      variant="plain"
      icon={IconGavel}
      title="Your team has been banned"
      subtitle={`Banned teams can't view the ${title.toLowerCase()}. Contact the organizers if you think this is a mistake.`}
    >
      <Button href="/">Home</Button>
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
