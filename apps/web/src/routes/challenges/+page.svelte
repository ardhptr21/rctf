<script lang="ts">
  import PageGate from '$lib/components/page-gate.svelte'
  import ChallengesPage from './challenges-page.svelte'
</script>

<PageGate page="challenges" title="Challenges page">
  <ChallengesPage />
</PageGate>
