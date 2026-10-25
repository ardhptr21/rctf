<script lang="ts">
  import MarkdownEditor from '$lib/components/markdown-editor.svelte'
  import { IconCaretDown, IconLightbulb, IconPlus, IconTrash } from '$lib/icons'
  import Button from '$lib/ui/button.svelte'
  import Section from '$lib/ui/section.svelte'
  import FormScroll from './form-scroll.svelte'
  import { MAX_HINTS } from './form-validation'

  interface Props {
    hints: string[]
    disabled: boolean
    error?: string
    onChange: (hints: string[]) => void
  }

  let { hints, disabled, error, onChange }: Props = $props()

  const canAdd = $derived(hints.length < MAX_HINTS)

  function changeAt(index: number, value: string) {
    onChange(hints.map((hint, i) => (i === index ? value : hint)))
  }

  function removeAt(index: number) {
    onChange(hints.filter((_, i) => i !== index))
  }

  function move(index: number, offset: -1 | 1) {
    const next = [...hints]
    const target = index + offset
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }
</script>

<FormScroll {disabled}>
  <hints-intro>
    <p>Hints support Markdown. Empty hints are not saved.</p>
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled || !canAdd}
      onclick={() => onChange([...hints, ''])}
    >
      <IconPlus /> Add hint
    </Button>
  </hints-intro>

  {#if error}<field-error role="alert">{error}</field-error>{/if}

  {#if hints.length === 0}
    <hints-empty>
      <IconLightbulb />
      <span>No hints yet</span>
    </hints-empty>
  {:else}
    {#each hints as hint, index (index)}
      <Section title={`Hint ${index + 1}`}>
        <hint-body>
          <hint-actions>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || index === 0}
              aria-label={`Move hint ${index + 1} up`}
              onclick={() => move(index, -1)}
            >
              <IconCaretDown data-flip />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || index === hints.length - 1}
              aria-label={`Move hint ${index + 1} down`}
              onclick={() => move(index, 1)}
            >
              <IconCaretDown />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              {disabled}
              aria-label={`Remove hint ${index + 1}`}
              onclick={() => removeAt(index)}
            >
              <IconTrash />
            </Button>
          </hint-actions>
          <MarkdownEditor
            label={`Hint ${index + 1}`}
            placeholder="Hint text (Markdown supported)"
            rows={5}
            value={hint}
            {disabled}
            oninput={value => changeAt(index, value)}
          />
        </hint-body>
      </Section>
    {/each}
  {/if}
</FormScroll>

<style>
  hints-intro {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2xs) var(--space-s);

    p {
      margin: 0;
      font-size: var(--step--1);
      color: var(--foreground-l3);
    }
  }

  hints-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-l);
    color: var(--foreground-l4);
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);

    :global(svg) {
      inline-size: 2rem;
      block-size: 2rem;
    }
  }

  hint-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding-block: var(--space-3xs);
  }

  hint-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3xs);

    :global([data-flip]) {
      transform: rotate(180deg);
    }
  }

  field-error {
    font-size: var(--step--1);
    color: var(--foreground-destructive);
  }
</style>
