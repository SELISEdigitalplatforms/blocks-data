import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { DmsItemList } from "../../components/dms-item-list/dms-item-list";
import { useDeleteFromTrash, useDmsTrash, useRestoreFromTrash } from "../../hooks/use-dms";
import { DmsItem, DmsItemType } from "../../models/dms.model";
import { itemActions } from "../../utils/permission-actions";

const FILTERS: { label: string; value: DmsItemType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Folders", value: "folder" },
  { label: "Files", value: "file" },
];

/**
 * The trash: archived folders and files, with restore and permanent delete.
 *
 * Permanent delete is the only irreversible action in the storage UI, so it sits
 * behind a confirmation and is offered only where the item's own flags allow a
 * delete. Restore is gated the same way, because putting something back is the
 * same authority as having removed it.
 */
export function Trash() {
  const [type, setType] = useState<DmsItemType | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<DmsItem | null>(null);

  const query = useDmsTrash(type === "all" ? {} : { type });
  const restore = useRestoreFromTrash();
  const permanentDelete = useDeleteFromTrash();

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  const handleRestore = async (item: DmsItem) => {
    try {
      await restore.mutateAsync(item.itemId);
      showSuccessToast({ title: "Restored", description: `${item.name} is back in its folder.` });
    } catch {
      showErrorToast({ title: "Could not restore", errors: `${item.name} was not restored.` });
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setPendingDelete(null);

    try {
      await permanentDelete.mutateAsync(item.itemId);
      showSuccessToast({ title: "Deleted", description: `${item.name} was permanently deleted.` });
    } catch {
      showErrorToast({ title: "Could not delete", errors: `${item.name} was not deleted.` });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={type === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setType(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <DmsItemList
        items={items}
        isLoading={query.isLoading}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => query.fetchNextPage()}
        emptyMessage="The trash is empty."
        renderActions={(item) => {
          const actions = itemActions(item);
          if (!actions.canDelete) {
            // Without delete there is nothing to offer: restoring and purging are
            // both the same authority as having removed it in the first place.
            return null;
          }

          return (
            <span className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(item)}
                disabled={restore.isPending}
              >
                Restore
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setPendingDelete(item)}>
                Delete
              </Button>
            </span>
          );
        }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <ConfirmationModal
          data={{
            dialogTitle: "Delete permanently",
            dialogSubtitle: `${pendingDelete?.name ?? "This item"} will be removed for good. This cannot be undone.`,
            confirmButton: "Delete permanently",
            cancelButton: "Cancel",
          }}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      </Dialog>
    </div>
  );
}
