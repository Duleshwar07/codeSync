/**
 * CollabEditor
 * ------------
 * Monaco editor bound to the shared Y.Text with y-monaco's MonacoBinding.
 *
 *   local keystroke -> Monaco model -> MonacoBinding -> Y.Text -> y-websocket -> other users
 *   remote change   -> y-websocket -> Y.Text -> MonacoBinding -> Monaco model
 *
 * The binding also publishes your cursor/selection via awareness and draws
 * other users' cursors (styled by RemoteCursorStyles below).
 */
import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';

// our language ids -> Monaco language ids
const MONACO_LANG = { javascript: 'javascript', python: 'python', cpp: 'cpp', java: 'java', go: 'go', rust: 'rust', ruby: 'ruby' };

export default function CollabEditor({ ydoc, provider, language }) {
  const bindingRef = useRef(null);

  const handleMount = (editor, monaco) => {
    const model = editor.getModel();
    // IMPORTANT: force "\n" line endings BEFORE binding. On Windows Monaco
    // defaults to "\r\n" (2 chars per line break) while Yjs counts "\n" (1 char),
    // so every edit would land N-1 characters off on line N for other users.
    model.setEOL(monaco.editor.EndOfLineSequence.LF);

    bindingRef.current = new MonacoBinding(
      ydoc.getText('code'),
      model,
      new Set([editor]),
      provider.awareness
    );
    editor.focus();
  };

  useEffect(() => () => bindingRef.current?.destroy(), []);

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={MONACO_LANG[language] || 'plaintext'}
      onMount={handleMount}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
      }}
    />
  );
}

/**
 * y-monaco tags remote selections with CSS classes that include the user's
 * Yjs clientID. We generate one rule per user so each cursor gets its color.
 */
export function RemoteCursorStyles({ users }) {
  const css = users
    .filter((u) => !u.isMe)
    .map(
      (u) => `
.yRemoteSelection-${u.clientId} { background-color: ${u.color}40; }
.yRemoteSelectionHead-${u.clientId} { border-left: 2px solid ${u.color}; position: absolute; height: 100%; }
.yRemoteSelectionHead-${u.clientId}::after {
  content: "${u.name.replace(/"/g, '')}";
  position: absolute; top: -1.3em; left: -2px; white-space: nowrap;
  background: ${u.color}; color: #111; font-size: 11px; padding: 0 4px; border-radius: 3px 3px 3px 0;
  pointer-events: none; z-index: 10;
}`
    )
    .join('\n');
  return <style>{css}</style>;
}
