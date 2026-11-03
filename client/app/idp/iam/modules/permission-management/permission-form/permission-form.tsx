
import { ChipsInput, ChipsInputField, ChipsInputList } from "@/components/chip-input/chips-input";
import { Button } from "@/components/ui-kits/button/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kits/select/select";
import { IPermission, PERMISSION_SEVERITY_OPTIONS, RESOURCE_TYPE } from "@blocks-idp/iam/models/permission";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { permissionFormDefaultValue, permissionFormSchema, permissionFormSchemaType } from "./utils";
import { Card, CardContent, CardFooter } from "@/components/ui-kits/card/card";
import { DependentPermissions } from "../dependent-permissions";
import { PermissionGroupCombobox } from "@blocks-idp/iam/components/permission-group-combobox/permission-group-combobox";
import { Textarea } from "@/components/ui-kits/textarea/textarea";
import { useT } from "@seliseblocks/genesis-os/i18n";

type PermissionFormProps = {
  onSave: (data: permissionFormSchemaType) => void;
  isPending: boolean;
  values?: IPermission | null;
};

export const PermissionForm = ({ onSave, isPending, values = null }: PermissionFormProps) => {
  const { t } = useT("data.idp.iam");
  const form = useForm({
    values: values || permissionFormDefaultValue,
    resolver: zodResolver(permissionFormSchema),
  });

  const onSubmit = async (data: permissionFormSchemaType) => {
    onSave(data);
  };

  const resourceType = form.watch("type");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4">
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              name="name"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common:NAME")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("PERMISSION_FORM.ENTER_NAME")} disabled={!!values?.isBuiltIn} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="type"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common:TYPE")}</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value.toString()}
                      onValueChange={(val) => field.onChange(Number(val))}
                      disabled={!!values?.isBuiltIn}
                    >
                      <SelectTrigger className="border-default col-span-3 flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm shadow-none placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2">
                        <SelectValue placeholder={t("PERMISSION_FORM.SELECT_TYPE")} />
                      </SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPE.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="resource"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("PERMISSION_FORM.RESOURCE")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={resourceType === 1 ? t("PERMISSION_FORM.ENTER_SERVICE_CONTROLLER_NAME") : t("PERMISSION_FORM.ENTER_RESOURCE")}
                      disabled={!!values?.isBuiltIn}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="resourceGroup"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("PERMISSION_FORM.GROUP")}</FormLabel>
                  <FormControl>
                    <PermissionGroupCombobox
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                      }}
                      disabled={!!values?.isBuiltIn}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="permissionSeverity"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("PERMISSION_FORM.SEVERITY")}</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={(val) => field.onChange(Number(val))}
                      disabled={!!values?.isBuiltIn}
                    >
                      <SelectTrigger className="border-default col-span-3 flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm shadow-none placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2">
                        <SelectValue placeholder={t("PERMISSION_FORM.SELECT_SEVERITY")} />
                      </SelectTrigger>
                      <SelectContent>
                        {PERMISSION_SEVERITY_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value.toString()}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="tags"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("PERMISSION_FORM.TAGS")}</FormLabel>
                  <FormControl>
                    <ChipsInput {...field}>
                      <ChipsInputList />
                      <ChipsInputField />
                    </ChipsInput>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="description"
              control={form.control}
              render={({ field }) => (
                <FormItem className=" md:col-span-2">
                  <FormLabel>{t("common:DESCRIPTION")}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t("PERMISSION_FORM.ENTER_DESCRIPTION")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {resourceType === 2 && (
              <FormField
                name="dependentPermissions"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t("PERMISSION_FORM.DEPENDENT_PERMISSIONS_MAX_5")}</FormLabel>
                    <FormControl>
                      <DependentPermissions
                        permissionsResource={field.value}
                        onChange={(data) => {
                          field.onChange(data);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
          <CardFooter className="mt-4 justify-end">
            <Button className="min-w-[80px]" type="submit" disabled={isPending}>
              {t("common:SAVE")}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};
