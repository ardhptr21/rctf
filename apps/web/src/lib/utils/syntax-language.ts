export type CodeLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'c'
  | 'cpp'
  | 'java'
  | 'rust'
  | 'go'
  | 'php'
  | 'sql'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'html'
  | 'xml'
  | 'css'
  | 'shell'
  | 'powershell'
  | 'ruby'
  | 'perl'
  | 'lua'
  | 'kotlin'
  | 'csharp'
  | 'swift'
  | 'toml'
  | 'dockerfile'

export const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  rust: 'Rust',
  go: 'Go',
  php: 'PHP',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  shell: 'Shell',
  powershell: 'PowerShell',
  ruby: 'Ruby',
  perl: 'Perl',
  lua: 'Lua',
  kotlin: 'Kotlin',
  csharp: 'C#',
  swift: 'Swift',
  toml: 'TOML',
  dockerfile: 'Dockerfile',
}

const BY_EXTENSION: Record<string, CodeLanguage> = {
  py: 'python',
  pyw: 'python',
  sage: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  java: 'java',
  rs: 'rust',
  go: 'go',
  php: 'php',
  sql: 'sql',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  rb: 'ruby',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  kt: 'kotlin',
  kts: 'kotlin',
  cs: 'csharp',
  swift: 'swift',
  toml: 'toml',
}

const BY_INTERPRETER: Record<string, CodeLanguage> = {
  python: 'python',
  python3: 'python',
  python2: 'python',
  sage: 'python',
  node: 'javascript',
  deno: 'typescript',
  bun: 'javascript',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ruby: 'ruby',
  perl: 'perl',
  php: 'php',
  lua: 'lua',
  pwsh: 'powershell',
}

// Picks a language from the file name, then from a `#!` line for scripts
// without an extension. Returns null when it is not recognisable code.
export function detectCodeLanguage(
  name: string,
  text: string
): CodeLanguage | null {
  const base = name.split(/[\\/]/).pop() ?? name
  if (/^dockerfile$/i.test(base) || /\.dockerfile$/i.test(base)) {
    return 'dockerfile'
  }

  const dot = base.lastIndexOf('.')
  if (dot > 0) {
    const byExtension = BY_EXTENSION[base.slice(dot + 1).toLowerCase()]
    if (byExtension) return byExtension
  }

  const shebang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(text)
  if (shebang) {
    const program = shebang[1]!.split('/').pop()!
    const interpreter = program === 'env' ? shebang[2] : program
    const language = interpreter ? BY_INTERPRETER[interpreter] : undefined
    if (language) return language
  }

  return null
}
