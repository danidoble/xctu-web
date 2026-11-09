// rest-api.js — Express routes: /ports, /connect, /disconnect, /commands,
// /commands/:id, /sequences, /import, /export, /parser, /profile (full saved profile).

import express from "express";
import { PORT_OPTIONS } from "./port-manager.js";
import { PARSER_TYPES, DEFAULT_PARSER_CONFIG } from "./parser-manager.js";
import { commandsToXml, xmlToCommands } from "./xml-io.js";

export function buildRouter({
  portManager,
  parserManager,
  commandStore,
  sequenceStore,
  profileStore,
  logBuffer,
}) {
  const router = express.Router();

  router.get("/ports", async (_req, res) => {
    try {
      const ports = await portManager.listPorts();
      res.json({ ports });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/options", (_req, res) => {
    res.json({
      port: PORT_OPTIONS,
      parser: { types: PARSER_TYPES, defaults: DEFAULT_PARSER_CONFIG },
    });
  });

  router.post("/connect", async (req, res) => {
    try {
      const result = await portManager.open(req.body || {});
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post("/disconnect", async (_req, res) => {
    try {
      await portManager.close();
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post("/parser", (req, res) => {
    try {
      const cfg = parserManager.apply(req.body || {});
      res.json({ ok: true, parser: cfg });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get("/state", (_req, res) => {
    res.json({
      open: portManager.isOpen(),
      path: portManager.path,
      config: portManager.config,
      parser: parserManager.config,
    });
  });

  // ---- session log ----
  // Return the last `limit` entries from the in-memory ring buffer. The
  // buffer is wiped on disconnect, so this is a per-session history.
  // Hard cap matches the buffer cap so callers can't ask for more than we
  // can possibly have. Default is 50_000 (matches the buffer cap).
  router.get("/log", (req, res) => {
    if (!logBuffer) return res.json({ entries: [] });
    const requested = Number(req.query.limit);
    const limit = Number.isFinite(requested) && requested > 0 ? requested : 50_000;
    const entries = logBuffer.tail(limit);
    res.json({
      entries,
      cap: logBuffer.cap,
      size: logBuffer.size(),
    });
  });

  // ---- commands ----
  router.get("/commands", (_req, res) =>
    res.json({ commands: commandStore.list() }),
  );

  router.delete("/commands", (_req, res) => {
    commandStore.replaceAll([]);
    res.json({ ok: true });
  });

  router.post("/commands", (req, res) => {
    try {
      const cmd = commandStore.create(req.body || {});
      res.json(cmd);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put("/commands/:id", (req, res) => {
    try {
      const cmd = commandStore.update(req.params.id, req.body || {});
      res.json(cmd);
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  router.delete("/commands/:id", (req, res) => {
    try {
      commandStore.remove(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  // ---- sequences ----
  router.get("/sequences", (_req, res) =>
    res.json({ sequences: sequenceStore.list() }),
  );
  router.post("/sequences", (req, res) => {
    try {
      res.json(sequenceStore.create(req.body || {}));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.put("/sequences/:id", (req, res) => {
    try {
      res.json(sequenceStore.update(req.params.id, req.body || {}));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });
  router.delete("/sequences/:id", (req, res) => {
    try {
      sequenceStore.remove(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  // ---- workspace reset + profile slots ----
  router.post("/workspace/reset", async (_req, res) => {
    try {
      if (portManager.isOpen()) await portManager.close();
      portManager.resetConfig();
      parserManager.resetConfig();
      commandStore.replaceAll([]);
      sequenceStore.replaceAll([]);
      profileStore.clearAll();
      res.json({
        ok: true,
        config: portManager.config,
        parser: parserManager.config,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Clear only the active workspace, preserving saved profile slots.
  router.post("/workspace/empty", async (_req, res) => {
    try {
      if (portManager.isOpen()) await portManager.close();
      portManager.resetConfig();
      parserManager.resetConfig();
      commandStore.replaceAll([]);
      sequenceStore.replaceAll([]);
      res.json({
        ok: true,
        config: portManager.config,
        parser: parserManager.config,
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/workspace/export", (_req, res) =>
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      active: {
        port: portManager.config,
        parser: parserManager.config,
        commands: commandStore.list(),
        sequences: sequenceStore.list(),
      },
      profiles: profileStore.all(),
    }),
  );

  router.post("/workspace/import", async (req, res) => {
    try {
      const body = req.body || {};
      const active = body.active || body;
      if (portManager.isOpen()) await portManager.close();
      portManager.setConfig(active.port);
      parserManager.setConfig(active.parser);
      commandStore.replaceAll(active.commands || []);
      sequenceStore.replaceAll(active.sequences || []);
      if (Array.isArray(body.profiles)) profileStore.replaceAll(body.profiles);
      res.json({
        ok: true,
        active: {
          port: portManager.config,
          parser: parserManager.config,
          commands: commandStore.list(),
          sequences: sequenceStore.list(),
        },
        profiles: profileStore.all(),
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/profiles", (_req, res) =>
    res.json({ profiles: profileStore.list() }),
  );
  router.post("/profiles/:slot", (req, res) => {
    try {
      res.json(profileStore.saveSlot(Number(req.params.slot), req.body || {}));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.delete("/profiles/:slot", (req, res) => {
    try {
      profileStore.removeSlot(Number(req.params.slot));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.post("/profiles/:slot/load", async (req, res) => {
    try {
      const data = profileStore.loadSlot(Number(req.params.slot));
      if (!data)
        return res.status(404).json({ error: "profile slot is empty" });
      if (portManager.isOpen()) await portManager.close();
      portManager.setConfig(data.port);
      parserManager.setConfig(data.parser);
      commandStore.replaceAll(data.commands || []);
      sequenceStore.replaceAll(data.sequences || []);
      res.json({
        ok: true,
        ...data,
        commands: commandStore.list(),
        sequences: sequenceStore.list(),
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ---- import / export ----
  router.post(
    "/import",
    express.text({
      type: ["application/xml", "text/xml", "text/plain"],
      limit: "5mb",
    }),
    (req, res) => {
      try {
        const commands = xmlToCommands(req.body);
        const saved = commandStore.replaceAll(commands);
        res.json({ ok: true, count: saved.length, commands: saved });
      } catch (e) {
        res.status(400).json({ ok: false, error: e.message });
      }
    },
  );

  router.get("/export", (_req, res) => {
    const xml = commandsToXml({
      name: "Serial Monitor Profile",
      description: "Exported from Serial Monitor",
      commands: commandStore.list(),
      sequences: sequenceStore.list(),
    });
    res.setHeader("Content-Type", "application/xml");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="serial-monitor-profile.xml"',
    );
    res.send(xml);
  });

  // ---- full saved profile (port + parser + commands + sequences) ----
  router.get("/profile", (_req, res) => {
    const profile = {
      port: portManager.config,
      parser: parserManager.config,
      commands: commandStore.list(),
      sequences: sequenceStore.list(),
    };
    res.json(profile);
  });

  router.post("/profile", (req, res) => {
    try {
      const body = req.body || {};
      const saved = profileStore.save({
        name: body.name || "Saved Profile",
        port: body.port || null,
        parser: body.parser || null,
        commands: Array.isArray(body.commands)
          ? body.commands
          : commandStore.list(),
        sequences: Array.isArray(body.sequences)
          ? body.sequences
          : sequenceStore.list(),
      });
      res.json({ ok: true, savedAt: saved.savedAt });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.post("/profile/load", (req, res) => {
    try {
      const data = profileStore.load();
      if (!data)
        return res.status(404).json({ ok: false, error: "no saved profile" });
      if (Array.isArray(data.commands)) {
        commandStore.replaceAll(data.commands);
      }
      if (Array.isArray(data.sequences))
        sequenceStore.replaceAll(data.sequences);
      res.json({
        ok: true,
        name: data.name,
        port: data.port || null,
        parser: data.parser || null,
        commands: commandStore.list(),
        sequences: sequenceStore.list(),
        savedAt: data.savedAt,
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // Profile import from a JSON file body (separate from /commands /profile/load
  // which operates on the server's saved snapshot).
  router.post("/profile/import", (req, res) => {
    try {
      const body = req.body || {};
      if (Array.isArray(body.commands)) commandStore.replaceAll(body.commands);
      if (Array.isArray(body.sequences))
        sequenceStore.replaceAll(body.sequences);
      // Port + parser are returned for the client to apply; we don't auto-open
      // because that needs a connected device.
      res.json({
        ok: true,
        port: body.port || null,
        parser: body.parser || null,
        commands: commandStore.list(),
        sequences: sequenceStore.list(),
      });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  return router;
}
