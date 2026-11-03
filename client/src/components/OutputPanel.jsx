/**
 * OutputPanel - terminal-like view of the live run output.
 * stdout is plain, stderr red, system messages (timeouts, errors) yellow.
 */
import { useEffect, useRef } from 'react';

export default function OutputPanel({ output, result, running }) {
  const endRef = useRef(null);

  // keep scrolled to the bottom as new output arrives
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [output]);

  return (
    <div className="output">
      <pre className="terminal">
        {output.length === 0 && !running && (
          <span className="muted">Press Run to execute the code. Output appears here for everyone in the room.</span>
        )}
        {output.map((chunk, i) => (
          <span key={i} className={`stream-${chunk.stream}`}>
            {chunk.text}
          </span>
        ))}
        {running && <span className="cursor-blink">▍</span>}
        <span ref={endRef} />
      </pre>
      {result && (
        <div className={`result ${result.exitCode === 0 ? 'ok' : 'fail'}`}>
          {result.timedOut ? 'Timed out' : `Exited with code ${result.exitCode}`} · {result.durationMs} ms
          {result.truncated && ' · output truncated'}
        </div>
      )}
    </div>
  );
}
