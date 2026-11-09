// api.ts — typed REST client.
import type {
  Command,
  CommandSequence,
  ConsoleEntry,
  FullProfile,
  Options,
  ParserConfig,
  PortInfo,
  PortConfig,
  ProfileSlot,
} from "./types";

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error || "";
    } catch {}
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
};

export const api = {
  async listPorts(): Promise<PortInfo[]> {
    return json<{ ports: PortInfo[] }>(await fetch("/api/ports")).then((d) => d.ports);
  },
  async getOptions(): Promise<Options> {
    return json<Options>(await fetch("/api/options"));
  },
  async getState() {
    return json<{
      open: boolean;
      path: string | null;
      config: PortConfig;
      parser: ParserConfig;
    }>(await fetch("/api/state"));
  },
  async connect(body: { path: string } & Partial<PortConfig>) {
    return json<{ ok: boolean; path?: string } & PortConfig>(
      await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async disconnect() {
    return json<{ ok: boolean }>(await fetch("/api/disconnect", { method: "POST" }));
  },
  async applyParser(cfg: ParserConfig) {
    return json<{ ok: boolean; parser: ParserConfig }>(
      await fetch("/api/parser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      }),
    );
  },
  async listCommands(): Promise<Command[]> {
    return json<{ commands: Command[] }>(await fetch("/api/commands")).then((d) => d.commands);
  },
  async createCommand(c: Omit<Command, "id">): Promise<Command> {
    return json<Command>(
      await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      }),
    );
  },
  async updateCommand(id: string, patch: Partial<Command>): Promise<Command> {
    return json<Command>(
      await fetch(`/api/commands/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },
  async deleteCommand(id: string) {
    return json<{ ok: boolean }>(await fetch(`/api/commands/${id}`, { method: "DELETE" }));
  },
  async deleteAllCommands() {
    return json<{ ok: boolean }>(await fetch("/api/commands", { method: "DELETE" }));
  },
  async listSequences(): Promise<CommandSequence[]> {
    return json<{ sequences: CommandSequence[] }>(await fetch("/api/sequences")).then(
      (d) => d.sequences,
    );
  },
  async createSequence(sequence: Omit<CommandSequence, "id">): Promise<CommandSequence> {
    return json<CommandSequence>(
      await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sequence),
      }),
    );
  },
  async updateSequence(id: string, patch: Partial<CommandSequence>): Promise<CommandSequence> {
    return json<CommandSequence>(
      await fetch(`/api/sequences/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },
  async deleteSequence(id: string) {
    return json<{ ok: boolean }>(await fetch(`/api/sequences/${id}`, { method: "DELETE" }));
  },
  async resetWorkspace() {
    return json<{ ok: boolean; config: PortConfig; parser: ParserConfig }>(
      await fetch("/api/workspace/reset", { method: "POST" }),
    );
  },
  async getLog(limit = 50_000): Promise<{
    entries: ConsoleEntry[];
    cap: number;
    size: number;
  }> {
    return json(await fetch(`/api/log?limit=${Math.max(1, Math.floor(limit))}`));
  },
  async emptyWorkspace() {
    return json<{ ok: boolean; config: PortConfig; parser: ParserConfig }>(
      await fetch("/api/workspace/empty", { method: "POST" }),
    );
  },
  async exportWorkspace() {
    return json<{
      version: number;
      exportedAt: string;
      active: FullProfile;
      profiles: (FullProfile | null)[];
    }>(await fetch("/api/workspace/export"));
  },
  async importWorkspace(workspace: unknown) {
    return json<{
      ok: boolean;
      active: FullProfile;
      profiles: (FullProfile | null)[];
    }>(
      await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      }),
    );
  },
  async listProfiles(): Promise<ProfileSlot[]> {
    return json<{ profiles: ProfileSlot[] }>(await fetch("/api/profiles")).then(
      (data) => data.profiles,
    );
  },
  async saveProfileSlot(slot: number, profile: FullProfile): Promise<FullProfile> {
    return json<FullProfile>(
      await fetch(`/api/profiles/${slot}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }),
    );
  },
  async loadProfileSlot(slot: number): Promise<FullProfile & { ok: boolean }> {
    return json<FullProfile & { ok: boolean }>(
      await fetch(`/api/profiles/${slot}/load`, { method: "POST" }),
    );
  },
  async deleteProfileSlot(slot: number) {
    return json<{ ok: boolean }>(await fetch(`/api/profiles/${slot}`, { method: "DELETE" }));
  },
  async importXml(xml: string): Promise<{ ok: boolean; count: number; commands: Command[] }> {
    return json(
      await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
      }),
    );
  },
  exportXmlUrl(): string {
    return "/api/export";
  },
  // ---- full profile ----
  async getProfile(): Promise<FullProfile> {
    return json<FullProfile>(await fetch("/api/profile"));
  },
  async saveProfile(profile: FullProfile): Promise<{ ok: boolean; savedAt: string }> {
    return json(
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }),
    );
  },
  async loadSavedProfile() {
    return json<FullProfile & { ok: boolean }>(
      await fetch("/api/profile/load", { method: "POST" }),
    );
  },
  async importProfile(profile: FullProfile) {
    return json<{
      ok: boolean;
      commands: Command[];
      sequences: CommandSequence[];
      port: PortConfig | null;
      parser: ParserConfig | null;
    }>(
      await fetch("/api/profile/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }),
    );
  },
};
