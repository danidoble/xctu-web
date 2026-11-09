// LayoutView.tsx — renders the panel arrangement for the chosen template.
// v4 of react-resizable-panels. Panel sizes are persisted to localStorage
// by the library itself via autoSaveId.

import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import type { ComponentProps, ReactNode } from "react";
import { Cable, Cog, ScrollText, Zap } from "lucide-react";
import { PortConfigPanel } from "./PortConfigPanel";
import { ParserConfigPanel } from "./ParserConfigPanel";
import { CommandWorkspace } from "./CommandWorkspace";
import { Console } from "./Console";
import { PanelCard } from "./PanelCard";
import type { Command, ConsoleEntry, ParserConfig } from "@/lib/types";
import type { LayoutState } from "@/lib/useLayout";
import { cn } from "@/lib/utils";

type Props = {
  layout: LayoutState;
  onTogglePanel: (id: "connection" | "parser" | "commands" | "console") => void;
  connected: boolean;
  onConnected: () => void;
  onDisconnected: () => void;
  parserInitial: ParserConfig | null;
  cmdRefreshKey: number;
  onSend: (c: Command) => void;
  onSendRaw: (payload: string, format: "hex" | "ascii") => void;
  entries: ConsoleEntry[];
  onClearConsole: () => void;
};

export function LayoutView(props: Props) {
  const { layout, onTogglePanel, ...rest } = props;
  const { template, panels } = layout;

  // Hooks for each layout so react-resizable-panels can persist sizes per-template.
  // We do NOT pass `id` to Group so autoSaveId stays disabled — useDefaultLayout
  // is the single source of truth for persistence.
  const sidebarLayout = useDefaultLayout({
    id: "xctu-sidebar-v2",
    storage: { getItem, setItem },
  });
  const sidebarLeftLayout = useDefaultLayout({
    id: "xctu-sidebar-left-v2",
    storage: { getItem, setItem },
  });
  const mainLayout = useDefaultLayout({
    id: "xctu-main-v2",
    storage: { getItem, setItem },
  });
  const columnsLayout = useDefaultLayout({
    id: "xctu-columns-v2",
    storage: { getItem, setItem },
  });
  const columnsLeftLayout = useDefaultLayout({
    id: "xctu-columns-left-v2",
    storage: { getItem, setItem },
  });
  const quadOuterLayout = useDefaultLayout({
    id: "xctu-quad-outer-v2",
    storage: { getItem, setItem },
  });
  const quadTopLayout = useDefaultLayout({
    id: "xctu-quad-top-v2",
    storage: { getItem, setItem },
  });
  const quadLeftLayout = useDefaultLayout({
    id: "xctu-quad-left-v2",
    storage: { getItem, setItem },
  });
  const consoleTopLayout = useDefaultLayout({
    id: "serial-monitor-console-top",
    storage: { getItem, setItem },
  });
  const consoleRightLayout = useDefaultLayout({
    id: "serial-monitor-console-right",
    storage: { getItem, setItem },
  });

  const cards = {
    connection: (
      <PanelCard
        title="Connection"
        icon={<Cable />}
        collapsed={panels.connection.collapsed}
        onToggleCollapsed={() => onTogglePanel("connection")}
        bodyClassName="p-3 overflow-auto"
      >
        <PortConfigPanel
          connected={rest.connected}
          onConnected={rest.onConnected}
          onDisconnected={rest.onDisconnected}
        />
      </PanelCard>
    ),
    parser: (
      <PanelCard
        title="Parser"
        icon={<Cog />}
        collapsed={panels.parser.collapsed}
        onToggleCollapsed={() => onTogglePanel("parser")}
        bodyClassName="p-3 overflow-auto"
      >
        <ParserConfigPanel initial={rest.parserInitial ?? undefined} disabled={!rest.connected} />
      </PanelCard>
    ),
    commands: (
      <PanelCard
        title="Commands"
        icon={<Zap />}
        collapsed={panels.commands.collapsed}
        onToggleCollapsed={() => onTogglePanel("commands")}
        className="h-full"
      >
        <CommandWorkspace
          key={rest.cmdRefreshKey}
          onSend={rest.onSend}
          connected={rest.connected}
        />
      </PanelCard>
    ),
    console: (
      <PanelCard
        title="Console"
        icon={<ScrollText />}
        collapsed={panels.console.collapsed}
        onToggleCollapsed={() => onTogglePanel("console")}
        className="h-full"
      >
        <Console
          entries={rest.entries}
          onClear={rest.onClearConsole}
          connected={rest.connected}
          onSendRaw={rest.onSendRaw}
        />
      </PanelCard>
    ),
  };

  // console-top (default): console above, commands below — port/parser config
  // lives in the header Config dialog instead of inline panels.
  if (template === "console-top") {
    return (
      <PanelStack
        layout={consoleTopLayout}
        topId="ct-console"
        bottomId="ct-commands"
        top={cards.console}
        bottom={cards.commands}
        topCollapsed={panels.console.collapsed}
        bottomCollapsed={panels.commands.collapsed}
      />
    );
  }

  // console-right: commands on the left, console on the right.
  if (template === "console-right") {
    return (
      <PanelStack
        layout={consoleRightLayout}
        orientation="horizontal"
        topId="cr-commands"
        bottomId="cr-console"
        top={cards.commands}
        bottom={cards.console}
        topCollapsed={panels.commands.collapsed}
        bottomCollapsed={panels.console.collapsed}
      />
    );
  }

  if (template === "sidebar") {
    return (
      <Group orientation="horizontal" {...sidebarLayout} className="h-full">
        <Panel id="sidebar-left" minSize="15" maxSize="45" className="min-w-0 min-h-0">
          <PanelStack
            layout={sidebarLeftLayout}
            className="pr-1"
            topId="sidebar-connection"
            bottomId="sidebar-parser"
            top={cards.connection}
            bottom={cards.parser}
            topCollapsed={panels.connection.collapsed}
            bottomCollapsed={panels.parser.collapsed}
          />
        </Panel>
        <VerticalSeparator />
        <Panel id="sidebar-right" minSize="30" className="min-w-0 min-h-0">
          <PanelStack
            layout={mainLayout}
            topId="main-top"
            bottomId="main-bottom"
            topMaxSize="70"
            top={cards.commands}
            bottom={cards.console}
            topCollapsed={panels.commands.collapsed}
            bottomCollapsed={panels.console.collapsed}
          />
        </Panel>
      </Group>
    );
  }

  if (template === "stacked") {
    return (
      <div className="flex flex-col gap-4 h-full">
        <div className="flex gap-4 shrink-0">
          <div className={panels.connection.collapsed ? "shrink-0" : "flex-1 min-w-0"}>
            {cards.connection}
          </div>
          <div className={panels.parser.collapsed ? "shrink-0" : "flex-1 min-w-0"}>
            {cards.parser}
          </div>
        </div>
        <div className={panels.commands.collapsed ? "shrink-0" : "flex-1 min-h-0"}>
          {cards.commands}
        </div>
        <div className={panels.console.collapsed ? "shrink-0" : "flex-1 min-h-0"}>
          {cards.console}
        </div>
      </div>
    );
  }

  if (template === "columns") {
    return (
      <Group orientation="horizontal" {...columnsLayout} className="h-full">
        <Panel id="columns-left" minSize="15" maxSize="50" className="min-w-0 min-h-0">
          <PanelStack
            layout={columnsLeftLayout}
            className="pr-1"
            topId="columns-connection"
            bottomId="columns-parser"
            top={cards.connection}
            bottom={cards.parser}
            topCollapsed={panels.connection.collapsed}
            bottomCollapsed={panels.parser.collapsed}
          />
        </Panel>
        <VerticalSeparator />
        <Panel id="columns-mid" minSize="20" className="min-w-0 min-h-0">
          {cards.commands}
        </Panel>
        <VerticalSeparator />
        <Panel id="columns-right" minSize="20" className="min-w-0 min-h-0">
          {cards.console}
        </Panel>
      </Group>
    );
  }

  // quad — resizable: console across the bottom, config + commands on top.
  return (
    <Group orientation="vertical" {...quadOuterLayout} className="h-full">
      <Panel id="quad-top" defaultSize="60" minSize="20" className="min-h-0">
        <Group orientation="horizontal" {...quadTopLayout} className="h-full pb-1">
          <Panel id="quad-left" minSize="20" maxSize="50" className="min-w-0 min-h-0">
            <PanelStack
              layout={quadLeftLayout}
              className="pr-1"
              topId="quad-connection"
              bottomId="quad-parser"
              top={cards.connection}
              bottom={cards.parser}
              topCollapsed={panels.connection.collapsed}
              bottomCollapsed={panels.parser.collapsed}
            />
          </Panel>
          <VerticalSeparator />
          <Panel id="quad-commands" minSize="30" className="min-w-0 min-h-0">
            <div className="h-full pl-1">{cards.commands}</div>
          </Panel>
        </Group>
      </Panel>
      <HorizontalSeparator />
      <Panel id="quad-console" minSize="15" className="min-h-0">
        <div className="h-full pt-1">{cards.console}</div>
      </Panel>
    </Group>
  );
}

// PanelStack — pair of resizable panels (vertical or horizontal). When one
// card is collapsed, the resizable Group is swapped for a plain flex box so
// the expanded card automatically reclaims the freed space.
function PanelStack({
  layout,
  className,
  orientation = "vertical",
  topId,
  bottomId,
  topMaxSize,
  top,
  bottom,
  topCollapsed,
  bottomCollapsed,
}: {
  layout: Omit<ComponentProps<typeof Group>, "orientation" | "children" | "className">;
  className?: string;
  orientation?: "vertical" | "horizontal";
  topId: string;
  bottomId: string;
  topMaxSize?: string;
  top: ReactNode;
  bottom: ReactNode;
  topCollapsed: boolean;
  bottomCollapsed: boolean;
}) {
  const horizontal = orientation === "horizontal";
  if (topCollapsed || bottomCollapsed) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 gap-2",
          horizontal ? "flex-row" : "flex-col",
          className,
        )}
      >
        <div className={topCollapsed ? "shrink-0" : "flex-1 min-h-0 min-w-0"}>{top}</div>
        <div className={bottomCollapsed ? "shrink-0" : "flex-1 min-h-0 min-w-0"}>{bottom}</div>
      </div>
    );
  }
  return (
    <Group orientation={orientation} {...layout} className={cn("h-full", className)}>
      <Panel
        id={topId}
        defaultSize="50"
        minSize="15"
        maxSize={topMaxSize}
        className="min-h-0 min-w-0"
      >
        <div className={cn("h-full", horizontal ? "pr-1" : "pb-1")}>{top}</div>
      </Panel>
      {horizontal ? <VerticalSeparator /> : <HorizontalSeparator />}
      <Panel id={bottomId} minSize="15" className="min-h-0 min-w-0">
        <div className={cn("h-full", horizontal ? "pl-1" : "pt-1")}>{bottom}</div>
      </Panel>
    </Group>
  );
}

function VerticalSeparator() {
  return (
    <Separator
      className={cn(
        "group relative w-1.5 bg-transparent transition-colors",
        "data-[resize-handle-state=hover]:bg-accent data-[resize-handle-state=drag]:bg-accent",
      )}
    >
      <div className="h-full w-px mx-auto bg-border group-data-[resize-handle-state=hover]:bg-primary group-data-[resize-handle-state=drag]:bg-primary transition-colors" />
    </Separator>
  );
}

function HorizontalSeparator() {
  return (
    <Separator
      className={cn(
        "group relative h-1.5 bg-transparent transition-colors",
        "data-[resize-handle-state=hover]:bg-accent data-[resize-handle-state=drag]:bg-accent",
      )}
    >
      <div className="w-full h-px my-auto bg-border group-data-[resize-handle-state=hover]:bg-primary group-data-[resize-handle-state=drag]:bg-primary transition-colors" />
    </Separator>
  );
}

// Safe localStorage wrapper — falls back to a no-op when storage is unavailable.
function getItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
