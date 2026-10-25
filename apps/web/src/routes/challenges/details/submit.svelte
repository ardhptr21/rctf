<script lang="ts">
  import {
    BadAlreadySolvedChallenge,
    GoodFlag,
    SubmitFlagRouteV2,
    type Challenge,
  } from '@rctf/types'
  import { tick } from 'svelte'
  import { showApiError } from '$lib/api'
  import { useApiForm } from '$lib/forms/use-api-form.svelte'
  import {
    IconCheck,
    IconFile,
    IconInfo,
    IconPaperPlaneTilt,
    IconPlus,
    IconSignIn,
    IconWarningCircle,
    IconX,
  } from '$lib/icons'
  import { useClientConfig } from '$lib/query/config'
  import { useCurrentUser } from '$lib/query/user'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Checkbox from '$lib/ui/checkbox.svelte'
  import Input from '$lib/ui/input.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import {
    collectAiLinks,
    formatFileSize,
    validateEvidence,
    type EvidenceErrors,
  } from './submit-evidence'
  import { resolveSubmitState } from './submit-ladder'

  interface Props {
    challenge: Challenge
    isSolved: boolean
    onSolve: (challengeId: string) => void
  }

  let { challenge, isSolved, onSolve }: Props = $props()

  const configQuery = useClientConfig()
  const clientConfig = $derived(configQuery.data)
  const isArchived = $derived(clientConfig?.isArchived ?? false)
  const flagPlaceholder = $derived(
    clientConfig?.flagFormatPlaceholder ?? 'flag{...}'
  )

  const endTime = $derived(clientConfig?.endTime ?? Number.POSITIVE_INFINITY)

  const userQuery = useCurrentUser()
  const isAuthenticated = $derived(userQuery.data != null)
  const isBanned = $derived(userQuery.data?.banned ?? false)

  let now = $state(Date.now())

  const submitState = $derived(
    resolveSubmitState({
      isArchived,
      endTime,
      now,
      isAuthenticated,
      isBanned,
      isSolved,
    })
  )

  $effect(() => {
    if (submitState === 'archived' || submitState === 'ended') return
    const interval = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(interval)
  })

  const requireEvidence = $derived(
    clientConfig?.requireSubmissionEvidence ?? false
  )
  const maxProofSize = $derived(clientConfig?.maxProofSize ?? 5 * 1024 * 1024)

  let aiLinks = $state<string[]>([''])
  let noAi = $state(false)
  let proof = $state<File | null>(null)
  let proofInput = $state<HTMLInputElement | null>(null)
  let linkList = $state<HTMLElement | null>(null)
  let evidenceErrors = $state<EvidenceErrors>({})

  function resetEvidence() {
    aiLinks = ['']
    noAi = false
    proof = null
    evidenceErrors = {}
    if (proofInput) proofInput.value = ''
  }

  async function addLink() {
    // fill in the existing fields before adding another
    const emptyIndex = aiLinks.findIndex(link => link.trim() === '')
    if (emptyIndex !== -1) {
      evidenceErrors = {
        ...evidenceErrors,
        aiLinks: 'Fill in the empty link before adding another.',
      }
      const empty = linkList?.querySelectorAll('input')[emptyIndex]
      empty?.focus({ preventScroll: true })
      empty?.scrollIntoView({ block: 'nearest' })
      return
    }
    aiLinks = [...aiLinks, '']
    // the list scrolls once it is taller than a few rows; bring the new
    // field into view and focus it
    await tick()
    const inputs = linkList?.querySelectorAll('input')
    const added = inputs?.[inputs.length - 1]
    added?.focus({ preventScroll: true })
    added?.scrollIntoView({ block: 'nearest' })
  }

  function removeLink(index: number) {
    aiLinks = aiLinks.filter((_, i) => i !== index)
  }

  const form = useApiForm(SubmitFlagRouteV2, {
    onSuccess: response => {
      if (response.kind === GoodFlag.kind) {
        toast.success('Flag correct!')
        onSolve(challenge.id)
        form.setData({ flag: '' })
        resetEvidence()
      } else if (response.kind === BadAlreadySolvedChallenge.kind) {
        toast.info('You already solved this challenge')
        onSolve(challenge.id)
      }
    },
    onError: response => {
      showApiError(response)
    },
  })

  $effect(() => {
    form.data.id = challenge.id
  })

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const flag = (form.data.flag ?? '').trim()
    if (!flag) return

    if (requireEvidence) {
      evidenceErrors = validateEvidence({
        links: aiLinks,
        noAi,
        proof,
        maxProofSize,
      })
      if (evidenceErrors.aiLinks || evidenceErrors.proof) return
      form.setData({
        flag,
        aiLinks: collectAiLinks(aiLinks, noAi),
        proof: proof ?? undefined,
      })
    } else {
      form.setData({ flag, aiLinks: undefined, proof: undefined })
    }
    form.submit()
  }

  function handleProofChange(
    event: Event & { currentTarget: HTMLInputElement }
  ) {
    proof = event.currentTarget.files?.[0] ?? null
    evidenceErrors = { ...evidenceErrors, proof: undefined }
  }
</script>

<challenge-submit>
  {#if submitState === 'archived'}
    <submit-notice>
      <IconInfo />
      <span>The CTF is archived.</span>
    </submit-notice>
  {:else if submitState === 'ended'}
    <submit-notice>
      <IconInfo />
      <span>The CTF has ended.</span>
    </submit-notice>
  {:else if submitState === 'banned'}
    <submit-notice data-tone="danger">
      <IconWarningCircle />
      <span>Your team is banned and can't submit flags.</span>
    </submit-notice>
  {:else if submitState === 'login'}
    <Button href="/login">
      <IconSignIn />
      Login to submit
    </Button>
  {:else}
    <form onsubmit={handleSubmit}>
      {#if requireEvidence && submitState !== 'solved'}
        <submit-evidence>
          <fieldset>
            <legend>AI links</legend>
            <Checkbox
              checked={noAi}
              disabled={form.submitting}
              onchange={e => {
                noAi = e.currentTarget.checked
                evidenceErrors = { ...evidenceErrors, aiLinks: undefined }
              }}
            >
              I didn&apos;t use AI
            </Checkbox>
            {#if !noAi}
              <link-list bind:this={linkList}>
                {#each aiLinks as _, index (index)}
                  <link-row>
                    <Input
                      type="url"
                      placeholder="https://chatgpt.com/share/..."
                      aria-label={`AI link ${index + 1}`}
                      aria-invalid={!!evidenceErrors.aiLinks || undefined}
                      disabled={form.submitting}
                      bind:value={aiLinks[index]}
                      oninput={() =>
                        (evidenceErrors = {
                          ...evidenceErrors,
                          aiLinks: undefined,
                        })}
                    />
                    {#if aiLinks.length > 1}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove AI link ${index + 1}`}
                        disabled={form.submitting}
                        onclick={() => removeLink(index)}
                      >
                        <IconX />
                      </Button>
                    {/if}
                  </link-row>
                {/each}
              </link-list>
              {#if aiLinks.length < 10}
                <add-link>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={form.submitting}
                    onclick={addLink}
                  >
                    <IconPlus />
                    Add link
                  </Button>
                </add-link>
              {/if}
            {/if}
            {#if evidenceErrors.aiLinks}
              <evidence-error role="alert"
                >{evidenceErrors.aiLinks}</evidence-error
              >
            {/if}
          </fieldset>

          <fieldset>
            <legend>Solver proof</legend>
            <evidence-hint>
              Your solve script, or a screenshot showing the flag. One file, up
              to {formatFileSize(maxProofSize)}.
            </evidence-hint>
            <!-- the transparent input covers the whole box, so clicking or
                 dropping a file anywhere on it works natively -->
            <label
              class="proof-picker"
              data-has-file={proof ? '' : undefined}
              data-invalid={evidenceErrors.proof ? '' : undefined}
              data-disabled={form.submitting || undefined}
            >
              <input
                bind:this={proofInput}
                type="file"
                aria-label="Solver proof file"
                disabled={form.submitting}
                onchange={handleProofChange}
              />
              <IconFile aria-hidden="true" />
              <picker-text>
                <strong>{proof ? proof.name : 'Choose a file'}</strong>
                <span
                  >{proof
                    ? formatFileSize(proof.size)
                    : 'Click to browse, or drop a file here'}</span
                >
              </picker-text>
              <picker-action>{proof ? 'Change' : 'Browse'}</picker-action>
            </label>
            {#if evidenceErrors.proof}
              <evidence-error role="alert"
                >{evidenceErrors.proof}</evidence-error
              >
            {/if}
          </fieldset>
        </submit-evidence>
      {/if}

      <submit-row>
        {#if submitState === 'solved'}
          <submit-notice data-tone="success">
            <IconCheck />
            <span>Challenge solved!</span>
          </submit-notice>
        {:else}
          <Input
            type="text"
            placeholder={flagPlaceholder}
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            data-flag-input
            aria-label="Flag"
            aria-invalid={!!form.errors._form || undefined}
            disabled={form.submitting}
            bind:value={form.data.flag}
          />
        {/if}
        <button
          type="submit"
          aria-label="Submit flag"
          disabled={form.submitting || submitState === 'solved'}
        >
          {#if form.submitting}
            <Spinner />
          {:else}
            <IconPaperPlaneTilt />
          {/if}
        </button>
      </submit-row>
    </form>
  {/if}
</challenge-submit>

<style>
  challenge-submit {
    display: block;
    --submit-block-size: 3rem;

    :global(a[data-variant]) {
      gap: 0.5rem;
      inline-size: 100%;
      block-size: var(--submit-block-size);
      font-size: 1.25rem;
    }
  }

  form {
    display: block;
  }

  submit-evidence {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    margin-block-end: var(--space-s);

    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs);
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      margin-block-end: var(--space-3xs);
      font-weight: var(--font-weight-medium);
      color: var(--foreground-l1);
    }
  }

  .proof-picker {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    min-inline-size: 0;
    padding: var(--space-2xs) var(--space-xs);
    color: var(--foreground-l1);
    background: var(--background-l4);
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease;

    &:hover {
      background: var(--background-l5);
      border-color: var(--foreground-l3);
    }

    &:focus-within {
      outline: 2px solid var(--ring);
      outline-offset: 1px;
    }

    &[data-has-file] {
      border-style: solid;
      border-color: var(--foreground-accent);
    }

    &[data-invalid] {
      border-color: var(--foreground-destructive);
    }

    &[data-disabled] {
      cursor: not-allowed;
      opacity: 0.5;
    }

    input {
      position: absolute;
      inset: 0;
      inline-size: 100%;
      block-size: 100%;
      opacity: 0;
      cursor: inherit;
    }

    > :global(svg) {
      flex-shrink: 0;
      inline-size: 1.5rem;
      block-size: 1.5rem;
      color: var(--foreground-l2);
    }
  }

  picker-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;

    strong {
      overflow: hidden;
      font-weight: var(--font-weight-medium);
      color: var(--foreground-l0);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      font-size: var(--step--1);
      color: var(--foreground-l3);
    }
  }

  picker-action {
    flex-shrink: 0;
    padding: var(--space-3xs) var(--space-xs);
    font-size: var(--step--1);
    font-weight: var(--font-weight-medium);
    color: var(--foreground-l0);
    background: var(--background-l2);
    border-radius: var(--radius-md);
  }

  /* capped at about three rows so many links can't crowd out the rest of
     the panel; the extra rows scroll */
  link-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    max-block-size: 8.75rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* room for focus rings, which overflow would otherwise clip */
    margin: -3px;
    padding: 3px;
  }

  link-row {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);

    :global(input) {
      flex: 1;
      min-inline-size: 0;
    }
  }

  add-link {
    display: flex;
  }

  evidence-hint {
    display: block;
    font-size: var(--step--1);
    color: var(--foreground-l3);
  }

  evidence-error {
    display: block;
    font-size: var(--step--1);
    color: var(--foreground-destructive);
  }

  submit-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    block-size: var(--submit-block-size);

    :global(input[data-flag-input]) {
      flex: 1;
      min-inline-size: 0;
      block-size: var(--submit-block-size);
      font-family: var(--font-mono);
      font-size: 1.25rem;
      border-radius: var(--radius-lg);

      &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
    }
  }

  submit-notice {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.75rem;
    min-inline-size: 0;
    block-size: var(--submit-block-size);
    padding-inline: 0.75rem;
    font-size: 1.25rem;
    color: var(--foreground-l3);
    background: var(--background-l4);
    border-radius: var(--radius-lg);

    &[data-tone='success'] {
      color: var(--foreground-success);
      background: var(--background-success);
    }

    &[data-tone='danger'] {
      color: var(--foreground-destructive);
      background: color-mix(
        in srgb,
        var(--foreground-destructive) 14%,
        var(--background-l4)
      );
    }

    span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    :global(svg) {
      flex-shrink: 0;
      inline-size: 1.5rem;
      block-size: 1.5rem;
    }
  }

  button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    padding-inline: 1rem;
    block-size: var(--submit-block-size);
    color: var(--foreground-l4);
    background: var(--background-l4);
    cursor: pointer;
    border-radius: var(--radius-lg);

    &:hover:enabled {
      background: var(--background-l5);
    }

    &:focus-visible {
      outline: 2px solid var(--ring);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    :global(svg) {
      inline-size: 1.5rem;
      block-size: 1.5rem;
    }
  }
</style>
