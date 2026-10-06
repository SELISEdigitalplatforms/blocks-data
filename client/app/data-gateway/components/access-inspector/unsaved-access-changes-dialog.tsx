import { Button } from "@/components/ui-kits/button/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";

/**
 * The panel now holds unsaved changes — a staged rule set, a picked-but-not-
 * saved tier — instead of sending them the instant Save is clicked inside the
 * rule editor. Closing the inspector or switching to a different field's
 * access used to just silently drop whatever was staged; this is the
 * checkpoint that stops that, matching `ConfirmationModal`'s pattern of
 * returning bare `DialogContent` for the caller to wrap in its own `Dialog`.
 */
export function UnsavedAccessChangesDialog({
  onSave,
  onDiscard,
  isSaving,
}: {
  onSave: () => void;
  onDiscard: () => void;
  isSaving?: boolean;
}) {
  return (
    <DialogContent
      className="mr-4 w-full max-w-[425px] rounded-md"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.style.pointerEvents = "";
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-left text-lg font-semibold leading-7">
          Save changes?
        </DialogTitle>
        <DialogDescription className="mb-2 mt-2 break-words text-left text-sm font-normal leading-5 text-medium-emphasis">
          This access rule has unsaved changes. Save them before leaving, or discard them.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDiscard}
          disabled={isSaving}
        >
          Discard
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
          Save changes
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
