// PortConfigPanel.tsx — pick port + open options, connect/disconnect.
import { useEffect, useState } from "react";
import { Loader2, Plug, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import type { Options, PortConfig, PortInfo } from "@/lib/types";

type Props = {
  connected: boolean;
  onConnected: () => void;
  onDisconnected: () => void;
  initial?: PortConfig;
};

export function PortConfigPanel({ connected, onConnected, onDisconnected, initial }: Props) {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [cfg, setCfg] = useState({
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
  });
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [ps, opts] = await Promise.all([api.listPorts(), api.getOptions()]);
      setPorts(ps);
      setOptions(opts);
      if (!selected && ps.length) setSelected(ps[0].path);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    refresh();
    // Sync with the backend on reload: if a port is already open, prefill the
    // form with its live config instead of falling back to the 9600 defaults.
    api
      .getState()
      .then((s) => {
        if (s.config) {
          setCfg({
            baudRate: Number(s.config.baudRate),
            dataBits: Number(s.config.dataBits),
            stopBits: Number(s.config.stopBits),
            parity: s.config.parity,
            flowControl: s.config.flowControl,
          });
        }
        if (s.open) {
          if (s.path) setSelected(s.path);
          onConnected();
        }
      })
      .catch(() => {
        /* server not up — ignore */
      });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  useEffect(() => {
    if (!initial) return;
    setCfg({
      baudRate: Number(initial.baudRate),
      dataBits: Number(initial.dataBits),
      stopBits: Number(initial.stopBits),
      parity: initial.parity,
      flowControl: initial.flowControl,
    });
  }, [initial]);

  const onChange = (k: string, v: string | number) => setCfg((c) => ({ ...c, [k]: v }));

  const connect = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.connect({ path: selected, ...cfg });
      onConnected();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      await api.disconnect();
      onDisconnected();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="port-select">Port</Label>
        <div className="flex gap-2">
          <Select value={selected} onValueChange={setSelected} disabled={connected}>
            <SelectTrigger id="port-select" className="flex-1">
              <SelectValue placeholder={ports.length === 0 ? "(no ports detected)" : undefined} />
            </SelectTrigger>
            <SelectContent>
              {ports.length === 0 && (
                <SelectItem value="__none__" disabled>
                  (no ports detected)
                </SelectItem>
              )}
              {ports.map((p) => (
                <SelectItem key={p.path} value={p.path}>
                  {p.path}
                  {p.manufacturer ? ` · ${p.manufacturer}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={refresh}
                disabled={connected}
                aria-label="Refresh ports"
              >
                <RefreshCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh ports</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Baud" id="cfg-baud">
          <Select
            value={String(cfg.baudRate)}
            onValueChange={(v) => onChange("baudRate", Number(v))}
            disabled={connected}
          >
            <SelectTrigger id="cfg-baud">
              <SelectValue placeholder="Select baud" />
            </SelectTrigger>
            <SelectContent>
              {(options?.port.baudRate ?? []).map((b) => (
                <SelectItem key={b} value={String(b)}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data bits" id="cfg-data">
          <Select
            value={String(cfg.dataBits)}
            onValueChange={(v) => onChange("dataBits", Number(v))}
            disabled={connected}
          >
            <SelectTrigger id="cfg-data">
              <SelectValue placeholder="Select bits" />
            </SelectTrigger>
            <SelectContent>
              {(options?.port.dataBits ?? []).map((b) => (
                <SelectItem key={b} value={String(b)}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Parity" id="cfg-parity">
          <Select
            value={cfg.parity}
            onValueChange={(v) => onChange("parity", v)}
            disabled={connected}
          >
            <SelectTrigger id="cfg-parity">
              <SelectValue placeholder="Select parity" />
            </SelectTrigger>
            <SelectContent>
              {(options?.port.parity ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Stop bits" id="cfg-stop">
          <Select
            value={String(cfg.stopBits)}
            onValueChange={(v) => onChange("stopBits", Number(v))}
            disabled={connected}
          >
            <SelectTrigger id="cfg-stop">
              <SelectValue placeholder="Select stop bits" />
            </SelectTrigger>
            <SelectContent>
              {(options?.port.stopBits ?? []).map((b) => (
                <SelectItem key={b} value={String(b)}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Flow control" id="cfg-flow">
        <Select
          value={cfg.flowControl}
          onValueChange={(v) => onChange("flowControl", v)}
          disabled={connected}
        >
          <SelectTrigger id="cfg-flow">
            <SelectValue placeholder="Select flow" />
          </SelectTrigger>
          <SelectContent>
            {(options?.port.flowControl ?? []).map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {!connected ? (
        <Button onClick={connect} disabled={busy || !selected} className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Connect
        </Button>
      ) : (
        <Button onClick={disconnect} disabled={busy} variant="destructive" className="w-full">
          {busy ? <Loader2 className="animate-spin" /> : <Plug />}
          Disconnect
        </Button>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
