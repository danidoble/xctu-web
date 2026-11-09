// log-buffer.js — bounded ring buffer of console entries for the export
// endpoint. Memory-bounded so a long-running session never blows up.
//
// Shape: each entry is a plain object serializable to JSON. We don't share
// the ws-server's reference; the buffer only sees the final values that
// were already broadcast, so it stays decoupled from network state.
//
// Default cap: 50_000 entries. Callers can request fewer via the REST API;
// the buffer itself never grows beyond the cap.

const DEFAULT_CAP = 50_000;

export class LogBuffer {
  constructor(cap = DEFAULT_CAP) {
    this.cap = cap;
    this.entries = [];
  }

  push(entry) {
    this.entries.push(entry);
    if (this.entries.length > this.cap) {
      // Drop the oldest batch in one shot — slicing once is O(n) but only
      // runs when the cap is exceeded, and amortizes to O(1) per push.
      this.entries = this.entries.slice(this.entries.length - this.cap);
    }
  }

  clear() {
    this.entries = [];
  }

  // Return the last `limit` entries, capped at both the buffer size and the
  // caller's request (caller's `limit` is the maximum, never exceeded).
  tail(limit = this.cap) {
    const max = Math.min(this.cap, Math.max(1, Math.floor(limit)));
    if (this.entries.length <= max) return this.entries.slice();
    return this.entries.slice(this.entries.length - max);
  }

  size() {
    return this.entries.length;
  }
}
