<script lang="ts">
  import {
    GetAdminSubmissionProofRouteV2,
    GoodSubmissionProof,
  } from '@rctf/types'
  import { apiRequest } from '$lib/api'
  import { IconDownload } from '$lib/icons'
  import Button from '$lib/ui/button.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { base64ToBytes, downloadBlob } from '$lib/utils/download'
  import { highlight, type HighlightedLine } from '$lib/utils/syntax-highlight'
  import {
    detectCodeLanguage,
    LANGUAGE_LABELS,
    type CodeLanguage,
  } from '$lib/utils/syntax-language'
  import { formatFileSize } from '../../challenges/details/submit-evidence'
  import {
    decodeText,
    detectPreviewKind,
    MAX_TEXT_PREVIEW_CHARS,
    previewMimeType,
    type ProofPreviewKind,
  } from './proof-preview'

  type Props = {
    submissionId: string
    open: boolean
    onOpenChange: (open: boolean) => void
  }

  let { submissionId, open, onOpenChange }: Props = $props()

  type Loaded = {
    name: string
    size: number
    kind: ProofPreviewKind
    bytes: Uint8Array
    text: string | null
    previewUrl: string | null
  }

  let loaded = $state<Loaded | null>(null)
  let error = $state<string | null>(null)

  $effect(() => {
    if (!open) return
    let cancelled = false
    let previewUrl: string | null = null
    loaded = null
    error = null

    apiRequest(GetAdminSubmissionProofRouteV2, { id: submissionId })
      .then(response => {
        if (cancelled) return
        if (response.kind !== GoodSubmissionProof.kind) {
          error = response.message
          return
        }
        const { name, size, contentType, data } = response.data
        const bytes = base64ToBytes(data)
        const kind = detectPreviewKind(name, contentType, bytes)
        if (kind === 'image' || kind === 'video' || kind === 'audio') {
          previewUrl = URL.createObjectURL(
            new Blob([bytes as BlobPart], {
              type: previewMimeType(kind, name, contentType),
            })
          )
        }
        loaded = {
          name,
          size,
          kind,
          bytes,
          text: kind === 'text' ? decodeText(bytes) : null,
          previewUrl,
        }
      })
      .catch(() => {
        if (!cancelled) error = 'Failed to load the solver proof.'
      })

    return () => {
      cancelled = true
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  })

  const truncated = $derived(
    (loaded?.text?.length ?? 0) > MAX_TEXT_PREVIEW_CHARS
  )
  const shownText = $derived(
    loaded?.text != null
      ? truncated
        ? loaded.text.slice(0, MAX_TEXT_PREVIEW_CHARS)
        : loaded.text
      : null
  )
  const codeLanguage = $derived<CodeLanguage | null>(
    loaded && shownText !== null
      ? detectCodeLanguage(loaded.name, shownText)
      : null
  )

  // highlighted lines replace the plain text once the parser has loaded;
  // until then, or if it fails, the plain text stays visible
  let highlighted = $state<HighlightedLine[] | null>(null)
  $effect(() => {
    highlighted = null
    const language = codeLanguage
    const text = shownText
    if (!language || text === null) return
    let cancelled = false
    highlight(language, text)
      .then(lines => {
        if (!cancelled) highlighted = lines
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  })

  function download() {
    if (!loaded) return
    // octet-stream so the browser saves the file instead of opening it
    downloadBlob(
      loaded.name,
      new Blob([loaded.bytes as BlobPart], { type: 'application/octet-stream' })
    )
  }
</script>

<Dialog
  {open}
  {onOpenChange}
  title={loaded?.name ?? 'Solver proof'}
  maxInlineSize="min(64rem, 92vw)"
  description={loaded ? formatFileSize(loaded.size) : undefined}
>
  {#snippet children()}
    <proof-preview>
      {#if error}
        <proof-message role="alert">{error}</proof-message>
      {:else if !loaded}
        <proof-message><Spinner /></proof-message>
      {:else if loaded.kind === 'image' && loaded.previewUrl}
        <img src={loaded.previewUrl} alt={`Solver proof ${loaded.name}`} />
      {:else if loaded.kind === 'video' && loaded.previewUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={loaded.previewUrl} controls></video>
      {:else if loaded.kind === 'audio' && loaded.previewUrl}
        <audio src={loaded.previewUrl} controls></audio>
      {:else if loaded.kind === 'text' && loaded.text !== null}
        {#if codeLanguage}
          <proof-language>{LANGUAGE_LABELS[codeLanguage]}</proof-language>
        {/if}
        <pre class="syntax"><code
            >{#if highlighted}{#each highlighted as line, index (index)}{#if index > 0}{'\n'}{/if}{#each line as segment, segmentIndex (segmentIndex)}{#if segment.className}<span
                      class={segment.className}>{segment.text}</span
                    >{:else}{segment.text}{/if}{/each}{/each}{:else}{shownText}{/if}</code
          ></pre>
        {#if truncated}
          <proof-message
            >Preview truncated. Download the file to see all of it.</proof-message
          >
        {/if}
      {:else}
        <proof-message>No preview for this file type.</proof-message>
      {/if}

      <proof-actions>
        <Button variant="secondary" disabled={!loaded} onclick={download}>
          <IconDownload />
          Download
        </Button>
      </proof-actions>
    </proof-preview>
  {/snippet}
</Dialog>

<style>
  proof-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    inline-size: 100%;
    min-inline-size: 0;
  }

  img,
  video {
    display: block;
    max-inline-size: 100%;
    max-block-size: 70vh;
    margin-inline: auto;
    object-fit: contain;
    background: var(--background-l2);
    border-radius: var(--radius-md);
  }

  audio {
    inline-size: 100%;
  }

  pre {
    max-block-size: 60vh;
    margin: 0;
    padding: var(--space-xs);
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--step--1);
    color: var(--foreground-l1);
    white-space: pre;
    background: var(--background-l2);
    border-radius: var(--radius-md);
  }

  proof-language {
    align-self: flex-start;
    padding: 0.125rem var(--space-3xs);
    font-size: var(--step--2);
    color: var(--foreground-l2);
    background: var(--background-l2);
    border-radius: var(--radius-md);
  }

  proof-message {
    display: flex;
    justify-content: center;
    padding: var(--space-s);
    font-size: var(--step--1);
    color: var(--foreground-l3);
  }

  proof-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
