import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const addOrganizationFormDefaultValue = {
  name: "",
};

export const addOrganizationFormSchema = z.lazy(() => z.object({
  name: z
    .string()
    .trim()
    .min(1, tStatic("data.idp.iam", "UTILS.NAME_IS_REQUIRED"))
    .max(100, tStatic("data.idp.iam", "UTILS.NAME_MUST_BE_AT_MOST_100")),
}));
