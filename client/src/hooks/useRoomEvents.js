/**
 * useRoomEvents(roomId)
 * ---------------------
 * Connects to ws://<host>/events/<roomId> and turns the server's run events
 * into React state. Reconnects automatically if the connection drops.
 *
 * Server -> client messages:
 *   { type: 'status', activeRun }               on connect
 *   { type: 'run-start', runId, startedBy, ... } someone pressed Run
 *   { type: 'output', stream, text }             a chunk of stdout/stderr/system
 *   { type: 'run-end', exitCode, timedOut, durationMs, ... }
 *   { type: 'history-updated' }                  run saved to MongoDB
 */
import { useEffect, useRef, useState } from 'react';
import { wsBase } from '../lib/api';

/**
 * Echo the stdin at the top of the output (like a terminal shows what you typed),
 * so you always see what input the program received - even if the code ignores it.
 */
export function stdinEcho(stdin) {
  if (!stdin) return [{ stream: 'stdin', text: 'stdin: (empty)\n' }];
  const shown = stdin.length > 500 ? `${stdin.slice(0, 500)}… (${stdin.length} chars)` : stdin;
  return [{ stream: 'stdin', text: `stdin:\n${shown.replace(/\n?$/, '\n')}` }, { stream: 'system', text: '─'.repeat(24) + '\n' }];
}

export function useRoomEvents(roomId) {
  const [activeRun, setActiveRun] = useState(null);
  const [output, setOutput] = useState([]); // [{ stream, text }]
  const [result, setResult] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let closedByUs = false;
    let retryTimer;

    const connect = () => {
      const ws = new WebSocket(`${wsBase()}/events/${roomId}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) retryTimer = setTimeout(connect, 1500);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case 'status':
            setActiveRun(msg.activeRun);
            break;
          case 'run-start':
            setActiveRun(msg);
            setResult(null);
            setOutput([
              { stream: 'system', text: `▶ ${msg.startedBy} started a ${msg.language} run\n` },
              ...stdinEcho(msg.stdin),
            ]);
            break;
          case 'output':
            setOutput((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.stream === msg.stream) {
                return [...prev.slice(0, -1), { ...last, text: last.text + msg.text }];
              }
              return [...prev, { stream: msg.stream, text: msg.text }];
            });
            break;
          case 'run-end':
            setActiveRun(null);
            setResult(msg);
            break;
          case 'history-updated':
            setHistoryVersion((v) => v + 1);
            break;
          default:
            break;
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [roomId]);

  return { activeRun, output, result, historyVersion, connected, setOutput, setResult };
}
