import { highlight } from '$lib/utils/syntax-highlight'
import { detectCodeLanguage } from '$lib/utils/syntax-language'
import { describe, expect, it } from 'bun:test'

describe('detectCodeLanguage', () => {
  it('detects languages from the file extension', () => {
    expect(detectCodeLanguage('solve.py', '')).toBe('python')
    expect(detectCodeLanguage('exploit.JS', '')).toBe('javascript')
    expect(detectCodeLanguage('pwn.c', '')).toBe('c')
    expect(detectCodeLanguage('main.rs', '')).toBe('rust')
    expect(detectCodeLanguage('run.sh', '')).toBe('shell')
    expect(detectCodeLanguage('Dockerfile', '')).toBe('dockerfile')
  })

  it('falls back to the #! line for files without an extension', () => {
    expect(
      detectCodeLanguage('solve', '#!/usr/bin/env python3\nprint(1)')
    ).toBe('python')
    expect(detectCodeLanguage('run', '#!/bin/bash\necho hi')).toBe('shell')
    expect(detectCodeLanguage('x', '#!/usr/bin/env node\n')).toBe('javascript')
  })

  it('returns null for plain text', () => {
    expect(detectCodeLanguage('notes.txt', 'flag{abc}')).toBeNull()
    expect(detectCodeLanguage('output', 'flag{abc}')).toBeNull()
  })
})

describe('highlight', () => {
  const classesOf = async (
    language: Parameters<typeof highlight>[0],
    code: string
  ) => {
    const lines = await highlight(language, code)
    return {
      lines,
      text: lines.map(line => line.map(s => s.text).join('')).join('\n'),
      classes: new Set(
        lines
          .flat()
          .map(s => s.className)
          .filter(Boolean)
      ),
    }
  }

  it('highlights Python keywords and strings and keeps the text intact', async () => {
    const code = 'def solve():\n    return "flag{x}"'
    const { text, classes, lines } = await classesOf('python', code)
    expect(text).toBe(code)
    expect(lines).toHaveLength(2)
    expect(classes.has('tok-keyword')).toBe(true)
    expect(classes.has('tok-string')).toBe(true)
  })

  it('highlights C and shell via legacy modes', async () => {
    expect(
      (await classesOf('c', 'int main() { return 0; }')).classes.has(
        'tok-keyword'
      )
    ).toBe(true)
    const shell = await classesOf('shell', 'echo "hi" # comment')
    expect(shell.text).toBe('echo "hi" # comment')
    expect(shell.classes.has('tok-comment')).toBe(true)
  })
})
