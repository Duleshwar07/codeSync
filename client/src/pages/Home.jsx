/**
 * Home page: create a room (server generates the id) or join an existing one.
 * A room is just a URL - share /room/<id> with someone to code together.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Home() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const createRoom = async () => {
    setBusy(true);
    setError('');
    try {
      const { roomId } = await api.createRoom();
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError(`${err.message}. Is the server running on port 4000?`);
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = (e) => {
    e.preventDefault();
    // accept either a bare id or a full pasted URL
    const id = joinId.trim().split('/').filter(Boolean).pop();
    if (id) navigate(`/room/${id}`);
  };

  return (
    <div className="home">
      <div className="home-card">
        <h1>CodeSync</h1>
        <p className="muted">
          Edit code together in real time, then run it in a sandboxed Docker container and watch the
          output stream in - for everyone in the room.
        </p>

        <button className="btn primary big" onClick={createRoom} disabled={busy}>
          {busy ? 'Creating…' : 'Create a new room'}
        </button>

        <div className="divider">or join one</div>

        <form onSubmit={joinRoom} className="join-form">
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Room id or link"
            aria-label="Room id or link"
          />
          <button className="btn" type="submit" disabled={!joinId.trim()}>
            Join
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
