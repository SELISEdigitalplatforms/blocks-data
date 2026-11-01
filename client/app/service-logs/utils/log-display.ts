import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_CONSOLE_MODULE = "data.console";
export const LOG_LEVEL = {
  get Information() { return tStatic(DATA_CONSOLE_MODULE, "LOG_DISPLAY.INFORMATION"); },
  get Warning() { return tStatic(DATA_CONSOLE_MODULE, "LOG_DISPLAY.WARNING"); },
  get Error() { return tStatic(DATA_CONSOLE_MODULE, "common:ERROR"); },
} as const;

export const getLogFormatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toISOString().replace("T", " ").replace("Z", "").slice(0, -4);
};

export const getLogLevelClassName = (level: string) => {
  switch (level) {
    case "Warning":
      return "text-warning";
    case "Information":
      return "text-success";
    case "Error":
      return "text-error";
    default:
      return "text-high-emphasis";
  }
};
