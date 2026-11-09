import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  GripVertical,
  Pencil,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { parseCommandLabel } from "@/lib/commandLabel";
import type { Command, CommandSequence } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { onSend: (command: Command) => void; connected: boolean };
const blankSequence = (): Omit<CommandSequence, "id"> => ({
  name: "",
  commandIds: [],
  intervalMs: 1000,
  passIntervalMs: 0,
});

// Sortable column keys — every visible header is sortable. Order here
// also dictates the tiebreaker precedence within a single sort column:
// name → created → commands → interval.
type SortKey = "name" | "created" | "commands" | "interval";
type SortDir = "asc" | "desc";
type SortState = Partial<Record<SortKey, SortDir>>;

// Default shown when no header has been clicked: creation order asc
// (i.e. oldest first — matches the order the backend stores them).
const DEFAULT_SORT: Required<Pick<SortState, "created" | "name">> = {
  created: "asc",
  name: "asc",
};

// Click a header → cycle none → asc → desc → none.
function cycleSort(current: SortState, key: SortKey): SortState {
  const dir = current[key];
  if (!dir) return { ...current, [key]: "asc" };
  if (dir === "asc") return { ...current, [key]: "desc" };
  const next = { ...current };
  delete next[key];
  return next;
}

export function SequenceList({ onSend, connected }: Props) {
  const [sequences, setSequences] = useState<CommandSequence[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [editing, setEditing] = useState<CommandSequence | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CommandSequence | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<CommandSequence, "id">>(blankSequence);
  const [error, setError] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  // Counter for the current run: total sequence passes completed so far
  // (or null when repeating infinitely). Surfaced in the Stop button
  // tooltip so users can see progress at a glance.
  const [runPasses, setRunPasses] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortState>({});
  // Sequence being configured for a repeat run. Null when no dialog is open.
  const [repeatFor, setRepeatFor] = useState<CommandSequence | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  const reload = async () => {
    try {
      const [nextSequences, nextCommands] = await Promise.all([
        api.listSequences(),
        api.listCommands(),
      ]);
      setSequences(nextSequences);
      setCommands(nextCommands);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!connected) stop();
  }, [connected]);

  const stop = () => {
    stoppedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setRunningId(null);
    setRunPasses(null);
  };

  // Start (or replace) a run. The whole sequence is executed `times` times in
  // a row, with `sequence.intervalMs` between every send. Pass `times = null`
  // to repeat until manually stopped. The pause between full passes comes
  // from the `passIntervalMsOverride` argument — when provided, it overrides
  // the sequence's saved `passIntervalMs` for this launch only. Per-send
  // interval is still respected inside each pass.
  const startRepeat = (
    sequence: CommandSequence,
    times: number | null,
    passIntervalMsOverride?: number,
  ) => {
    if (!connected || !sequence.commandIds.length) return;
    stop();
    stoppedRef.current = false;
    setRunningId(sequence.id);
    setRunPasses(0);
    const selected = sequence.commandIds
      .map((id) => commands.find((command) => command.id === id))
      .filter((command): command is Command => Boolean(command));
    if (!selected.length) {
      stop();
      return;
    }
    let cmdIndex = 0;
    let passIndex = 0; // number of completed passes
    const sendDelay = sequence.intervalMs;
    const passDelay =
      typeof passIntervalMsOverride === "number"
        ? passIntervalMsOverride
        : (sequence.passIntervalMs ?? 0);
    const tick = () => {
      if (stoppedRef.current) return;
      if (cmdIndex >= selected.length) {
        // One pass done — start over unless we've hit the limit.
        passIndex += 1;
        setRunPasses(passIndex);
        if (times !== null && passIndex >= times) {
          setRunningId(null);
          setRunPasses(null);
          return;
        }
        cmdIndex = 0;
        // Wait the inter-pass delay before the first send of the next pass.
        timerRef.current = setTimeout(tick, passDelay);
        return;
      }
      onSend(selected[cmdIndex++]);
      timerRef.current = setTimeout(tick, sendDelay);
    };
    tick();
  };

  // One-shot run: a single pass through the sequence. Equivalent to
  // startRepeat(seq, 1) but kept separate so the row button doesn't have
  // to open a dialog.
  const runOnce = (sequence: CommandSequence) => startRepeat(sequence, 1);
  const create = async () => {
    if (!draft.name.trim()) return;
    try {
      await api.createSequence(draft);
      setCreating(false);
      setDraft(blankSequence());
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = async () => {
    if (!editing?.name.trim()) return;
    try {
      await api.updateSequence(editing.id, editing);
      setEditing(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (id: string) => {
    stop();
    try {
      await api.deleteSequence(id);
      setConfirmDelete(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  type DecoratedSequence = { sequence: CommandSequence; index: number };

  const visibleSequences = useMemo<DecoratedSequence[]>(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? sequences
          .map((s, i) => ({ sequence: s, index: i }))
          .filter(({ sequence }) => sequence.name.toLowerCase().includes(q))
      : sequences.map((s, i) => ({ sequence: s, index: i }));

    // Apply the user's sort if any column is active. Otherwise fall back to
    // the default order: created asc + name asc (creation order, alphabetical
    // inside ties). Remaining keys always serve as deterministic asc tiebreakers.
    const hasOverride = Boolean(sort.name ?? sort.created ?? sort.commands ?? sort.interval);
    const primaryKeys: SortKey[] = hasOverride
      ? (
          [
            ["name", sort.name],
            ["created", sort.created],
            ["commands", sort.commands],
            ["interval", sort.interval],
          ] as [SortKey, SortDir | undefined][]
        )
          .filter(([, dir]) => dir)
          .map(([k]) => k)
      : ["created", "name"];
    const tiebreakerKeys = (["name", "created", "commands", "interval"] as SortKey[]).filter(
      (k) => !primaryKeys.includes(k),
    );
    const allKeys = [...primaryKeys, ...tiebreakerKeys];

    const decorated = filtered.map(({ sequence, index }) => ({
      sequence,
      name: sequence.name.toLowerCase(),
      commands: sequence.commandIds.length,
      interval: sequence.intervalMs,
      index,
    }));
    decorated.sort((a, b) => {
      for (const k of allKeys) {
        // Primary keys use the user's direction (or default asc); tiebreakers
        // always run asc so the order is fully deterministic.
        const isPrimary = primaryKeys.includes(k);
        const dir = isPrimary && sort[k] === "desc" ? -1 : 1;
        const av =
          k === "name"
            ? a.name
            : k === "created"
              ? a.index
              : k === "commands"
                ? a.commands
                : a.interval;
        const bv =
          k === "name"
            ? b.name
            : k === "created"
              ? b.index
              : k === "commands"
                ? b.commands
                : b.interval;
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
      }
      return 0;
    });
    return decorated.map((d) => ({ sequence: d.sequence, index: d.index }));
  }, [sequences, filter, sort]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 shrink-0">
        <span className="text-xs tabular-nums text-muted-foreground">
          {visibleSequences.length === sequences.length
            ? `${sequences.length} ${sequences.length === 1 ? "sequence" : "sequences"}`
            : `${visibleSequences.length} of ${sequences.length}`}
        </span>
        <div className="flex items-center gap-1.5">
          {runningId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={stop}>
                  <Square />
                  Stop
                  {runPasses !== null && (
                    <span className="ml-1 tabular-nums text-xs text-muted-foreground">
                      (
                      {runPasses === 0
                        ? "running"
                        : `${runPasses} pass${runPasses === 1 ? "" : "es"}`}
                      )
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop sequence</TooltipContent>
            </Tooltip>
          )}
          <Input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-36 h-7 text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              setError("");
              setDraft(blankSequence());
              setCreating(true);
            }}
          >
            <Plus />
            New sequence
          </Button>
        </div>
      </div>

      <div className="px-3 py-1.5 grid grid-cols-12 gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b bg-muted/40 shrink-0">
        <SortableHeader col="created" sort={sort} onSort={setSort} className="col-span-2">
          #
        </SortableHeader>
        <SortableHeader col="name" sort={sort} onSort={setSort} className="col-span-4">
          Name
        </SortableHeader>
        <SortableHeader col="commands" sort={sort} onSort={setSort} className="col-span-2">
          Commands
        </SortableHeader>
        <SortableHeader col="interval" sort={sort} onSort={setSort} className="col-span-2">
          Interval
        </SortableHeader>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {visibleSequences.map(({ sequence, index }) => (
          <div
            key={sequence.id}
            className="group grid grid-cols-12 gap-3 px-3 py-1.5 items-center text-sm hover:bg-muted/40 border-b border-border/40 last:border-0"
          >
            <div className="col-span-2 text-xs tabular-nums text-muted-foreground">
              #{index + 1}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="col-span-4 truncate cursor-default font-medium">
                  {sequence.name}
                </div>
              </TooltipTrigger>
              {sequence.name.length > 28 && (
                <TooltipContent className="max-w-sm break-all">{sequence.name}</TooltipContent>
              )}
            </Tooltip>
            <div className="col-span-2">
              <Badge variant="secondary">{sequence.commandIds.length}</Badge>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="col-span-2 text-xs tabular-nums text-muted-foreground cursor-default">
                  {sequence.intervalMs} ms
                  {(sequence.passIntervalMs ?? 0) > 0 && (
                    <span className="ml-1 text-foreground/60">+{sequence.passIntervalMs} ms</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {sequence.intervalMs} ms between every command
                {(sequence.passIntervalMs ?? 0) > 0 && (
                  <>
                    <br />
                    {sequence.passIntervalMs} ms pause between full passes
                  </>
                )}
              </TooltipContent>
            </Tooltip>
            <div className="col-span-2 flex gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
              <IconButton
                label="Edit sequence"
                onClick={() => {
                  setError("");
                  setEditing({
                    ...sequence,
                    commandIds: [...sequence.commandIds],
                  });
                }}
              >
                <Pencil />
              </IconButton>
              <IconButton
                label="Delete sequence"
                onClick={() => setConfirmDelete(sequence)}
                destructive
              >
                <Trash2 />
              </IconButton>
              <IconButton
                label="Run sequence once"
                onClick={() => runOnce(sequence)}
                disabled={!connected || !sequence.commandIds.length || runningId !== null}
              >
                <Play />
              </IconButton>
              <IconButton
                label={runningId === sequence.id ? "Stop repeating" : "Repeat sequence…"}
                // When the same sequence is running, the button acts as
                // Stop (cancels the in-flight timer). Otherwise it opens
                // the repeat dialog.
                onClick={() => (runningId === sequence.id ? stop() : setRepeatFor(sequence))}
                disabled={!connected || !sequence.commandIds.length}
                className={cn(runningId === sequence.id && "text-warning")}
              >
                {runningId === sequence.id ? <Square /> : <Repeat />}
              </IconButton>
            </div>
          </div>
        ))}
        {!sequences.length && (
          <Empty className="h-full border-0 gap-3 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Play />
              </EmptyMedia>
              <EmptyTitle className="text-base">No sequences yet</EmptyTitle>
              <EmptyDescription>
                Create a sequence, select its commands and set their order in one place.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {sequences.length > 0 && visibleSequences.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-3 py-3">
            No sequences match the filter.
          </p>
        )}
      </div>
      {error && <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>}
      <SequenceDialog
        open={creating}
        title="New sequence"
        description="Choose saved commands, arrange their order, then save the complete sequence."
        value={draft}
        commands={commands}
        onChange={setDraft}
        onOpenChange={setCreating}
        onSave={create}
      />
      <SequenceDialog
        open={!!editing}
        title="Edit sequence"
        description="Update the sequence details and drag commands into the desired send order."
        value={editing}
        commands={commands}
        onChange={setEditing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={save}
      />
      <SequenceRepeatDialog
        open={!!repeatFor}
        sequence={repeatFor}
        commands={commands}
        onOpenChange={(open) => !open && setRepeatFor(null)}
        onStart={(times, passIntervalMs) => {
          if (repeatFor) startRepeat(repeatFor, times, passIntervalMs);
          setRepeatFor(null);
        }}
      />
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sequence?</DialogTitle>
            <DialogDescription>
              &quot;{confirmDelete?.name}&quot; will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete && remove(confirmDelete.id)}>
              <Trash2 />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// SortableHeader — click cycles none → asc → desc → none. Inactive columns
// show a muted up-down indicator; the active direction paints the label in
// primary text so users can read the current sort at a glance.
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

function IconButton({
  label,
  children,
  destructive,
  className,
  ...props
}: {
  label: string;
  children: React.ReactNode;
  destructive?: boolean;
} & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            className={cn(destructive && "text-destructive", className)}
            {...props}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SequenceDialog({
  open,
  title,
  description,
  value,
  commands,
  onChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  title: string;
  description: string;
  value: CommandSequence | Omit<CommandSequence, "id"> | null;
  commands: Command[];
  onChange: (value: never) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  if (!value) return null;
  const selected = value.commandIds
    .map((id) => commands.find((command) => command.id === id))
    .filter((command): command is Command => Boolean(command));
  const update = (patch: Partial<Omit<CommandSequence, "id">>) =>
    onChange({ ...value, ...patch } as never);
  const toggle = (id: string, checked: boolean) =>
    update({
      commandIds: checked
        ? [...value.commandIds, id]
        : value.commandIds.filter((commandId) => commandId !== id),
    });
  const moveBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = value.commandIds.filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(targetId), 0, draggedId);
    update({ commandIds: ids });
    setDraggedId(null);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={value.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Sequence name"
            aria-label="Sequence name"
          />
          <Input
            className="w-32 font-mono"
            type="number"
            min={0}
            value={value.intervalMs}
            onChange={(e) => update({ intervalMs: Number(e.target.value) })}
            aria-label="Interval in milliseconds"
            title="Delay between every command inside a pass"
          />
          <Input
            className="w-32 font-mono"
            type="number"
            min={0}
            value={value.passIntervalMs ?? 0}
            onChange={(e) => update({ passIntervalMs: Math.max(0, Number(e.target.value)) })}
            aria-label="Pause between passes in milliseconds"
            title="Extra pause inserted between full passes of the sequence"
            placeholder="0"
          />
        </div>
        <div className="grid max-h-[50vh] grid-cols-2 gap-4 overflow-hidden">
          <div className="min-h-0 overflow-y-auto rounded-md border p-2">
            <p className="mb-2 text-xs font-medium">Available commands</p>
            <div className="flex flex-col gap-1">
              {commands.map((command) => {
                const label = parseCommandLabel(command.name);
                return (
                  <label
                    key={command.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted"
                  >
                    <Checkbox
                      checked={value.commandIds.includes(command.id)}
                      onCheckedChange={(checked) => toggle(command.id, checked === true)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{label.displayName}</span>
                    {label.category && (
                      <Badge variant="outline" className="font-normal">
                        {label.category}
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {command.format}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto rounded-md border p-2">
            <p className="mb-2 text-xs font-medium">Send order — drag to reorder</p>
            <div className="flex flex-col gap-1">
              {selected.map((command) => {
                const label = parseCommandLabel(command.name);
                return (
                  <div
                    key={command.id}
                    draggable
                    onDragStart={() => setDraggedId(command.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveBefore(command.id)}
                    className="flex items-center gap-2 rounded border bg-background px-2 py-1.5"
                  >
                    <GripVertical className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{label.displayName}</span>
                    {label.category && (
                      <Badge variant="outline" className="font-normal">
                        {label.category}
                      </Badge>
                    )}
                    <Badge variant={command.format === "hex" ? "default" : "secondary"}>
                      {command.format}
                    </Badge>
                  </div>
                );
              })}
              {!selected.length && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Select commands on the left.
                </p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            Cancel
          </Button>
          <Button disabled={!value.name.trim()} onClick={onSave}>
            <Check />
            Save sequence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// SequenceRepeatDialog — configure how many times the whole sequence
// should run. The interval between sends comes from the sequence itself;
// the pause between passes is pre-filled from the sequence's saved value
// but can be overridden per-launch. Empty "times" (or 0) means repeat
// forever — Stop in the toolbar cancels.
function SequenceRepeatDialog({
  open,
  sequence,
  commands,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  sequence: CommandSequence | null;
  commands: Command[];
  onOpenChange: (open: boolean) => void;
  onStart: (times: number | null, passIntervalMs: number) => void;
}) {
  const [times, setTimes] = useState("");
  const [passPause, setPassPause] = useState<string>("");
  // Reset prefill whenever a different sequence is opened.
  useEffect(() => {
    if (sequence) setPassPause(String(sequence.passIntervalMs ?? 0));
  }, [sequence]);
  const timesNum = times.trim() === "" ? null : Math.floor(Number(times));
  const timesOk = timesNum === null || (Number.isFinite(timesNum) && timesNum >= 1);
  const pauseNum = Math.floor(Number(passPause));
  const pauseOk = Number.isFinite(pauseNum) && pauseNum >= 0;
  if (!sequence) return null;
  // Show the resolved command names so the user can verify what they're
  // about to launch — same labels they see in the Commands tab.
  const selected = sequence.commandIds
    .map((id) => commands.find((c) => c.id === id))
    .filter((c): c is Command => Boolean(c));
  const submit = () => {
    if (!timesOk || !pauseOk) return;
    onStart(timesNum, pauseNum);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run sequence</DialogTitle>
          <DialogDescription>
            Send every command in &quot;{sequence.name}&quot; in order, with {sequence.intervalMs}{" "}
            ms between sends. Leave &quot;times&quot; empty to repeat until you click Stop.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sequence-repeat-times">Times (empty = ∞)</Label>
            <Input
              id="sequence-repeat-times"
              type="number"
              min={1}
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              placeholder="∞"
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && timesOk && pauseOk) submit();
              }}
            />
            {!timesOk && (
              <p className="text-xs text-destructive">Must be 1 or a positive integer.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sequence-repeat-pause">Pause between passes (ms)</Label>
            <Input
              id="sequence-repeat-pause"
              type="number"
              min={0}
              value={passPause}
              onChange={(e) => setPassPause(e.target.value)}
              className="font-mono"
              placeholder="0"
              title="Override the sequence's inter-pass pause for this run"
            />
            {!pauseOk && (
              <p className="text-xs text-destructive">Must be 0 or a positive number.</p>
            )}
          </div>
          {selected.length > 0 && (
            <div className="rounded-md border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Send order
              </p>
              <ol className="mt-1 list-decimal pl-5 text-xs space-y-0.5">
                {selected.map((c) => (
                  <li key={c.id} className="truncate">
                    {parseCommandLabel(c.name).displayName}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            Cancel
          </Button>
          <Button disabled={!timesOk || !pauseOk || !selected.length} onClick={submit}>
            <Repeat />
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
