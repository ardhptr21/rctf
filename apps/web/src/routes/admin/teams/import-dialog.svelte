<script lang="ts">
  import {
    BadTeamsImport,
    GoodAdminTeamsImport,
    GoodAdminTeamsImportPreview,
    ImportAdminTeamsRouteV2,
    type TeamsCsvProblem,
  } from '@rctf/types'
  import { apiRequest, showApiError } from '$lib/api'
  import { IconCheckCircle, IconDownload, IconFile } from '$lib/icons'
  import Button from '$lib/ui/button.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import { createAsyncAction } from '$lib/utils/async-action.svelte'
  import { downloadTextFile } from '$lib/utils/download'
  import {
    importTemplateCsv,
    joinCodesCsv,
    joinCodesFileName,
    type TeamJoinCode,
  } from './teams-import'

  type Props = {
    open: boolean
    ctfName: string
    divisions: Record<string, string>
    onClose: () => void
    onImported: () => void
  }

  let { open, ctfName, divisions, onClose, onImported }: Props = $props()

  type PreviewTeam = { line: number; name: string; division: string }

  let fileName = $state<string | null>(null)
  let csv = $state('')
  let preview = $state<PreviewTeam[]>([])
  let problems = $state<TeamsCsvProblem[]>([])
  let created = $state<TeamJoinCode[] | null>(null)

  const checkAction = createAsyncAction()
  const importAction = createAsyncAction()

  const busy = $derived(checkAction.pending || importAction.pending)
  const canImport = $derived(
    !busy && preview.length > 0 && problems.length === 0
  )

  // start over each time the dialog opens
  $effect(() => {
    if (!open) return
    fileName = null
    csv = ''
    preview = []
    problems = []
    created = null
  })

  function downloadTemplate() {
    const division = Object.keys(divisions)[0] ?? 'open'
    downloadTextFile(
      'teams-template.csv',
      importTemplateCsv(division),
      'text/csv'
    )
  }

  function chooseFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0]
    // the same file can be picked again after fixing it
    event.currentTarget.value = ''
    if (!file) return
    checkAction.run(
      async () => {
        const text = await file.text()
        const response = await apiRequest(ImportAdminTeamsRouteV2, {
          csv: text,
          confirm: false,
        })
        if (response.kind !== GoodAdminTeamsImportPreview.kind) {
          showApiError(response)
          return
        }
        fileName = file.name
        csv = text
        preview = response.data.teams
        problems = response.data.problems
      },
      { errorMessage: 'Failed to read the file' }
    )
  }

  function runImport() {
    importAction.run(
      async () => {
        const response = await apiRequest(ImportAdminTeamsRouteV2, {
          csv,
          confirm: true,
        })
        if (response.kind === BadTeamsImport.kind) {
          problems = response.data.problems
          return
        }
        if (response.kind !== GoodAdminTeamsImport.kind) {
          showApiError(response)
          return
        }
        created = response.data.teams
        onImported()
      },
      { errorMessage: 'Failed to import teams' }
    )
  }

  function downloadJoinCodes() {
    if (!created) return
    downloadTextFile(
      joinCodesFileName(ctfName),
      joinCodesCsv(created, divisions),
      'text/csv'
    )
  }

  const problemLabel = (problem: TeamsCsvProblem) =>
    problem.line === null
      ? problem.message
      : `Line ${problem.line}: ${problem.message}`
</script>

<Dialog
  {open}
  onOpenChange={next => {
    if (!next) onClose()
  }}
  title="Import teams"
  description={created
    ? undefined
    : 'Upload a CSV with a "name" column and an optional "division" column. Nothing is created until the whole file is valid.'}
  maxInlineSize="40rem"
>
  {#snippet children({ closeProps })}
    <import-body>
      {#if created}
        <import-done>
          <IconCheckCircle aria-hidden="true" />
          <p>
            Created {created.length} team{created.length === 1 ? '' : 's'}.
            Download their join codes to hand out. You can also get them later
            with Export join codes, or one at a time from each team's row.
          </p>
        </import-done>
        <import-actions>
          <Button {...closeProps} variant="secondary">Close</Button>
          <Button onclick={downloadJoinCodes}>
            <IconDownload />
            Download join codes
          </Button>
        </import-actions>
      {:else}
        <file-row>
          <label class="file-picker" data-disabled={busy || undefined}>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              disabled={busy}
              onchange={chooseFile}
            />
            {#if checkAction.pending}<Spinner />{:else}<IconFile
                aria-hidden="true"
              />{/if}
            <span>{fileName ?? 'Choose a CSV file'}</span>
          </label>
          <Button variant="ghost" size="sm" onclick={downloadTemplate}>
            <IconDownload />
            Template
          </Button>
        </file-row>

        {#if problems.length > 0}
          <import-problems role="alert">
            <strong>
              Fix {problems.length === 1 ? 'this problem' : 'these problems'} in the
              file, then choose it again:
            </strong>
            <ul>
              {#each problems as problem, index (index)}
                <li>{problemLabel(problem)}</li>
              {/each}
            </ul>
          </import-problems>
        {/if}

        {#if preview.length > 0}
          <preview-table>
            <table>
              <thead>
                <tr><th>Line</th><th>Name</th><th>Division</th></tr>
              </thead>
              <tbody>
                {#each preview as team (team.line)}
                  <tr>
                    <td>{team.line}</td>
                    <td>{team.name}</td>
                    <td>{divisions[team.division] ?? team.division}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </preview-table>
        {/if}

        <import-actions>
          <Button {...closeProps} variant="secondary">Cancel</Button>
          <Button disabled={!canImport} onclick={runImport}>
            {#if importAction.pending}<Spinner />{/if}
            {preview.length > 0
              ? `Import ${preview.length} team${preview.length === 1 ? '' : 's'}`
              : 'Import'}
          </Button>
        </import-actions>
      {/if}
    </import-body>
  {/snippet}
</Dialog>

<style>
  import-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  file-row {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }

  .file-picker {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2xs);
    min-inline-size: 0;
    padding: var(--space-2xs) var(--space-xs);
    color: var(--foreground-l2);
    background: var(--background-l3);
    border: 2px dashed var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;

    &:hover,
    &:focus-within {
      border-color: var(--ring);
    }

    &[data-disabled] {
      cursor: default;
      opacity: 0.6;
    }

    input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: inherit;
    }

    span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  import-problems {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    max-block-size: 10rem;
    padding: var(--space-2xs) var(--space-xs);
    overflow-y: auto;
    color: var(--foreground-destructive);
    font-size: var(--step--1);
    background: var(--background-destructive);
    border-radius: var(--radius-md);

    ul {
      margin: 0;
      padding-inline-start: 1.1rem;
    }
  }

  preview-table {
    display: block;
    max-block-size: 18rem;
    overflow: auto;
    border: 2px solid var(--border);
    border-radius: var(--radius-md);

    table {
      inline-size: 100%;
      font-size: var(--step--1);
      border-collapse: collapse;
    }

    th,
    td {
      padding: var(--space-3xs) var(--space-2xs);
      text-align: start;
    }

    th {
      position: sticky;
      inset-block-start: 0;
      color: var(--foreground-l3);
      font-weight: 600;
      background: var(--background-l3);
    }

    td:first-child,
    th:first-child {
      inline-size: 3.5rem;
      color: var(--foreground-l3);
    }

    tbody tr + tr td {
      border-block-start: 1px solid var(--border);
    }
  }

  import-done {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2xs);
    color: var(--foreground-l2);

    :global(svg) {
      flex-shrink: 0;
      margin-block-start: 0.15rem;
      color: var(--foreground-success);
      font-size: 1.25rem;
    }

    p {
      margin: 0;
    }
  }

  import-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2xs);
  }
</style>
