/**
 * useSharedText(ydoc, name)
 * -------------------------
 * Binds a plain <textarea> to a Y.Text in the shared document, so every user
 * in the room sees and edits the same text (used for the stdin box).
 *
 *   const { value, onChange, ref } = useSharedText(ydoc, 'stdin');
 *   <textarea ref={ref} value={value} onChange={onChange} />
 *
 * Local typing  -> minimal diff (common prefix/suffix) -> Y.Text insert/delete
 *                  (so two people typing at different spots merge correctly)
 * Remote change -> Y.Text event -> new value; your caret is shifted by the
 *                  remote insert/delete so it doesn't jump while you type.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useSharedText(ydoc, name) {
  const ref = useRef(null);
  const pendingSelection = useRef(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!ydoc) return undefined;
    const ytext = ydoc.getText(name);
    setValue(ytext.toString());

    const onYChange = (event, transaction) => {
      const el = ref.current;
      // Keep the local caret in place when someone ELSE edits.
      if (!transaction.local && el && document.activeElement === el) {
        let start = el.selectionStart;
        let end = el.selectionEnd;
        let index = 0;
        for (const op of event.delta) {
          if (op.retain) {
            index += op.retain;
          } else if (op.insert) {
            const n = op.insert.length;
            if (index < start) start += n;
            if (index < end) end += n;
            index += n;
          } else if (op.delete) {
            const n = op.delete;
            if (index < start) start -= Math.min(n, start - index);
            if (index < end) end -= Math.min(n, end - index);
          }
        }
        pendingSelection.current = [start, end];
      }
      setValue(ytext.toString());
    };

    ytext.observe(onYChange);
    return () => ytext.unobserve(onYChange);
  }, [ydoc, name]);

  // Restore the caret right after React has written the new value.
  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    if (sel && ref.current) {
      ref.current.setSelectionRange(sel[0], sel[1]);
      pendingSelection.current = null;
    }
  }, [value]);

  const onChange = useCallback(
    (e) => {
      if (!ydoc) return;
      const ytext = ydoc.getText(name);
      const oldValue = ytext.toString();
      const newValue = e.target.value;

      // Find the changed region: skip the common prefix and suffix.
      let start = 0;
      while (start < oldValue.length && start < newValue.length && oldValue[start] === newValue[start]) start++;
      let oldEnd = oldValue.length;
      let newEnd = newValue.length;
      while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }

      ydoc.transact(() => {
        if (oldEnd > start) ytext.delete(start, oldEnd - start);
        if (newEnd > start) ytext.insert(start, newValue.slice(start, newEnd));
      });
    },
    [ydoc, name]
  );

  return { value, onChange, ref };
}
