<script lang="ts">
  import type { Challenge } from '@rctf/types'
  import Markdown from '$lib/components/markdown.svelte'
  import Section from '$lib/ui/section.svelte'

  interface Props {
    challenge: Challenge
  }

  let { challenge }: Props = $props()
</script>

<hints-content>
  {#each challenge.hints as hint, index (index)}
    <Section title={`Hint ${index + 1}`}>
      <Markdown content={hint} />
    </Section>
  {/each}
</hints-content>

<style>
  hints-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
  }
</style>
