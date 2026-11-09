import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type Props = {
  onProfileLoaded: (profile: FullProfile) => void;
  onWorkspaceReset: () => void;
  layoutSnapshot: import("@/lib/types").LayoutSnapshot;
};

export const ACTIVE_PROFILE_KEY = "serial-monitor-active-profile";
const ACTIVE_PROFILE_EVENT = "serial-monitor-active-profile-changed";

export function announceActiveProfile(slot: number | null) {
  if (slot == null) window.localStorage.removeItem(ACTIVE_PROFILE_KEY);
  else window.localStorage.setItem(ACTIVE_PROFILE_KEY, String(slot));
  window.dispatchEvent(new CustomEvent(ACTIVE_PROFILE_EVENT, { detail: slot }));
}

export function ProfileSwitcher({ onProfileLoaded, onWorkspaceReset, layoutSnapshot }: Props) {
  const [profiles, setProfiles] = useState<ProfileSlot[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(() => {
    const stored = Number(window.localStorage.getItem(ACTIVE_PROFILE_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onActiveProfileChanged = (event: Event) =>
      setActiveSlot((event as CustomEvent<number | null>).detail);
    window.addEventListener(ACTIVE_PROFILE_EVENT, onActiveProfileChanged);
    return () => window.removeEventListener(ACTIVE_PROFILE_EVENT, onActiveProfileChanged);
  }, []);

  const refresh = async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch (e) {
      toast.error(`Could not load profiles: ${(e as Error).message}`);
    }
  };

  const load = async (profile: ProfileSlot) => {
    setBusy(true);
    try {
      if (activeSlot && activeSlot !== profile.slot) {
        const current = await api.getProfile();
        const currentMeta = profiles.find((item) => item.slot === activeSlot);
        await api.saveProfileSlot(activeSlot, {
          ...current,
          name: currentMeta?.name || `Profile ${activeSlot}`,
          layout: layoutSnapshot,
        });
      }
      if (!profile.name) {
        const empty = await api.emptyWorkspace();
        await api.saveProfileSlot(profile.slot, {
          name: `Profile ${profile.slot}`,
          port: empty.config,
          parser: empty.parser,
          commands: [],
          sequences: [],
          layout: layoutSnapshot,
        });
        onWorkspaceReset();
        onProfileLoaded({
          name: `Profile ${profile.slot}`,
          port: empty.config,
          parser: empty.parser,
          commands: [],
          sequences: [],
          layout: layoutSnapshot,
        });
        announceActiveProfile(profile.slot);
        toast.success(`Started empty profile ${profile.slot}`);
        return;
      }
      const loaded = await api.loadProfileSlot(profile.slot);
      onWorkspaceReset();
      onProfileLoaded(loaded);
      announceActiveProfile(profile.slot);
      toast.success(`Switched to ${profile.name || `profile ${profile.slot}`}`);
    } catch (e) {
      toast.error(`Profile switch failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) refresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={busy}>
          <Users />
          {activeSlot ? `Active: Profile ${activeSlot}` : "Active: none"}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-92">
        <DropdownMenuLabel>Saved profiles</DropdownMenuLabel>
        <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground">
          Active: {activeSlot ? `Profile ${activeSlot}` : "none"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!profiles.length && <DropdownMenuItem disabled>No profile slots</DropdownMenuItem>}
        {profiles.map((profile) => (
          <DropdownMenuItem key={profile.slot} onSelect={() => load(profile)}>
            {activeSlot === profile.slot ? (
              <Check />
            ) : profile.name ? (
              <span className="w-4" />
            ) : (
              <Plus />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate">
                Profile {profile.slot} · {profile.name || "Use empty slot"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {profile.savedAt
                  ? new Date(profile.savedAt).toLocaleString()
                  : "Start a clean workspace here"}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
