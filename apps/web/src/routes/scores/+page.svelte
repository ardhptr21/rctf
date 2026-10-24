<script lang="ts">
  import PageGate from '$lib/components/page-gate.svelte'
  import ScoresPage from './scores-page.svelte'
</script>

<PageGate page="scores" title="Scoreboard">
  <ScoresPage />
</PageGate>
