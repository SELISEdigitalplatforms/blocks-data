"use client";

import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kits/dialog/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui-kits/radio-group/radio-group";
import { Switch } from "@/components/ui-kits/switch/switch";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import {
  useGetDataServiceConfiguration,
  useUpdateDataSourceConfiguration,
} from "../hooks/use-configuration";
import { IDataSourceFormValues, IDataSourceResponse } from "../models/data-service";

const isDefaultConnection = (val: string | undefined | null) =>
  !val || val === "default";

const EditDataSourcePage = () => {
  const navigate = useNavigate();
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { data: configData, isLoading } = useGetDataServiceConfiguration();
  const { isPending: isUpdatePending, mutateAsync: updateDataSource } =
    useUpdateDataSourceConfiguration();

  const [selectedSource, setSelectedSource] = useState<"blocks" | "others">("blocks");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const form = useForm<IDataSourceFormValues>({
    mode: "onChange",
    defaultValues: {
      dbConnectionString: "",
      databaseName: "",
      isCollectionNameEditable: false,
      collectionNamePattern: "sb_{SchemaName}s",
    },
  });

  useEffect(() => {
    if (!isLoading && configData?.data) {
      const data = configData.data as IDataSourceResponse;
      const isBlocks = isDefaultConnection(data.dbConnectionString);
      setSelectedSource(isBlocks ? "blocks" : "others");
      form.reset({
        dbConnectionString: isBlocks ? "" : (data.dbConnectionString || ""),
        databaseName: isBlocks ? "" : (data.databaseName || ""),
        isCollectionNameEditable: data.isCollectionNameEditable || false,
        collectionNamePattern: data.collectionNamePattern || "sb_{SchemaName}s",
      });
    }
  }, [isLoading, configData?.data, form]);

  const handleSave = () => {
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmSave = async () => {
    try {
      const formData = form.getValues();
      const responseData = configData?.data as IDataSourceResponse & { itemId?: string };
      const itemId = responseData?.ItemId || responseData?.itemId;

      if (!itemId) {
        showErrorToast({ errors: ["Configuration not found. Please reload the page."] });
        setIsConfirmDialogOpen(false);
        return;
      }

      const payload = {
        projectKey,
        connectionString: selectedSource === "others" ? formData.dbConnectionString : "default",
        databaseName: selectedSource === "others" ? formData.databaseName : "default",
        isCollectionNameEditable: formData.isCollectionNameEditable,
        collectionNamePattern: formData.collectionNamePattern,
        itemId,
      };

      const res = await updateDataSource(payload);

      if (res.isSuccess) {
        showSuccessToast({ description: "Data source updated successfully" });
      } else {
        const errorMessages = Array.isArray(res.errors)
          ? res.errors.map((e: { propertyName?: string; errorMessage?: string }) =>
              e.errorMessage || e.propertyName || JSON.stringify(e)
            )
          : res.errors;
        showErrorToast({ errors: errorMessages });
      }

      setIsConfirmDialogOpen(false);
    } catch (error) {
      if (isErrorWithErrors(error)) {
        const errors = error.errors;
        const errorMessages = Array.isArray(errors)
          ? errors.map((e: { propertyName?: string; errorMessage?: string }) =>
              e.errorMessage || e.propertyName || JSON.stringify(e)
            )
          : errors;
        showErrorToast({ errors: errorMessages });
      } else {
        showErrorToast({ errors: ["An unexpected error occurred. Please try again."] });
      }
      setIsConfirmDialogOpen(false);
    }
  };

  const isFormValid =
    selectedSource === "blocks" ||
    (form.formState.isValid &&
      !!form.watch("dbConnectionString") &&
      !!form.watch("databaseName"));

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageBreadcrumb breadcrumbIndex={2} />

        <Form {...form}>
          <form className="flex flex-col gap-4">
            {/* Data Source Selection */}
            <div className="rounded-lg border bg-card p-6">
              <h2 className="mb-1 text-sm font-semibold">Data Source</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Select where your data will be stored and retrieved from.
              </p>

              <RadioGroup
                value={selectedSource}
                onValueChange={(v) => setSelectedSource(v as "blocks" | "others")}
                className="flex flex-col gap-3"
              >
                <label
                  htmlFor="blocks"
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                    selectedSource === "blocks"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem id="blocks" value="blocks" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Blocks database</p>
                    <p className="text-xs text-muted-foreground">
                      Use the managed database provided by Blocks
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="others"
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                    selectedSource === "others"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem id="others" value="others" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">My data sources</p>
                    <p className="text-xs text-muted-foreground">
                      Connect your own database with a custom connection string
                    </p>
                  </div>
                </label>
              </RadioGroup>

              {selectedSource === "others" && (
                <div className="mt-4 flex flex-col gap-4 border-t pt-4">
                  <FormField
                    control={form.control}
                    name="dbConnectionString"
                    rules={{ required: "Connection string is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Connection String</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. mongodb://<username>:<password>@host:27017/db"
                            {...field}
                            disabled={isUpdatePending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="databaseName"
                    rules={{ required: "Database name is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. my-database"
                            {...field}
                            disabled={isUpdatePending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Collection Settings */}
            <div className="rounded-lg border bg-card p-6">
              <h2 className="mb-1 text-sm font-semibold">Collection Settings</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Configure how collection names are generated for schemas.
              </p>

              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="isCollectionNameEditable"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Collection Name Editable</FormLabel>
                        <FormDescription>
                          Allow users to edit collection names when creating or updating schemas
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isUpdatePending}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="collectionNamePattern"
                  rules={{
                    required: "Collection name pattern is required",
                    validate: (value) =>
                      value.includes("{SchemaName}") || "Pattern must contain {SchemaName}",
                  }}
                  render={({ field }) => {
                    const SCHEMA_NAME_PLACEHOLDER = "{SchemaName}";

                    const idx = field.value?.indexOf(SCHEMA_NAME_PLACEHOLDER) ?? -1;
                    const prefix = idx === -1 ? (field.value || "") : field.value.substring(0, idx);
                    const postfix = idx === -1 ? "" : field.value.substring(idx + SCHEMA_NAME_PLACEHOLDER.length);

                    return (
                      <FormItem>
                        <FormLabel>Collection Name Pattern</FormLabel>
                        <FormControl>
                          <div className="flex items-center rounded-md border bg-background">
                            <input
                              type="text"
                              value={prefix}
                              onChange={(e) =>
                                field.onChange(`${e.target.value}${SCHEMA_NAME_PLACEHOLDER}${postfix}`)
                              }
                              style={{ width: `${prefix.length > 0 ? prefix.length : 6}ch` }}
                              className="min-w-0 bg-transparent py-2 pl-3 pr-0 text-sm outline-none disabled:opacity-50"
                              placeholder="prefix"
                              disabled={isUpdatePending}
                            /><span className="shrink-0 text-sm font-medium text-primary">{SCHEMA_NAME_PLACEHOLDER}</span><input
                              type="text"
                              value={postfix}
                              onChange={(e) =>
                                field.onChange(`${prefix}${SCHEMA_NAME_PLACEHOLDER}${e.target.value}`)
                              }
                              className="flex-1 bg-transparent py-2 pl-0 pr-3 text-sm outline-none disabled:opacity-50"
                              placeholder="postfix"
                              disabled={isUpdatePending}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Pattern for generating collection names. The{" "}
                          <span className="font-medium text-primary">{SCHEMA_NAME_PLACEHOLDER}</span>{" "}
                          placeholder cannot be modified or removed.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => navigate("/services/data-gateway")}
                disabled={isUpdatePending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!isFormValid || isUpdatePending}
              >
                {isUpdatePending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent
          className="mr-4 w-full max-w-[425px] rounded-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-left text-lg font-semibold leading-7">
              Confirm data source update?
            </DialogTitle>
            <DialogDescription className="mb-6 mt-2 break-words text-left text-sm font-normal leading-5 text-medium-emphasis">
              Changing the data source will affect all existing data. You will need to manually
              migrate any required data to the new source. Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmSave} disabled={isUpdatePending}>
              {isUpdatePending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditDataSourcePage;
