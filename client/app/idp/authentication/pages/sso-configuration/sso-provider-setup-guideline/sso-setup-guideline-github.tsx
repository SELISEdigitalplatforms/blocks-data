import { Link } from "react-router";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";

export const githubStepupDocs = [
  {
    id: "0",
    get description() {
      return (
      <div>
        <p>
          {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.GITHUB_LOGIN_ALLOWS_USERS_TO")}
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.PREREQUISITES")}</h4>
        <p>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.BEFORE_YOU_BEGIN")}</p>
        <ul className="mt-2 list-inside list-disc">
          <li>
            <Link to="https://github.com/login" className="text-primary">
              {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.SIGN_IN_TO_YOUR_GITHUB_ACCOUNT")}
            </Link>
          </li>
          <li>
            {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.GO_TO")}
            <Link
              to="https://github.com/settings/developers"
              className="text-primary"
            >
              {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.GITHUB_DEVELOPER_SETTINGS")}
            </Link>
          </li>
          <li>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.ENSURE_YOU_HAVE_ADMINISTRATIVE_ACCESS")}</li>
        </ul>
      </div>
      );
    },
  },
  {
    id: "3",
    get description() {
      return (
      <div>
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.OBTAIN_CLIENT_CREDENTIALS")}</h4>
        <p>
          {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.AFTER_REGISTERING_THE_APP_GITHUB_WILL")} <b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.CLIENT_ID")}</b> {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.AND_ALLOW_YOU_TO_VIEW_OR")} <b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_GITHUB.CLIENT_SECRET")}</b>.
        </p>
      </div>
      );
    },
  },
];
