<script lang="ts">
  import { IconSignIn, IconUsersThree } from '$lib/icons'
  import { useClientConfig } from '$lib/query/config'
  import { usePlayerSelf } from '$lib/query/team'
  import Button from '$lib/ui/button.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import StatusCard from '$lib/ui/status-card.svelte'
  import TeamRoster from './team-roster.svelte'
  import TeamSetup from './team-setup.svelte'

  const configQuery = useClientConfig()
  const playerQuery = usePlayerSelf()

  const clientConfig = $derived(configQuery.data)
  const self = $derived(playerQuery.data)
</script>

<svelte:head>
  {#if clientConfig}
    <title>Team | {clientConfig.ctfName}</title>
  {/if}
</svelte:head>

<team-page>
  {#if playerQuery.isLoading || !clientConfig}
    <Spinner />
  {:else if !clientConfig.discord}
    <StatusCard
      icon={IconUsersThree}
      title="Teams are managed from your profile"
      subtitle="This CTF uses team logins, so there are no individual player accounts."
    >
      <Button href="/profile">Go to profile</Button>
    </StatusCard>
  {:else if !self}
    <StatusCard
      icon={IconSignIn}
      title="Login required"
      subtitle="Log in with Discord to create or join a team."
    >
      <Button href="/login?next=/team">Login with Discord</Button>
    </StatusCard>
  {:else if self.team}
    <TeamRoster {self} />
  {:else}
    <TeamSetup
      {self}
      divisions={clientConfig.divisions}
      canCreate={clientConfig.teamCreationEnabled}
    />
  {/if}
</team-page>

<style>
  team-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-m);
    padding: var(--space-l) var(--space-s);
  }
</style>
