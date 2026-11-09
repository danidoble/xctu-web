// Console.tsx — live data stream.
// Hex view shows only hex bytes; ascii view shows only text.
// TX (sent) and RX (received) rows use distinct colors + direction tags.
// Timestamps can be hidden (also affects the exported log).
// Quick-send bar at the bottom sends ad-hoc payloads without saving a command.
//
// Rendering is capped at the last 1000 entries to keep the DOM cheap when a
// session accumulates thousands of frames. The full session history lives in
// a backend ring buffer (capped at 50_000) and is fetched on demand when the
// user clicks Export.

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Copy, Download, Eraser, ScrollText, Send, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import type { ConsoleEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  entries: ConsoleEntry[];
  onClear: () => void;
  connected: boolean;
  onSendRaw: (payload: string, format: "hex" | "ascii") => void;
};

// Hard cap on what we render. Beyond this, the rest of the buffer is still
// available via Export. Picked 1000 to balance scrollback against DOM cost
// (each row ≈ a handful of spans); tests show ~1500 rows starts to feel slow
// on large viewports, 1000 stays smooth.
const RENDER_CAP = 1000;
const EXPORT_CAP = 50_000;

export function Console({ entries, onClear, connected, onSendRaw }: Props) {
  const [view, setView] = useState<"hex" | "ascii">("hex");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTs, setShowTs] = useState(true);
  const [showCommandName, setShowCommandName] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [quickPayload, setQuickPayload] = useState("");
  const [quickFormat, setQuickFormat] = useState<"hex" | "ascii">("hex");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Slice to the last RENDER_CAP entries. Cheap (one slice) and lets the
  // entries prop keep growing without us paying the DOM cost on every frame.
  const visibleEntries = useMemo(() => {
    if (entries.length <= RENDER_CAP) return entries;
    return entries.slice(entries.length - RENDER_CAP);
  }, [entries]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const el = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLDivElement | null;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [visibleEntries, autoScroll]);

  const copy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(idx);
      setTimeout(() => setCopiedId((c) => (c === idx ? null : c)), 1200);
    } catch {
      /* ignore */
    }
  };

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportLog = async () => {
    setExporting(true);
    setExportError("");
    try {
      // Pull the full session log (up to EXPORT_CAP) from the backend. This
      // works even when the local buffer is trimmed by the render cap.
      const { entries: logEntries } = await api.getLog(EXPORT_CAP);
      const lines = logEntries.map(formatLogLine);
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `serial-log-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // Formatter used by both Export and any future copy-all affordance. Lives
  // at component scope so it doesn't reallocate on every render.
  function formatLogLine(e: ConsoleEntry): string {
    const ts = showTs ? `${new Date(e.ts).toISOString()} ` : "";
    const name = showCommandName && e.commandName ? `[${e.commandName}] ` : "";
    const dir = e.dir === "in" ? "RX" : "TX";
    const body = e.error ?? e.payload;
    const meta = e.bytes != null ? ` [${e.bytes}B]` : "";
    return `${ts}${dir}${meta} ${name}${body}`;
  }

  const quickSend = () => {
    const payload = quickPayload.trim();
    if (!payload || !connected) return;
    onSendRaw(payload, quickFormat);
    setQuickPayload("");
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {entries.length > RENDER_CAP
            ? `${RENDER_CAP} of ${entries.length} entries (rest available via export)`
            : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        </span>
        <div className="flex items-center gap-1.5">
          <Tabs value={view} onValueChange={(v) => setView(v as "hex" | "ascii")}>
            <TabsList>
              <TabsTrigger value="hex">hex</TabsTrigger>
              <TabsTrigger value="ascii">ascii</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant={autoScroll ? "default" : "ghost"}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            aria-pressed={autoScroll}
          >
            Auto-scroll
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={showTs ? "default" : "ghost"}
                onClick={() => setShowTs(!showTs)}
                aria-pressed={showTs}
                aria-label="Toggle timestamps"
              >
                <Clock />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showTs ? "Hide timestamps" : "Show timestamps"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={showCommandName ? "default" : "ghost"}
                onClick={() => setShowCommandName(!showCommandName)}
                aria-pressed={showCommandName}
                aria-label="Toggle command names"
              >
                <Tag />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showCommandName ? "Hide command names" : "Show command names"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={exportLog}
                disabled={exporting}
                aria-label={exporting ? "Exporting…" : "Export log"}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {exporting
                ? `Exporting up to ${EXPORT_CAP.toLocaleString()} entries…`
                : `Export up to ${EXPORT_CAP.toLocaleString()} entries from the session log`}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label="Clear">
                <Eraser />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 min-h-0" ref={scrollRef}>
        <ScrollArea className="h-full">
          <div
            className="px-3 py-2 text-xs font-mono leading-6"
            style={{ color: "hsl(var(--console-fg))", minHeight: "100%" }}
          >
            {visibleEntries.length === 0 && (
              <Empty className="h-full border-0 gap-3 p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ScrollText />
                  </EmptyMedia>
                  <EmptyTitle className="text-base">No data yet</EmptyTitle>
                  <EmptyDescription>
                    Connect to a port to begin streaming. Incoming and outgoing frames will appear
                    here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {visibleEntries.map((e, i) => (
              <ConsoleRow
                key={i}
                entry={e}
                index={i}
                view={view}
                showTs={showTs}
                showCommandName={showCommandName}
                onCopy={copy}
                copied={copiedId === i}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      {exportError && (
        <p className="border-t px-3 py-1.5 text-xs text-destructive">
          Export failed: {exportError}
        </p>
      )}

      <div className="flex items-center gap-2 px-2 py-1.5 border-t shrink-0">
        <Select value={quickFormat} onValueChange={(v) => setQuickFormat(v as "hex" | "ascii")}>
          <SelectTrigger className="w-20 h-8 shrink-0" aria-label="Quick-send format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hex">hex</SelectItem>
            <SelectItem value="ascii">ascii</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={quickPayload}
          onChange={(e) => setQuickPayload(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") quickSend();
          }}
          placeholder={
            quickFormat === "hex" ? "Quick send — e.g. 41 54 0D" : "Quick send — e.g. AT"
          }
          className="flex-1 h-8 font-mono text-xs"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                size="sm"
                onClick={quickSend}
                disabled={!connected || !quickPayload.trim()}
                aria-label="Send payload"
              >
                <Send />
                Send
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {connected ? "Send once (not saved)" : "Connect to a port to send"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ConsoleRow({
  entry,
  index,
  view,
  showTs,
  showCommandName,
  onCopy,
  copied,
}: {
  entry: ConsoleEntry;
  index: number;
  view: "hex" | "ascii";
  showTs: boolean;
  showCommandName: boolean;
  onCopy: (text: string, idx: number) => void;
  copied: boolean;
}) {
  const isOut = entry.dir === "out";
  const accent = entry.error
    ? "hsl(var(--console-err))"
    : isOut
      ? "hsl(var(--console-out))"
      : "hsl(var(--console-in))";
  const bytes = useMemo(() => bytesFromHex(entry.payload), [entry.payload]);
  const ascii = entry.ascii ?? "";
  const ts = new Date(entry.ts).toISOString().substring(11, 23);
  const copyText = entry.payload;

  return (
    <>
      {showCommandName && entry.commandName && (
        <div
          className="flex items-center gap-2 py-1 text-[10px] font-sans font-semibold uppercase tracking-wider text-foreground/60"
          title={entry.commandName}
        >
          <span className="h-px flex-1 bg-border" />
          <span className="max-w-56 truncate">{entry.commandName}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
      <div
        onClick={() => onCopy(copyText, index)}
        className="group flex items-start gap-2 px-2 py-0.5 rounded cursor-pointer hover:bg-foreground/5"
        title={copied ? "Copied!" : "Click to copy hex payload"}
      >
        {showTs && <span className="tabular-nums shrink-0 text-foreground/60">{ts}</span>}

        <span
          style={{ color: accent, borderColor: accent }}
          className="shrink-0 w-7 text-center text-[10px] font-bold leading-4 mt-1 rounded-full border bg-transparent"
          aria-label={isOut ? "Sent (TX)" : "Received (RX)"}
        >
          {isOut ? "TX" : "RX"}
        </span>

        <span className="shrink-0 tabular-nums w-7 text-right text-foreground/60">
          {entry.bytes != null ? `${entry.bytes}B` : ""}
        </span>

        <div className="flex-1 min-w-0" style={{ color: accent }}>
          {entry.error ? (
            <span>{entry.error}</span>
          ) : view === "hex" ? (
            <span className="tracking-wide">
              {bytes.map((b, i) => (
                <span key={i} className="byte-cell" style={{ color: accent }}>
                  {b.hex}
                  {i < bytes.length - 1 ? " " : ""}
                </span>
              ))}
            </span>
          ) : (
            <span>{renderableAscii(ascii || bytesToAscii(bytes))}</span>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              className="shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onCopy(copyText, index);
              }}
              aria-label={copied ? "Copied" : "Copy payload"}
            >
              {copied ? "✓" : <Copy />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied" : "Copy payload"}</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

function bytesFromHex(hex: string): { hex: string; code: number }[] {
  const cleaned = (hex || "").replace(/[^0-9a-fA-F]/g, "");
  const out: { hex: string; code: number }[] = [];
  for (let i = 0; i + 1 < cleaned.length; i += 2) {
    const byte = cleaned.slice(i, i + 2);
    const code = parseInt(byte, 16);
    out.push({ hex: byte.toUpperCase(), code });
  }
  return out;
}

function bytesToAscii(bytes: { code: number }[]): string {
  return bytes
    .map((b) => (b.code >= 0x20 && b.code < 0x7f ? String.fromCharCode(b.code) : "·"))
    .join("");
}

function renderableAscii(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, "·");
}
