<script lang="ts">
  import {
    BadEndpoint,
    BadUnknownUser,
    GoodLogin,
    LoginRoute,
  } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { apiRequest, isAuthenticated, setToken, showApiError } from '$lib/api'
  import ArchivedNotice from '$lib/components/archived-notice.svelte'
  import { useApiForm } from '$lib/forms/use-api-form.svelte'
  import { useClientConfig } from '$lib/query/config'
  import { queryKeys } from '$lib/query/keys'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'
  import Field from '$lib/ui/field.svelte'
  import Input from '$lib/ui/input.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { IconDiscord } from '$lib/icons'
  import { createAsyncAction } from '$lib/utils/async-action.svelte'
  import {
    buildDiscordAuthorizeUrl,
    startDiscordLogin,
  } from '$lib/utils/discord'
  import { getRedirectPath } from '$lib/utils/redirect'
  import { onMount } from 'svelte'
  import ButtonCtftime from '../button-ctftime.svelte'
  import DiscordLogin from './discord-login.svelte'

  const queryClient = useQueryClient()
  const configQuery = useClientConfig()
  const clientConfig = $derived(configQuery.data)

  const form = useApiForm(LoginRoute, {
    onSuccess: response => handleLoginSuccess(response.data.authToken),
    onError: response => {
      // with Discord login, the API turns away tokens of non-admin teams
      if (clientConfig?.discord && response.kind === BadEndpoint.kind) {
        form.setError(
          '_form',
          'Only admin teams can log in with a team token. Log in with Discord instead.'
        )
      }
    },
  })

  const ctftimeLoginAction = createAsyncAction()
  let loginLinkSupplied = $state(false)
  let replacingSession = $state(false)
  const isPending = $derived(form.submitting || ctftimeLoginAction.pending)

  function handleLoginSuccess(authToken: string) {
    setToken(authToken)
    toast.success('Logged in successfully!')
    queryClient.invalidateQueries({ queryKey: queryKeys.userSelf })
    goto(getRedirectPath(page.url.searchParams.get('next'), page.url.origin))
  }

  async function handleCtftimeDone(data: {
    ctftimeToken: string
    ctftimeName: string
  }) {
    await ctftimeLoginAction.run(
      async () => {
        const response = await apiRequest(LoginRoute, {
          ctftimeToken: data.ctftimeToken,
        })
        if (response.kind === GoodLogin.kind) {
          handleLoginSuccess(response.data.authToken)
        } else if (response.kind === BadUnknownUser.kind) {
          sessionStorage.setItem('ctftimeToken', data.ctftimeToken)
          sessionStorage.setItem('ctftimeName', data.ctftimeName)
          goto('/register')
        } else {
          showApiError(response)
        }
      },
      { errorMessage: 'Login failed' }
    )
  }

  function loginWithDiscord() {
    const discord = clientConfig?.discord
    if (!clientConfig || !discord) return
    const state = startDiscordLogin(page.url.searchParams.get('next'))
    window.location.assign(
      buildDiscordAuthorizeUrl({
        clientId: discord.clientId,
        origin: clientConfig.origin,
        requireGuild: discord.requireGuild,
        state,
      })
    )
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const value = form.data.teamToken ?? ''
    try {
      const url = new URL(value)
      const urlToken = url.searchParams.get('token')
      if (urlToken) {
        form.setData({ teamToken: urlToken })
      }
    } catch {}
    form.submit()
  }

  onMount(() => {
    const cleanUrl = new URL(page.url)
    const token = cleanUrl.searchParams.get('token')
    if (token === null) return

    cleanUrl.searchParams.delete('token')
    window.history.replaceState(
      window.history.state,
      '',
      `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`
    )
    if (!token) return

    replacingSession = isAuthenticated()
    loginLinkSupplied = true
    form.setData({ teamToken: token })
    form.clearErrors()
  })
</script>

<svelte:head>
  {#if clientConfig}
    <title>Login | {clientConfig.ctfName}</title>
  {/if}
</svelte:head>

{#snippet tokenForm(adminOnly: boolean)}
  {#if loginLinkSupplied}
    <p role="status">
      {replacingSession
        ? 'This link contains a team token. Click Login to replace your current session.'
        : 'This link contains a team token. Click Login to confirm that you want to sign in.'}
    </p>
  {/if}
  {#if adminOnly}
    <p>This link logs in an admin team. Players log in with Discord.</p>
  {/if}
  <form onsubmit={handleSubmit}>
    <Field
      label="Team token"
      error={form.errors.teamToken ?? form.errors._form}
    >
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          name="teamToken"
          type="password"
          placeholder="Enter your team token"
          autocomplete="current-password"
          required
          aria-describedby={describedBy}
          aria-invalid={!!form.errors.teamToken ||
            !!form.errors._form ||
            undefined}
          bind:value={form.data.teamToken}
          oninput={() => form.validateField('teamToken')}
        />
      {/snippet}
    </Field>
    {#if !adminOnly && clientConfig?.emailEnabled}
      <p><a href="/recover">Lost your team token?</a></p>
    {/if}
    <Button type="submit" disabled={isPending}>
      {#if isPending}
        <Spinner />
      {/if}
      Login
    </Button>
  </form>
{/snippet}

{#if clientConfig?.isArchived}
  <ArchivedNotice message="Authentication is not available." />
{:else if clientConfig?.discord && loginLinkSupplied}
  <!-- players log in with Discord; an admin team's login link still works -->
  <Card title="Admin login" description="Log in to {clientConfig.ctfName}">
    <auth-page>
      {@render tokenForm(true)}
      <auth-divider aria-hidden="true">or</auth-divider>
      <Button
        variant="secondary"
        onclick={loginWithDiscord}
        disabled={isPending}
      >
        <IconDiscord aria-hidden="true" />
        Login with Discord
      </Button>
    </auth-page>
  </Card>
{:else if clientConfig?.discord}
  <DiscordLogin
    ctfName={clientConfig.ctfName}
    origin={clientConfig.origin}
    clientId={clientConfig.discord.clientId}
    requireGuild={clientConfig.discord.requireGuild}
  />
{:else if clientConfig}
  <Card title="Login" description="Log in to {clientConfig.ctfName}">
    <auth-page>
      {@render tokenForm(false)}
      {#if clientConfig.ctftime}
        <auth-divider aria-hidden="true">or</auth-divider>
        <ButtonCtftime
          clientId={clientConfig.ctftime.clientId}
          onCtftimeDone={handleCtftimeDone}
          disabled={isPending}
        />
      {/if}
      {#if clientConfig.registrationsEnabled !== false}
        <footer-note
          >Don't have an account? <a href="/register">Register here</a
          >.</footer-note
        >
      {/if}
    </auth-page>
  </Card>
{/if}
