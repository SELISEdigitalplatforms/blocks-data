import { Link } from "react-router";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const linkedinStepupDocs = [
  {
    id: "0",
    get description() {
      return (
      <div>
        <p>
          {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.LINKEDIN_LOGIN_ALLOWS_USERS_TO")} <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.CLIENT_ID")}</b> {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.AND")}
          <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.CLIENT_SECRET")}</b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.AND_CONFIGURE_REDIRECT_URIS_PROPERLY")}
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.PREREQUISITES")}</h4>
        <p>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.BEFORE_STARTING")}</p>
        <ul className="mt-2 list-inside list-disc">
          <li>
            <Link to="https://www.linkedin.com/developers/" className="text-primary">
              {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.SIGN_IN_TO_THE_LINKEDIN_DEVELOPER")}
            </Link>
          </li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.ENSURE_YOU_HAVE_A_VERIFIED_LINKEDIN")}</li>
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.OBTAIN_OAUTH_CREDENTIALS")}</h4>
        <p>
          {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.IN_YOUR_LINKEDIN_APP_DASHBOARD_UNDER")} <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.AUTH")}</b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.YOU_LL_FIND")}
        </p>
        <ul className="mt-2 list-inside list-disc">
          <li><b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.CLIENT_ID")}</b></li>
          <li><b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.CLIENT_SECRET")}</b></li>
        </ul>
        <p className="mt-2">
          {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_LINKEDIN.KEEP_THESE_CREDENTIALS_SECURE_AND_DO")}
        </p>
      </div>
      );
    },
  },
];
