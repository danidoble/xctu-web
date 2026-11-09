// PanelCard.tsx — collapsible card wrapper used by every panel.
// Provides a chevron toggle, accessible label, and tight spacing.

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  icon?: React.ReactNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  className?: string;
  children: React.ReactNode;
  bodyClassName?: string;
};

export function PanelCard({
  title,
  icon,
  collapsed,
  onToggleCollapsed,
  className,
  children,
  bodyClassName,
}: Props) {
  const CollapseBtn = (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? `Expand ${title} panel` : `Collapse ${title} panel`}
      aria-expanded={!collapsed}
    >
      {collapsed ? <ChevronDown /> : <ChevronUp />}
    </Button>
  );

  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col h-full min-h-0 min-w-0 overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <h2 className="text-sm font-semibold tracking-tight flex-1 truncate">{title}</h2>
        <Tooltip>
          <TooltipTrigger asChild>{CollapseBtn}</TooltipTrigger>
          <TooltipContent>{collapsed ? "Expand" : "Collapse"}</TooltipContent>
        </Tooltip>
      </header>
      {!collapsed && (
        <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", bodyClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
