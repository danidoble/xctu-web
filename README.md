# Serial Monitor — Web-based Serial Console

Web serial monitor: send/receive commands over a real serial port
from any browser, with XML command-profile import/export (XCTU-compatible).

- **Backend**: Node.js + Express + `ws` (WebSocket) + `serialport` (serialport.io)
- **Frontend**: React 18 + TypeScript + Tailwind + Vite
- **Bridge**: WebSocket between browser ↔ Node.js, serialport.io to the physical port

## Layout

```
serial-monitor/
├── backend/          # Node.js server (REST + WebSocket + serial)
│   ├── src/
│   │   ├── index.js          # boot: wires Express + WS + managers
│   │   ├── port-manager.js   # serialport.io wrapper (open/close/write)
│   │   ├── parser-manager.js # @serialport/parser-* selection
│   │   ├── ws-server.js      # WebSocket bridge + protocol
│   │   ├── command-store.js  # JSON-file CRUD for saved commands
│   │   ├── xml-io.js         # XML command-profile import/export
│   │   └── rest-api.js       # /api/* routes
│   ├── test/                 # pure-node tests (no hardware required)
│   └── data/commands.json    # persisted command store
├── frontend/         # React + TypeScript SPA
│   └── src/
│       ├── App.tsx            # layout + WS message dispatch
│       ├── PortConfigPanel.tsx
│       ├── ParserConfigPanel.tsx
│       ├── CommandList.tsx
│       ├── Console.tsx
│       ├── ImportExportBar.tsx
│       ├── StatusBar.tsx
│       ├── api.ts             # typed REST client
│       └── useWebSocket.ts    # auto-reconnecting WS hook
└── package.json      # root scripts: install:all, dev, build
```

## Setup

```bash
# from serial-monitor/
npm run install:all     # installs root + backend + frontend
cd backend && npm test   # runs all 3 test suites (no hardware needed)
```

## Run (development)

Two processes (Vite dev server + Node backend), with `/api` and `/ws` proxied:

```bash
# from serial-monitor/
npm run dev
# open http://localhost:5173
```

## Run (production)

Build the SPA, then let the backend serve it on a single port:

```bash
# from serial-monitor/
npm run build           # builds frontend/dist
npm start               # backend on http://localhost:3001
```

The backend serves `frontend/dist` when present and falls back to `index.html`
for SPA routes. `/api/*` and `/ws` remain available.

## REST API

| Method | Path                | Body / Response |
|--------|---------------------|-----------------|
| GET    | `/api/ports`        | `{ ports: PortInfo[] }` |
| GET    | `/api/options`      | `{ port: {...}, parser: {...} }` |
| GET    | `/api/state`        | `{ open, path, config, parser }` |
| GET    | `/api/log?limit=N`  | `{ entries: ConsoleEntry[], cap, size }` — last N (≤ 50 000) |
| POST   | `/api/connect`      | `{ path, baudRate, dataBits, stopBits, parity, flowControl }` |
| POST   | `/api/disconnect`   | — |
| POST   | `/api/parser`       | `{ type, ...params }` |
| GET    | `/api/commands`     | `{ commands: Command[] }` |
| DELETE | `/api/commands`     | removes every command |
| POST   | `/api/commands`     | `{ name, payload, format, description }` |
| PUT    | `/api/commands/:id` | partial command patch |
| DELETE | `/api/commands/:id` | — |
| POST   | `/api/import`       | raw XML body, replaces store |
| GET    | `/api/export`       | downloads command-profile XML |

## WebSocket protocol

All messages are JSON.

**Client → server:**
```json
{ "type": "send", "payload": "AT\r", "format": "ascii", "id": "req-1" }
{ "type": "ping" }
```

**Server → client:**
```json
{ "type": "state", "open": false, "config": {...} }
{ "type": "open",  "config": {...} }
{ "type": "close" }
{ "type": "data",  "payload": "41540d", "ascii": "AT\r", "ts": 1700000000000 }
{ "type": "sent",  "id": "req-1", "bytes": 3 }
{ "type": "error", "message": "...", "id": "req-1" }
{ "type": "pong",  "ts": 1700000000000 }
```

## XML command-profile format

Two real-world shapes are supported on import; we always **export** the
modern shape so files round-trip cleanly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<data>
  <loop>false</loop>
  <repeat_times>1</repeat_times>
  <repeat_period>500</repeat_period>
  <packets_list>
    <packet name="00 - Descubrir tarjeta (06)">
      <payload>F1060000000000000000F2F8</payload>
    </packet>
    ...
  </packets_list>
</data>
```

The older variant is also accepted on import:

```xml
<xbee_profile>
  <command_set>
    <command format="ascii|hex">
      <name>AT</name>
      <frame>AT</frame>
      <description>...</description>
    </command>
  </command_set>
</xbee_profile>
```

`format` may be either an attribute on `<command>` (we emit this in the
older shape) or a child element — both are accepted. On the modern
`<packet>` shape, format is auto-detected: payloads that are pure hex
characters with even length are tagged `hex`, otherwise `ascii`.

## Tests

Three pure-Node test suites run without physical hardware:

- `test/xml-roundtrip.js` — generate → parse → assert round-trip equality + edge cases
- `test/parser-manager.test.js` — build each parser type + validate error paths
- `test/ws-roundtrip.js` — boot the HTTP+WS server, simulate a client, verify every message type

```bash
cd backend && npm test
```

## Environment variables

| Var            | Default                  | Notes |
|----------------|--------------------------|-------|
| `PORT`         | `3001`                   | backend listen port |
| `COMMAND_FILE` | `backend/data/commands.json` | JSON-file path for command store |
| `LOG_BUFFER_CAP` | `50000` | in-memory ring buffer cap for the session log |