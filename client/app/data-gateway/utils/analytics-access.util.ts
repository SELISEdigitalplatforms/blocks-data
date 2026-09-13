import { IAnalyticsConfiguration } from "../models/data-service";

export const isAnalyticsAccessible = (
  configuration: IAnalyticsConfiguration | null | undefined,
  now = new Date(),
) => {
  if (!configuration) return false;
  if (!configuration.enableAnalytics) return false;

  const enableDate = configuration.enableDate ? new Date(configuration.enableDate) : null;
  const validTill = configuration.validTill ? new Date(configuration.validTill) : null;

  if (enableDate && (Number.isNaN(enableDate.getTime()) || now < enableDate)) {
    return false;
  }

  if (validTill && (Number.isNaN(validTill.getTime()) || now > validTill)) {
    return false;
  }

  return true;
};
