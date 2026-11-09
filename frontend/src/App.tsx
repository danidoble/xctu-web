// App.tsx — top-level layout. Header (logo + Profile + View + Theme),
// main area (resizable panels driven by useLayout), status bar at the bottom.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cable, Settings } from "lucide-react";
import { ConfigDialog } from "./ConfigDialog";
import { LayoutView } from "./LayoutView";
import { ProfileMenu } from "./ProfileMenu";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { StatusBar } from "./StatusBar";
import { ViewMenu } from "./ViewMenu";
import { useWebSocket, type WsMessage } from "./useWebSocket";
import { Button } from "@/components/ui/button";
import { useLayout } from "@/lib/useLayout";
import { api } from "@/lib/api";
import type { Command, ConsoleEntry, FullProfile, ParserConfig, PortConfig } from "@/lib/types";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

export function App() {
  const [connected, setConnected] = useState(false);
  const [portPath, setPortPath] = useState<string>("");
  const [portCfg, setPortCfg] = useState<PortConfig | null>(null);
  const [parserCfg, setParserCfg] = useState<ParserConfig | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [cmdRefreshKey, setCmdRefreshKey] = useState(0);
  const [parserRefreshKey, setParserRefreshKey] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);

  const { layout, setTemplate, togglePanel, reset, applyLayout } = useLayout();

  useEffect(() => {
    api
      .getState()
      .then((s) => {
        setConnected(s.open);
        setPortCfg(s.config);
        setPortPath(s.path ?? "");
        setParserCfg(s.parser);
      })
      .catch(() => {
        /* server not up — ignore */
      });
  }, []);

  // Layout snapshot for the profile export/import — only template + collapsed state.
  const layoutSnapshot = useMemo(
    () => ({
      template: layout.template,
      panels: layout.panels,
    }),
    [layout.template, layout.panels],
  );

  const onMessage = useCallback((m: WsMessage) => {
    switch (m.type) {
      case "open":
        setConnected(true);
        setPortCfg(m.config as PortConfig);
        setPortPath((m.config as PortConfig & { path?: string })?.path || "");
        break;
      case "close":
        setConnected(false);
        break;
      case "data":
        setEntries((prev) => [
          ...prev,
          {
            ts: m.ts as number,
            dir: "in",
            payload: String(m.payload),
            ascii: typeof m.ascii === "string" ? m.ascii : undefined,
          },
        ]);
        break;
      case "sent":
        setEntries((prev) => [
          ...prev,
          {
            ts: Date.now(),
            dir: "out",
            payload: String(m.payload),
            ascii: typeof m.ascii === "string" ? m.ascii : undefined,
            format: m.format as "ascii" | "hex",
            bytes: m.bytes as number,
            commandName: typeof m.name === "string" ? m.name : undefined,
          },
        ]);
        break;
      case "error":
        setEntries((prev) => [
          ...prev,
          {
            ts: Date.now(),
            dir: "in",
            payload: "",
            error: String(m.message),
          },
        ]);
        break;
      case "state":
        setConnected(Boolean(m.open));
        if (m.config) {
          setPortCfg(m.config as PortConfig);
          const p = (m.config as PortConfig & { path?: string }).path;
          if (p) setPortPath(p);
        }
        break;
    }
  }, []);

  const { connected: wsConnected, send } = useWebSocket(WS_URL, onMessage);

  const onSend = useCallback(
    (c: Command) => {
      send({
        type: "send",
        payload: c.payload,
        format: c.format,
        id: c.id,
        name: c.name,
      });
    },
    [send],
  );

  // Ad-hoc payload from the console quick-send bar (not a saved command).
  const onSendRaw = useCallback(
    (payload: string, format: "hex" | "ascii") => {
      send({ type: "send", payload, format });
    },
    [send],
  );

  // Refresh from the backend each time the config dialog opens so the form
  // always shows the live port/parser config.
  const openConfigDialog = useCallback(() => {
    api
      .getState()
      .then((s) => {
        setConnected(s.open);
        setPortCfg(s.config);
        setPortPath(s.path ?? "");
        setParserCfg(s.parser);
      })
      .catch(() => {
        /* ignore */
      });
    setConfigOpen(true);
  }, []);

  const onProfileLoaded = useCallback(
    (p: FullProfile) => {
      setCmdRefreshKey((k) => k + 1);
      if (p.port) setPortCfg(p.port);
      if (p.parser) {
        setParserCfg(p.parser);
        setParserRefreshKey((k) => k + 1);
      }
      if (p.layout) applyLayout(p.layout);
    },
    [applyLayout],
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="flex items-center gap-2.5 px-3 py-1 border-b bg-card">
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground grid place-items-center">
          <Cable className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold tracking-tight">Serial Monitor</h1>
          <p className="text-[11px] text-muted-foreground">Web serial console</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={openConfigDialog}>
            <Settings />
            Config
          </Button>
          <ProfileMenu
            onCommandsChanged={() => setCmdRefreshKey((k) => k + 1)}
            onProfileLoaded={onProfileLoaded}
            onWorkspaceReset={() => {
              setEntries([]);
              setConnected(false);
              setPortPath("");
              setCmdRefreshKey((k) => k + 1);
            }}
            layoutSnapshot={layoutSnapshot}
          />
          <ProfileSwitcher
            onProfileLoaded={onProfileLoaded}
            onWorkspaceReset={() => {
              setEntries([]);
              setConnected(false);
              setPortPath("");
              setCmdRefreshKey((k) => k + 1);
            }}
            layoutSnapshot={layoutSnapshot}
          />
          <ViewMenu template={layout.template} onTemplateChange={setTemplate} onReset={reset} />
        </div>
      </header>

      <ConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        connected={connected}
        onConnected={() => setConnected(true)}
        onDisconnected={() => setConnected(false)}
        parserInitial={parserCfg}
        portInitial={portCfg}
      />

      <main className="flex-1 min-h-0">
        <div className="h-full p-3">
          <LayoutView
            layout={layout}
            onTogglePanel={togglePanel}
            connected={connected}
            onConnected={() => setConnected(true)}
            onDisconnected={() => setConnected(false)}
            parserInitial={parserCfg}
            cmdRefreshKey={cmdRefreshKey + parserRefreshKey}
            onSend={onSend}
            onSendRaw={onSendRaw}
            entries={entries}
            onClearConsole={() => setEntries([])}
          />
        </div>
      </main>

      <StatusBar connected={connected} wsConnected={wsConnected} path={portPath} config={portCfg} />
    </div>
  );
}
