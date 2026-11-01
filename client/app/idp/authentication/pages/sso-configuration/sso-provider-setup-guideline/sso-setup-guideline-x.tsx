import { Link } from "react-router";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_IDP_AUTHENTICATION_MODULE = "data.idp.authentication";

export const xStepupDocs = [
  {
    id: "0",
    get description() {
      return (
      <div>
        <p>
          {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.TWITTER_NOW_X_LOGIN_ENABLES_USERS")}
          <Link to="https://developer.x.com/en/portal/dashboard" className="text-primary">
            {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.X_DEVELOPER_PORTAL")}
          </Link>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.OBTAIN_YOUR")} <b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.CLIENT_ID")}</b> {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.AND")} <b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.CLIENT_SECRET")}</b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.AND_CONFIGURE_REDIRECT_URIS_CORRECTLY")}
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.PREREQUISITES")}</h4>
        <p>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.BEFORE_YOU_BEGIN")}</p>
        <ul className="mt-2 list-inside list-disc">
          <li>
            {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.HAVE_A_VERIFIED")}
            <Link to="https://twitter.com/" className="text-primary">
              {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.X_TWITTER_ACCOUNT")}
            </Link>
          </li>
          <li>
            {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.ACCESS_TO_THE")}
            <Link to="https://developer.x.com/en/portal/dashboard" className="text-primary">
              {tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.X_DEVELOPER_PORTAL")}
            </Link>
          </li>
        </ul>
      </div>
      );
    },
  },
  {
    id: "4",
    get description() {
      return (
      <div>
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.OBTAIN_CLIENT_CREDENTIALS")}</h4>
        <ul className="mt-2 list-inside list-disc">
          <li><b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.CLIENT_ID")}</b></li>
          <li><b>{tStatic(DATA_IDP_AUTHENTICATION_MODULE, "SSO_SETUP_GUIDELINE_X.CLIENT_SECRET")}</b></li>
        </ul>
      </div>
      );
    },
  }
];
