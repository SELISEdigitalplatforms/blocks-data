import { Button } from "@/components/ui-kits/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui-kits/label/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui-kits/radio-group/radio-group";
import { showErrorToast, showSuccessToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  useCreateDataSourceConfiguration,
  useUpdateDataSourceConfiguration,
} from "../hooks/use-configuration";
import {
  IDataServiceConfiguration,
  IDataSourceFormValues,
  IDataSourceResponse,
} from "../models/data-service";
import ConfirmationModal from "@/components/confirmation-modal/confirmation-modal";

interface DataSourceProps {
  onCancel: () => void;
  onConfirm: () => void;
  mode?: "create" | "edit";
  initialData?: IDataSourceResponse;
}

const ConfigureDataSourceModal: React.FC<DataSourceProps> = ({
  onCancel,
  onConfirm,
  mode = "create",
  initialData,
}) => {
  const isEditMode = mode === "edit";

  const projectKey = useProjectStore().selectedProject?.tenantId || "";

  const [selectedSource, setSelectedSource] = useState(
    initialData?.dbConnectionString &&
      initialData.dbConnectionString !== "default"
      ? "others"
      : "blocks",
  );

  const [isUpdateSourceDialogOpen, setIsUpdateSourceDialogOpen] =
    useState(false);
  const updateDataSourceConfirmationModalData = {
    dialogTitle: "Confirm data source update?",
    dialogSubtitle:
      "Changing the data source will affect all existing data. You will need to manually migrate any required data to the new source. Are you sure you want to proceed?",
    confirmButton: "Confirm",
    cancelButton: "Cancel",
  };

  const { mutateAsync: createDataSource } = useCreateDataSourceConfiguration();
  const {
    isPending: isUpdateDataSourcePending,
    mutateAsync: updateDataSource,
  } = useUpdateDataSourceConfiguration();

  const sourceForm = useForm<IDataSourceFormValues>({
    mode: "onChange",
    defaultValues: {
      dbConnectionString: initialData?.dbConnectionString || "",
      databaseName: initialData?.databaseName || "",
    },
  });

  const handleDataSourceSave = () => {
    if (isEditMode) {
      setIsUpdateSourceDialogOpen(true);
      onConfirm();
    } else {
      saveDataSource();
    }
  };

  const saveDataSource = async () => {
    try {
      const formData = sourceForm.getValues();

      const payload: IDataServiceConfiguration = {
        connectionString:
          selectedSource === "others" ? formData.dbConnectionString : "default",
        databaseName:
          selectedSource === "others" ? formData.databaseName : "default",
        projectKey: projectKey,
        itemId: initialData?.ItemId || "",
      };

      const res = isEditMode
        ? await updateDataSource(payload)
        : await createDataSource(payload);

      if (res.isSuccess) {
        showSuccessToast({
          description: isEditMode
            ? "Data source updated successfully"
            : "Data source saved successfully",
        });
      } else {
        showErrorToast({ errors: res.errors });
      }

      setIsUpdateSourceDialogOpen(false);
      onConfirm();
    } catch (error) {
      if (isErrorWithErrors(error)) {
        showErrorToast({ errors: error.errors });
      }
    }
  };

  return (
    <>
      <DialogContent className="mr-4 w-full max-w-[425px] rounded-md">
        <DialogHeader>
          <DialogTitle className="text-left text-lg font-semibold leading-7">
            {isEditMode ? "Edit data source" : "Configure data source"}
          </DialogTitle>

          <DialogDescription className="mb-6 mt-2 text-left text-sm font-normal leading-5 text-medium-emphasis">
            {isEditMode
              ? "Update your existing data connection settings"
              : "Select a source to set up your data connection"}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedSource} onValueChange={setSelectedSource}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="blocks" value="blocks" />
            <Label
              htmlFor="blocks"
              className="cursor-pointer text-sm font-medium"
            >
              Blocks database
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="others" value="others" />
            <Label
              htmlFor="others"
              className="cursor-pointer text-sm font-medium"
            >
              My data sources
            </Label>
          </div>
        </RadioGroup>

        {selectedSource === "others" && (
          <Form {...sourceForm}>
            <FormField
              control={sourceForm.control}
              name="dbConnectionString"
              rules={{ required: "Connection string is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Connection string</FormLabel>
                  <FormControl>
                    <Input placeholder="Write here" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={sourceForm.control}
              name="databaseName"
              rules={{ required: "Database name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Database name</FormLabel>
                  <FormControl>
                    <Input placeholder="Write here" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        )}

        <DialogFooter className="mt-4 flex flex-row gap-2">
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </DialogTrigger>

          <Button
            size="sm"
            onClick={handleDataSourceSave}
            disabled={
              selectedSource === "others" && !sourceForm.formState.isValid
            }
          >
            {isEditMode ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={isUpdateSourceDialogOpen}
        onOpenChange={setIsUpdateSourceDialogOpen}
      >
        <ConfirmationModal
          onCancel={() => {}}
          onConfirm={saveDataSource}
          data={updateDataSourceConfirmationModalData}
          buttonState={{ confirm: { disable: isUpdateDataSourcePending } }}
        />
      </Dialog>
    </>
  );
};

export default ConfigureDataSourceModal;
