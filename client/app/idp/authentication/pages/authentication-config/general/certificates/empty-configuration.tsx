

import { Card, CardContent } from "@/components/ui-kits/card/card";
import { AddEditProviderModal } from "./add-edit-provider-modal";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const EmptyConfiguration = () => {
  const { t } = useT("data.idp.authentication");
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-between gap-3">
        <p>{t("EMPTY_CONFIGURATION.NO_PROVIDER_CONFIGURED")}</p>
        <AddEditProviderModal />
      </CardContent>
    </Card>
  );
};
