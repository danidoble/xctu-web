// ParserConfigPanel.tsx — select parser type + parameters, apply to live port.
import { useEffect, useState } from "react";
import { Check, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Options, ParserConfig } from "@/lib/types";

type Props = { disabled: boolean; initial?: ParserConfig };

export function ParserConfigPanel({ disabled, initial }: Props) {
  const [options, setOptions] = useState<Options | null>(null);
  const [cfg, setCfg] = useState<ParserConfig>(initial ?? { type: "none" });
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    api
      .getOptions()
      .then((o) => {
        setOptions(o);
        setCfg((current) => ({
          ...o.parser.defaults,
          ...(initial ?? current),
        }));
      })
      .catch((e) => setError((e as Error).message));
  }, [initial]);

  // Sync from external state (backend /api/state, loaded profiles) so the form
  // restores after a page reload even if getOptions above resolves late.
  useEffect(() => {
    if (initial) setCfg((current) => ({ ...current, ...initial }));
  }, [initial]);

  const apply = async () => {
    setError("");
    setApplied(false);
    try {
      const r = await api.applyParser(cfg);
      setCfg(r.parser);
      setApplied(true);
      setTimeout(() => setApplied(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const update = <K extends keyof ParserConfig>(k: K, v: ParserConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="parser-type">Type</Label>
        <Select
          value={cfg.type}
          onValueChange={(v) => update("type", v as ParserConfig["type"])}
          disabled={disabled}
        >
          <SelectTrigger id="parser-type">
            <SelectValue placeholder="Select parser" />
          </SelectTrigger>
          <SelectContent>
            {options?.parser.types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cfg.type === "byte-length" && (
        <div className="space-y-1.5">
          <Label htmlFor="parser-length">Bytes per frame</Label>
          <Input
            id="parser-length"
            type="number"
            min={1}
            value={cfg.length ?? 1}
            onChange={(e) => update("length", Number(e.target.value))}
            disabled={disabled}
            className="font-mono"
          />
        </div>
      )}

      {cfg.type === "delimiter" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="parser-delim">
              Delimiter <span className="font-mono text-muted-foreground">(\\n \r \t \0)</span>
            </Label>
            <Input
              id="parser-delim"
              type="text"
              value={cfg.delimiter ?? "\\n"}
              onChange={(e) => update("delimiter", e.target.value)}
              disabled={disabled}
              className="font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="parser-delim-hex"
              checked={!!cfg.delimiterAsHex}
              onCheckedChange={(c) => update("delimiterAsHex", !!c)}
              disabled={disabled}
            />
            <Label htmlFor="parser-delim-hex" className="text-xs font-normal">
              Treat as hex bytes (e.g. <code className="font-mono">AA 55</code>)
            </Label>
          </div>
        </>
      )}

      {cfg.type === "readline" && (
        <div className="space-y-1.5">
          <Label htmlFor="parser-rl">Line ending</Label>
          <Input
            id="parser-rl"
            type="text"
            value={cfg.delimiterReadline ?? "\r\n"}
            onChange={(e) => update("delimiterReadline", e.target.value)}
            disabled={disabled}
            className="font-mono"
          />
        </div>
      )}

      {cfg.type === "regex" && (
        <div className="space-y-1.5">
          <Label htmlFor="parser-regex">Regex pattern</Label>
          <Input
            id="parser-regex"
            type="text"
            value={cfg.regex ?? "\\r?\\n"}
            onChange={(e) => update("regex", e.target.value)}
            disabled={disabled}
            className="font-mono"
          />
        </div>
      )}

      {cfg.type === "inter-byte-timeout" && (
        <div className="space-y-1.5">
          <Label htmlFor="parser-interval">Interval (ms)</Label>
          <Input
            id="parser-interval"
            type="number"
            min={1}
            value={cfg.interval ?? 100}
            onChange={(e) => update("interval", Number(e.target.value))}
            disabled={disabled}
            className="font-mono"
          />
        </div>
      )}

      <Button
        onClick={apply}
        disabled={disabled}
        className="w-full"
        variant={applied ? ("success" as never) : "default"}
      >
        {applied ? <Check /> : <Cog />}
        {applied ? "Applied" : "Apply parser"}
      </Button>

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
