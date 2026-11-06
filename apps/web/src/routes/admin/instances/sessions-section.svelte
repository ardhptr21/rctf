<script lang="ts">
  import { IconArrowClockwise, IconCaretRight } from '$lib/icons'
  import { useAdminInstanceSessionsInfinite } from '$lib/query/admin'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { formatLocalTime } from '$lib/utils/time'
  import {
    formatBytes,
    formatDurationMs,
    formatOffset,
    renderChunk,
    sessionDetails,
    transcriptToText,
    type AdminInstanceDetail,
    type InstanceSession,
    type TranscriptMode,
  } from './instances-model'

  type Props = {
    instanceId: string | null
    summary: AdminInstanceDetail['sessions']
    onRefresh: () => void
  }

  let { instanceId, summary, onRefresh }: Props = $props()

  let clientIp = $state('')
  let mode = $state<TranscriptMode>('text')
  // the connection whose transcript is shown, one at a time
  let expandedId = $state<string | null>(null)

  $effect(() => {
    void instanceId
    clientIp = ''
    expandedId = null
  })

  const sessionsQuery = useAdminInstanceSessionsInfinite(
    () => instanceId,
    () => (clientIp ? { clientIp } : {})
  )
  const sessions = $derived(
    sessionsQuery.data?.pages.flatMap(result => result.sessions) ?? []
  )
  const matching = $derived(sessionsQuery.data?.pages[0]?.total ?? 0)
  const refreshing = $derived(sessionsQuery.isFetching)

  const refresh = () => {
    onRefresh()
    void sessionsQuery.refetch()
  }

  const toggle = (id: string) => {
    expandedId = expandedId === id ? null : id
  }

  async function copyTranscript(session: InstanceSession) {
    try {
      await navigator.clipboard.writeText(transcriptToText(session, mode))
      toast.success('Transcript copied.')
    } catch {
      toast.error('Could not copy the transcript.')
    }
  }
</script>

<section-title>TCP connections</section-title>
<summary-row>
  <stat><strong>{summary.total}</strong> connections</stat>
  <stat><strong>{summary.uniqueIps}</strong> IPs</stat>
  {#if summary.lastAt}
    <muted>last {formatLocalTime(Date.parse(summary.lastAt))}</muted>
  {/if}
</summary-row>
{#if summary.kept < summary.total}
  <note
    >Showing the newest {summary.kept} of {summary.total} connections; older ones
    are no longer kept.</note
  >
{/if}

<filter-row>
  <mode-tabs role="tablist" aria-label="Transcript format">
    {#each [{ value: 'text', label: 'Text' }, { value: 'hex', label: 'Hex' }] as const as option (option.value)}
      <button
        type="button"
        role="tab"
        aria-selected={mode === option.value}
        data-selected={mode === option.value || undefined}
        onclick={() => (mode = option.value)}
      >
        {option.label}
      </button>
    {/each}
  </mode-tabs>
  {#if clientIp}
    <ip-chip>
      IP {clientIp}
      <button
        type="button"
        aria-label="Show all IPs"
        onclick={() => (clientIp = '')}>×</button
      >
    </ip-chip>
  {/if}
  <Button
    class="refresh"
    size="sm"
    variant="secondary"
    disabled={refreshing}
    onclick={refresh}
  >
    {#if refreshing}<Spinner />{:else}<IconArrowClockwise
        aria-hidden="true"
      />{/if}
    Refresh
  </Button>
</filter-row>

<sessions-table>
  <table>
    <thead>
      <tr>
        <th>Opened</th>
        <th>Client IP</th>
        <th>Duration</th>
        <th>Client sent</th>
        <th>Challenge sent</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each sessions as session (session.id)}
        {@const open = expandedId === session.id}
        {@const localTime = formatLocalTime(Date.parse(session.startedAt))}
        <tr
          class="session"
          data-open={open || undefined}
          tabindex="0"
          aria-expanded={open}
          aria-controls="session-{session.id}"
          title={open ? 'Hide transcript' : 'Show transcript'}
          onclick={() => toggle(session.id)}
          onkeydown={event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle(session.id)
            }
          }}
        >
          <td>
            <time-cell>
              <IconCaretRight aria-hidden="true" data-caret />
              {localTime}
            </time-cell>
          </td>
          <td>
            <button
              type="button"
              class="ip"
              title="Only this IP"
              onclick={event => {
                event.stopPropagation()
                clientIp = session.clientIp
              }}>{session.clientIp}</button
            >
          </td>
          <td>{formatDurationMs(session.durationMs)}</td>
          <td>{formatBytes(session.bytesIn)}</td>
          <td>{formatBytes(session.bytesOut)}</td>
          <td>
            <tags>
              {#if session.open}<tag data-tone="success">Open</tag>{/if}
              {#if session.truncated}<tag>Truncated</tag>{/if}
              {#if session.error}<tag data-tone="danger" title={session.error}
                  >Error</tag
                >{/if}
            </tags>
          </td>
        </tr>
        {#if open}
          <tr class="details" id="session-{session.id}">
            <td colspan="6">
              <dl>
                {#each sessionDetails(session, localTime) as detail (detail.label)}
                  <dt>{detail.label}</dt>
                  <dd>
                    {#if detail.code}<code>{detail.value}</code
                      >{:else}{detail.value}{/if}
                  </dd>
                {/each}
              </dl>
              <transcript-head>
                <span>Transcript</span>
                {#if session.transcript.length > 0}
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={() => copyTranscript(session)}>Copy</Button
                  >
                {/if}
              </transcript-head>
              <transcript>
                {#each session.transcript as chunk, i (i)}
                  <chunk data-dir={chunk.dir}>
                    <chunk-head>
                      <strong
                        >{chunk.dir === 'in' ? 'Client' : 'Challenge'}</strong
                      >
                      <span>{formatOffset(chunk.t)}</span>
                    </chunk-head>
                    <pre data-mode={mode}>{renderChunk(chunk, mode)}</pre>
                  </chunk>
                {:else}
                  <muted>Nothing was sent either way.</muted>
                {/each}
              </transcript>
            </td>
          </tr>
        {/if}
      {:else}
        <tr>
          <td colspan="6" class="empty">
            {sessionsQuery.isPending
              ? 'Loading connections...'
              : clientIp
                ? 'No connections from this IP.'
                : 'No connections reached this instance.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</sessions-table>
<table-foot>
  <muted>{sessions.length} of {matching}{clientIp ? ' matching' : ''}</muted>
  {#if sessionsQuery.hasNextPage}
    <Button
      size="sm"
      variant="secondary"
      disabled={sessionsQuery.isFetchingNextPage}
      onclick={() => sessionsQuery.fetchNextPage()}
    >
      {#if sessionsQuery.isFetchingNextPage}<Spinner />{/if}
      Load more
    </Button>
  {/if}
</table-foot>

<style>
  section-title {
    padding-block-start: var(--space-2xs);
    color: var(--foreground-l1);
    font-weight: 600;
    border-block-start: 2px solid var(--border);
  }

  summary-row,
  filter-row,
  table-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs);
  }

  table-foot {
    justify-content: space-between;
  }

  filter-row :global(.refresh) {
    margin-inline-start: auto;
  }

  stat {
    padding: 0.125rem var(--space-2xs);
    color: var(--foreground-l2);
    font-size: var(--step--1);
    background: var(--background-l3);
    border-radius: var(--radius-md);

    strong {
      color: var(--foreground-l1);
      font-variant-numeric: tabular-nums;
    }
  }

  note,
  muted {
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  muted {
    color: var(--foreground-l4);
  }

  mode-tabs {
    display: flex;
    gap: var(--space-3xs);
    padding: 0.125rem;
    background: var(--background-l3);
    border-radius: var(--radius-md);

    button {
      padding: 0.25rem var(--space-xs);
      color: var(--foreground-l3);
      font-size: var(--step--1);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;

      &:hover {
        color: var(--foreground-l1);
      }

      &[data-selected] {
        color: var(--foreground-l0);
        background: var(--background-l5);
      }
    }
  }

  ip-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3xs);
    padding: 0.125rem var(--space-2xs);
    font-size: var(--step--1);
    background: var(--background-l4);
    border-radius: var(--radius-md);

    button {
      color: var(--foreground-l3);
      background: transparent;
      border: none;
      cursor: pointer;
    }
  }

  sessions-table {
    display: block;
    max-block-size: 32rem;
    overflow: auto;
    border: 2px solid var(--border);
    border-radius: var(--radius-md);

    table {
      inline-size: 100%;
      font-size: var(--step--1);
      font-variant-numeric: tabular-nums;
      border-collapse: collapse;
    }

    th,
    td {
      padding: var(--space-3xs) var(--space-2xs);
      text-align: start;
      white-space: nowrap;
    }

    th {
      position: sticky;
      z-index: 1;
      inset-block-start: 0;
      color: var(--foreground-l3);
      font-weight: 600;
      background: var(--background-l3);
    }

    td {
      color: var(--foreground-l2);
    }

    tbody tr + tr td {
      border-block-start: 1px solid var(--border);
    }

    .empty {
      padding: var(--space-m);
      color: var(--foreground-l3);
      text-align: center;
    }

    .session {
      cursor: pointer;

      &:hover td,
      &[data-open] td {
        background: var(--background-l3);
      }

      &:focus-visible {
        outline: 2px solid var(--foreground-l2);
        outline-offset: -2px;
      }
    }

    time-cell {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3xs);

      :global([data-caret]) {
        flex: none;
        color: var(--foreground-l3);
        transition: rotate 120ms ease;
      }
    }

    .session[data-open] time-cell :global([data-caret]) {
      rotate: 90deg;
    }

    .details td {
      padding: var(--space-xs) var(--space-s);
      white-space: normal;
      background: var(--background-l2);
      border-block-start: none;
    }

    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: var(--space-3xs) var(--space-s);
      margin: 0;
    }

    dt {
      color: var(--foreground-l3);
    }

    dd {
      margin: 0;
      color: var(--foreground-l1);
      overflow-wrap: anywhere;
    }
  }

  tags {
    display: inline-flex;
    gap: var(--space-3xs);
  }

  tag {
    padding: 0 var(--space-3xs);
    color: var(--foreground-l3);
    font-size: var(--step--2);
    background: var(--background-l4);
    border-radius: var(--radius-sm);

    &[data-tone='success'] {
      color: var(--foreground-success);
    }
    &[data-tone='danger'] {
      color: var(--foreground-destructive);
    }
  }

  transcript-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-block: var(--space-s) var(--space-2xs);
    color: var(--foreground-l3);
  }

  transcript {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    max-block-size: 24rem;
    overflow: auto;
  }

  chunk {
    display: block;
    padding: var(--space-3xs) var(--space-2xs);
    background: var(--background-l3);
    border-radius: var(--radius-md);

    &[data-dir='out'] {
      background: var(--background-l1);
      border: 1px solid var(--border);
    }
  }

  chunk-head {
    display: flex;
    gap: var(--space-2xs);
    color: var(--foreground-l4);
    font-size: var(--step--2);

    strong {
      color: var(--foreground-l2);
      font-weight: 600;
    }
  }

  chunk[data-dir='in'] chunk-head strong {
    color: var(--foreground-sky-l1);
  }

  pre {
    margin: 0;
    color: var(--foreground-l1);
    font-family: var(--font-mono);
    font-size: var(--step--1);
    white-space: pre-wrap;
    word-break: break-all;

    &[data-mode='hex'] {
      overflow-x: auto;
      white-space: pre;
      word-break: normal;
    }
  }

  .ip {
    padding: 0;
    color: var(--foreground-l2);
    font: inherit;
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover {
      color: var(--foreground-l1);
      text-decoration: underline;
    }
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--step--1);
  }
</style>
