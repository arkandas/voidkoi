'use client';

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightSpecialChars, keymap, placeholder as placeholderText } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

import { cycleHeading, link, run, toggleWrap } from './commands';

/** Markdown coloured from the theme's tokens, so it follows light and dark by itself. */
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.22em', color: 'var(--ink)' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.12em', color: 'var(--ink)' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '700', color: 'var(--ink)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.monospace, color: 'rgb(var(--code-keyword-rgb))' },
  { tag: tags.quote, color: 'var(--ink-muted)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName], color: 'var(--ink-faint)' },
  { tag: tags.list, color: 'var(--accent)' },
  { tag: [tags.comment, tags.blockComment], color: 'rgb(var(--code-comment-rgb))', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: 'rgb(var(--code-keyword-rgb))' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'rgb(var(--code-string-rgb))' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.className, tags.typeName], color: 'rgb(var(--code-function-rgb))' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.propertyName], color: 'rgb(var(--code-number-rgb))' },
  { tag: [tags.tagName, tags.angleBracket], color: 'rgb(var(--code-tag-rgb))' },
  { tag: [tags.attributeName, tags.variableName, tags.self], color: 'rgb(var(--code-builtin-rgb))' },
]);

const theme = EditorView.theme({
  '&': {
    color: 'var(--ink)',
    backgroundColor: 'transparent',
    fontSize: '14.5px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.75',
    overflow: 'visible',
  },
  '.cm-content': {
    padding: '4px 0 40vh',
    caretColor: 'var(--accent)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent) !important',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
  '.cm-placeholder': { color: 'var(--ink-faint)' },
  '.cm-panels': { backgroundColor: 'var(--raised)', color: 'var(--ink)', borderColor: 'var(--line)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-search': { fontFamily: 'inherit', fontSize: '13px', padding: '6px 8px' },
  '.cm-textfield': {
    border: '1px solid var(--line-strong)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    padding: '2px 6px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--muted)',
    border: '1px solid var(--line-strong)',
    borderRadius: '6px',
    color: 'var(--ink)',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, rgb(var(--warning-rgb)) 30%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' },
});

export interface MarkdownEditorProps {
  initial: string;
  onChange(text: string): void;
  /** Pictures pasted or dropped, with where a drop landed. */
  onImages(files: File[], at: number | null, view: EditorView): void;
  onSave(): void;
  onReady(view: EditorView | null): void;
  placeholder: string;
  linkPlaceholder: string;
  label: string;
}

function images(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter(file => file.type.startsWith('image/'));
}

/**
 * The Markdown editor: highlighting, lists that carry on with Enter, the
 * usual shortcuts, search, and pictures pasted or dropped in. It grows with
 * the text; the page around it scrolls.
 */
export function MarkdownEditor({ initial, onChange, onImages, onSave, onReady, placeholder, linkPlaceholder, label }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  // Read through refs: the editor is made once and outlives every render.
  const handlers = useRef({ onChange, onImages, onSave, linkPlaceholder });
  useEffect(() => {
    handlers.current = { onChange, onImages, onSave, linkPlaceholder };
  }, [onChange, onImages, onSave, linkPlaceholder]);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          closeBrackets(),
          highlightSelectionMatches(),
          search({ top: true }),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(markdownStyle),
          theme,
          placeholderText(placeholder),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'true', autocapitalize: 'sentences' }),
          keymap.of([
            { key: 'Mod-b', run: target => run(target, state => toggleWrap(state, '**')) },
            { key: 'Mod-i', run: target => run(target, state => toggleWrap(state, '_')) },
            { key: 'Mod-k', run: target => run(target, state => link(state, handlers.current.linkPlaceholder)) },
            { key: 'Mod-Alt-2', run: target => run(target, cycleHeading) },
            {
              key: 'Mod-s',
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event, target) {
              const files = images(event.clipboardData?.files);
              if (files.length === 0) return false;
              event.preventDefault();
              handlers.current.onImages(files, null, target);
              return true;
            },
            drop(event, target) {
              const files = images(event.dataTransfer?.files);
              if (files.length === 0) return false;
              event.preventDefault();
              const at = target.posAtCoords({ x: event.clientX, y: event.clientY });
              handlers.current.onImages(files, at, target);
              return true;
            },
          }),
        ],
      }),
    });
    onReady(view);
    return () => {
      onReady(null);
      view.destroy();
    };
    // The editor is made once, with the text it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="min-h-[50vh]" />;
}
