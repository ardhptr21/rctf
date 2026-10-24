<script lang="ts">
  import Button from '$lib/ui/button.svelte'
  import Card from '$lib/ui/card.svelte'

  interface Props {
    title: string
  }

  let { title }: Props = $props()
</script>

<Card {title} description="Accounts are managed with Discord">
  <auth-page>
    <p>
      Every player signs in with their own Discord account, so there is nothing
      to register or recover here. Log in with Discord, then create or join a
      team.
    </p>
    <Button href="/login">Login with Discord</Button>
  </auth-page>
</Card>
