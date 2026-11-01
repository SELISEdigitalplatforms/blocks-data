import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";
import { Button } from "@/components/ui-kits/button/button";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { DmsItemList } from "../../components/dms-item-list/dms-item-list";
import { useDeleteFromTrash, useDmsTrash, useRestoreFromTrash } from "../../hooks/use-dms";
import { DmsItem, DmsItemType } from "../../models/dms.model";
import { itemActions } from "../../utils/permission-actions";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_STORAGE_MODULE = "data.storage";

const FILTERS: { label: string; value: DmsItemType | "all" }[] = [
  { get label() { return tStatic(DATA_STORAGE_MODULE, "common:ALL"); }, value: "all" },
  { get label() { return tStatic(DATA_STORAGE_MODULE, "TRASH.DIRECTORYS"); }, value: "directory" },
  { get label() { return tStatic(DATA_STORAGE_MODULE, "TRASH.FILES"); }, value: "file" },
];

/**
 * The trash: archived directorys and files, with restore and permanent delete.
 *
 * Permanent delete is the only irreversible action in the storage UI, so it sits
 * behind a confirmation and is offered only where the item's own flags allow a
 * delete. Restore is gated the same way, because putting something back is the
 * same authority as having removed it.
 */
export function Trash() {
  const { t } = useT(DATA_STORAGE_MODULE);
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
      showSuccessToast({ title: t("TRASH.RESTORED"), description: t("TRASH.NAME_IS_BACK_IN_ITS_DIRECTORY", { name: item.name }) });
    } catch {
      showErrorToast({ title: t("TRASH.COULD_NOT_RESTORE"), errors: t("TRASH.NAME_WAS_NOT_RESTORED", { name: item.name }) });
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setPendingDelete(null);

    try {
      await permanentDelete.mutateAsync(item.itemId);
      showSuccessToast({ title: t("TRASH.DELETED"), description: t("TRASH.NAME_WAS_PERMANENTLY_DELETED", { name: item.name }) });
    } catch {
      showErrorToast({ title: t("TRASH.COULD_NOT_DELETE"), errors: t("TRASH.NAME_WAS_NOT_DELETED", { name: item.name }) });
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
        emptyMessage={t("TRASH.THE_TRASH_IS_EMPTY")}
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
                {t("TRASH.RESTORE")}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setPendingDelete(item)}>
                {t("common:DELETE")}
              </Button>
            </span>
          );
        }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <ConfirmationModal
          data={{
            dialogTitle: t("TRASH.DELETE_PERMANENTLY"),
            dialogSubtitle: t("TRASH.NAME_WILL_BE_REMOVED_FOR_GOOD", { name: pendingDelete?.name ?? t("TRASH.THIS_ITEM") }),
            confirmButton: t("TRASH.DELETE_PERMANENTLY"),
            cancelButton: t("common:CANCEL"),
          }}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      </Dialog>
    </div>
  );
}
