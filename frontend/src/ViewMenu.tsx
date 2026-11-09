// ViewMenu.tsx — pick layout template + reset to defaults.

import {
  ChevronDown,
  LayoutGrid,
  LayoutPanelTop,
  LayoutTemplate as LayoutTemplateIcon,
  Rows,
  SquareSplitHorizontal,
  SquareSplitVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { LayoutTemplate } from "@/lib/useLayout";

type Props = {
  template: LayoutTemplate;
  onTemplateChange: (t: LayoutTemplate) => void;
  onReset: () => void;
};

function Columns() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

const TEMPLATES: {
  id: LayoutTemplate;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "console-top", label: "Console top", icon: <SquareSplitVertical /> },
  {
    id: "console-right",
    label: "Console right",
    icon: <SquareSplitHorizontal />,
  },
  { id: "sidebar", label: "Sidebar", icon: <LayoutPanelTop /> },
  { id: "columns", label: "Three cols", icon: <Columns /> },
  { id: "stacked", label: "Stacked", icon: <Rows /> },
  { id: "quad", label: "Quad", icon: <LayoutGrid /> },
];

export function ViewMenu({ template, onTemplateChange, onReset }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <LayoutTemplateIcon />
          View <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={template}
          onValueChange={(v) => onTemplateChange(v as LayoutTemplate)}
        >
          {TEMPLATES.map((t) => (
            <DropdownMenuRadioItem key={t.id} value={t.id}>
              {t.icon}
              <span>{t.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}>Reset to defaults</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
