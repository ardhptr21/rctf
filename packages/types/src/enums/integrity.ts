// Kinds of suspicious activity the integrity detectors record.
export enum IntegritySignalKind {
  FLAG_SHARING = 'flagSharing',
  SHARED_IP = 'sharedIp',
  DUPLICATE_PROOF = 'duplicateProof',
  DUPLICATE_AI_LINK = 'duplicateAiLink',
  SOLVED_WITHOUT_DOWNLOAD = 'solvedWithoutDownload',
  UNLISTED_AI_LINK = 'unlistedAiLink',
}

export enum IntegritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum IntegrityCaseStatus {
  OPEN = 'open',
  DISMISSED = 'dismissed',
  ACTIONED = 'actioned',
}

export const INTEGRITY_SIGNAL_KINDS = Object.values(IntegritySignalKind)
export const INTEGRITY_SEVERITIES = Object.values(IntegritySeverity)
export const INTEGRITY_CASE_STATUSES = Object.values(IntegrityCaseStatus)
