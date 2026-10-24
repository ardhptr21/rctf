<script lang="ts">
  import {
    CreateTeamRouteV2,
    GoodTeamCreate,
    GoodTeamJoin,
    JoinTeamRouteV2,
    type RouteResponseData,
    type GetPlayerSelfRouteV2,
  } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { apiRequest, showApiError } from '$lib/api'
  import DivisionMenu from '$lib/components/division-menu.svelte'
  import { queryKeys } from '$lib/query/keys'
  import { resetSessionQueries } from '$lib/query/core'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Field from '$lib/ui/field.svelte'
  import Input from '$lib/ui/input.svelte'
  import type { MenuItem } from '$lib/ui/menu.svelte'
  import Spinner from '$lib/ui/spinner.svelte'

  interface Props {
    self: RouteResponseData<typeof GetPlayerSelfRouteV2>
    divisions: Record<string, string>
    canCreate: boolean
  }

  let { self, divisions, canCreate }: Props = $props()

  const queryClient = useQueryClient()

  let teamName = $state('')
  let chosenDivision = $state<string | undefined>()
  const division = $derived(chosenDivision ?? Object.keys(divisions)[0])
  let joinToken = $state('')
  let pending = $state<'create' | 'join' | null>(null)

  const showDivision = $derived(Object.keys(divisions).length > 1)
  const divisionItems = $derived<MenuItem[]>(
    Object.entries(divisions).map(([value, label]) => ({
      value,
      label,
      checked: division === value,
      onSelect: () => (chosenDivision = value),
    }))
  )

  async function refresh() {
    // the player's token now resolves to a team, so every session query changes
    await resetSessionQueries(queryClient)
    await queryClient.invalidateQueries({ queryKey: queryKeys.playerSelf })
  }

  async function createTeam(event: SubmitEvent) {
    event.preventDefault()
    pending = 'create'
    try {
      const response = await apiRequest(CreateTeamRouteV2, {
        name: teamName,
        ...(division ? { division } : {}),
      })
      if (response.kind === GoodTeamCreate.kind) {
        toast.success(`Created ${response.data.name}`)
        await refresh()
      } else {
        showApiError(response)
      }
    } finally {
      pending = null
    }
  }

  async function joinTeam(event: SubmitEvent) {
    event.preventDefault()
    pending = 'join'
    try {
      const response = await apiRequest(JoinTeamRouteV2, {
        token: joinToken.trim(),
      })
      if (response.kind === GoodTeamJoin.kind) {
        toast.success(`Joined ${response.data.name}`)
        await refresh()
      } else {
        showApiError(response)
      }
    } finally {
      pending = null
    }
  }
</script>

<setup-intro>
  <h1>Welcome, {self.player.displayName ?? self.player.discordUsername}</h1>
  <p>
    {#if canCreate}
      You need a team to play. Create one and share its token with up to {self.maxTeamSize -
        1} teammates, or join an existing team.
    {:else}
      You need a team to play. Ask your team captain for the team token to join.
    {/if}
  </p>
</setup-intro>

<setup-grid data-single={canCreate ? undefined : ''}>
  {#if canCreate}
    <Card title="Create a team" description="You become the team captain">
      <form onsubmit={createTeam}>
        <Field label="Team name">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              aria-describedby={describedBy}
              bind:value={teamName}
              minlength={2}
              maxlength={64}
              required
            />
          {/snippet}
        </Field>
        {#if showDivision}
          <Field label="Division">
            {#snippet children({ describedBy })}
              <DivisionMenu
                items={divisionItems}
                selectedLabel={division
                  ? (divisions[division] ?? division)
                  : 'Select division'}
                {describedBy}
              />
            {/snippet}
          </Field>
        {/if}
        <Button type="submit" disabled={pending !== null}>
          {#if pending === 'create'}
            <Spinner />
          {/if}
          Create team
        </Button>
      </form>
    </Card>
  {/if}

  <Card title="Join a team" description="Ask your captain for the team token">
    <form onsubmit={joinTeam}>
      <Field label="Team token">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            aria-describedby={describedBy}
            type="password"
            autocomplete="off"
            bind:value={joinToken}
            required
          />
        {/snippet}
      </Field>
      <Button type="submit" variant="secondary" disabled={pending !== null}>
        {#if pending === 'join'}
          <Spinner />
        {/if}
        Join team
      </Button>
    </form>
  </Card>
</setup-grid>

<style>
  setup-intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    max-inline-size: 48rem;
    text-align: center;

    h1 {
      font-size: var(--step-2);
    }

    p {
      color: var(--foreground-l3);
    }
  }

  setup-grid {
    display: grid;
    gap: var(--space-s);
    inline-size: 100%;
    max-inline-size: 48rem;

    @media (width >= 48rem) {
      grid-template-columns: 1fr 1fr;
    }

    &[data-single] {
      max-inline-size: 24rem;
      grid-template-columns: 1fr;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-s);
    }
  }
</style>
