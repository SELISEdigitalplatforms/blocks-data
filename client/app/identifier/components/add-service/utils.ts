import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

const DATA_CONSOLE_MODULE = "data.console";

export const addServiceSchema = z.lazy(() => z.object({
  serviceName: z
    .string()
    .trim()
    .min(1, tStatic(DATA_CONSOLE_MODULE, "UTILS.SERVICE_NAME_IS_REQUIRED"))
    .max(100, tStatic(DATA_CONSOLE_MODULE, "UTILS.SERVICE_NAME_TOO_LONG_MAXIMUM_100")),
  tags: z
    .string()
    .array()
    .refine((tags) => new Set(tags).size === tags.length, tStatic(DATA_CONSOLE_MODULE, "UTILS.DUPLICATE_TAGS_ARE_NOT_ALLOWED")),
  serviceType: z.enum(["frontend", "backend"]).default("frontend"),
  description: z.string().optional(),
}));

export type AddServiceForm = z.infer<typeof addServiceSchema>;

export const addServiceDefaultValues: AddServiceForm = {
  serviceName: "",
  tags: [],
  description: "",
  serviceType: "frontend",
};
