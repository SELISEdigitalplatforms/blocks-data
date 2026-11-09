import { SheetFooter } from "@/components/ui-kits/sheet/sheet";
import { Button } from "@/components/ui-kits/button/button";
import { useT } from "@seliseblocks/genesis-os/i18n";

type MembershipFooterProps = {
  isEditing: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
  onEdit: () => void;
  onUnassign: () => void;
};

export const MembershipFooter = ({
  isEditing,
  isPending,
  onCancel,
  onSave,
  onEdit,
  onUnassign,
}: MembershipFooterProps) => {
  const { t } = useT("data.idp.iam");
  return (
  <SheetFooter className="mt-auto flex gap-2">
    {isEditing ? (
      <>
        <Button variant="outline" onClick={onCancel} className="flex-1">
          {t("common:CANCEL")}
        </Button>
        <Button onClick={onSave} disabled={isPending} className="flex-1">
          {isPending ? t("MEMBERSHIP_FOOTER.SAVING") : t("common:SAVE")}
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="outline"
          onClick={onUnassign}
          className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
        >
          {t("MEMBERSHIP_FOOTER.UNASSIGN_USER")}
        </Button>
        <Button variant="outline" onClick={onEdit} className="flex-1">
          {t("common:EDIT")}
        </Button>
      </>
    )}
  </SheetFooter>
);
};
