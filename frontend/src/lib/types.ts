// lib/types.ts — shared between components.
import type { LayoutTemplate, PanelId, PanelState } from "./useLayout";

export type PortInfo = {
  path: string;
  manufacturer?: string;
  productId?: string;
  vendorId?: string;
};

export type PortConfig = {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  flowControl: string;
};

export type ParserConfig = {
  type: "none" | "byte-length" | "delimiter" | "readline" | "regex" | "inter-byte-timeout";
  length?: number;
  delimiter?: string;
  delimiterAsHex?: boolean;
  delimiterReadline?: string;
  regex?: string;
  interval?: number;
};

export type Command = {
  id: string;
  name: string;
  payload: string;
  format: "ascii" | "hex";
  description?: string;
};

export type CommandSequence = {
  id: string;
  name: string;
  commandIds: string[];
  intervalMs: number;
  /** Optional pause (ms) inserted between consecutive passes of the
   * sequence. 0 = no extra delay beyond the per-send `intervalMs`. */
  passIntervalMs?: number;
};

export type ConsoleEntry = {
  ts: number;
  dir: "in" | "out";
  payload: string; // hex (always present for consistent grouping)
  ascii?: string; // decoded text
  format?: "ascii" | "hex"; // for outgoing
  bytes?: number;
  commandName?: string;
  error?: string;
};

export type Options = {
  port: {
    baudRate: number[];
    dataBits: number[];
    stopBits: number[];
    parity: string[];
    flowControl: string[];
  };
  parser: { types: string[]; defaults: ParserConfig };
};

export type LayoutSnapshot = {
  template: LayoutTemplate;
  panels: Record<PanelId, PanelState>;
};

export type FullProfile = {
  name?: string;
  port?: PortConfig | null;
  parser?: ParserConfig | null;
  commands: Command[];
  sequences?: CommandSequence[];
  layout?: LayoutSnapshot;
  savedAt?: string;
};

export type ProfileSlot = {
  slot: number;
  name: string | null;
  savedAt: string | null;
};
