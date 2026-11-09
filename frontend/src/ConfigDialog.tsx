// ConfigDialog.tsx — port connection + parser configuration in one modal,
// separated by tabs. Frees the main view for Commands and Console.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortConfigPanel } from "./PortConfigPanel";
import { ParserConfigPanel } from "./ParserConfigPanel";
import type { ParserConfig, PortConfig } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connected: boolean;
  onConnected: () => void;
  onDisconnected: () => void;
  parserInitial: ParserConfig | null;
  portInitial: PortConfig | null;
};

export function ConfigDialog({
  open,
  onOpenChange,
  connected,
  onConnected,
  onDisconnected,
  parserInitial,
  portInitial,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
          <DialogDescription>Serial port connection and incoming-data parser.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="connection">
          <TabsList className="w-full">
            <TabsTrigger value="connection" className="flex-1">
              Connection
            </TabsTrigger>
            <TabsTrigger value="parser" className="flex-1">
              Parser
            </TabsTrigger>
          </TabsList>
          <TabsContent value="connection" className="pt-4">
            <PortConfigPanel
              connected={connected}
              onConnected={onConnected}
              onDisconnected={onDisconnected}
              initial={portInitial ?? undefined}
            />
          </TabsContent>
          <TabsContent value="parser" className="pt-4">
            <ParserConfigPanel initial={parserInitial ?? undefined} disabled={!connected} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
