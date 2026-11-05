import { useGetUserById } from "@blocks-idp/iam/hooks/use-user";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { useContext } from "react";
import { userMfaContext } from "./user-mfa";
import { useT } from "@seliseblocks/genesis-os/i18n";

const LoadingSkelton = () => {
  return (
    <>
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="my-2 h-6" />
      <Skeleton className="my-2 h-6" />
    </>
  );
};

export const UserMFADetails = () => {
  const { t } = useT("data.idp.iam");
  const { projectKey, userId } = useContext(userMfaContext);
  const { isLoading, data } = useGetUserById({ id: userId, projectKey });

  if (isLoading) return <LoadingSkelton />;

  return (
    <>
      {data?.data.mfaEnabled ? (
        <div className="text-base font-normal text-high-emphasis">
          {t("USER_MFA_DETAIL.MULTI_FACTOR_AUTHENTICATION_MFA_IS")}
        </div>
      ) : (
        <div className="text-base font-normal text-high-emphasis">
          {t("USER_MFA_DETAIL.MULTI_FACTOR_AUTHENTICATION_MFA_IS_2")}
        </div>
      )}
    </>
  );
};
