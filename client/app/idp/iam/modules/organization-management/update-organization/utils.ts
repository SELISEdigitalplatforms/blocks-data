import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const updateOrganizationFormSchema = z.lazy(() => z.object({
  name: z
    .string()
    .min(1, tStatic("data.idp.iam", "UPDATE_ORGANIZATION_UTILS.NAME_IS_REQUIRED"))
    .max(100, tStatic("data.idp.iam", "UPDATE_ORGANIZATION_UTILS.NAME_MUST_BE_AT_MOST_100"))
    .trim(),
}));
