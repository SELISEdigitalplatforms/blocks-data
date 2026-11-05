import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const createClientSchema = z.lazy(() => z.object({
  clientNameService: z.string().trim().min(1, tStatic("data.idp.authentication", "UTILS.CLIENT_NAME_IS_REQUIRED")),
  audienceUrlService: z.string().trim().url(),
  roles: z.array(z.string().trim()),
}));

export type CreateClientModalFormValues = z.infer<typeof createClientSchema>;

export const CreateClientModalFormDefaultValues: CreateClientModalFormValues = {
  clientNameService: "",
  audienceUrlService: "",
  roles: [],
};
