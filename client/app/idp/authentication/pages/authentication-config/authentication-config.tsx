import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kits/tabs/tabs";
import { TabsContent } from "@radix-ui/react-tabs";
import { useQueryState } from "nuqs";
import { GrantTypes } from "./general/grant-types";
import { GeneralSettings } from "./general/settings";
import { AuthenticationTabs } from "@blocks-idp/authentication/constants/authentication.constant";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { Permissions } from "@blocks-idp/iam/modules/permission-management";
import { AddRole, Roles } from "@blocks-idp/iam/modules/role-management";
import { PrimaryButton } from "@/components/action-buttons/primary-button";
import { Link } from "react-router";

export const AuthenticationConfig = () => {
  const [selectedTab, setSelectedTab] = useQueryState("tab", { defaultValue: "general" });

  return (
    <div>
      <div className="mb-[18px] flex items-center justify-between md:mb-[24px]">
        <h1 className="text-lg font-semibold md:text-2xl">IDP</h1>
      </div>
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value)}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <>
            <div className="hidden w-full overflow-x-auto sm:block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList className="w-max">
                {AuthenticationTabs.map((item) => (
                  <TabsTrigger key={item.id} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="sm:hidden">
              <Select value={selectedTab} onValueChange={(value) => setSelectedTab(value)}>
                <SelectTrigger className="w-32 gap-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AuthenticationTabs.map((item) => (
                    <SelectItem key={item.id} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>

          <>
            {selectedTab === "roles" && <AddRole />}
            {selectedTab === "permissions" && (
              <Link to="/services/iam/permission-detail/new">
                <PrimaryButton label="Add Permission" />
              </Link>
            )}
          </>
        </div>
        <TabsContent value="general" className="grid grid-cols-1 gap-6">
          <GeneralSettings />
          <GrantTypes />
        </TabsContent>
        <TabsContent value="signin-flow">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Signin flow</h3>
            <p className="text-muted-foreground mt-2">Configure your signin flow settings</p>
          </div>
        </TabsContent>
        <TabsContent value="signup-flow">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Signup flow</h3>
            <p className="text-muted-foreground mt-2">Configure your signup flow settings</p>
          </div>
        </TabsContent>
        <TabsContent value="oidc-template">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">OIDC template</h3>
            <p className="text-muted-foreground mt-2">Configure your OIDC template settings</p>
          </div>
        </TabsContent>
        <TabsContent value="roles">
          <Roles />
        </TabsContent>
        <TabsContent value="permissions">
          <Permissions />
        </TabsContent>
      </Tabs>
    </div>
  );
};
