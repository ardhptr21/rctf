import { NO_AI, validateAiLinks } from '@rctf/types'

export type EvidenceInput = {
  links: string[]
  noAi: boolean
  proof: File | null
  maxProofSize: number
}

export type EvidenceErrors = {
  aiLinks?: string
  proof?: string
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// The links to send: exactly "no ai" when the player didn't use AI.
export function collectAiLinks(links: readonly string[], noAi: boolean) {
  return noAi ? [NO_AI] : links.map(link => link.trim()).filter(Boolean)
}

export function validateEvidence(input: EvidenceInput): EvidenceErrors {
  const errors: EvidenceErrors = {}

  const aiLinksError = validateAiLinks(collectAiLinks(input.links, input.noAi))
  if (aiLinksError) {
    errors.aiLinks = aiLinksError
  }

  if (!input.proof || input.proof.size === 0) {
    errors.proof = 'Upload your solve script or a screenshot of the flag.'
  } else if (input.proof.size > input.maxProofSize) {
    errors.proof = `The file is larger than ${formatFileSize(input.maxProofSize)}.`
  }

  return errors
}
