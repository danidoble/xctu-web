// useWebSocket.ts — auto-reconnecting WS client with a tiny message queue.
import { useEffect, useRef, useState } from "react";

export type WsMessage = { type: string } & Record<string, unknown>;

export function useWebSocket(url: string, onMessage: (m: WsMessage) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const queueRef = useRef<string[]>([]);
  const retriesRef = useRef(0);

  // Always read latest callback without reconnecting.
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        retriesRef.current = 0;
        // flush queue
        for (const msg of queueRef.current) ws.send(msg);
        queueRef.current = [];
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data as string) as WsMessage;
          onMessageRef.current(m);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        retriesRef.current += 1;
        const delay = Math.min(2000 * retriesRef.current, 8000);
        setTimeout(connect, delay);
      };
      ws.onerror = () => {
        /* onclose handles reconnect */
      };
    };

    connect();
    return () => {
      stopped = true;
      wsRef.current?.close();
    };
  }, [url]);

  const send = (msg: unknown) => {
    const str = JSON.stringify(msg);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(str);
    } else {
      queueRef.current.push(str);
    }
  };

  return { connected, send };
}
