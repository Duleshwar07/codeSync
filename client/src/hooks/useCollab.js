/**
 * useCollab(roomId, user)
 * -----------------------
 * Creates the Yjs document for a room and connects it to the server at
 * ws://<host>/yjs/<roomId> using y-websocket's WebsocketProvider.
 *
 * Shared document: getText('code'), getText('stdin'), getMap('meta').language
 *
 * Returns:
 *   ydoc, provider   - passed to the editor binding
 *   status           - 'connecting' | 'connected' | 'disconnected'
 *   synced           - true once the first full sync with the server is done
 *   language         - shared language (ydoc.getMap('meta').get('language'))
 *   setLanguage(id)  - changes it for everyone
 *   users            - everyone in the room (from awareness), incl. yourself
 */
import { useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { wsBase } from '../lib/api';

export function useCollab(roomId, user) {
  const [state, setState] = useState({ ydoc: null, provider: null });
  const [status, setStatus] = useState('connecting');
  const [synced, setSynced] = useState(false);
  const [language, setLang] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(`${wsBase()}/yjs`, roomId, ydoc);
    const meta = ydoc.getMap('meta');

    provider.awareness.setLocalStateField('user', user);

    const onStatus = ({ status }) => setStatus(status);
    const onSync = (isSynced) => setSynced(isSynced);
    const onMeta = () => setLang(meta.get('language') || null);
    const onAwareness = () => {
      const list = [];
      provider.awareness.getStates().forEach((s, clientId) => {
        if (s.user) list.push({ clientId, ...s.user, isMe: clientId === ydoc.clientID });
      });
      setUsers(list);
    };

    provider.on('status', onStatus);
    provider.on('sync', onSync);
    meta.observe(onMeta);
    provider.awareness.on('change', onAwareness);
    onAwareness();

    setState({ ydoc, provider });

    return () => {
      meta.unobserve(onMeta);
      provider.awareness.off('change', onAwareness);
      provider.destroy();
      ydoc.destroy();
      setSynced(false);
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep presence in sync if the user renames themselves
  useEffect(() => {
    state.provider?.awareness.setLocalStateField('user', user);
  }, [user, state.provider]);

  /**
   * Switch language for everybody. If the editor still contains an unmodified
   * starter template (or nothing), swap in the new language's template too.
   */
  const setLanguage = useCallback(
    (id, templates) => {
      const { ydoc } = state;
      if (!ydoc) return;
      const text = ydoc.getText('code');
      const current = text.toString();
      const isTemplate = !current.trim() || Object.values(templates).some((t) => t === current);
      ydoc.transact(() => {
        ydoc.getMap('meta').set('language', id);
        if (isTemplate && templates[id]) {
          text.delete(0, text.length);
          text.insert(0, templates[id]);
        }
      });
    },
    [state]
  );

  return { ...state, status, synced, language, setLanguage, users };
}
