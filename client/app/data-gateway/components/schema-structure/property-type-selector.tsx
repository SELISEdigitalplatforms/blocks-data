import { Button } from "@/components/ui-kits/button/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kits/popover/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { typeOptions } from "../../constants/input-restrictions";
import { ISchemaDetails } from "../../models/data-service";

interface PropertyTypeSelectorProps {
  index: number;
  value: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: string) => void;
  isReadOnly: boolean;
  isEditMode: boolean;
  schemaItems: ISchemaDetails[];
  onSearchChange: (value: string) => void;
  searchText: string;
  isMobile?: boolean;
  /** When true, applies colorful styling to highlight child schema types */
  isChildType?: boolean;
}

export function PropertyTypeSelector({
  value,
  isOpen,
  onOpenChange,
  onSelect,
  isReadOnly,
  isEditMode,
  schemaItems,
  onSearchChange,
  searchText,
  isMobile = false,
  isChildType = false,
}: PropertyTypeSelectorProps) {
  const childTypeStyles = isChildType
    ? "border-primary/50 bg-primary/5 text-primary font-medium"
    : "";

  if (!isEditMode) {
    const typeLabel = value || "Select type...";
    return (
      <div
        title={typeLabel}
        className={cn(
          "flex h-10 w-full min-w-0 items-center rounded-md border px-3 text-sm",
          "bg-background text-foreground",
          childTypeStyles,
        )}
      >
        <span className="block w-full truncate">{typeLabel}</span>
      </div>
    );
  }

  const typeLabel = value || "Select type...";
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          title={typeLabel}
          className={cn(
            "h-10 w-full min-w-0 justify-between text-left shadow-none",
            isReadOnly && "cursor-not-allowed bg-muted",
            isChildType && !isReadOnly && "border-primary/50 bg-primary/5 text-primary",
          )}
          disabled={isReadOnly}
        >
          <span className="truncate">{typeLabel}</span>
          <ChevronsUpDown
            className={cn("ml-2 h-4 w-4 shrink-0", isChildType ? "text-primary opacity-70" : "opacity-50")}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0", isMobile ? "w-[calc(100vw-2rem)] sm:w-[300px]" : "sm:w-[300px]")}
        align={isMobile ? "start" : "center"}
      >
        <Command>
          <CommandInput placeholder="Search types..." onValueChange={onSearchChange} />
          <CommandList>
            <CommandEmpty>No type found.</CommandEmpty>
            <CommandGroup heading="Primitive Types">
              {typeOptions
                .filter((type) => type.toLowerCase().includes(searchText.toLowerCase()))
                .map((type) => (
                  <CommandItem key={type} value={type} onSelect={() => onSelect(type)}>
                    <Check
                      className={cn("mr-2 h-4 w-4", value === type ? "opacity-100" : "opacity-0")}
                    />
                    {type}
                  </CommandItem>
                ))}
            </CommandGroup>

            {schemaItems.length > 0 && (
              <CommandGroup heading="Child Types">
                {schemaItems.map((item) => (
                  <CommandItem
                    key={item.schemaName}
                    value={item.schemaName}
                    onSelect={() => onSelect(item.schemaName)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === item.schemaName ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.schemaName}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
