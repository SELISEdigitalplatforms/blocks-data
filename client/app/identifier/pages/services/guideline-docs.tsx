import { tStatic } from "@seliseblocks/genesis-os/i18n";
export const managedServicesGuidelineSteps = [
  {
    id: "0",
    get description() {
      return (
      <div className="text-sm text-medium-emphasis">
        <h4 className="mb-2 text-lg font-semibold text-high-emphasis">{tStatic("data.console", "GUIDELINE_DOCS.MANAGED_SERVICE_OVERVIEW")}</h4>
        <p>
          {tStatic("data.console", "GUIDELINE_DOCS.OUR_MANAGED_SERVICE_LETS_YOU_REGISTER")}
        </p>
        <ul className="ml-4 mt-2 list-inside list-disc text-sm">
          <li>{tStatic("data.console", "GUIDELINE_DOCS.REGISTER_YOUR_SERVICE_IN_THE_CLOUD")}</li>
          <li>{tStatic("data.console", "GUIDELINE_DOCS.INSTALL_THE_NUGET_PACKAGE_SELISEBLOCKS")}</li>
        </ul>
        <p className="mt-2 text-high-emphasis">
          {tStatic("data.console", "GUIDELINE_DOCS.SEND_STRUCTURED_LOGS_METRICS_AND")}
        </p>
      </div>
      );
    },
  },
  {
    id: "1",
    get description() {
      return (
      <div className="text-sm text-medium-emphasis">
        <h4 className="mb-2 text-lg font-semibold text-high-emphasis">{tStatic("data.console", "GUIDELINE_DOCS.NUGET_INTEGRATION")}</h4>
        <p className="text-sm">
          {tStatic("data.console", "GUIDELINE_DOCS.INSTALL_THE_OFFICIAL_CLIENT_LIBRARY")}
        </p>
        <p className="mt-2 font-semibold">
          {tStatic("data.console", "GUIDELINE_DOCS.PACKAGE")}
          <a
            href="https://www.nuget.org/packages/SeliseBlocks.LMT.Client#readme-body-tab"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 font-normal text-primary underline"
          >
            SeliseBlocks.LMT.Client
          </a>
        </p>
        <p className="mt-2 font-semibold">{tStatic("data.console", "GUIDELINE_DOCS.FEATURES")}</p>
        <ul className="ml-4 mt-2 list-inside list-disc text-sm">
          <li>{tStatic("data.console", "GUIDELINE_DOCS.AUTOMATIC_RETRY_AND_BUFFERING_ON")}</li>
          <li>{tStatic("data.console", "GUIDELINE_DOCS.SUPPORTS_LOGS_TRACES_AND_CUSTOM")}</li>
          <li>{tStatic("data.console", "GUIDELINE_DOCS.MINIMAL_CONFIGURATION_VIA_APPSETTINGS")}</li>
        </ul>
      </div>
      );
    },
  },
  {
    id: "2",
    get description() {
      return (
      <div className="text-sm text-medium-emphasis">
        <h4 className="mb-2 text-lg font-semibold text-high-emphasis">{tStatic("data.console", "GUIDELINE_DOCS.VIEWING_YOUR_DATA")}</h4>
        <p className="text-sm">
          {tStatic("data.console", "GUIDELINE_DOCS.ONCE_THE_CLIENT_IS_ACTIVE_ALL")}
        </p>
        <ul className="mt-2 list-inside list-disc text-sm">
          <li>{tStatic("data.console", "GUIDELINE_DOCS.USE_THE_LIST_VIEW_TO_BROWSE")}</li>
          <li>{tStatic("data.console", "GUIDELINE_DOCS.FILTER_BY_SEVERITY_TRACE_ID_SERVICE")}</li>
          <li>{tStatic("data.console", "GUIDELINE_DOCS.LEVERAGE_TIME_RANGE_FILTERS_FOR")}</li>
        </ul>
      </div>
      );
    },
  },
];
