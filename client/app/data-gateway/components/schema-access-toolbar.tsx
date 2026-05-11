import { Button } from "@/components/ui-kits/button/button";
import { Input } from "@/components/ui-kits/input/input";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Search } from "lucide-react";

type SchemaAccessToolbarProps = {
  isEditing: boolean;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onAdd: () => void;
  className?: string;
};

export function SchemaAccessToolbar({
  isEditing,
  isSaving = false,
  hasUnsavedChanges = false,
  onEdit,
  onSave,
  onCancel,
  onAdd,
  className,
}: SchemaAccessToolbarProps) {
  if (isEditing) {
    return (
      <div className={cn("flex flex-col gap-3 md:flex-row md:items-center md:justify-between", className)}>
        {/* Search Input */}
        <div className="relative flex w-full md:min-w-[220px] md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search" className="h-10 w-full rounded-md pl-9" />
        </div>

        {/* Action Buttons */}
        <div className="flex w-full items-center gap-2 md:w-auto">
          <Button
            variant="outline"
            size="default"
            className="flex-1 gap-2 md:flex-none"
            onClick={onAdd}
            disabled={isSaving}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
          <Button
            variant="outline"
            size="default"
            className="flex-1 gap-2 md:flex-none"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            size="default"
            className="flex-1 gap-2 md:flex-none"
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Search Input - Flexible Width */}
      <div className="relative flex flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search" className="h-10 w-full rounded-md pl-9" />
      </div>

      {/* Edit Button */}
      <Button
        variant="outline"
        size="default"
        className="gap-2 whitespace-nowrap"
        onClick={onEdit}
        disabled={isSaving}
      >
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
    </div>
  );
}
