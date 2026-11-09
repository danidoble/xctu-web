// useLayout.ts — persisted panel layout (template + per-panel collapsed state).
// Panel sizes are NOT managed here — react-resizable-panels persists those
// directly to localStorage via autoSaveId / useDefaultLayout.

import { useCallback, useEffect, useState } from "react";

export type PanelId = "connection" | "parser" | "commands" | "console";

export type LayoutTemplate =
  | "console-top"
  | "console-right"
  | "sidebar"
  | "stacked"
  | "columns"
  | "quad";

const TEMPLATES: LayoutTemplate[] = [
  "console-top",
  "console-right",
  "sidebar",
  "stacked",
  "columns",
  "quad",
];

export type PanelState = {
  collapsed: boolean;
};

export type LayoutState = {
  template: LayoutTemplate;
  panels: Record<PanelId, PanelState>;
};

const DEFAULTS: LayoutState = {
  template: "console-top",
  panels: {
    connection: { collapsed: false },
    parser: { collapsed: false },
    commands: { collapsed: false },
    console: { collapsed: false },
  },
};

const KEY = "serial-monitor-layout";

function load(): LayoutState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      template: TEMPLATES.includes(parsed.template) ? parsed.template : DEFAULTS.template,
      panels: { ...DEFAULTS.panels, ...(parsed.panels ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function useLayout() {
  const [layout, setLayout] = useState<LayoutState>(load);

  useEffect(() => {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
  }, [layout]);

  const setTemplate = useCallback((template: LayoutTemplate) => {
    setLayout((l) => ({ ...l, template }));
  }, []);

  const togglePanel = useCallback((id: PanelId) => {
    setLayout((l) => ({
      ...l,
      panels: {
        ...l.panels,
        [id]: { ...l.panels[id], collapsed: !l.panels[id].collapsed },
      },
    }));
  }, []);

  const reset = useCallback(() => setLayout(DEFAULTS), []);

  const applyLayout = useCallback(
    (snapshot: { template?: LayoutTemplate; panels?: Partial<Record<PanelId, PanelState>> }) => {
      setLayout((l) => ({
        ...l,
        template: snapshot.template ?? l.template,
        panels: { ...l.panels, ...(snapshot.panels ?? {}) },
      }));
    },
    [],
  );

  return { layout, setTemplate, togglePanel, reset, applyLayout };
}
