
import { Button } from "@/components/ui-kits/button/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useUpdateUser, useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { IMembership } from "@blocks-idp/iam/models/user";
import { useT } from "@seliseblocks/genesis-os/i18n";

type RemoveMembershipProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    membership: IMembership;
    organizationName: string;
    userId: string;
    projectKey: string;
    onSuccess?: () => void;
};

export const RemoveMembership = ({
    open,
    onOpenChange,
    membership,
    organizationName,
    userId,
    projectKey,
    onSuccess,
}: RemoveMembershipProps) => {
  const { t } = useT("data.idp.iam");
    const { data: userData } = useGetUserById({ id: userId, projectKey });
    const { mutateAsync, isPending } = useUpdateUser({ id: userId, projectKey });

    const existingMemberships = userData?.data?.memberships || [];

    const onConfirm = async () => {
        try {
            const updatedMemberships = existingMemberships.filter(
                (m) => m.organizationId !== membership.organizationId
            );

            const res = await mutateAsync({
                ...userData?.data,
                memberships: updatedMemberships,
                itemId: userId,
                projectKey,
            });

            if (!res.isSuccess) {
                showErrorToast({ errors: res.errors });
                return;
            }

            showSuccessToast({ description: t("REMOVE_MEMBERSHIP.ORGANIZATION_MEMBERSHIP_REMOVED") });
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            if (isErrorWithErrors(error)) {
                showErrorToast({ errors: error.errors });
            } else {
                showErrorToast({ errors: t("REMOVE_MEMBERSHIP.SOMETHING_WENT_WRONG") });
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("REMOVE_MEMBERSHIP.REMOVE_ORGANIZATION_MEMBERSHIP")}</DialogTitle>
                    <DialogDescription>
                        {t("REMOVE_MEMBERSHIP.ARE_YOU_SURE_YOU_WANT_TO", { organizationName })}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t("common:CANCEL")}
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
                        {isPending ? t("REMOVE_MEMBERSHIP.REMOVING") : t("common:REMOVE")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
