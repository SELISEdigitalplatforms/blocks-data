import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_SHARED_MODULE = "data.shared";
export const getErrorMessage = (
  error: Record<string, string | string[]>,
  messageMap: Record<string, string> = {},
): string | string[] => {
  if (!error || Object.keys(error).length === 0) {
    return tStatic(DATA_SHARED_MODULE, "ERROR.SOMETHING_WENT_WRONG");
  }

  const messages: string[] = [];

  for (const key in error) {
    const value = error[key];

    if (messageMap[key]) {
      messages.push(messageMap[key]);
      continue;
    }

    if (typeof value === "string") {
      messages.push(value);
    } else if (Array.isArray(value) && value.length > 0) {
      messages.push(value.join(", "));
    }
  }

  return messages.length ? messages : tStatic(DATA_SHARED_MODULE, "ERROR.SOMETHING_WENT_WRONG");
};

export const isErrorWithErrors = (
  error: unknown,
): error is { errors: Record<string, string | string[]> } => {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    typeof (error as { errors: unknown }).errors === "object"
  );
};

export const handleErrorMessages = (
  errors: unknown,
  customMessages?: Record<string, string>,
): string | string[] => {
  if (typeof errors === "string") return errors;

  if (Array.isArray(errors)) {
    const stringErrors = errors.filter((e): e is string => typeof e === "string");
    return stringErrors.length ? stringErrors : tStatic(DATA_SHARED_MODULE, "ERROR.AN_UNEXPECTED_ERROR_OCCURRED");
  }

  if (errors && typeof errors === "object") {
    return getErrorMessage(errors as Record<string, string | string[]>, customMessages);
  }

  return tStatic(DATA_SHARED_MODULE, "ERROR.AN_UNEXPECTED_ERROR_OCCURRED");
};
