<script lang="ts">
  import { page } from '$app/state'
  import { IconDiscord } from '$lib/icons'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import {
    buildDiscordAuthorizeUrl,
    startDiscordLogin,
  } from '$lib/utils/discord'

  interface Props {
    ctfName: string
    origin: string
    clientId: string
    requireGuild: boolean
  }

  let { ctfName, origin, clientId, requireGuild }: Props = $props()

  function login() {
    const state = startDiscordLogin(page.url.searchParams.get('next'))
    window.location.assign(
      buildDiscordAuthorizeUrl({ clientId, origin, requireGuild, state })
    )
  }
</script>

<Card title="Login" description="Log in to {ctfName}">
  <auth-page>
    {#if requireGuild}
      <p>You need to be a member of the CTF Discord server.</p>
    {/if}
    <Button onclick={login}>
      <IconDiscord aria-hidden="true" />
      Login with Discord
    </Button>
  </auth-page>
</Card>
