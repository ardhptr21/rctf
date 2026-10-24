import {
  StreamLanguage,
  type Language,
  type StreamParser,
} from '@codemirror/language'
import { classHighlighter, highlightCode } from '@lezer/highlight'
import type { CodeLanguage } from './syntax-language'

type Parser = Language['parser']

export type HighlightedSegment = { text: string; className: string }
export type HighlightedLine = HighlightedSegment[]

// legacy modes are typed against @codemirror/streamparser's copy of
// StreamParser; they are the documented input to StreamLanguage.define
const stream = (mode: object): Parser =>
  StreamLanguage.define(mode as StreamParser<unknown>).parser

// Parsers are imported on demand so they only load when a preview needs one.
const loaders: Record<CodeLanguage, () => Promise<Parser>> = {
  python: async () =>
    (await import('@codemirror/lang-python')).pythonLanguage.parser,
  javascript: async () =>
    (await import('@codemirror/lang-javascript')).javascriptLanguage.parser,
  typescript: async () =>
    (await import('@codemirror/lang-javascript')).typescriptLanguage.parser,
  jsx: async () =>
    (await import('@codemirror/lang-javascript')).jsxLanguage.parser,
  tsx: async () =>
    (await import('@codemirror/lang-javascript')).tsxLanguage.parser,
  c: async () => (await import('@codemirror/lang-cpp')).cppLanguage.parser,
  cpp: async () => (await import('@codemirror/lang-cpp')).cppLanguage.parser,
  java: async () => (await import('@codemirror/lang-java')).javaLanguage.parser,
  rust: async () => (await import('@codemirror/lang-rust')).rustLanguage.parser,
  go: async () => (await import('@codemirror/lang-go')).goLanguage.parser,
  php: async () =>
    (await import('@codemirror/lang-php')).php({ plain: true }).language.parser,
  sql: async () =>
    (await import('@codemirror/lang-sql')).StandardSQL.language.parser,
  json: async () => (await import('@codemirror/lang-json')).jsonLanguage.parser,
  yaml: async () => (await import('@codemirror/lang-yaml')).yamlLanguage.parser,
  markdown: async () =>
    (await import('@codemirror/lang-markdown')).markdownLanguage.parser,
  html: async () => (await import('@codemirror/lang-html')).htmlLanguage.parser,
  xml: async () => (await import('@codemirror/lang-xml')).xmlLanguage.parser,
  css: async () => (await import('@codemirror/lang-css')).cssLanguage.parser,
  shell: async () =>
    stream((await import('@codemirror/legacy-modes/mode/shell')).shell),
  powershell: async () =>
    stream(
      (await import('@codemirror/legacy-modes/mode/powershell')).powerShell
    ),
  ruby: async () =>
    stream((await import('@codemirror/legacy-modes/mode/ruby')).ruby),
  perl: async () =>
    stream((await import('@codemirror/legacy-modes/mode/perl')).perl),
  lua: async () =>
    stream((await import('@codemirror/legacy-modes/mode/lua')).lua),
  kotlin: async () =>
    stream((await import('@codemirror/legacy-modes/mode/clike')).kotlin),
  csharp: async () =>
    stream((await import('@codemirror/legacy-modes/mode/clike')).csharp),
  swift: async () =>
    stream((await import('@codemirror/legacy-modes/mode/swift')).swift),
  toml: async () =>
    stream((await import('@codemirror/legacy-modes/mode/toml')).toml),
  dockerfile: async () =>
    stream(
      (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile
    ),
}

// Splits code into lines of class-tagged segments, using the same `tok-*`
// classes as the code editor. Rendered as text, never as HTML.
export function highlightWith(parser: Parser, code: string): HighlightedLine[] {
  const lines: HighlightedLine[] = [[]]
  highlightCode(
    code,
    parser.parse(code),
    classHighlighter,
    (text, className) => lines[lines.length - 1]!.push({ text, className }),
    () => lines.push([])
  )
  return lines
}

export async function highlight(
  language: CodeLanguage,
  code: string
): Promise<HighlightedLine[]> {
  return highlightWith(await loaders[language](), code)
}
