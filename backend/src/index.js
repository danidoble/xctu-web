// index.js — wires Express + WebSocket + PortManager + ParserManager + CommandStore
// Also serves the built frontend (frontend/dist) in production.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";

import { PortManager, DEFAULT_PORT_CONFIG } from "./port-manager.js";
import { ParserManager } from "./parser-manager.js";
import { CommandStore } from "./command-store.js";
import { SequenceStore } from "./sequence-store.js";
import { ProfileStore } from "./profile-store.js";
import { LogBuffer } from "./log-buffer.js";
import { buildRouter } from "./rest-api.js";
import { WsServer } from "./ws-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3001);
const DATA_FILE =
  process.env.COMMAND_FILE ||
  path.join(__dirname, "..", "data", "commands.json");
const PROFILE_FILE =
  process.env.PROFILE_FILE ||
  path.join(__dirname, "..", "data", "profile.json");
const SEQUENCE_FILE =
  process.env.SEQUENCE_FILE ||
  path.join(__dirname, "..", "data", "sequences.json");
const FRONTEND_DIST = path.join(__dirname, "..", "..", "frontend", "dist");
const LOG_BUFFER_CAP = Number(process.env.LOG_BUFFER_CAP || 50_000);

const portManager = new PortManager();
const parserManager = new ParserManager(portManager);
const commandStore = new CommandStore(DATA_FILE);
const sequenceStore = new SequenceStore(SEQUENCE_FILE);
const profileStore = new ProfileStore(PROFILE_FILE);
const logBuffer = new LogBuffer(LOG_BUFFER_CAP);

// Keep the parser pipeline in sync with the port lifecycle:
// forget the parser instance on close, re-apply the stored config on reconnect.
portManager.onClose(() => parserManager.reset());
portManager.onOpen(() => {
  try {
    parserManager.reapply();
  } catch (e) {
    console.error("[serial-monitor] parser reapply failed:", e.message);
  }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(
  "/api",
  buildRouter({
    portManager,
    parserManager,
    commandStore,
    sequenceStore,
    profileStore,
    logBuffer,
  }),
);

// Serve built frontend if it exists (production mode).
import fs from "node:fs";
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^\/(?!api|ws).*/, (_req, res) =>
    res.sendFile(path.join(FRONTEND_DIST, "index.html")),
  );
}

const server = http.createServer(app);
const ws = new WsServer({ httpServer: server, portManager, logBuffer });

server.listen(PORT, () => {
  console.log(`[serial-monitor] backend listening on http://localhost:${PORT}`);
  console.log(
    `[serial-monitor] default port config: ${JSON.stringify(DEFAULT_PORT_CONFIG)}`,
  );
  console.log(`[serial-monitor] commands file: ${DATA_FILE}`);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n[serial-monitor] received ${signal}, shutting down...`);
  try {
    await ws.close();
    server.close();
    if (portManager.isOpen()) await portManager.close();
    process.exit(0);
  } catch (e) {
    console.error("shutdown error:", e);
    process.exit(1);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
