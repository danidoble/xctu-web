// port-manager.js — list, open, close, reconfigure a single serial port
// Single-active-connection model (per plan §7). Keeps things simple.

import { SerialPort } from "serialport";

// Supported open options (subset that most users need)
export const PORT_OPTIONS = {
  baudRate: [
    300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800,
    921600,
  ],
  dataBits: [5, 6, 7, 8],
  stopBits: [1, 2],
  parity: ["none", "even", "odd", "mark", "space"],
  flowControl: ["none", "xon", "xoff", "xany", "rtscts"],
};

// Default config — common out-of-the-box serial settings.
export const DEFAULT_PORT_CONFIG = Object.freeze({
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
});

function flowControlToBinding(value) {
  // serialport v13 uses xon/xoff/xany/rtscts as booleans. We translate cleanly.
  switch (value) {
    case "none":
      return { xon: false, xoff: false, xany: false, rtscts: false };
    case "xon":
      return { xon: true, xoff: false, xany: false, rtscts: false };
    case "xoff":
      return { xon: false, xoff: true, xany: false, rtscts: false };
    case "xany":
      return { xon: false, xoff: true, xany: true, rtscts: false };
    case "rtscts":
      return { xon: false, xoff: false, xany: false, rtscts: true };
    default:
      return { xon: false, xoff: false, xany: false, rtscts: false };
  }
}

export class PortManager {
  constructor() {
    this.port = null; // active SerialPort instance
    this.path = null; // path of the active port
    this.config = { ...DEFAULT_PORT_CONFIG };
    this.parser = null; // current parser pipe (null = raw)
    this.dataListeners = []; // fn(buf) — invoked on parsed data
    this.errorListeners = []; // fn(err)
    this.closeListeners = []; // fn()
    this.openListeners = []; // fn()
    // Single raw-data handler so we can detach it when a parser takes over.
    this._onRawData = (buf) => this.emitData(buf);
  }

  onData(fn) {
    this.dataListeners.push(fn);
  }
  onError(fn) {
    this.errorListeners.push(fn);
  }
  onClose(fn) {
    this.closeListeners.push(fn);
  }
  onOpen(fn) {
    this.openListeners.push(fn);
  }

  emitData(buf) {
    for (const fn of this.dataListeners) fn(buf);
  }
  emitError(err) {
    for (const fn of this.errorListeners) fn(err);
  }
  emitClose() {
    for (const fn of this.closeListeners) fn();
  }
  emitOpen() {
    for (const fn of this.openListeners) fn();
  }

  async listPorts() {
    return SerialPort.list();
  }

  isOpen() {
    return Boolean(this.port && this.port.isOpen);
  }

  async open({ path, ...configOverrides }) {
    if (!path) throw new Error("port path is required");
    if (this.isOpen())
      throw new Error("a port is already open — close it first");

    const cfg = { ...this.config, ...configOverrides };
    const flow = flowControlToBinding(cfg.flowControl);

    const port = new SerialPort({
      path,
      baudRate: Number(cfg.baudRate),
      dataBits: Number(cfg.dataBits),
      stopBits: Number(cfg.stopBits),
      parity: cfg.parity,
      ...flow,
      autoOpen: false,
    });

    return new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) {
          port.removeAllListeners();
          return reject(err);
        }
        this.port = port;
        this.path = path;
        this.config = cfg;
        this.parser = null;
        port.on("data", this._onRawData);
        port.on("error", (err) => this.emitError(err));
        port.on("close", () => {
          this.emitClose();
          this._reset();
        });
        this.emitOpen();
        resolve({ path, ...cfg });
      });
    });
  }

  // Swap the data pipeline: parser (stream) takes over from the raw listener,
  // or null to go back to raw passthrough. Detaches any previous parser.
  attachParser(parser) {
    if (!this.isOpen())
      throw new Error("cannot attach parser: port is not open");
    const port = this.port;

    // Detach previous parser, if any.
    if (this.parser) {
      try {
        port.unpipe(this.parser);
      } catch (_) {
        /* ignore */
      }
      this.parser.removeAllListeners("data");
      this.parser = null;
    }

    if (parser) {
      // Parser mode: raw listener off, chunks flow port -> parser -> emitData.
      port.removeListener("data", this._onRawData);
      port.pipe(parser);
      parser.on("data", (buf) => this.emitData(buf));
      this.parser = parser;
    } else if (!port.listeners("data").includes(this._onRawData)) {
      // Back to raw passthrough.
      port.on("data", this._onRawData);
    }
  }

  async close() {
    if (!this.port) return;
    return new Promise((resolve, reject) => {
      this.port.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  resetConfig() {
    this.config = { ...DEFAULT_PORT_CONFIG };
  }

  setConfig(config) {
    this.config = { ...DEFAULT_PORT_CONFIG, ...(config || {}) };
  }

  // Re-open current port with the given config. If not open, this is a no-op.
  async reconfigure(configOverrides) {
    if (!this.isOpen()) throw new Error("cannot reconfigure: port is not open");
    const path = this.port.path;
    await this.close();
    return this.open({ path, ...configOverrides });
  }

  // Write payload — Buffer or string (UTF-8). Resolves once flushed.
  write(payload) {
    if (!this.isOpen()) throw new Error("port is not open");
    const buf = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(String(payload), "utf8");
    return new Promise((resolve, reject) => {
      this.port.write(buf, (err) => {
        if (err) return reject(err);
        this.port.drain((drainErr) => {
          if (drainErr) return reject(drainErr);
          resolve();
        });
      });
    });
  }

  _reset() {
    this.port = null;
    this.path = null;
    this.parser = null;
    // NOTE: registered listeners (onData/onError/onClose/onOpen) are permanent
    // subscriptions (e.g. from WsServer) and must survive reconnect cycles.
  }
}
