// CommandList.tsx — CRUD table, send-on-row-click, inline edit, repeat send,
// clear-all, shadcn components.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Info,
  Pencil,
  Plus,
  Repeat,
  Send,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { parseCommandLabel } from "@/lib/commandLabel";
import type { Command } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { onSend: (c: Command) => void; connected: boolean };

const empty: Omit<Command, "id"> = {
  name: "",
  payload: "",
  format: "hex",
  description: "",
};

// Sortable column keys — every visible header is sortable. Order here
// also dictates the tiebreaker precedence within a single sort column:
// category → name → payload → format.
type SortKey = "category" | "name" | "payload" | "format";
type SortDir = "asc" | "desc";
type SortState = Partial<Record<SortKey, SortDir>>;

// Default order shown when no header has been clicked: category asc + name asc.
const DEFAULT_SORT: Required<Pick<SortState, "category" | "name">> = {
  category: "asc",
  name: "asc",
};

// Click a header → cycle none → asc → desc → none. Sorting by a single
// column keeps name as a stable secondary key (always asc) so the order
// stays deterministic.
function cycleSort(current: SortState, key: SortKey): SortState {
  const dir = current[key];
  if (!dir) return { ...current, [key]: "asc" };
  if (dir === "asc") return { ...current, [key]: "desc" };
  const next = { ...current };
  delete next[key];
  return next;
}

export function CommandList({ onSend, connected }: Props) {
  const [cmds, setCmds] = useState<Command[]>([]);
  const [draft, setDraft] = useState<Omit<Command, "id">>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Command | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [sort, setSort] = useState<SortState>({});
  // Repeat send: command being configured + per-command running state.
  const [repeatFor, setRepeatFor] = useState<Command | null>(null);
  const [repeating, setRepeating] = useState<Record<string, { remaining: number | null }>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Kill any running repeaters on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearInterval(t);
    };
  }, []);

  // Stop all repeaters when the port disconnects.
  useEffect(() => {
    if (connected) return;
    for (const id of timersRef.current.keys()) stopRepeat(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const stopRepeat = (id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearInterval(t);
    timersRef.current.delete(id);
    setRepeating((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  };

  const startRepeat = (cmd: Command, intervalMs: number, times: number | null) => {
    stopRepeat(cmd.id);
    let remaining = times; // null = infinite
    onSend(cmd); // first shot right away
    if (remaining !== null) remaining -= 1;
    if (remaining !== null && remaining <= 0) return;
    setRepeating((r) => ({ ...r, [cmd.id]: { remaining } }));
    const timer = setInterval(() => {
      onSend(cmd);
      if (remaining !== null) {
        remaining -= 1;
        setRepeating((r) => (r[cmd.id] ? { ...r, [cmd.id]: { remaining } } : r));
        if (remaining <= 0) stopRepeat(cmd.id);
      }
    }, intervalMs);
    timersRef.current.set(cmd.id, timer);
  };

  const reload = async () => {
    try {
      setCmds(await api.listCommands());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const create = async () => {
    if (!draft.name.trim() || !draft.payload) return;
    setError("");
    try {
      await api.createCommand(draft);
      setDraft(empty);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async (id: string, patch: Partial<Command>) => {
    setError("");
    try {
      await api.updateCommand(id, patch);
      setEditing(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (cmd: Command) => {
    setError("");
    stopRepeat(cmd.id);
    try {
      await api.deleteCommand(cmd.id);
      await reload();
      setConfirmDelete(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const clearAll = async () => {
    setError("");
    try {
      for (const id of timersRef.current.keys()) stopRepeat(id);
      await api.deleteAllCommands();
      await reload();
      setConfirmClearAll(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) return cmds;
    const q = filter.toLowerCase();
    return cmds.filter((c) => {
      const label = parseCommandLabel(c.name);
      return (
        c.name.toLowerCase().includes(q) ||
        label.displayName.toLowerCase().includes(q) ||
        (label.category ?? "").toLowerCase().includes(q) ||
        c.payload.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [cmds, filter]);

  // Sort: if any column has an explicit override, use that column as primary
  // (in the user's last-clicked order). Otherwise fall back to the default
  // (category asc + name asc). Remaining keys always serve as deterministic
  // asc tiebreakers so the order is fully reproducible.
  const sortedFiltered = useMemo(() => {
    const hasOverride = Boolean(sort.category ?? sort.name ?? sort.payload ?? sort.format);
    const primaryKeys: SortKey[] = hasOverride
      ? (
          [
            ["category", sort.category],
            ["name", sort.name],
            ["payload", sort.payload],
            ["format", sort.format],
          ] as [SortKey, SortDir | undefined][]
        )
          .filter(([, dir]) => dir)
          .map(([k]) => k)
      : ["category", "name"];
    const tiebreakerKeys = (["category", "name", "payload", "format"] as SortKey[]).filter(
      (k) => !primaryKeys.includes(k),
    );
    const allKeys = [...primaryKeys, ...tiebreakerKeys];
    const decorated = filtered.map((c) => {
      const label = parseCommandLabel(c.name);
      return {
        c,
        category: label.category ?? "",
        displayName: label.displayName.toLowerCase(),
        payload: c.payload.toLowerCase(),
        format: c.format,
      };
    });
    decorated.sort((a, b) => {
      for (const k of allKeys) {
        const isPrimary = primaryKeys.includes(k);
        const dir = isPrimary && sort[k] === "desc" ? -1 : 1;
        const av =
          k === "category"
            ? a.category
            : k === "name"
              ? a.displayName
              : k === "payload"
                ? a.payload
                : a.format;
        const bv =
          k === "category"
            ? b.category
            : k === "name"
              ? b.displayName
              : k === "payload"
                ? b.payload
                : b.format;
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
      }
      return 0;
    });
    return decorated.map((d) => d.c);
  }, [filtered, sort]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">
          {cmds.length} {cmds.length === 1 ? "command" : "commands"}
        </span>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-40 h-7 text-xs"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setConfirmClearAll(true)}
                disabled={cmds.length === 0}
                aria-label="Clear all commands"
                className="text-destructive"
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear all commands</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-3 py-1.5 grid grid-cols-12 gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/40 shrink-0">
        <SortableHeader col="category" sort={sort} onSort={setSort} className="col-span-2">
          Category
        </SortableHeader>
        <SortableHeader col="name" sort={sort} onSort={setSort} className="col-span-4">
          Name
        </SortableHeader>
        <SortableHeader col="payload" sort={sort} onSort={setSort} className="col-span-3">
          Payload
        </SortableHeader>
        <SortableHeader col="format" sort={sort} onSort={setSort} className="col-span-1">
          Fmt
        </SortableHeader>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {sortedFiltered.map((c) => (
          <CommandRow
            key={c.id}
            cmd={c}
            editing={editing === c.id}
            onEdit={() => setEditing(c.id)}
            onCancel={() => setEditing(null)}
            onSave={(p) => save(c.id, p)}
            onDelete={() => setConfirmDelete(c)}
            onSend={() => onSend(c)}
            canSend={connected}
            repeating={repeating[c.id]}
            onRepeat={() => setRepeatFor(c)}
            onStopRepeat={() => stopRepeat(c.id)}
          />
        ))}
        {sortedFiltered.length === 0 && cmds.length > 0 && (
          <p className="text-xs text-muted-foreground italic px-3 py-3">
            No commands match the filter.
          </p>
        )}
        {cmds.length === 0 && (
          <Empty className="h-full border-0 gap-3 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Zap />
              </EmptyMedia>
              <EmptyTitle className="text-base">No commands yet</EmptyTitle>
              <EmptyDescription>
                Add your first command below — give it a name, a payload and a format, then send it
                with one click.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <div className="border-t bg-muted/30 p-2 shrink-0">
        <div className="grid grid-cols-12 gap-2">
          <Input
            placeholder="Name (e.g. [SISTEMA] 00 - Reset)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="col-span-6"
          />
          <Input
            placeholder="Payload"
            value={draft.payload}
            onChange={(e) => setDraft({ ...draft, payload: e.target.value })}
            className="col-span-4 font-mono"
          />
          <Select
            value={draft.format}
            onValueChange={(v) => setDraft({ ...draft, format: v as "ascii" | "hex" })}
          >
            <SelectTrigger className="col-span-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hex">hex</SelectItem>
              <SelectItem value="ascii">ascii</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={create} className="col-span-1">
            <Plus />
            Add
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete command?</DialogTitle>
            <DialogDescription>
              "{confirmDelete?.name}" will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete && remove(confirmDelete)}>
              <Trash2 />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all commands?</DialogTitle>
            <DialogDescription>
              All {cmds.length} commands will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClearAll(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearAll}>
              <Trash2 />
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {repeatFor && (
        <RepeatDialog
          cmd={repeatFor}
          onClose={() => setRepeatFor(null)}
          onStart={(intervalMs, times) => {
            startRepeat(repeatFor, intervalMs, times);
            setRepeatFor(null);
          }}
        />
      )}
    </div>
  );
}

// RepeatDialog — configure an interval send: N times or infinitely until stopped.
function RepeatDialog({
  cmd,
  onClose,
  onStart,
}: {
  cmd: Command;
  onClose: () => void;
  onStart: (intervalMs: number, times: number | null) => void;
}) {
  const [intervalMs, setIntervalMs] = useState("1000");
  const [times, setTimes] = useState("");
  const interval = Number(intervalMs);
  const timesNum = times.trim() === "" ? null : Math.floor(Number(times));
  const intervalOk = Number.isFinite(interval) && interval >= 50;
  const timesOk = timesNum === null || (Number.isFinite(timesNum) && timesNum >= 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repeat send</DialogTitle>
          <DialogDescription>
            Send "{cmd.name}" on an interval. Leave "times" empty (or 0) to repeat until stopped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="repeat-interval">Interval (ms)</Label>
            <Input
              id="repeat-interval"
              type="number"
              min={50}
              value={intervalMs}
              onChange={(e) => setIntervalMs(e.target.value)}
              className="font-mono"
            />
            {!intervalOk && <p className="text-xs text-destructive">Minimum 50 ms.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repeat-times">Times (empty = ∞)</Label>
            <Input
              id="repeat-times"
              type="number"
              min={0}
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              placeholder="∞"
              className="font-mono"
            />
            {!timesOk && (
              <p className="text-xs text-destructive">Must be 0 or a positive integer.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!intervalOk || !timesOk}
            onClick={() => onStart(interval, !timesNum ? null : timesNum)}
          >
            <Repeat />
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// SortableHeader — click cycles none → asc → desc → none. Shows the active
// direction inline; inactive columns show a muted up-down indicator. The
// active sort also paints the label in primary text so users can read the
// current sort at a glance.
function SortableHeader({
  col,
  sort,
  onSort,
  className,
  children,
}: {
  col: SortKey;
  sort: SortState;
  onSort: (next: SortState) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const dir = sort[col];
  const active = Boolean(dir);
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(cycleSort(sort, col))}
      className={cn(
        "group/sort inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded -mx-1 px-1",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <span>{children}</span>
      <Icon
        className={cn(
          "size-3 transition-opacity",
          active ? "opacity-100" : "opacity-40 group-hover/sort:opacity-80",
        )}
      />
    </button>
  );
}

function CommandRow({
  cmd,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onSend,
  canSend,
  repeating,
  onRepeat,
  onStopRepeat,
}: {
  cmd: Command;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (p: Partial<Command>) => void;
  onDelete: () => void;
  onSend: () => void;
  canSend: boolean;
  repeating?: { remaining: number | null };
  onRepeat: () => void;
  onStopRepeat: () => void;
}) {
  const [draft, setDraft] = useState(cmd);
  useEffect(() => setDraft(cmd), [cmd]);

  if (editing) {
    return (
      <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40 last:border-0 space-y-1.5">
        <div className="grid grid-cols-12 gap-2 items-center">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="col-span-7 h-8"
          />
          <Input
            value={draft.payload}
            onChange={(e) => setDraft({ ...draft, payload: e.target.value })}
            className="col-span-3 h-8 font-mono"
          />
          <Select
            value={draft.format}
            onValueChange={(v) => setDraft({ ...draft, format: v as "ascii" | "hex" })}
          >
            <SelectTrigger className="col-span-1 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hex">hex</SelectItem>
              <SelectItem value="ascii">ascii</SelectItem>
            </SelectContent>
          </Select>
          <div className="col-span-1 flex gap-1 justify-end">
            <Button size="icon-sm" variant="ghost" onClick={() => onSave(draft)} aria-label="Save">
              <Check />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Cancel">
              <X />
            </Button>
          </div>
        </div>
        <Input
          value={draft.description ?? ""}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Description (optional)"
          className="h-7 text-xs"
        />
      </div>
    );
  }

  const label = parseCommandLabel(cmd.name);

  return (
    <div className="group grid grid-cols-12 gap-3 px-3 py-1.5 items-center text-sm hover:bg-muted/40 border-b border-border/40 last:border-0">
      <div className="col-span-2 truncate">
        {label.category ? (
          <Badge variant="outline" className="font-normal">
            {label.category}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="col-span-4 truncate cursor-default">{label.displayName}</div>
        </TooltipTrigger>
        {cmd.name.length > 24 && (
          <TooltipContent className="max-w-sm break-all">{cmd.name}</TooltipContent>
        )}
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="col-span-3 font-mono truncate text-muted-foreground cursor-default">
            {cmd.payload}
          </div>
        </TooltipTrigger>
        {cmd.payload.length > 20 && (
          <TooltipContent className="max-w-sm break-all font-mono">{cmd.payload}</TooltipContent>
        )}
      </Tooltip>
      <div className="col-span-1">
        <Badge variant={cmd.format === "hex" ? "default" : "secondary"}>{cmd.format}</Badge>
      </div>
      <div className="col-span-2 flex gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
        {cmd.description && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Show description"
                className="text-muted-foreground"
              >
                <Info />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80 text-sm whitespace-pre-wrap">
              {cmd.description}
            </HoverCardContent>
          </HoverCard>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send"
                className={cn(canSend && "text-primary")}
              >
                <Send />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{canSend ? "Send" : "Connect to a port to send"}</TooltipContent>
        </Tooltip>
        {repeating ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onStopRepeat}
                aria-label="Stop repeat"
                className="text-warning"
              >
                <Square />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {repeating.remaining === null
                ? "Stop (repeating ∞)"
                : `Stop (${repeating.remaining} left)`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={onRepeat}
                  disabled={!canSend}
                  aria-label="Repeat send"
                >
                  <Repeat />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {canSend ? "Repeat send…" : "Connect to a port to send"}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-xs" variant="ghost" onClick={onEdit} aria-label="Edit">
              <Pencil />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              aria-label="Delete"
              className="text-destructive"
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
