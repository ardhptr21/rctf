export type ProofPreviewKind = 'image' | 'text' | 'video' | 'audio' | 'none'

// Text previews stop here so huge files do not freeze the page.
export const MAX_TEXT_PREVIEW_CHARS = 200_000

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
  'ico',
  'svg',
])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'ogv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac'])

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// Decodes bytes as text when they look like a text file, otherwise null.
export function decodeText(bytes: Uint8Array): string | null {
  const sample = bytes.subarray(0, 64 * 1024)
  if (sample.includes(0)) {
    return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

// HTML, XML and other markup only ever reach the text preview, never a
// renderer, so an uploaded file cannot run script in the admin's session.
export function detectPreviewKind(
  name: string,
  contentType: string,
  bytes: Uint8Array
): ProofPreviewKind {
  const ext = fileExtension(name)
  const type = contentType.toLowerCase()

  if (
    IMAGE_EXTENSIONS.has(ext) ||
    (type.startsWith('image/') && ext !== 'html')
  ) {
    return 'image'
  }
  if (VIDEO_EXTENSIONS.has(ext) || type.startsWith('video/')) {
    return 'video'
  }
  if (AUDIO_EXTENSIONS.has(ext) || type.startsWith('audio/')) {
    return 'audio'
  }
  return decodeText(bytes) === null ? 'none' : 'text'
}

// The MIME type used for the in-page blob of a previewable file.
export function previewMimeType(
  kind: ProofPreviewKind,
  name: string,
  contentType: string
): string {
  const ext = fileExtension(name)
  if (kind === 'image') {
    return (
      IMAGE_MIME[ext] ??
      (contentType.startsWith('image/') ? contentType : `image/${ext}`)
    )
  }
  if (kind === 'video' || kind === 'audio') {
    return contentType || `${kind}/${ext}`
  }
  return 'application/octet-stream'
}
