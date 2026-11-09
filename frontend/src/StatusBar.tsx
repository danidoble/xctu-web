// StatusBar.tsx — bottom strip: connection, ws, port summary, theme.
import { useTheme } from "./useTheme";
import { Cpu, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LABELS = { light: "Light", dark: "Dark", system: "System" } as const;

type Props = {
  connected: boolean;
  wsConnected: boolean;
  path: string;
  config: {
    baudRate: number;
    dataBits: number;
    parity: string;
    stopBits: number;
    flowControl: string;
  } | null;
};

export function StatusBar({ connected, wsConnected, path, config }: Props) {
  const { mode, setMode } = useTheme();

  return (
    <footer className="flex items-center gap-3 px-3 py-0 border-t bg-card text-xs text-muted-foreground">
      <Badge variant={connected ? "success" : "destructive"}>
        {connected ? "Connected" : "Disconnected"}
      </Badge>
      <Badge variant={wsConnected ? "secondary" : "outline"}>
        <span
          className={cn(
            "inline-block w-1.5 h-1.5 rounded-full mr-1.5",
            wsConnected ? "bg-success" : "bg-warning animate-pulse",
          )}
        />
        {wsConnected ? "WS live" : "Reconnecting…"}
      </Badge>
      <span className="flex items-center gap-1.5">
        <Cpu className="h-3 w-3" />
        <span className="font-mono">{path || "—"}</span>
      </span>
      {config && (
        <span className="font-mono text-muted-foreground/70">
          {config.baudRate} · {config.dataBits}
          {config.parity[0].toUpperCase()}
          {config.stopBits} · {config.flowControl}
        </span>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-muted-foreground/70">Serial Monitor</span>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Theme">
                  {mode === "light" && <Sun />}
                  {mode === "dark" && <Moon />}
                  {mode === "system" && <Monitor />}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Theme: {LABELS[mode]}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "light" | "dark" | "system")}
            >
              <DropdownMenuRadioItem value="light">
                <Sun />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  );
}
