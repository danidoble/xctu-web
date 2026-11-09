// test/ws-roundtrip.js — boot the HTTP+WS server, connect a synthetic client,
// verify state handshake + send/data round-trip using an in-memory echo port.
//
// We avoid requiring a physical serial device by injecting a fake PortManager
// that satisfies the same interface. This validates protocol + plumbing only.

import http from "node:http";
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import { WsServer } from "../src/ws-server.js";

// Fake PortManager — implements the minimum surface used by WsServer.
class FakePortManager extends EventEmitter {
  constructor() {
    super();
    this.config = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    };
    this._open = false;
  }
  isOpen() {
    return this._open;
  }
  write(buf) {
    if (!this._open) return Promise.reject(new Error("not open"));
    // Echo back as if the device spoke
    setImmediate(() => this.emit("data", Buffer.from(buf)));
    return Promise.resolve();
  }
  // WsServer expects these methods:
  onData(fn) {
    this.on("data", fn);
  }
  onError(fn) {
    this.on("error", fn);
  }
  onClose(fn) {
    this.on("close", fn);
  }
  onOpen(fn) {
    this.on("open", fn);
  }
}

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
};

const portManager = new FakePortManager();
const server = http.createServer();
const ws = new WsServer({ httpServer: server, portManager });

await new Promise((r) => server.listen(0, r));
const { port } = server.address();

const client = new WebSocket(`ws://localhost:${port}/ws`);
const received = [];

// Attach message handler FIRST so server's initial send isn't missed.
client.on("message", (raw) => {
  received.push(JSON.parse(raw.toString("utf8")));
});

await new Promise((resolve, reject) => {
  client.on("open", resolve);
  client.on("error", reject);
});

// 1) initial state message
await new Promise((r) => setTimeout(r, 50));
const state = received.find((m) => m.type === "state");
assert(state, "should receive initial state message");
assert(state.open === false, "state.open should be false initially");
console.log("PASS: initial state handshake");

// Pretend the port is open so writes succeed and echoes get emitted
portManager._open = true;

// 2) send ascii -> echo -> data
client.send(
  JSON.stringify({
    type: "send",
    payload: "hello",
    format: "ascii",
    id: "req-1",
  }),
);
await new Promise((r) => setTimeout(r, 50));

const sent = received.find((m) => m.type === "sent" && m.id === "req-1");
assert(sent, "should receive sent ack");
assert(sent.bytes === 5, "sent ack should report 5 bytes");
console.log("PASS: send ack with byte count");

const data = received.find((m) => m.type === "data");
assert(data, "should receive data echo");
assert(
  data.payload === "68656c6c6f",
  `hex payload mismatch: got ${data.payload}`,
);
assert(data.ascii === "hello", "ascii payload mismatch");
console.log("PASS: data echo (hex + ascii)");

// 3) ping/pong
client.send(JSON.stringify({ type: "ping" }));
await new Promise((r) => setTimeout(r, 50));
const pong = received.find((m) => m.type === "pong");
assert(pong, "should receive pong");
console.log("PASS: ping/pong");

// 4) bad JSON -> error
client.send("not-json");
await new Promise((r) => setTimeout(r, 50));
const err = received.find(
  (m) => m.type === "error" && m.message === "invalid JSON",
);
assert(err, "should respond with invalid JSON error");
console.log("PASS: invalid JSON error");

// 5) bad hex -> error
client.send(
  JSON.stringify({ type: "send", payload: "abc", format: "hex", id: "bad" }),
);
await new Promise((r) => setTimeout(r, 50));
const hexErr = received.find((m) => m.type === "error" && m.id === "bad");
assert(hexErr, "should reject odd-length hex");
console.log("PASS: bad hex rejected");

// 6) open event broadcast
portManager.config = { ...portManager.config, baudRate: 115200 };
portManager.emit("open");
await new Promise((r) => setTimeout(r, 50));
const openMsg = received.find((m) => m.type === "open");
assert(openMsg, "should broadcast open event");
assert(openMsg.config.baudRate === 115200, "open event should carry config");
console.log("PASS: open event broadcast");

// 7) close event broadcast
portManager.emit("close");
await new Promise((r) => setTimeout(r, 50));
const closeMsg = received.find((m) => m.type === "close");
assert(closeMsg, "should broadcast close event");
console.log("PASS: close event broadcast");

client.close();
await ws.close();
server.close();
console.log("\nALL WS TESTS PASSED ✓");
process.exit(0);
