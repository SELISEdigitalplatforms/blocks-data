import { z } from "zod";
import { INotificationConfig } from "../models/notification.model";
import { useSaveNotificationConfig } from "../hooks/use-notifications";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  channelsToNotify,
  notificationTypes,
} from "../constants/notification.constant";
import { Checkbox } from "@/components/ui-kits/checkbox/checkbox";
import { useEffect } from "react";
import { useProjectStore } from "@seliseblocks/genesis-os";
import { showErrorToast, toast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui-kits/dialog/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui-kits/select/select";
import { Button } from "@/components/ui-kits/button/button";
import { useT, tStatic } from "@seliseblocks/genesis-os/i18n";

interface NewNotificationConfigurationProps {
  dialogTitle: string;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  onClose: Function;
  previousData?: INotificationConfig;
  isEdit: boolean;
}

const schema = z.lazy(() => z.object({
  name: z
    .string()
    .min(3, { message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.CONFIGURATION_NAME_MUST_BE_AT_LEAST") })
    .max(100, { message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.CONFIGURATION_NAME_MUST_BE_AT_MOST") })
    .refine((val) => val.trim().length > 0, {
      message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.NAME_CANNOT_CONTAIN_ONLY_WHITESPACE"),
    }),
  channelToNotify: z
    .number()
    .min(0, { message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.CHANNEL_TO_NOTIFY_IS_REQUIRED") }),
  notificationType: z
    .number()
    .min(0, { message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.NOTIFICATION_TYPE_IS_REQUIRED") }),
  enablePersistence: z.boolean(),
  notifyMethod: z
    .string()
    .min(3, { message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.NOTIFY_METHOD_MUST_BE_AT_LEAST") })
    .max(100, { message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.NOTIFY_METHOD_MUST_BE_AT_MOST") })
    .refine((val) => val.trim().length > 0, {
      message: tStatic("data.console", "NEW_NOTIFICATION_CONFIGURATION.NOTIFY_METHOD_CANNOT_CONTAIN_ONLY"),
    }),
}));

const NewNotificationConfiguration: React.FC<
  NewNotificationConfigurationProps
> = ({ dialogTitle, onClose, previousData, isEdit }) => {
  const { t } = useT("data.console");
  const tenantId = useProjectStore()?.selectedProject?.tenantId || "";
  const { isPending, mutateAsync } = useSaveNotificationConfig();

  if (isEdit && previousData?.itemId == "") {
    return <div>{t("NEW_NOTIFICATION_CONFIGURATION.LOADING")}</div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const form = useForm<INotificationConfig>({
    defaultValues: isEdit
      ? {
          name: previousData?.name || "",
          channelToNotify: previousData?.channelToNotify || 0,
          notificationType: previousData?.notificationType || 0,
          enablePersistence: previousData?.enablePersistence || false,
          notifyMethod: previousData?.notifyMethod || "",
        }
      : {
          name: "",
          channelToNotify: 0,
          notificationType: 0,
          enablePersistence: false,
          notifyMethod: "",
        },
    resolver: zodResolver(schema),
    mode: "onChange",
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (isEdit && previousData) {
      form.reset({
        name: previousData?.name || "",
        channelToNotify: previousData?.channelToNotify || 0,
        notificationType: previousData?.notificationType || 0,
        enablePersistence: previousData?.enablePersistence || false,
        notifyMethod: previousData?.notifyMethod || "",
      });
    } else if (!isEdit) {
      form.reset({
        name: "",
        channelToNotify: 0,
        notificationType: 0,
        enablePersistence: false,
        notifyMethod: "",
      });
    }
  }, [previousData, isEdit, form]);

  const formSubmitHandler = async (data: INotificationConfig) => {
    try {
      data.itemId = isEdit && previousData?.itemId ? previousData?.itemId : "";
      const payload = {
        ...data,
        projectKey: tenantId,
        isUpdateRequest: isEdit,
      };
      const res = await mutateAsync(payload);
      if (res?.isSuccess) {
        toast({
          variant: "success",
          title: t("common:SUCCESS"),
          description: isEdit
            ? t("NEW_NOTIFICATION_CONFIGURATION.CONFIGURATION_UPDATED")
            : t("NEW_NOTIFICATION_CONFIGURATION.NEW_CONFIGURATION_ADDED"),
        });
        form.reset();
        onClose(false);
      } else {
        showErrorToast({ errors: res?.errors });
      }
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({
          errors: error.errors as Record<string, string | string[]>,
        });
      } else {
        showErrorToast({ errors: t("NEW_NOTIFICATION_CONFIGURATION.SOMETHING_WENT_WRONG") });
      }
    }
  };

  return (
    <DialogContent className="rounded-md sm:max-w-[700px]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(formSubmitHandler)}>
          <DialogHeader>
            <DialogTitle className="mb-2 text-left">{dialogTitle}</DialogTitle>
            <DialogDescription asChild>
              <div className="pb-4 pt-4 text-left">
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    name="name"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-left font-medium text-high-emphasis">
                          {t("NEW_NOTIFICATION_CONFIGURATION.NAME")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            disabled={isEdit}
                            id="configName"
                            placeholder={t("NEW_NOTIFICATION_CONFIGURATION.ENTER_NAME")}
                            className="border-default col-span-3 mt-1 border shadow-none"
                            {...field}
                            onBlur={(e) => {
                              field.onChange(e.target.value.trim());
                              field.onBlur();
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <FormField
                    name="channelToNotify"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-left font-medium text-high-emphasis">
                          {t("NEW_NOTIFICATION_CONFIGURATION.CHANNEL_TO_NOTIFY")}
                        </FormLabel>
                        <Select
                          disabled={true}
                          onValueChange={(val) => field.onChange(Number(val))}
                          defaultValue={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger className="border-default col-span-3 flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm shadow-none">
                              <SelectValue placeholder={t("NEW_NOTIFICATION_CONFIGURATION.SELECT_CONFIGURATION")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {channelsToNotify.map((channel) => (
                              <SelectItem
                                key={channel.value}
                                value={String(channel.value)}
                              >
                                {channel.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="notificationType"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-left font-medium text-high-emphasis">
                          {t("NEW_NOTIFICATION_CONFIGURATION.NOTIFICATION_TYPE")}
                        </FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(Number(val))}
                          defaultValue={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger className="border-default col-span-3 flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm shadow-none">
                              <SelectValue placeholder={t("NEW_NOTIFICATION_CONFIGURATION.SELECT_NOTIFICATION_TYPE")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {notificationTypes.map((type) => (
                              <SelectItem
                                key={type.value}
                                value={String(type.value)}
                              >
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <FormField
                    name="notifyMethod"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-left font-medium text-high-emphasis">
                          {t("NEW_NOTIFICATION_CONFIGURATION.NOTIFY_METHOD")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            id="notifyMethod"
                            placeholder={t("NEW_NOTIFICATION_CONFIGURATION.ENTER_NOTIFY_METHOD")}
                            className="border-default col-span-3 mt-1 border shadow-none"
                            {...field}
                            onBlur={(e) => {
                              field.onChange(e.target.value.trim());
                              field.onBlur();
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mt-4">
                  <FormField
                    name="enablePersistence"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Checkbox
                            className="mr-2"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                        <FormLabel className="flex-start inline-flex">
                          {t("NEW_NOTIFICATION_CONFIGURATION.ENABLE_PERSISTENCE")}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <div className="flex flex-row justify-end gap-2">
              <DialogTrigger asChild>
                <Button variant="outline" size="default" disabled={isPending}>
                  {t("common:CANCEL")}
                </Button>
              </DialogTrigger>
              <Button
                disabled={isPending || !form.formState.isValid}
                size="default"
              >
                {t("common:SAVE")}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
};

export default NewNotificationConfiguration;
