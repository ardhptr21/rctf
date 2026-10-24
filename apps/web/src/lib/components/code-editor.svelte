<script lang="ts">
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
  } from '@codemirror/commands'
  import { javascript } from '@codemirror/lang-javascript'
  import { markdown } from '@codemirror/lang-markdown'
  import { yaml } from '@codemirror/lang-yaml'
  import {
    indentOnInput,
    indentUnit,
    syntaxHighlighting,
  } from '@codemirror/language'
  import { Compartment, EditorState, type Extension } from '@codemirror/state'
  import {
    EditorView,
    keymap,
    placeholder as placeholderExt,
  } from '@codemirror/view'
  import { classHighlighter } from '@lezer/highlight'
  import { indentationMarkers } from '@replit/codemirror-indentation-markers'
  import { untrack } from 'svelte'

  interface Props {
    value: string
    language: string
    disabled: boolean
    rows?: number
    placeholder?: string
    label?: string
    invalid?: boolean
    wrap?: boolean
    indent?: boolean
    oninput: (value: string) => void
    onblur?: () => void
  }

  let {
    value,
    language,
    disabled,
    rows = 16,
    placeholder,
    label,
    invalid = false,
    wrap = false,
    indent = false,
    oninput,
    onblur,
  }: Props = $props()

  let container = $state<HTMLElement | null>(null)
  let view = $state<EditorView | null>(null)
  const readOnly = new Compartment()
  const contentAttrs = new Compartment()

  function languageExtensions(): Extension[] {
    switch (language) {
      case 'yaml':
        return [yaml()]
      case 'javascript':
        return [javascript()]
      case 'typescript':
        return [javascript({ typescript: true })]
      case 'markdown':
        return [markdown()]
      default:
        return []
    }
  }

  function attributes(): Record<string, string> {
    return {
      spellcheck: 'false',
      autocapitalize: 'off',
      ...(label ? { 'aria-label': label } : {}),
      ...(invalid ? { 'aria-invalid': 'true' } : {}),
    }
  }

  $effect(() => {
    const parent = container
    if (!parent) {
      return
    }
    const instance = untrack(
      () =>
        new EditorView({
          parent,
          state: EditorState.create({
            doc: value,
            extensions: [
              history(),
              indentOnInput(),
              indentUnit.of('  '),
              EditorState.tabSize.of(2),
              keymap.of([
                ...(indent ? [indentWithTab] : []),
                ...defaultKeymap,
                ...historyKeymap,
              ]),
              ...languageExtensions(),
              syntaxHighlighting(classHighlighter),
              ...(wrap ? [EditorView.lineWrapping] : []),
              ...(indent
                ? [
                    indentationMarkers({
                      thickness: 1,
                      colors: {
                        light: 'var(--code-guide)',
                        dark: 'var(--code-guide)',
                        activeLight: 'var(--code-guide-active)',
                        activeDark: 'var(--code-guide-active)',
                      },
                    }),
                  ]
                : []),
              ...(placeholder ? [placeholderExt(placeholder)] : []),
              readOnly.of(EditorState.readOnly.of(disabled)),
              contentAttrs.of(EditorView.contentAttributes.of(attributes())),
              EditorView.updateListener.of(update => {
                if (update.docChanged) {
                  oninput(update.state.doc.toString())
                }
              }),
              EditorView.domEventHandlers({
                blur: () => onblur?.(),
              }),
            ],
          }),
        })
    )
    view = instance
    return () => {
      instance.destroy()
      view = null
    }
  })

  $effect(() => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
    }
  })

  $effect(() => {
    if (view && view.state.readOnly !== disabled) {
      view.dispatch({
        effects: readOnly.reconfigure(EditorState.readOnly.of(disabled)),
      })
    }
  })

  $effect(() => {
    const attrs = attributes()
    if (view) {
      view.dispatch({
        effects: contentAttrs.reconfigure(
          EditorView.contentAttributes.of(attrs)
        ),
      })
    }
  })
</script>

<code-editor-shell
  class="syntax"
  bind:this={container}
  data-invalid={invalid || undefined}
  style:--code-editor-block-size="calc({rows * 1.5}em + 2 * var(--space-3xs))"
></code-editor-shell>

<style>
  code-editor-shell {
    --code-guide: color-mix(in srgb, var(--foreground-l4) 40%, transparent);
    --code-guide-active: color-mix(
      in srgb,
      var(--foreground-l4) 70%,
      transparent
    );
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: var(--step--1);
    background: var(--background-l4);
    border: 2px solid transparent;
    border-radius: var(--radius-md);

    &:focus-within {
      outline: 2px solid var(--ring);
      outline-offset: -1px;
    }

    &[data-invalid] {
      border-color: var(--foreground-destructive);
    }

    :global(.cm-editor) {
      block-size: var(--code-editor-block-size);
      min-block-size: 4.5rem;
    }

    :global(.cm-editor.cm-focused) {
      outline: none;
    }

    :global(.cm-scroller) {
      font-family: var(--font-mono);
      line-height: 1.5;
    }

    :global(.cm-content) {
      padding: var(--space-3xs) 0;
      caret-color: var(--foreground-l0);
    }

    :global(.cm-line) {
      padding-inline: var(--space-2xs);
    }

    :global(.cm-content ::selection),
    :global(.cm-line::selection) {
      background: color-mix(in srgb, var(--foreground-accent) 35%, transparent);
    }

    :global(.cm-placeholder) {
      color: var(--foreground-l4);
    }
  }
</style>
