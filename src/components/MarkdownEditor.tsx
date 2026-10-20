import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Annotation, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { indentUnit, bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter, placeholder } from '@codemirror/view';

const externalUpdate = Annotation.define<boolean>();

export interface MarkdownEditorHandle { view: EditorView | null }

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  acceptChange: (value: string) => boolean;
}>(function MarkdownEditor({ value, readOnly, onChange, acceptChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, acceptChange });
  useLayoutEffect(() => { callbacks.current = { onChange, acceptChange }; });
  useImperativeHandle(ref, () => ({ get view() { return instance.current; } }), []);

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          indentUnit.of('    '), lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]), bracketMatching(),
          markdown({ codeLanguages: languages }), syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping, EditorView.theme({ '&': { height: '100%' } }),
          placeholder('从一个想法开始…'),
          EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown 正文', 'aria-multiline': 'true' }),
          EditorState.transactionFilter.of(transaction => {
            if (!transaction.docChanged || transaction.annotation(externalUpdate) === true) return transaction;
            return callbacks.current.acceptChange(transaction.newDoc.toString()) ? transaction : [];
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !update.transactions.every(transaction => transaction.annotation(externalUpdate) === true)) {
              callbacks.current.onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    instance.current = view;
    return () => { view.destroy(); instance.current = null; };
    // A parent key identifies the note and read-only state. Other updates use transactions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const view = instance.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)] });
  }, [value]);

  return <div className="markdown-editor" ref={host} />;
});
