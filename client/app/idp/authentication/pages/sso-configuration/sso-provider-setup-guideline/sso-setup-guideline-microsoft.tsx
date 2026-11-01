import { Link } from "react-router";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";

export const microsoftStepupDocs = [
  {
      id: "0",
      get description() {
      return (
        <div>
          <p>
            {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.THE_MICROSOFT_SOCIAL_CONNECTION_ALLOWS")}
          </p>
          <p className="mt-2">
            {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.AUTH0_AUTOMATICALLY_SYNCS_USER_PROFILE")}
          </p>
        </div>
      );
      },
    },
    {
      id: "1",
      get description() {
      return (
        <div>
          <h4 className="text-lg text-high-emphasis">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.PREREQUISITES")}</h4>
          <p>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.BEFORE_YOU_BEGIN")}</p>
          <ul className="mt-2 list-inside list-disc">
            <li>
              <Link to="">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.SIGN_UP_FOR_AN_AZURE_ACCOUNT")}</Link>
            </li>
            <li>
              <Link to="">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.CREATE_AN_AZURE_AD_TENANT")}</Link>
            </li>
          </ul>
        </div>
      );
      },
    },
    {
      id: "2",
      get description() {
      return (
        <div>
          <h4 className="text-lg text-high-emphasis">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.TEST_CONNECTION")}</h4>
          <p>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_MICROSOFT.YOU_RE_READY_TO_TEST_YOUR")}</p>
        </div>
      );
      },
    },
];
