"use client";

import { useState } from "react";
import { AlertTriangle, BarChart3, Database, Loader2, Server, Settings2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useProjectStore } from "@seliseblocks/genesis-os";
import PageBreadcrumb from "@/components/breadcrumb/breadcrumb";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui-kits/radio-group/radio-group";
import { Skeleton } from "@/components/ui-kits/skeleton/skeleton";
import { Switch } from "@/components/ui-kits/switch/switch";
import { setBreadcrumbTitle } from "@/constants/breadcrumb-custom-title";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { cn } from "@/lib/utils";
import {
  useGetDataServiceConfiguration,
  useSaveDataSourceConfiguration,
} from "../../hooks/use-configuration";
import type { IDataSourceResponse } from "../../models/data-service";
import {
  buildSavePayload,
  canKeepSecret,
  dataSourceFormSchema,
  isCustomSource,
  SCHEMA_NAME_PLACEHOLDER,
  toFormValues,
  validateSource,
  type DataSourceKind,
} from "./utils";

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
};

const labelClass = "text-xs font-medium uppercase tracking-widest text-low-emphasis";

const SectionHeader = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex items-center gap-2.5 border-b px-6 py-4">
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
      {icon}
    </div>
    <div>
      <h2 className="text-sm font-semibold text-high-emphasis">{title}</h2>
      <p className="text-xs text-low-emphasis">{description}</p>
    </div>
  </div>
);

const DataSourceForm = ({ configuration }: { configuration: IDataSourceResponse | undefined }) => {
  const projectKey = useProjectStore().selectedProject?.tenantId || "";
  const { isPending: isSaving, mutateAsync: save } = useSaveDataSourceConfiguration();
  const isCustom = isCustomSource(configuration);

  const [kind, setKind] = useState<DataSourceKind>(isCustom ? "others" : "blocks");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm({
    defaultValues: toFormValues(configuration),
    resolver: zodResolver(dataSourceFormSchema),
  });

  const handleSave = async () => {
    const valid = await form.trigger();
    const sourceErrors = validateSource(kind, form.getValues(), canKeepSecret(configuration));
    (Object.keys(sourceErrors) as Array<keyof typeof sourceErrors>).forEach((name) =>
      form.setError(name, { message: sourceErrors[name] }),
    );
    if (valid && Object.keys(sourceErrors).length === 0) setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    try {
      const payload = buildSavePayload(kind, form.getValues(), configuration, projectKey);
      const res = await save({ payload, exists: !!configuration });
      if (!res.isSuccess) {
        showErrorToast({ errors: res.errors });
      } else {
        showSuccessToast({
          description: configuration
            ? "Configuration updated successfully"
            : "Configuration created successfully",
        });
      }
    } catch (error) {
      showErrorToast({
        errors: isErrorWithErrors(error)
          ? error.errors
          : "An unexpected error occurred. Please try again.",
      });
    }
    setConfirmOpen(false);
  };

  const sourceOption = (
    value: DataSourceKind,
    title: string,
    text: string,
    icon: React.ReactNode,
  ) => (
    <label
      htmlFor={value}
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-sm border p-4 transition-colors",
        kind === value ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <RadioGroupItem id={value} value={value} className="mt-0" disabled={isSaving} />
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-high-emphasis">{title}</p>
        <p className="text-xs text-low-emphasis">{text}</p>
      </div>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb breadcrumbIndex={3} />
      {!configuration && (
        <p className="rounded-sm border bg-muted/30 px-4 py-3 text-sm text-low-emphasis">
          No data source is configured yet. Saving creates it.
        </p>
      )}
      <Form {...form}>
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <section className="rounded-sm border bg-card">
            <SectionHeader
              icon={<Database className="h-4 w-4" />}
              title="Data Source"
              description="Select where your data will be stored and retrieved from."
            />
            <div className="px-6 py-5">
              <RadioGroup
                value={kind}
                onValueChange={(v) => setKind(v as DataSourceKind)}
                className="flex flex-col gap-3"
              >
                {sourceOption(
                  "blocks",
                  "Blocks database",
                  "Use the managed database provided by Blocks",
                  <Database className="h-4 w-4" />,
                )}
                {sourceOption(
                  "others",
                  "My data sources",
                  "Connect your own database with a custom connection string",
                  <Server className="h-4 w-4" />,
                )}
              </RadioGroup>

              {kind === "others" && (
                <div className="mt-4 flex flex-col gap-4 border-t pt-5">
                  <FormField
                    control={form.control}
                    name="connectionString"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Connection String</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="off"
                            placeholder="mongodb://<username>:<password>@host:27017/db"
                            {...field}
                            disabled={isSaving}
                          />
                        </FormControl>
                        {isCustom && (
                          <FormDescription>
                            Saved — enter a new value to replace it. The saved value is never shown.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="databaseName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Database Name</FormLabel>
                        <FormControl>
                          <Input placeholder="my-database" {...field} disabled={isSaving} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-sm border bg-card">
            <SectionHeader
              icon={<Settings2 className="h-4 w-4" />}
              title="Collection Settings"
              description="Configure how collection names are generated for schemas."
            />
            <div className="flex flex-col gap-5 px-6 py-5">
              <FormField
                control={form.control}
                name="isCollectionNameEditable"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-sm border px-4 py-3.5">
                    <div>
                      <FormLabel className="text-sm font-medium text-high-emphasis">
                        Collection Name Editable
                      </FormLabel>
                      <FormDescription>
                        Allow users to edit collection names when creating or updating schemas
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSaving}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="collectionNamePattern"
                render={({ field }) => {
                  const idx = field.value.indexOf(SCHEMA_NAME_PLACEHOLDER);
                  const prefix = idx === -1 ? field.value : field.value.substring(0, idx);
                  const postfix =
                    idx === -1 ? "" : field.value.substring(idx + SCHEMA_NAME_PLACEHOLDER.length);
                  return (
                    <FormItem>
                      <FormLabel className={labelClass}>Collection Name Pattern</FormLabel>
                      <FormControl>
                        <div className="flex items-center rounded-sm border bg-background focus-within:ring-1 focus-within:ring-primary/30">
                          <input
                            type="text"
                            aria-label="Collection name prefix"
                            value={prefix}
                            onChange={(e) =>
                              field.onChange(
                                `${e.target.value}${SCHEMA_NAME_PLACEHOLDER}${postfix}`,
                              )
                            }
                            style={{ width: `calc(${Math.max(prefix.length, 6)}ch + 0.75rem)` }}
                            className="min-w-0 bg-transparent py-2 pl-3 pr-0 text-sm outline-hidden disabled:opacity-50"
                            placeholder="prefix"
                            disabled={isSaving}
                          />
                          <span className="shrink-0 text-sm font-medium text-primary">
                            {SCHEMA_NAME_PLACEHOLDER}
                          </span>
                          <input
                            type="text"
                            aria-label="Collection name postfix"
                            value={postfix}
                            onChange={(e) =>
                              field.onChange(`${prefix}${SCHEMA_NAME_PLACEHOLDER}${e.target.value}`)
                            }
                            className="flex-1 bg-transparent py-2 pl-0 pr-3 text-sm outline-hidden disabled:opacity-50"
                            placeholder="postfix"
                            disabled={isSaving}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Pattern for generating collection names. The {SCHEMA_NAME_PLACEHOLDER}{" "}
                        placeholder cannot be modified or removed.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
          </section>

          <section className="rounded-sm border bg-card">
            <SectionHeader
              icon={<BarChart3 className="h-4 w-4" />}
              title="Analytics"
              description="View and manage analytics availability for this project."
            />
            <div className="flex flex-col gap-4 px-6 py-5">
              <FormField
                control={form.control}
                name="enableAnalytics"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-sm border px-4 py-3.5">
                    <div>
                      <FormLabel className="text-sm font-medium text-high-emphasis">
                        Enable Analytics
                      </FormLabel>
                      <FormDescription>
                        Show analytics in the menu and allow access during the configured period.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSaving}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-sm border px-4 py-3.5">
                  <p className={labelClass}>Enable date</p>
                  <p className="mt-2 text-sm text-high-emphasis">
                    {formatDate(configuration?.analyticsConfiguration?.enableDate) ?? "Not set"}
                  </p>
                </div>
                <div className="rounded-sm border px-4 py-3.5">
                  <p className={labelClass}>Valid till</p>
                  <p className="mt-2 text-sm text-high-emphasis">
                    {formatDate(configuration?.analyticsConfiguration?.validTill) ??
                      "Not set (analytics unavailable)"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-low-emphasis">
                Availability dates are managed by Blocks and cannot be edited here.
              </p>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setKind(isCustom ? "others" : "blocks");
                form.reset(toFormValues(configuration));
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="w-full max-w-[420px] rounded-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Confirm data source {configuration ? "update" : "configuration"}?
            </DialogTitle>
            <DialogDescription className="mt-2 text-left text-sm">
              Changing the data source will affect all existing data. You will need to manually
              migrate any required data to the new source. Are you sure you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex flex-row gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const DataSourceConfiguration = () => {
  setBreadcrumbTitle("/services/data-gateway", "Data Gateway");
  setBreadcrumbTitle("/services/data-gateway/configuration", "Configuration");

  const { data: response, isLoading, isError, refetch } = useGetDataServiceConfiguration();
  const configuration = (response?.data as IDataSourceResponse | null | undefined) ?? undefined;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" data-testid="data-source-loading">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || response?.isSuccess === false) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-sm border bg-card p-6">
        <p className="text-sm text-high-emphasis">
          The data source configuration could not be loaded.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  // Remount on every new server value so the form always starts from what is saved.
  return (
    <DataSourceForm key={JSON.stringify(configuration ?? null)} configuration={configuration} />
  );
};
