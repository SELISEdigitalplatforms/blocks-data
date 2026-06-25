"use client";

import { Button } from "@/components/ui-kits/button/button";
import { DataGatewayActions } from "../components/data-gateway-actions";
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
import { cn } from "@/lib/utils";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
import { Database, Loader2, Server, Settings2 } from "lucide-react";
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

  const handleSave = () => setIsConfirmDialogOpen(true);

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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <PageBreadcrumb breadcrumbIndex={2} />
          <DataGatewayActions />
        </div>

        <Form {...form}>
          <form className="flex flex-col gap-4">

            {/* Data Source Section */}
            <div className="relative overflow-hidden rounded-sm border border-border/40 bg-card">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.04),transparent_60%)]" />
              <div className="relative border-b border-border/40 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
                    <Database className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Data Source</h2>
                    <p className="text-xs text-muted-foreground/60">
                      Select where your data will be stored and retrieved from.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative px-6 py-5">
                <RadioGroup
                  value={selectedSource}
                  onValueChange={(v) => setSelectedSource(v as "blocks" | "others")}
                  className="flex flex-col gap-3"
                >
                  {/* Blocks database option */}
                  <label
                    htmlFor="blocks"
                    className={cn(
                      "flex cursor-pointer items-center gap-4 rounded-sm border p-4 transition-all duration-150",
                      selectedSource === "blocks"
                        ? "border-primary/30 bg-primary/5 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                        : "border-border/30 hover:border-border/50 hover:bg-muted/10",
                    )}
                  >
                    <RadioGroupItem id="blocks" value="blocks" className="mt-0" />
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition-colors",
                      selectedSource === "blocks"
                        ? "bg-indigo-500/10 ring-indigo-500/20"
                        : "bg-muted/30 ring-border/20",
                    )}>
                      <Database className={cn("h-4 w-4 transition-colors", selectedSource === "blocks" ? "text-indigo-400" : "text-muted-foreground/40")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Blocks database</p>
                      <p className="text-xs text-muted-foreground/60">
                        Use the managed database provided by Blocks
                      </p>
                    </div>
                  </label>

                  {/* Custom data source option */}
                  <label
                    htmlFor="others"
                    className={cn(
                      "flex cursor-pointer items-center gap-4 rounded-sm border p-4 transition-all duration-150",
                      selectedSource === "others"
                        ? "border-primary/30 bg-primary/5 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                        : "border-border/30 hover:border-border/50 hover:bg-muted/10",
                    )}
                  >
                    <RadioGroupItem id="others" value="others" className="mt-0" />
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition-colors",
                      selectedSource === "others"
                        ? "bg-indigo-500/10 ring-indigo-500/20"
                        : "bg-muted/30 ring-border/20",
                    )}>
                      <Server className={cn("h-4 w-4 transition-colors", selectedSource === "others" ? "text-indigo-400" : "text-muted-foreground/40")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">My data sources</p>
                      <p className="text-xs text-muted-foreground/60">
                        Connect your own database with a custom connection string
                      </p>
                    </div>
                  </label>
                </RadioGroup>

                {selectedSource === "others" && (
                  <div className="mt-4 flex flex-col gap-4 border-t border-border/40 pt-5">
                    <FormField
                      control={form.control}
                      name="dbConnectionString"
                      rules={{ required: "Connection string is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50">Connection String</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="mongodb://user:pass@host:27017/db"
                              className="border-border/40 bg-muted/10 focus-visible:border-primary/40 focus-visible:ring-primary/20"
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
                          <FormLabel className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50">Database Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="my-database"
                              className="border-border/40 bg-muted/10 focus-visible:border-primary/40 focus-visible:ring-primary/20"
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
            </div>

            {/* Collection Settings Section */}
            <div className="relative overflow-hidden rounded-sm border border-border/40 bg-card">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,0.03),transparent_60%)]" />
              <div className="relative border-b border-border/40 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
                    <Settings2 className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Collection Settings</h2>
                    <p className="text-xs text-muted-foreground/60">
                      Configure how collection names are generated for schemas.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col gap-5 px-6 py-5">
                {/* Toggle row */}
                <FormField
                  control={form.control}
                  name="isCollectionNameEditable"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-sm border border-border/30 bg-muted/10 px-4 py-3.5">
                      <div>
                        <FormLabel className="text-sm font-medium text-foreground">
                          Collection Name Editable
                        </FormLabel>
                        <FormDescription className="mt-0.5 text-xs text-muted-foreground/60">
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

                {/* Pattern input */}
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
                        <FormLabel className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50">
                          Collection Name Pattern
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-center rounded-sm border border-border/40 bg-muted/10 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-colors">
                            <input
                              type="text"
                              value={prefix}
                              onChange={(e) =>
                                field.onChange(`${e.target.value}${SCHEMA_NAME_PLACEHOLDER}${postfix}`)
                              }
                              style={{ width: `calc(${prefix.length > 0 ? prefix.length : 6}ch + 0.75rem)` }}
                              className="min-w-0 bg-transparent py-2 pl-3 pr-0 text-sm text-foreground/80 outline-none disabled:opacity-50"
                              placeholder="prefix"
                              disabled={isUpdatePending}
                            />
                            <span className="shrink-0 text-sm font-medium text-indigo-400/80">
                              {SCHEMA_NAME_PLACEHOLDER}
                            </span>
                            <input
                              type="text"
                              value={postfix}
                              onChange={(e) =>
                                field.onChange(`${prefix}${SCHEMA_NAME_PLACEHOLDER}${e.target.value}`)
                              }
                              className="flex-1 bg-transparent py-2 pl-0 pr-3 text-sm text-foreground/80 outline-none disabled:opacity-50"
                              placeholder="postfix"
                              disabled={isUpdatePending}
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs text-muted-foreground/50">
                          Pattern for generating collection names. The{" "}
                          <span className="font-medium text-indigo-400/70">{SCHEMA_NAME_PLACEHOLDER}</span>{" "}
                          placeholder cannot be modified or removed.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                className="border-border/40 text-muted-foreground/70 hover:text-foreground"
                onClick={() => navigate("/services/data-gateway")}
                disabled={isUpdatePending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="shadow-[0_0_16px_-2px_rgba(99,102,241,0.4)] hover:shadow-[0_0_20px_-2px_rgba(99,102,241,0.5)]"
                onClick={handleSave}
                disabled={!isFormValid || isUpdatePending}
              >
                {isUpdatePending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
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
          className="w-full max-w-[420px] rounded-sm border border-border/40"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-left text-base font-semibold">
              Confirm data source update?
            </DialogTitle>
            <DialogDescription className="mt-2 text-left text-sm text-muted-foreground/70">
              Changing the data source will affect all existing data. You will need to manually
              migrate any required data to the new source. Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-border/40"
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmSave} disabled={isUpdatePending}>
              {isUpdatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditDataSourcePage;
