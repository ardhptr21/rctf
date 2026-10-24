<script lang="ts">
  import {
    GoodTeamCaptainTransfer,
    GoodTeamLeave,
    GoodTeamMemberRemove,
    GoodTeamTokenRotate,
    LeaveTeamRouteV2,
    RemoveTeamMemberRouteV2,
    RotateTeamTokenRouteV2,
    TransferTeamCaptainRouteV2,
    type GetPlayerSelfRouteV2,
    type RouteResponseData,
  } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { apiRequest, showApiError } from '$lib/api'
  import { resetSessionQueries } from '$lib/query/core'
  import { queryKeys } from '$lib/query/keys'
  import { useTeamMembers } from '$lib/query/team'
  import { toast } from '$lib/toast'
  import Avatar from '$lib/ui/avatar.svelte'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { copyText } from '$lib/utils/clipboard'

  interface Props {
    self: RouteResponseData<typeof GetPlayerSelfRouteV2>
  }

  let { self }: Props = $props()

  const queryClient = useQueryClient()
  const membersQuery = useTeamMembers(() => true)

  const team = $derived(self.team!)
  const isCaptain = $derived(self.player.isCaptain)
  const members = $derived(membersQuery.data?.members ?? [])
  const limit = $derived(membersQuery.data?.maxTeamSize ?? null)
  const joinToken = $derived(membersQuery.data?.joinToken ?? null)

  let busy = $state(false)
  let tokenVisible = $state(false)

  async function run(action: () => Promise<void>) {
    busy = true
    try {
      await action()
    } finally {
      busy = false
    }
  }

  const refreshMembers = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.playerSelf }),
    ])

  function removeMember(id: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return
    return run(async () => {
      const response = await apiRequest(RemoveTeamMemberRouteV2, {
        playerId: id,
      })
      if (response.kind === GoodTeamMemberRemove.kind) {
        toast.success(`Removed ${name}`)
        await refreshMembers()
      } else {
        showApiError(response)
      }
    })
  }

  function makeCaptain(id: string, name: string) {
    if (!confirm(`Make ${name} the team captain?`)) return
    return run(async () => {
      const response = await apiRequest(TransferTeamCaptainRouteV2, {
        playerId: id,
      })
      if (response.kind === GoodTeamCaptainTransfer.kind) {
        toast.success(`${name} is now captain`)
        await refreshMembers()
      } else {
        showApiError(response)
      }
    })
  }

  function leave() {
    if (!confirm(`Leave ${team.name}?`)) return
    return run(async () => {
      const response = await apiRequest(LeaveTeamRouteV2)
      if (response.kind === GoodTeamLeave.kind) {
        toast.success(`You left ${team.name}`)
        await resetSessionQueries(queryClient)
      } else {
        showApiError(response)
      }
    })
  }

  function rotateToken() {
    if (!confirm('Rotate the team token? The old token stops working.')) return
    return run(async () => {
      const response = await apiRequest(RotateTeamTokenRouteV2)
      if (response.kind === GoodTeamTokenRotate.kind) {
        toast.success('Team token rotated')
        await refreshMembers()
      } else {
        showApiError(response)
      }
    })
  }
</script>

<roster-layout>
  <Card
    title={team.name}
    description={limit === null
      ? `${members.length} members`
      : `${members.length} / ${limit} members`}
  >
    {#if membersQuery.isLoading}
      <Spinner />
    {:else}
      <member-list>
        {#each members as member (member.id)}
          {@const name = member.displayName ?? member.discordUsername}
          <member-row>
            <Avatar src={member.avatarUrl} {name} />
            <member-name>
              <strong>{name}</strong>
              <span>@{member.discordUsername}</span>
            </member-name>
            {#if member.isCaptain}
              <member-badge>Captain</member-badge>
            {:else if isCaptain}
              <member-actions>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onclick={() => makeCaptain(member.id, name)}
                >
                  Make captain
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || self.rosterLocked}
                  onclick={() => removeMember(member.id, name)}
                >
                  Remove
                </Button>
              </member-actions>
            {/if}
          </member-row>
        {/each}
      </member-list>
    {/if}

    {#if self.rosterLocked}
      <roster-note>
        The CTF has started, so players can no longer leave or be removed.
      </roster-note>
    {/if}
    <Button
      variant="outline"
      disabled={busy || self.rosterLocked}
      onclick={leave}
    >
      Leave team
    </Button>
  </Card>

  {#if isCaptain && joinToken}
    <Card
      title="Team token"
      description="Share this with teammates so they can join"
    >
      <token-row>
        <code>{tokenVisible ? joinToken : '•'.repeat(24)}</code>
        <Button
          size="sm"
          variant="ghost"
          onclick={() => (tokenVisible = !tokenVisible)}
        >
          {tokenVisible ? 'Hide' : 'Show'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onclick={() => copyText(joinToken, 'Team token copied')}
        >
          Copy
        </Button>
      </token-row>
      <Button variant="outline" disabled={busy} onclick={rotateToken}>
        Rotate token
      </Button>
    </Card>
  {/if}
</roster-layout>

<style>
  roster-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    inline-size: 100%;
    max-inline-size: 36rem;
  }

  member-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-block-end: var(--space-s);
  }

  member-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }

  member-name {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;

    span {
      font-size: var(--step--1);
      color: var(--foreground-l3);
    }
  }

  member-badge {
    padding: 0.125rem var(--space-3xs);
    font-size: var(--step--1);
    color: var(--foreground-accent);
    border: 1px solid currentColor;
    border-radius: var(--radius-md);
  }

  member-actions {
    display: flex;
    gap: var(--space-3xs);
  }

  roster-note {
    display: block;
    margin-block-end: var(--space-2xs);
    font-size: var(--step--1);
    color: var(--foreground-l3);
  }

  token-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs);
    margin-block-end: var(--space-s);

    code {
      flex: 1;
      min-inline-size: 0;
      overflow-wrap: anywhere;
      font-size: var(--step--1);
    }
  }
</style>
