"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui-kits/button/button";

interface ResetButtonProps {
  isActive: boolean;
  onReset: () => void;
}

export function ResetButton({ isActive, onReset }: ResetButtonProps) {
  if (!isActive) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={onReset}
      title="Reset all filters"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Reset
    </Button>
  );
}
