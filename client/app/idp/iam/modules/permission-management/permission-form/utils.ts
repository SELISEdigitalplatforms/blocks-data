import { PermissionSeverityLevel } from "@blocks-idp/iam/models/permission";
import { z } from "zod";
import { tStatic } from "@seliseblocks/genesis-os/i18n";

export const permissionFormDefaultValue: permissionFormSchemaType = {
  name: "",
  type: 0,
  tags: [],
  resource: "",
  resourceGroup: "",
  description: "",
  dependentPermissions: [],
  permissionSeverity: "" as unknown as PermissionSeverityLevel,
};

export const permissionFormSchema = z.lazy(() => z
  .object({
    name: z.string().min(1, tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.NAME_IS_REQUIRED")).max(50, tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.NAME_MUST_BE_AT_MOST_50")).trim(),
    type: z.coerce.number().min(1, tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.TYPE_IS_REQUIRED")),
    resource: z
      .string()
      .min(1, tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.RESOURCE_IS_REQUIRED"))
      .max(50, tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.RESOURCE_MUST_BE_AT_MOST_50"))
      .trim()
      .refine((s) => !s.includes(" "), tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.RESOURCE_CAN_T_CONTAIN_SPACES")),
    resourceGroup: z.string().nonempty(tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.GROUP_IS_REQUIRED")).trim(),
    tags: z.string().array(),
    description: z.string().max(150, tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.DESCRIPTION_MUST_BE_AT_MOST_150")),
    dependentPermissions: z.array(z.string()),
    permissionSeverity: z.nativeEnum(PermissionSeverityLevel, {
      message: tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.SEVERITY_IS_REQUIRED"),
    }),
  })
  .refine(
    (arg) => {
      if (arg.type === 1) {
        const regex = /^[a-zA-Z0-9-]+::[a-zA-Z0-9-]+::[a-zA-Z0-9-]+$/;
        return regex.test(arg.resource);
      }
      return true;
    },
    {
      message: tStatic("data.idp.iam", "PERMISSION_FORM_UTILS.RESOURCE_FORMAT_SHOULD_BE_SERVICE"),
      path: ["resource"],
    }
  ));

export type permissionFormSchemaType = z.infer<typeof permissionFormSchema>;
