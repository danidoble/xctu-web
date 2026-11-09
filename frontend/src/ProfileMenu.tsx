// ProfileMenu.tsx — single dropdown in the header. Replaces the 6-button bar.

import { useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Database,
  FileJson,
  FileUp,
  FolderOpen,
  RotateCcw,
  Trash2,
  Save,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { FullProfile, ProfileSlot } from "@/lib/types";
import { announceActiveProfile } from "./ProfileSwitcher";

type Props = {
  onCommandsChanged: () => void;
  onProfileLoaded: (p: FullProfile) => void;
  onWorkspaceReset: () => void;
  /** Called with the current layout snapshot so callers can persist it. */
  layoutSnapshot: import("@/lib/types").LayoutSnapshot;
};

export function ProfileMenu({
  onCommandsChanged,
  onProfileLoaded,
  onWorkspaceReset,
  layoutSnapshot,
}: Props) {
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const workspaceInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileSlot[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmProfileDelete, setConfirmProfileDelete] = useState<ProfileSlot | null>(null);

  const refreshProfiles = async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch (e) {
      toast.error(`Could not load profiles: ${(e as Error).message}`);
    }
  };

  const importXml = async (file: File) => {
    setBusy(true);
    try {
      const xml = await file.text();
      const r = await api.importXml(xml);
      toast.success(`Imported ${r.count} commands from XML`);
      onCommandsChanged();
    } catch (e) {
      toast.error(`XML import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportXml = () => {
    toast.info("Exporting XML…");
    window.location.href = api.exportXmlUrl();
  };

  const exportProfile = async () => {
    setBusy(true);
    try {
      const profile = await api.getProfile();
      const blob = new Blob([JSON.stringify({ ...profile, layout: layoutSnapshot }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `serial-monitor-profile-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Profile exported (commands + sequences + port + parser + layout)");
    } catch (e) {
      toast.error(`Profile export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const importProfile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const profile = JSON.parse(text) as FullProfile;
      const r = await api.importProfile(profile);
      const slots = await api.listProfiles();
      const available = slots.find((slot) => !slot.name);
      if (available) {
        await api.saveProfileSlot(available.slot, {
          ...profile,
          name: profile.name || `Imported profile ${available.slot}`,
          port: r.port ?? profile.port ?? null,
          parser: r.parser ?? profile.parser ?? null,
          commands: r.commands,
          sequences: r.sequences ?? profile.sequences ?? [],
        });
        announceActiveProfile(available.slot);
      }
      onProfileLoaded({
        port: r.port ?? profile.port ?? null,
        parser: r.parser ?? profile.parser ?? null,
        commands: r.commands,
        layout: profile.layout,
      });
      toast.success(
        `Profile imported: ${r.commands.length} commands loaded${available ? ` into profile ${available.slot}` : ""}`,
      );
    } catch (e) {
      toast.error(`Profile import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportWorkspace = async () => {
    setBusy(true);
    try {
      const workspace = await api.exportWorkspace();
      const blob = new Blob(
        [
          JSON.stringify(
            {
              ...workspace,
              activeSlot:
                Number(window.localStorage.getItem("serial-monitor-active-profile")) || null,
              active: { ...workspace.active, layout: layoutSnapshot },
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `serial-monitor-workspace-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Workspace exported (${workspace.profiles.filter(Boolean).length} profiles)`);
    } catch (e) {
      toast.error(`Workspace export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const importWorkspace = async (file: File) => {
    setBusy(true);
    try {
      const workspace = JSON.parse(await file.text()) as {
        active: FullProfile;
        profiles?: (FullProfile | null)[];
        activeSlot?: number | null;
      };
      if (!workspace.active) throw new Error("not a workspace export");
      const result = await api.importWorkspace(workspace);
      onWorkspaceReset();
      announceActiveProfile(workspace.activeSlot ?? null);
      onProfileLoaded({ ...result.active, layout: workspace.active.layout });
      await refreshProfiles();
      toast.success(`Workspace imported (${result.profiles.filter(Boolean).length} profiles)`);
    } catch (e) {
      toast.error(`Workspace import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveServerProfile = async () => {
    setBusy(true);
    try {
      const profile = await api.getProfile();
      const r = await api.saveProfile({
        ...profile,
        layout: layoutSnapshot,
        name: "Working profile",
      });
      toast.success(`Saved server-side profile (${new Date(r.savedAt).toLocaleTimeString()})`);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const loadServerProfile = async () => {
    setBusy(true);
    try {
      const r = await api.loadSavedProfile();
      if (!r.ok) {
        toast.warning("No saved profile on server");
        return;
      }
      onProfileLoaded({
        port: r.port,
        parser: r.parser,
        commands: r.commands,
        savedAt: r.savedAt,
        layout: (r as unknown as { layout?: import("@/lib/types").LayoutSnapshot }).layout,
      });
      toast.success(`Loaded server profile (${r.commands.length} commands)`);
    } catch (e) {
      toast.error(`Load failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const openProfiles = async () => {
    setProfilesOpen(true);
    await refreshProfiles();
  };

  const saveToSlot = async (slot: number) => {
    setBusy(true);
    try {
      const profile = await api.getProfile();
      await api.saveProfileSlot(slot, {
        ...profile,
        layout: layoutSnapshot,
        name: `Profile ${slot}`,
      });
      await refreshProfiles();
      toast.success(`Saved to profile ${slot}`);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const loadFromSlot = async (slot: number) => {
    setBusy(true);
    try {
      const profile = await api.loadProfileSlot(slot);
      onWorkspaceReset();
      announceActiveProfile(slot);
      onProfileLoaded(profile);
      toast.success(`Loaded ${profile.name || `profile ${slot}`}`);
    } catch (e) {
      toast.error(`Load failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteProfileSlot = async () => {
    if (!confirmProfileDelete) return;
    setBusy(true);
    try {
      await api.deleteProfileSlot(confirmProfileDelete.slot);
      if (
        Number(window.localStorage.getItem("serial-monitor-active-profile")) ===
        confirmProfileDelete.slot
      )
        announceActiveProfile(null);
      setConfirmProfileDelete(null);
      await refreshProfiles();
      toast.success(`Deleted profile ${confirmProfileDelete.slot}`);
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const resetWorkspace = async () => {
    setBusy(true);
    try {
      const result = await api.resetWorkspace();
      onWorkspaceReset();
      announceActiveProfile(null);
      onProfileLoaded({
        port: result.config,
        parser: result.parser,
        commands: [],
        sequences: [],
      });
      setConfirmReset(false);
      toast.success("Workspace reset for a new device");
    } catch (e) {
      toast.error(`Reset failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={xmlInputRef}
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importXml(f);
          e.target.value = "";
        }}
      />
      <input
        ref={profileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importProfile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={workspaceInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importWorkspace(f);
          e.target.value = "";
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={busy}>
            Profile <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Commands (XML)</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => xmlInputRef.current?.click()}>
            <Upload />
            Import XML…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportXml}>
            <Download />
            Export XML
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Full profile (commands + sequences + settings)</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => profileInputRef.current?.click()}>
            <FileUp />
            Import profile…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportProfile}>
            <FileJson />
            Export profile
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Complete workspace</DropdownMenuLabel>
          <DropdownMenuItem onSelect={exportWorkspace}>
            <Database />
            Export workspace…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => workspaceInputRef.current?.click()}>
            <FileUp />
            Import workspace…
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuItem onSelect={openProfiles}>
            <FolderOpen />
            Manage profiles…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmReset(true)} className="text-destructive">
            <RotateCcw />
            Reset workspace…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profilesOpen} onOpenChange={setProfilesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Device profiles</DialogTitle>
            <DialogDescription>
              Save up to 50 complete setups and switch between them without importing files again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {profiles.map((profile) => (
              <div key={profile.slot} className="flex items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Profile {profile.slot}: {profile.name || "Empty"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.savedAt
                      ? `Saved ${new Date(profile.savedAt).toLocaleString()}`
                      : "Available slot"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveToSlot(profile.slot)}
                  disabled={busy}
                >
                  <Save />
                  Save
                </Button>
                <Button
                  size="sm"
                  onClick={() => loadFromSlot(profile.slot)}
                  disabled={busy || !profile.name}
                >
                  <FolderOpen />
                  Load
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete profile ${profile.slot}`}
                        className="text-destructive"
                        onClick={() => setConfirmProfileDelete(profile)}
                        disabled={busy || !profile.name}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Delete profile</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset workspace?</DialogTitle>
            <DialogDescription>
              This disconnects the port, removes commands, sequences and all saved profiles, and
              restores the default connection and parser settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={resetWorkspace}>
              <RotateCcw />
              Reset workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmProfileDelete}
        onOpenChange={(open) => !open && setConfirmProfileDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete profile?</DialogTitle>
            <DialogDescription>
              &quot;{confirmProfileDelete?.name}&quot; will be removed from profile{" "}
              {confirmProfileDelete?.slot}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmProfileDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={deleteProfileSlot}>
              <Trash2 />
              Delete profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
