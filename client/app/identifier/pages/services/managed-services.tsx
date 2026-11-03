import { ServiceList } from "./service-list";
import { GuideLineWrapper } from "@/identifier/components/guideline/guideline-wrapper";
import { useState } from "react";
import { managedServicesGuidelineSteps } from "./guideline-docs";
import { useT } from "@seliseblocks/genesis-os/i18n";

interface ManagedServicesProps {
  guideOpen?: boolean;
  onGuideOpenChange?: (open: boolean) => void;
}

export const ManagedServices = ({ guideOpen, onGuideOpenChange }: ManagedServicesProps = {}) => {
  const { t } = useT("data.console");
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  
  const open = guideOpen !== undefined ? guideOpen : internalOpen;
  const setOpen = onGuideOpenChange || setInternalOpen;

  return (
    <>
      <ServiceList />
      <GuideLineWrapper
        title={t("MANAGED_SERVICES.GUIDELINE")}
        open={open}
        onOpenChange={setOpen}
        content={managedServicesGuidelineSteps}
      />
    </>
  );
};
