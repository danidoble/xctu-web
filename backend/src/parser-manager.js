// parser-manager.js — select/configure @serialport/parser-* applied server-side.
// Supported: byte-length, delimiter (byte or string), readline, regex,
// inter-byte-timeout, ready (raw passthrough), none (raw).

import { DelimiterParser } from "@serialport/parser-delimiter";
import { ByteLengthParser } from "@serialport/parser-byte-length";
import { ReadlineParser } from "@serialport/parser-readline";
import { RegexParser } from "@serialport/parser-regex";
import { InterByteTimeoutParser } from "@serialport/parser-inter-byte-timeout";
import { ReadyParser } from "@serialport/parser-ready";

// Parser types exposed to the UI. Each has its own parameter schema.
export const PARSER_TYPES = [
  "none",
  "byte-length",
  "delimiter",
  "readline",
  "regex",
  "inter-byte-timeout",
];

export const DEFAULT_PARSER_CONFIG = Object.freeze({
  type: "none",
  // byte-length
  length: 1,
  // delimiter
  delimiter: "\\n", // user-friendly string (e.g. '\n', '0x0D', 'END')
  delimiterAsHex: false, // when true, treat delimiter as hex bytes like 'AA 55'
  // readline
  delimiterReadline: "\r\n",
  // regex
  regex: "\\r?\\n",
  // inter-byte-timeout
  interval: 100, // ms
});

function parseDelimiter(spec, asHex) {
  if (!spec) return Buffer.from("\n", "utf8");
  if (asHex) {
    const cleaned = spec.replace(/[^0-9a-fA-F]/g, "");
    if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
      throw new Error("hex delimiter must have an even number of hex digits");
    }
    return Buffer.from(cleaned, "hex");
  }
  // Allow common escape sequences for readability
  return Buffer.from(
    spec
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\0/g, "\0"),
    "utf8",
  );
}

export class ParserManager {
  constructor(portManager) {
    this.portManager = portManager;
    this.config = { ...DEFAULT_PARSER_CONFIG };
    this.currentParser = null; // active parser instance
  }

  // Build the parser without applying it — useful for validation in tests.
  build(config) {
    const cfg = { ...this.config, ...config };
    switch (cfg.type) {
      case "none":
        return null;
      case "byte-length":
        if (!Number.isInteger(cfg.length) || cfg.length < 1) {
          throw new Error(
            "byte-length parser: length must be a positive integer",
          );
        }
        return new ByteLengthParser({ length: cfg.length });
      case "delimiter": {
        const delim = parseDelimiter(cfg.delimiter, cfg.delimiterAsHex);
        return new DelimiterParser({ delimiter: delim });
      }
      case "readline":
        return new ReadlineParser({ delimiter: cfg.delimiterReadline });
      case "regex":
        return new RegexParser({ regex: new RegExp(cfg.regex) });
      case "inter-byte-timeout":
        if (!Number.isFinite(cfg.interval) || cfg.interval < 1) {
          throw new Error(
            "inter-byte-timeout: interval must be a positive number (ms)",
          );
        }
        return new InterByteTimeoutParser({ interval: cfg.interval });
      default:
        throw new Error(`unknown parser type: ${cfg.type}`);
    }
  }

  // Pipe the parser through port manager's current data flow.
  apply(config) {
    if (!this.portManager.isOpen()) {
      throw new Error("cannot apply parser: port is not open");
    }
    const parser = this.build(config);
    this.config = { ...this.config, ...config };
    this.currentParser = parser;
    // Port-manager swaps raw listener <-> parser pipe without duplicating data.
    this.portManager.attachParser(parser);
    return this.config;
  }

  // Re-apply the stored config after a reconnect. No-op when type is 'none'
  // (fresh ports already start in raw passthrough).
  reapply() {
    if (this.config.type === "none") return;
    this.apply(this.config);
  }

  // Forget the active parser instance (called when the port closes).
  reset() {
    this.currentParser = null;
  }

  resetConfig() {
    this.currentParser = null;
    this.config = { ...DEFAULT_PARSER_CONFIG };
  }

  setConfig(config) {
    this.currentParser = null;
    this.config = { ...DEFAULT_PARSER_CONFIG, ...(config || {}) };
  }
}
