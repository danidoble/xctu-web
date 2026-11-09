// sequence-store.js — CRUD persistence for ordered command sequences.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class SequenceStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.sequences = [];
    this._load();
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.sequences = Array.isArray(data) ? data : data.sequences || [];
    } catch {
      this.sequences = [];
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify({ sequences: this.sequences }, null, 2),
      "utf8",
    );
  }

  list() {
    return this.sequences;
  }
  get(id) {
    return this.sequences.find((sequence) => sequence.id === id) || null;
  }

  create({ name, commandIds = [], intervalMs = 1000, passIntervalMs = 0 }) {
    if (!String(name || "").trim()) throw new Error("name is required");
    const sequence = this._normalize({
      id: randomUUID(),
      name,
      commandIds,
      intervalMs,
      passIntervalMs,
    });
    this.sequences.push(sequence);
    this._save();
    return sequence;
  }

  update(id, patch) {
    const sequence = this.get(id);
    if (!sequence) throw new Error("sequence not found");
    Object.assign(sequence, this._normalize({ ...sequence, ...patch, id }));
    this._save();
    return sequence;
  }

  remove(id) {
    const before = this.sequences.length;
    this.sequences = this.sequences.filter((sequence) => sequence.id !== id);
    if (before === this.sequences.length) throw new Error("sequence not found");
    this._save();
  }

  replaceAll(sequences) {
    this.sequences = (Array.isArray(sequences) ? sequences : []).map(
      (sequence) =>
        this._normalize({ ...sequence, id: sequence.id || randomUUID() }),
    );
    this._save();
    return this.sequences;
  }

  _normalize({ id, name, commandIds, intervalMs, passIntervalMs }) {
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval < 0)
      throw new Error("intervalMs must be zero or greater");
    // passIntervalMs is optional in stored data — default to 0 (no extra
    // pause between passes). Negative values are rejected to match the
    // frontend's <input min={0} />.
    const passInterval = Number(passIntervalMs ?? 0);
    if (!Number.isFinite(passInterval) || passInterval < 0)
      throw new Error("passIntervalMs must be zero or greater");
    return {
      id,
      name: String(name).trim(),
      commandIds: (Array.isArray(commandIds) ? commandIds : []).map(String),
      intervalMs: Math.round(interval),
      passIntervalMs: Math.round(passInterval),
    };
  }
}
