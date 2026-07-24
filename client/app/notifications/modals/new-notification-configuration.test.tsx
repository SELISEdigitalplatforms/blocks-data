import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const useSaveNotificationConfig = vi.fn();
vi.mock("../hooks/use-notifications", () => ({
  useSaveNotificationConfig: () => useSaveNotificationConfig(),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({
    selectedProject: { tenantId: "tenant-1" },
  }),
}));

const toast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: (...a: unknown[]) => toast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { Dialog } from "@/components/ui-kits/dialog/dialog";
import NewNotificationConfiguration from "./new-notification-configuration";

function renderModal(props: Partial<Parameters<typeof NewNotificationConfiguration>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Dialog open>
      <NewNotificationConfiguration
        dialogTitle="Add configuration"
        onClose={onClose}
        isEdit={false}
        {...props}
      />
    </Dialog>,
  );
  return { onClose, ...utils };
}

afterEach(() => vi.clearAllMocks());

describe("NewNotificationConfiguration", () => {
  it("renders the create form with a disabled Save button until valid", () => {
    useSaveNotificationConfig.mockReturnValue({ isPending: false, mutateAsync });
    renderModal();

    expect(screen.getByText("Add configuration")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter notify method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a loading state when editing a record that has no itemId yet", () => {
    useSaveNotificationConfig.mockReturnValue({ isPending: false, mutateAsync });
    render(
      <Dialog open>
        <NewNotificationConfiguration
          dialogTitle="Edit"
          onClose={vi.fn()}
          isEdit
          previousData={{
            itemId: "",
            name: "",
            channelToNotify: 0,
            notificationType: 0,
            enablePersistence: false,
            notifyMethod: "",
          }}
        />
      </Dialog>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("prefills fields when editing an existing configuration", () => {
    useSaveNotificationConfig.mockReturnValue({ isPending: false, mutateAsync });
    render(
      <Dialog open>
        <NewNotificationConfiguration
          dialogTitle="Edit configuration"
          onClose={vi.fn()}
          isEdit
          previousData={{
            itemId: "cfg-1",
            name: "My config",
            channelToNotify: 0,
            notificationType: 1,
            enablePersistence: true,
            notifyMethod: "email",
          }}
        />
      </Dialog>,
    );
    expect(screen.getByDisplayValue("My config")).toBeInTheDocument();
    expect(screen.getByDisplayValue("email")).toBeInTheDocument();
    // Name field is disabled in edit mode.
    expect(screen.getByDisplayValue("My config")).toBeDisabled();
  });

  it("submits a valid form and shows a success toast, then closes", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    useSaveNotificationConfig.mockReturnValue({ isPending: false, mutateAsync });
    const { onClose } = renderModal();

    await user.type(screen.getByPlaceholderText("Enter name"), "Valid name");
    await user.type(screen.getByPlaceholderText("Enter notify method"), "email");

    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Valid name",
        notifyMethod: "email",
        projectKey: "tenant-1",
        isUpdateRequest: false,
      }),
    );
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
  });

  it("surfaces an error toast when the save fails logically", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { name: "taken" } });
    useSaveNotificationConfig.mockReturnValue({ isPending: false, mutateAsync });
    renderModal();

    await user.type(screen.getByPlaceholderText("Enter name"), "Valid name");
    await user.type(screen.getByPlaceholderText("Enter notify method"), "email");
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: { name: "taken" } }),
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it("surfaces an error toast when mutateAsync throws a non-error value", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue("boom");
    useSaveNotificationConfig.mockReturnValue({ isPending: false, mutateAsync });
    renderModal();

    await user.type(screen.getByPlaceholderText("Enter name"), "Valid name");
    await user.type(screen.getByPlaceholderText("Enter notify method"), "email");
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });
});
