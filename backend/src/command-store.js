// command-store.js — CRUD over a JSON file. Lightweight persistence.
// Each command: { id, name, payload, format: 'ascii'|'hex', description }

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class CommandStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.commands = [];
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const data = JSON.parse(raw);
      this.commands = Array.isArray(data) ? data : data.commands || [];
    } catch (e) {
      this.commands = [];
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify({ commands: this.commands }, null, 2),
      "utf8",
    );
  }

  list() {
    return this.commands;
  }

  get(id) {
    return this.commands.find((c) => c.id === id) || null;
  }

  create({ name, payload, format = "ascii", description = "" }) {
    if (!name) throw new Error("name is required");
    if (!payload) throw new Error("payload is required");
    if (!["ascii", "hex"].includes(format))
      throw new Error("format must be ascii or hex");
    const cmd = { id: randomUUID(), name, payload, format, description };
    this.commands.push(cmd);
    this._save();
    return cmd;
  }

  update(id, patch) {
    const cmd = this.get(id);
    if (!cmd) throw new Error(`command not found: ${id}`);
    const allowed = ["name", "payload", "format", "description"];
    for (const k of allowed) {
      if (k in patch) cmd[k] = patch[k];
    }
    this._save();
    return cmd;
  }

  remove(id) {
    const before = this.commands.length;
    this.commands = this.commands.filter((c) => c.id !== id);
    if (this.commands.length === before)
      throw new Error(`command not found: ${id}`);
    this._save();
  }

  replaceAll(commands) {
    this.commands = commands.map((c) => ({
      id: c.id || randomUUID(),
      name: String(c.name || "Unnamed"),
      payload: String(c.payload || ""),
      format: c.format === "hex" ? "hex" : "ascii",
      description: String(c.description || ""),
    }));
    this._save();
    return this.commands;
  }
}
