import { Button } from "@/components/ui-kits/button/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui-kits/command/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui-kits/popover/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import type { RequiredOn } from "../../models/data-service";

const requiredOnOptions: RequiredOn[] = ["None", "Insert", "Update", "Both"];

interface RequiredOnSelectorProps {
  value: RequiredOn;
  onSelect: (value: RequiredOn) => void;
  isReadOnly: boolean;
  isEditMode: boolean;
  ariaLabel: string;
  isMobile?: boolean;
}

export function RequiredOnSelector({
  value,
  onSelect,
  isReadOnly,
  isEditMode,
  ariaLabel,
  isMobile = false,
}: RequiredOnSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isEditMode) {
    return (
      <div
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded="false"
        title={value}
        className="flex h-10 w-full min-w-0 items-center rounded-md border bg-background px-3 text-sm text-foreground"
      >
        <span className="block w-full truncate">{value}</span>
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          title={value}
          disabled={isReadOnly}
          className={cn(
            "h-10 w-full min-w-0 justify-between text-left shadow-none",
            isReadOnly && "cursor-not-allowed bg-muted",
          )}
        >
          <span className="truncate">{value}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0",
          isMobile ? "w-[calc(100vw-2rem)] sm:w-[300px]" : "sm:w-[300px]",
        )}
        align={isMobile ? "start" : "center"}
      >
        <Command>
          <CommandList>
            <CommandGroup heading="Required On">
              {requiredOnOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onSelect(option);
                    setIsOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
