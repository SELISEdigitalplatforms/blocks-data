import { useProjectStore } from "@/store/use-project-store";
import { SSOProviderList } from "./sso-provider-list";

export const SSO = () => {
  useProjectStore();

  return (
    <div>
      <SSOProviderList />
    </div>
  );
};
