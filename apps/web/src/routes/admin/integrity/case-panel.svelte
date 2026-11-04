<script lang="ts">
  import {
    GoodAdminIntegrityCaseUpdate,
    GoodAdminUserUpdateV2,
    IntegrityCaseStatus,
    UpdateAdminIntegrityCaseRouteV2,
    UpdateAdminUserRouteV2,
  } from '@rctf/types'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { apiRequest, showApiError } from '$lib/api'
  import {
    invalidateAdminIntegrityQueries,
    invalidateAdminTeamQueries,
    useAdminIntegrityCase,
  } from '$lib/query/admin'
  import { toast } from '$lib/toast'
  import Button from '$lib/ui/button.svelte'
  import Dialog from '$lib/ui/dialog.svelte'
  import Spinner from '$lib/ui/spinner.svelte'
  import Textarea from '$lib/ui/textarea.svelte'
  import { createAsyncAction } from '$lib/utils/async-action.svelte'
  import { formatLocalTime } from '$lib/utils/time'
  import { createConfirmState } from '../confirm-state.svelte'
  import ConfirmDialog from '../profile/confirm-dialog.svelte'
  import {
    caseTeamsLabel,
    describeEvidence,
    KIND_LABEL,
    riskBand,
    SEVERITY_LABEL,
    type IntegrityCaseDetail,
  } from './integrity-model'

  type Props = {
    caseId: string | null
    onClose: () => void
  }

  let { caseId, onClose }: Props = $props()

  const queryClient = useQueryClient()
  const caseQuery = useAdminIntegrityCase(() => caseId)
  const kase = $derived(caseQuery.data)

  const action = createAsyncAction<string>()
  const confirmState = createConfirmState()

  let note = $state('')
  // load the saved note each time a different case opens
  $effect(() => {
    note = kase?.note ?? ''
  })

  type Team = NonNullable<IntegrityCaseDetail['otherTeam']>
  const teams = $derived<Team[]>(
    kase ? [kase.team, ...(kase.otherTeam ? [kase.otherTeam] : [])] : []
  )
  const teamName = (id: string) =>
    teams.find(team => team.id === id)?.name ?? id

  async function patchStatus(
    id: string,
    status: IntegrityCaseStatus
  ): Promise<boolean> {
    const response = await apiRequest(UpdateAdminIntegrityCaseRouteV2, {
      id,
      status,
      note: note.trim(),
    })
    if (response.kind !== GoodAdminIntegrityCaseUpdate.kind) {
      showApiError(response)
      return false
    }
    invalidateAdminIntegrityQueries(queryClient)
    return true
  }

  function setStatus(status: IntegrityCaseStatus, message: string) {
    const id = kase?.id
    if (!id) return
    action.run(
      async () => {
        if (await patchStatus(id, status)) toast.success(message)
      },
      { key: status, errorMessage: 'Failed to update the case' }
    )
  }

  function banTeam(team: Team) {
    const id = kase?.id
    if (!id) return
    action.run(
      async () => {
        const response = await apiRequest(UpdateAdminUserRouteV2, {
          id: team.id,
          data: { banned: true },
        })
        if (response.kind !== GoodAdminUserUpdateV2.kind) {
          showApiError(response)
          return
        }
        invalidateAdminTeamQueries(queryClient)
        if (!note.trim()) note = `Banned ${team.name}.`
        if (await patchStatus(id, IntegrityCaseStatus.ACTIONED)) {
          toast.success(`${team.name} banned and the case marked actioned.`)
        }
      },
      { key: `ban:${team.id}`, errorMessage: `Failed to ban ${team.name}` }
    )
  }

  function requestBan(team: Team) {
    confirmState.request({
      title: 'Ban team',
      message: `Banning ${team.name} removes it from the leaderboard and blocks its challenges. The case is then marked actioned.`,
      confirmLabel: 'Ban team',
      destructive: true,
      run: () => banTeam(team),
    })
  }
</script>

<Dialog
  open={caseId !== null}
  onOpenChange={open => {
    if (!open) onClose()
  }}
  title={kase ? caseTeamsLabel(kase) : 'Integrity case'}
  maxInlineSize="min(52rem, 92vw)"
>
  {#snippet children()}
    {#if !kase}
      <panel-status>
        {#if caseQuery.isError}
          <p>{caseQuery.error?.message ?? 'Failed to load the case.'}</p>
        {:else}
          <Spinner />
        {/if}
      </panel-status>
    {:else}
      <case-panel>
        <case-summary>
          <risk-badge data-band={riskBand(kase.score)}>
            Risk {kase.score}
          </risk-badge>
          <span>
            {kase.signalCount} signal{kase.signalCount === 1 ? '' : 's'} ·
            {kase.status}
          </span>
        </case-summary>

        <section-label>Teams</section-label>
        <case-teams>
          {#each teams as team (team.id)}
            <team-row>
              <a href="/admin/profile/{team.id}">{team.name}</a>
              {#if team.banned}
                <banned-tag>Banned</banned-tag>
              {:else}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={action.pending}
                  onclick={() => requestBan(team)}
                >
                  {#if action.key === `ban:${team.id}`}<Spinner />{/if}
                  Ban team
                </Button>
              {/if}
            </team-row>
          {/each}
        </case-teams>

        <section-label>Signals</section-label>
        <signal-list>
          {#each kase.signals as signal (signal.id)}
            <signal-item>
              <signal-head>
                <strong>{KIND_LABEL[signal.kind]}</strong>
                <severity-text data-severity={signal.severity}
                  >{SEVERITY_LABEL[signal.severity]}</severity-text
                >
                {#if signal.challenge}
                  <challenge-name
                    >{signal.challenge.category}/{signal.challenge
                      .name}</challenge-name
                  >
                {/if}
                <time>{formatLocalTime(signal.createdAt)}</time>
              </signal-head>
              <signal-body>
                <span>{teamName(signal.teamId)}:</span>
                {describeEvidence(signal)}
              </signal-body>
            </signal-item>
          {/each}
        </signal-list>

        <label>
          <span>Note</span>
          <Textarea
            rows={2}
            maxlength={2000}
            placeholder="Why this case was dismissed or actioned"
            bind:value={note}
          />
        </label>

        <panel-actions>
          {#if kase.status === IntegrityCaseStatus.OPEN}
            <Button
              variant="secondary"
              disabled={action.pending}
              onclick={() =>
                setStatus(IntegrityCaseStatus.DISMISSED, 'Case dismissed.')}
            >
              {#if action.key === IntegrityCaseStatus.DISMISSED}<Spinner />{/if}
              Dismiss
            </Button>
            <Button
              disabled={action.pending}
              onclick={() =>
                setStatus(
                  IntegrityCaseStatus.ACTIONED,
                  'Case marked actioned.'
                )}
            >
              {#if action.key === IntegrityCaseStatus.ACTIONED}<Spinner />{/if}
              Mark actioned
            </Button>
          {:else}
            <Button
              variant="secondary"
              disabled={action.pending}
              onclick={() =>
                setStatus(IntegrityCaseStatus.OPEN, 'Case reopened.')}
            >
              {#if action.key === IntegrityCaseStatus.OPEN}<Spinner />{/if}
              Reopen
            </Button>
          {/if}
        </panel-actions>
      </case-panel>
    {/if}
  {/snippet}
</Dialog>

<ConfirmDialog
  open={confirmState.current !== null}
  onOpenChange={(open: boolean) => {
    if (!open) confirmState.cancel()
  }}
  title={confirmState.current?.title ?? ''}
  message={confirmState.current?.message ?? ''}
  confirmLabel={confirmState.current?.confirmLabel ?? 'Confirm'}
  destructive={confirmState.current?.destructive ?? false}
  onConfirm={confirmState.confirm}
/>

<style>
  panel-status {
    display: flex;
    justify-content: center;
    padding: var(--space-l);
    color: var(--foreground-l3);
  }

  case-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  case-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  risk-badge {
    padding: 0.125rem var(--space-2xs);
    color: var(--risk-color);
    font-weight: 600;
    background: color-mix(in srgb, var(--risk-color) 14%, transparent);
    border-radius: var(--radius-md);

    &[data-band='low'] {
      --risk-color: var(--foreground-l2);
    }
    &[data-band='medium'] {
      --risk-color: var(--foreground-yellow-l1);
    }
    &[data-band='high'] {
      --risk-color: var(--foreground-destructive);
    }
  }

  section-label {
    margin-block-end: calc(var(--space-s) * -1 + var(--space-3xs));
    color: var(--foreground-l3);
    font-size: var(--step--1);
  }

  /* teams and signals: one bordered list each, rows split by rules */
  case-teams,
  signal-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);

    & > * + * {
      border-block-start: 1px solid var(--border);
    }
  }

  team-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    padding: var(--space-3xs) var(--space-xs);

    a {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--foreground-l1);
      white-space: nowrap;
      text-overflow: ellipsis;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  banned-tag {
    flex-shrink: 0;
    color: var(--foreground-destructive);
    font-size: var(--step--1);
  }

  signal-list {
    max-block-size: 22rem;
    overflow-y: auto;
  }

  signal-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    padding: var(--space-2xs) var(--space-xs);
  }

  signal-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs);
    font-size: var(--step--1);
    color: var(--foreground-l3);

    strong {
      color: var(--foreground-l1);
      font-weight: 500;
    }

    time {
      margin-inline-start: auto;
      font-variant-numeric: tabular-nums;
    }
  }

  severity-text {
    color: var(--foreground-l3);

    &[data-severity='medium'] {
      color: var(--foreground-yellow-l1);
    }
    &[data-severity='high'] {
      color: var(--foreground-destructive);
    }
  }

  challenge-name {
    font-family: var(--font-mono);
    font-size: var(--step--2);
  }

  signal-body {
    overflow-wrap: anywhere;
    color: var(--foreground-l2);
    font-size: var(--step--1);

    span {
      color: var(--foreground-l1);
    }
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    color: var(--foreground-l2);
    font-size: var(--step--1);
  }

  panel-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2xs);
  }
</style>
