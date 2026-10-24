import {
  base64ToBytes,
  detectPreviewKind,
  previewMimeType,
} from '$routes/admin/submissions/proof-preview'
import { describe, expect, it } from 'bun:test'

const text = (value: string) => new TextEncoder().encode(value)
const binary = new Uint8Array([0x89, 0x00, 0xff, 0x10])

describe('detectPreviewKind', () => {
  it('previews images, including SVG, as images', () => {
    expect(detectPreviewKind('flag.png', 'image/png', binary)).toBe('image')
    expect(detectPreviewKind('flag.JPG', '', binary)).toBe('image')
    expect(detectPreviewKind('flag.svg', 'image/svg+xml', text('<svg/>'))).toBe(
      'image'
    )
  })

  it('previews scripts and other text as text', () => {
    expect(
      detectPreviewKind('solve.py', 'text/x-python', text('print(1)'))
    ).toBe('text')
    expect(detectPreviewKind('solve', '', text('#!/bin/sh\necho hi'))).toBe(
      'text'
    )
  })

  it('never renders HTML: it is shown as source text', () => {
    expect(
      detectPreviewKind('exploit.html', 'text/html', text('<script>x</script>'))
    ).toBe('text')
  })

  it('previews video and audio with players', () => {
    expect(detectPreviewKind('run.mp4', 'video/mp4', binary)).toBe('video')
    expect(detectPreviewKind('note.mp3', '', binary)).toBe('audio')
  })

  it('has no preview for other binary files', () => {
    expect(detectPreviewKind('solve.pdf', 'application/pdf', binary)).toBe(
      'none'
    )
    expect(detectPreviewKind('a.out', '', binary)).toBe('none')
  })
})

describe('previewMimeType', () => {
  it('maps image extensions to image types', () => {
    expect(previewMimeType('image', 'a.jpg', '')).toBe('image/jpeg')
    expect(previewMimeType('image', 'a.svg', 'text/plain')).toBe(
      'image/svg+xml'
    )
  })
})

describe('base64ToBytes', () => {
  it('decodes base64', () => {
    expect(Array.from(base64ToBytes('AQID'))).toEqual([1, 2, 3])
  })
})
