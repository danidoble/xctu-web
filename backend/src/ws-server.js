// ws-server.js — WebSocket bridge between browser and serial port.
// Message protocol (JSON):
//   client -> server:
//     { type: 'send', payload: 'string', format: 'ascii' | 'hex', id?: string }
//     { type: 'ping' }
//   server -> client:
//     { type: 'open', config }
//     { type: 'close' }
//     { type: 'data', payload: 'string', format: 'ascii' | 'hex', ts: number }
//     { type: 'sent', id?: string, name?: string, bytes: number }
//     { type: 'error', message }
//     { type: 'pong', ts: number }

import { WebSocketServer } from "ws";

function hexStringToBuffer(hex) {
  const cleaned = String(hex).replace(/[^0-9a-fA-F]/g, "");
  if (cleaned.length % 2 !== 0) {
    throw new Error("hex payload must have an even number of digits");
  }
  return Buffer.from(cleaned, "hex");
}

function bufferToAscii(buf) {
  return buf.toString("utf8");
}

function bufferToHex(buf) {
  return buf.toString("hex");
}

export class WsServer {
  constructor({ httpServer, portManager, logBuffer }) {
    this.portManager = portManager;
    this.logBuffer = logBuffer;
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws" });
    this.clients = new Set();

    this.portManager.onData((buf) => this.broadcastData(buf));
    this.portManager.onError((err) =>
      this.broadcast({ type: "error", message: err.message }),
    );
    this.portManager.onClose(() => {
      // New session — drop the in-memory log so a fresh connection doesn't
      // see frames from the previous connection.
      this.logBuffer?.clear();
      this.broadcast({ type: "close" });
    });
    this.portManager.onOpen(() =>
      this.broadcast({
        type: "open",
        config: { ...this.portManager.config, path: this.portManager.path },
      }),
    );

    this.wss.on("connection", (ws) => this._handleConnection(ws));
  }

  _handleConnection(ws) {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
    ws.on("error", () => this.clients.delete(ws));
    ws.on("message", (raw) => this._handleMessage(ws, raw));

    // Send initial state once the socket is fully open (avoid races).
    const sendState = () => {
      ws.send(
        JSON.stringify({
          type: "state",
          open: this.portManager.isOpen(),
          config: { ...this.portManager.config, path: this.portManager.path },
        }),
      );
    };
    if (ws.readyState === ws.OPEN) sendState();
    else ws.once("open", sendState);
  }

  _handleMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
      return;
    }
    switch (msg.type) {
      case "send": {
        try {
          const buf =
            msg.format === "hex"
              ? hexStringToBuffer(msg.payload)
              : Buffer.from(String(msg.payload), "utf8");
          this.portManager
            .write(buf)
            .then(() => {
              ws.send(
                JSON.stringify({
                  type: "sent",
                  id: msg.id,
                  name: typeof msg.name === "string" ? msg.name : undefined,
                  bytes: buf.length,
                  payload: bufferToHex(buf),
                  ascii: bufferToAscii(buf),
                  format: msg.format || "ascii",
                }),
              );
            })
            .catch((err) => {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: err.message,
                  id: msg.id,
                }),
              );
            });
        } catch (e) {
          ws.send(
            JSON.stringify({ type: "error", message: e.message, id: msg.id }),
          );
        }
        return;
      }
      case "ping":
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      default:
        ws.send(
          JSON.stringify({
            type: "error",
            message: `unknown message type: ${msg.type}`,
          }),
        );
    }
  }

  broadcastData(buf) {
    this.broadcast({
      type: "data",
      payload: bufferToHex(buf),
      ascii: bufferToAscii(buf),
      ts: Date.now(),
    });
  }

  broadcast(obj) {
    // Mirror user-meaningful frames into the log buffer so the export
    // endpoint can return the full session history. State/open/close
    // are control messages and don't appear in the log.
    if (this.logBuffer && this._isLoggable(obj)) {
      this.logBuffer.push(this._normalize(obj));
    }
    const str = JSON.stringify(obj);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(str);
    }
  }

  // Only data + error + sent frames belong in the session log. data = RX,
  // sent = TX, error = parse/transport failures.
  _isLoggable(obj) {
    return obj && (obj.type === "data" || obj.type === "error" || obj.type === "sent");
  }

  // Map a WS message to the same shape the frontend's ConsoleEntry uses,
  // so the export endpoint can hand the array straight to the client.
  _normalize(obj) {
    if (obj.type === "data") {
      return {
        ts: obj.ts,
        dir: "in",
        payload: obj.payload,
        ascii: obj.ascii,
      };
    }
    if (obj.type === "sent") {
      return {
        ts: Date.now(),
        dir: "out",
        payload: obj.payload ?? "",
        ascii: obj.ascii ?? "",
        format: obj.format,
        bytes: obj.bytes,
        commandName: obj.name,
      };
    }
    // error
    return {
      ts: Date.now(),
      dir: "in",
      payload: "",
      error: obj.message,
    };
  }

  async close() {
    for (const ws of this.clients) ws.close();
    await new Promise((r) => this.wss.close(r));
  }
}
