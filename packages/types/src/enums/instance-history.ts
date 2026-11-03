// How an instance in the history ended.
export enum InstanceEndReason {
  // the team stopped it
  STOPPED = 'stopped',
  // stopped automatically once the team solved the challenge
  SOLVED = 'solved',
  // its time ran out
  EXPIRED = 'expired',
  // the instancer no longer had it, for example it crashed or was removed
  GONE = 'gone',
  // the instancer reported an error
  ERRORED = 'errored',
}

// An instance's state in the history: running, or how it ended.
export enum InstanceHistoryStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
  SOLVED = 'solved',
  EXPIRED = 'expired',
  GONE = 'gone',
  ERRORED = 'errored',
}
