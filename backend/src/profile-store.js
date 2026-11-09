// profile-store.js — saves / loads the entire saved profile (port config,
// parser config, commands) as a single JSON document.

import fs from "node:fs";
import path from "node:path";

export const PROFILE_VERSION = 1;
export const MAX_PROFILES = 50;

export class ProfileStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    return this.loadSlot(1);
  }

  list() {
    const collection = this._readCollection();
    return collection.profiles.map((profile, index) =>
      profile
        ? { slot: index + 1, name: profile.name, savedAt: profile.savedAt }
        : { slot: index + 1, name: null, savedAt: null },
    );
  }

  all() {
    return this._readCollection().profiles;
  }

  loadSlot(slot) {
    this._validateSlot(slot);
    const profile = this._readCollection().profiles[slot - 1];
    return profile
      ? { ...profile, version: profile.version || PROFILE_VERSION }
      : null;
  }

  saveSlot(slot, profile) {
    this._validateSlot(slot);
    const collection = this._readCollection();
    const payload = {
      version: PROFILE_VERSION,
      savedAt: new Date().toISOString(),
      ...profile,
    };
    collection.profiles[slot - 1] = payload;
    this._writeCollection(collection);
    return payload;
  }

  removeSlot(slot) {
    this._validateSlot(slot);
    const collection = this._readCollection();
    collection.profiles[slot - 1] = null;
    this._writeCollection(collection);
  }

  clearAll() {
    this._writeCollection({ profiles: Array(MAX_PROFILES).fill(null) });
  }

  replaceAll(profiles) {
    if (!Array.isArray(profiles) || profiles.length > MAX_PROFILES)
      throw new Error(`workspace contains more than ${MAX_PROFILES} profiles`);
    this._writeCollection({
      profiles: Array.from(
        { length: MAX_PROFILES },
        (_, index) => profiles[index] || null,
      ),
    });
  }

  _readCollection() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.profiles))
        return {
          profiles: Array.from(
            { length: MAX_PROFILES },
            (_, index) => data.profiles[index] || null,
          ),
        };
      // Migrate the previous single-profile format into slot 1.
      return { profiles: [data, ...Array(MAX_PROFILES - 1).fill(null)] };
    } catch {
      return { profiles: Array(MAX_PROFILES).fill(null) };
    }
  }

  _writeCollection(collection) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(
        { version: PROFILE_VERSION, profiles: collection.profiles },
        null,
        2,
      ),
      "utf8",
    );
  }

  _validateSlot(slot) {
    if (
      !Number.isInteger(Number(slot)) ||
      Number(slot) < 1 ||
      Number(slot) > MAX_PROFILES
    )
      throw new Error(`profile slot must be between 1 and ${MAX_PROFILES}`);
  }

  save(profile) {
    return this.saveSlot(1, profile);
  }
}
