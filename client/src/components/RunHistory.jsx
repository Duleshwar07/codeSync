/**
 * RunHistory - previous runs of this room, loaded from MongoDB.
 * Clicking a run loads its saved output into the Output panel.
 * Reloads whenever the server announces 'history-updated'.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function RunHistory({ roomId, version, onSelect }) {
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .runs(roomId)
      .then((r) => {
        setRuns(r);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [roomId, version]);

  const open = async (id) => {
    try {
      onSelect(await api.runDetail(roomId, id));
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <p className="error small">{error}</p>;
  if (runs.length === 0)
    return <p className="muted small">No saved runs yet (history needs MongoDB).</p>;

  return (
    <ul className="history">
      {runs.map((r) => (
        <li key={r._id}>
          <button onClick={() => open(r._id)}>
            <span className={`dot ${r.exitCode === 0 ? 'ok' : 'fail'}`} />
            <span className="h-main">
              {r.language} · {r.startedBy}
            </span>
            <span className="muted small">
              {new Date(r.createdAt).toLocaleTimeString()} · {r.timedOut ? 'timeout' : `exit ${r.exitCode}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
