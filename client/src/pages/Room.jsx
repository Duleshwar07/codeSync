/**
 * Room page - puts everything together.
 *
 *  ┌ header: room id · copy link · language · users · Run ┐
 *  │ Monaco editor (shared via Yjs)  │ Output / History   │
 *  │                                 │ stdin box          │
 *  └─────────────────────────────────┴────────────────────┘
 *
 * Run flow: click Run -> POST /api/rooms/:id/run -> server reads the code
 * from the shared Yjs doc, runs it in Docker, and streams output to every
 * user through the /events WebSocket (useRoomEvents).
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import CollabEditor, { RemoteCursorStyles } from '../components/CollabEditor';
import OutputPanel from '../components/OutputPanel';
import RunHistory from '../components/RunHistory';
import { useCollab } from '../hooks/useCollab';
import { useRoomEvents, stdinEcho } from '../hooks/useRoomEvents';
import { useSharedText } from '../hooks/useSharedText';
import { api } from '../lib/api';
import { getLocalUser, saveLocalUser } from '../lib/user';

// How to read stdin in each language - shown next to the stdin box
const STDIN_HINT = {
  javascript: "require('fs').readFileSync(0, 'utf8')",
  python: 'input()',
  cpp: 'std::cin >> x',
  java: 'new Scanner(System.in).nextLine()',
  go: "bufio.NewReader(os.Stdin).ReadString('\\n')",
  rust: 'io::stdin().read_line(&mut s)',
  ruby: 'STDIN.gets',
};

export default function Room() {
  const { roomId } = useParams();
  const [user, setUser] = useState(getLocalUser);
  const [languages, setLanguages] = useState([]);
  const [tab, setTab] = useState('output');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const collab = useCollab(roomId, user);
  const events = useRoomEvents(roomId);
  // stdin lives in the shared Yjs doc (ydoc.getText('stdin')) - everyone edits the same box
  const stdin = useSharedText(collab.ydoc, 'stdin');

  useEffect(() => {
    api.languages().then(setLanguages).catch((e) => setError(e.message));
  }, []);

  const templates = useMemo(
    () => Object.fromEntries(languages.map((l) => [l.id, l.template])),
    [languages]
  );

  const running = Boolean(events.activeRun);

  const run = async () => {
    setError('');
    setTab('output');
    try {
      // The server reads BOTH the code and stdin from the shared doc
      await api.run(roomId, { startedBy: user.name });
    } catch (e) {
      setError(e.message);
    }
  };

  // Ctrl/Cmd + Enter runs the code
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !running) {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const rename = () => {
    const name = window.prompt('Your display name', user.name)?.trim();
    if (name) {
      const next = { ...user, name: name.slice(0, 24) };
      saveLocalUser(next);
      setUser(next);
    }
  };

  const showSavedRun = (r) => {
    events.setOutput([
      { stream: 'system', text: `● Saved run by ${r.startedBy} at ${new Date(r.createdAt).toLocaleString()}\n` },
      ...stdinEcho(r.stdin),
      ...r.output,
    ]);
    events.setResult(r);
    setTab('output');
  };

  return (
    <div className="room">
      <RemoteCursorStyles users={collab.users} />

      <header className="topbar">
        <Link to="/" className="brand">CodeSync</Link>
        <span className="room-id" title="Room id">#{roomId}</span>
        <button className="btn small" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button>

        <span className={`conn ${collab.status}`} title="Sync connection">
          {collab.status === 'connected' ? (collab.synced ? 'Live' : 'Syncing…') : collab.status}
        </span>

        <div className="spacer" />

        <div className="users">
          {collab.users.map((u) => (
            <span
              key={u.clientId}
              className="avatar"
              style={{ background: u.color }}
              title={u.isMe ? `${u.name} (you) - click to rename` : u.name}
              onClick={u.isMe ? rename : undefined}
            >
              {u.name.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>

        <select
          value={collab.language || ''}
          onChange={(e) => collab.setLanguage(e.target.value, templates)}
          disabled={!collab.synced || running}
          aria-label="Language"
        >
          {!collab.language && <option value="">…</option>}
          {languages.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>

        <button
          className="btn primary"
          onClick={run}
          disabled={running || !collab.synced}
          title="Run (Ctrl+Enter)"
        >
          {running ? 'Running…' : '▶ Run'}
        </button>
      </header>

      <main className="workspace">
        <section className="editor-pane">
          {collab.ydoc && collab.provider ? (
            <CollabEditor
              key={roomId}
              ydoc={collab.ydoc}
              provider={collab.provider}
              language={collab.language}
            />
          ) : (
            <div className="muted center">Connecting…</div>
          )}
        </section>

        <aside className="side-pane">
          <div className="tabs">
            <button className={tab === 'output' ? 'active' : ''} onClick={() => setTab('output')}>Output</button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
            {running && <span className="running-badge">running · {events.activeRun.startedBy}</span>}
          </div>

          <div className="tab-body">
            {tab === 'output' ? (
              <OutputPanel output={events.output} result={events.result} running={running} />
            ) : (
              <RunHistory roomId={roomId} version={events.historyVersion} onSelect={showSavedRun} />
            )}
          </div>

          {error && <p className="error small">{error}</p>}

          <label className="stdin">
            <span>
              stdin <span className="shared-tag">shared</span> — <b>input data</b> (not code) for your
              program. Your code must read it: <code>{STDIN_HINT[collab.language] || 'input()'}</code>
            </span>
            <textarea
              ref={stdin.ref}
              value={stdin.value}
              onChange={stdin.onChange}
              disabled={!collab.synced}
              maxLength={64 * 1024}
              rows={3}
              placeholder={'e.g. your name\none value per line'}
            />
          </label>
        </aside>
      </main>
    </div>
  );
}
