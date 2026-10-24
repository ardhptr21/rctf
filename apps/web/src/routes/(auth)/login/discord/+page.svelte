<script lang="ts">
  import { DiscordLoginRouteV2, GoodDiscordLogin } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { apiRequest, setToken } from '$lib/api'
  import { useClientConfig } from '$lib/query/config'
  import { playerSelfQueryOptions } from '$lib/query/team'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { discordRedirectUri, finishDiscordLogin } from '$lib/utils/discord'
  import { getRedirectPath } from '$lib/utils/redirect'
  import { onMount } from 'svelte'

  const queryClient = useQueryClient()
  const configQuery = useClientConfig()

  let error = $state<string | null>(null)

  onMount(async () => {
    const params = page.url.searchParams
    const { valid, next } = finishDiscordLogin(params.get('state'))
    const code = params.get('code')

    if (params.get('error')) {
      error = 'Discord login was cancelled.'
      return
    }
    if (!valid || !code) {
      error = 'This login link is invalid or expired. Please try again.'
      return
    }

    const config = configQuery.data
    if (!config?.discord) {
      error = 'Discord login is not enabled.'
      return
    }

    const response = await apiRequest(DiscordLoginRouteV2, {
      code,
      redirectUri: discordRedirectUri(config.origin),
    })
    if (response.kind !== GoodDiscordLogin.kind) {
      error = response.message
      return
    }

    setToken(response.data.authToken)
    const self = await queryClient.fetchQuery(playerSelfQueryOptions)
    toast.success('Logged in successfully!')
    goto(self?.team ? getRedirectPath(next, page.url.origin) : '/team', {
      replaceState: true,
    })
  })
</script>

<svelte:head>
  {#if configQuery.data}
    <title>Login | {configQuery.data.ctfName}</title>
  {/if}
</svelte:head>

{#if error}
  <Card title="Login failed">
    <auth-page>
      <p role="alert">{error}</p>
      <Button href="/login">Try again</Button>
    </auth-page>
  </Card>
{:else}
  <auth-status>
    <Spinner />
  </auth-status>
{/if}

<style>
  auth-status {
    display: flex;
    justify-content: center;
  }
</style>
