import { Link } from "react-router";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const googleStepupDocs = [
  {
    id: "0",
    get description() {
      return (
      <div>
        <p>
          {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.GOOGLE_LOGIN_ALLOWS_USERS_TO")}
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.PREREQUISITES")}</h4>
        <p>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.BEFORE_YOU_BEGIN")}</p>
        <ul className="mt-2 list-inside list-disc">
          <li>
            <Link to="https://console.cloud.google.com/" className="text-primary">
              {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.SIGN_IN_TO_GOOGLE_CLOUD_CONSOLE")}
            </Link>
          </li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CREATE_A_NEW_PROJECT_OR_SELECT")}</li>
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CONFIGURE_CONSENT_SCREEN")}</h4>
        <p>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.IN_GOOGLE_CLOUD_CONSOLE")}</p>
        <ul className="mt-2 list-inside list-disc">
          <li>
            {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.GO_TO")}
            <Link
              to="https://console.cloud.google.com/apis/credentials/consent"
              className="text-primary"
            >
              {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.OAUTH_CONSENT_SCREEN")}
            </Link>
          </li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.SELECT_EXTERNAL_AS_USER_TYPE")}</li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.FILL_REQUIRED_FIELDS_LIKE_APP_NAME")}</li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.SAVE_AND_CONTINUE_THROUGH_THE_STEPS")}</li>
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CREATE_OAUTH_2_0_CREDENTIALS")}</h4>
        <ul className="mt-2 list-inside list-disc">
          <li>
            {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.GO_TO")}
            <Link to="https://console.cloud.google.com/apis/credentials" className="text-primary">
              {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.APIS_SERVICES_CREDENTIALS")}
            </Link>
          </li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CLICK_CREATE_CREDENTIALS_OAUTH_CLIENT")}</li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.SELECT_WEB_APPLICATION_AS_APPLICATION")}</li>
          <li>
            {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.ADD_YOUR_DOMAIN_IN")} <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.AUTHORIZED_JAVASCRIPT_ORIGINS")}</b>:<br />
            <code>https://yourdomain.com</code>
          </li>
          <li>
            {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.ADD_REDIRECT_URI")}
            <br />
            <code>https://yourdomain.com/login/callback</code>
          </li>
          <li>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CLICK_CREATE_AND_NOTE_THE_CLIENT")}</li>
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
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CONFIGURE_IN_ADMIN_PANEL")}</h4>
        <p>
          {tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.COPY_THE_FOLLOWING_VALUES_FROM_THE")}
        </p>
        <ul className="mt-2 list-inside list-disc">
          <li>
            <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CLIENT_ID")}</b>
          </li>
          <li>
            <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.CLIENT_SECRET")}</b>
          </li>
          <li>
            <b>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.REDIRECT_URI")}</b>: <code>https://yourdomain.com/login/callback</code>
          </li>
        </ul>
      </div>
      );
    },
  },
  {
    id: "5",
    get description() {
      return (
      <div>
        <h4 className="text-lg font-semibold text-high-emphasis">{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.TEST_CONNECTION")}</h4>
        <p>{tStatic("data.idp.authentication", "SSO_SETUP_GUIDELINE_GOOGLE.LOG_OUT_AND_TRY_LOGGING_IN")}</p>
      </div>
      );
    },
  },
];
