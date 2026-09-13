import { IAnalyticsConfiguration } from "../models/data-service";

export const isAnalyticsAccessible = (
  configuration: IAnalyticsConfiguration | null | undefined,
  now = new Date(),
) => {
  if (!configuration) return false;
  if (!configuration.enableAnalytics) return false;
  if (!configuration.validTill) return false;

  const enableDate = configuration.enableDate ? new Date(configuration.enableDate) : null;
  const validTill = new Date(configuration.validTill);

  if (enableDate && (Number.isNaN(enableDate.getTime()) || now < enableDate)) {
    return false;
  }

  if (Number.isNaN(validTill.getTime()) || now > validTill) {
    return false;
  }

  return true;
};
