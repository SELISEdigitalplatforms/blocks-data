import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { clearQueryString } from "@/lib/utils";
import { InviteUser } from "@blocks-idp/iam/modules/user-management/invite-user/invite-user";
import { Users } from "@blocks-idp/iam/modules/user-management/users";
import { SignupSettings } from "@blocks-idp/iam/modules/user-management/signup-settings";
import { useQueryState } from "nuqs";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const IamManagement = () => {
  const { t } = useT("data.idp.iam");
  const [tabId, setTabId] = useQueryState("tab", { defaultValue: "users" });

  return (
    <main className="flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-2xl font-bold tracking-tight">{t("IAM_MANAGEMENT.IDENTITY_AND_ACCESS_MANAGEMENT")}</h3>
        </div>
      </div>

      <Tabs
        defaultValue={tabId}
        onValueChange={(value: string) => {
          clearQueryString();
          setTabId(value);
        }}
      >
        <div className="mb-5 mt-6 flex items-center justify-between rounded text-base">
          <TabsList>
            <TabsTrigger value="users">{t("IAM_MANAGEMENT.USERS")}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <SignupSettings />
            <InviteUser />
          </div>
        </div>
        <TabsContent value="users">
          <Users />
        </TabsContent>
      </Tabs>
    </main>
  );
};
