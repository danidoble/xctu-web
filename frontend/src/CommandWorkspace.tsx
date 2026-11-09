import { CommandList } from "./CommandList";
import { SequenceList } from "./SequenceList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Command } from "@/lib/types";

export function CommandWorkspace({
  onSend,
  connected,
}: {
  onSend: (command: Command) => void;
  connected: boolean;
}) {
  return (
    <Tabs defaultValue="commands" className="h-full min-h-0 gap-0">
      <TabsList className="mx-3 mt-2 shrink-0" aria-label="Commands workspace">
        <TabsTrigger value="commands">Commands</TabsTrigger>
        <TabsTrigger value="sequences">Sequences</TabsTrigger>
      </TabsList>
      <TabsContent value="commands" className="min-h-0">
        <CommandList onSend={onSend} connected={connected} />
      </TabsContent>
      <TabsContent value="sequences" className="min-h-0">
        <SequenceList onSend={onSend} connected={connected} />
      </TabsContent>
    </Tabs>
  );
}
