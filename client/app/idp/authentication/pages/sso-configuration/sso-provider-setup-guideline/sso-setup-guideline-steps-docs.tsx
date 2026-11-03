import { SSO_PROVIDERS } from "@blocks-idp/authentication/constants/sso-providers.constant";
import { ReactNode } from "react";
import { googleStepupDocs } from "./sso-setup-guideline-google";
import { microsoftStepupDocs } from "./sso-setup-guideline-microsoft";
import { githubStepupDocs } from "./sso-setup-guideline-github";
import { linkedinStepupDocs } from "./sso-setup-guideline-linkedin";
import { xStepupDocs } from "./sso-setup-guideline-x";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export type Step = {
  id: string;
  description: ReactNode;
};

export const SSOSetupGuideSteps: Record<SSO_PROVIDERS, Step[]> = {
  google: googleStepupDocs,
  github: githubStepupDocs,
  linkedin: linkedinStepupDocs,
  x: xStepupDocs,
  microsoft: microsoftStepupDocs,
  apple: [],
  facebook: [],
  ownsso: [
    {
      id: "0",
      get description() {
      return (
        <div>
          <p>
            {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_STEPS_DOCS.COMING_SOON_THE_OWNSSO_SOCIAL")}
          </p>
          <p className="mt-2">
            {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_STEPS_DOCS.COMING_SOON_THE_OWNSSO_SOCIAL")}
          </p>
        </div>
      );
      },
    },
  ],
};
