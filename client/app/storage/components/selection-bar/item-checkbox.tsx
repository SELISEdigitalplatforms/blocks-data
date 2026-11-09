import type { KeyboardEvent, MouseEvent } from "react";
import { useT } from "@seliseblocks/genesis-os/i18n";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import type { ItemSelection, SelectableItem } from "@/storage/hooks/use-item-selection";
import { cn } from "@/lib/utils";

// The checkboxes sit inside rows and cards that open the folder or preview the
// file on click, Enter and Space. Ticking a box must not do either.
const stopPropagation = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

interface ItemCheckboxProps {
  name: string;
  checked: boolean;
  onToggle: () => void;
  /** Grid cards show the box on hover only, until something is selected. */
  revealOnHover?: boolean;
  className?: string;
}

/** One row's or card's checkbox. */
export function ItemCheckbox({
  name,
  checked,
  onToggle,
  revealOnHover = false,
  className,
}: Readonly<ItemCheckboxProps>) {
  const { t } = useT("data.storage");
  return (
    <Checkbox
      aria-label={t("ITEM_CHECKBOX.SELECT_NAME", { name })}
      checked={checked}
      onCheckedChange={onToggle}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
      className={cn(
        "bg-background",
        revealOnHover && !checked && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
    />
  );
}

interface SelectAllCheckboxProps {
  label: string;
  items: SelectableItem[];
  selection: ItemSelection;
}

/**
 * A list header's select-all. It covers only the rows passed in, which are the
 * ones loaded so far, and is indeterminate when some but not all of them are ticked.
 */
export function SelectAllCheckbox({ label, items, selection }: Readonly<SelectAllCheckboxProps>) {
  const selectedCount = items.filter((item) => selection.isSelected(item.id)).length;
  let checked: boolean | "indeterminate" = "indeterminate";
  if (selectedCount === 0) checked = false;
  else if (selectedCount === items.length) checked = true;

  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      onCheckedChange={(value) => selection.setAll(items, value === true)}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    />
  );
}
