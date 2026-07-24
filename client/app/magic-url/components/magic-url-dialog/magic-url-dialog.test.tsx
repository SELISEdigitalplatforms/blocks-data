import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMagicUrl = vi.fn();
const toast = vi.fn();
let isPending = false;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ user: { itemId: "user-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/magic-url/hooks/use-magic-url", () => ({
  useCreateMagicUrl: () => ({ mutate: createMagicUrl, isPending }),
}));

import { MagicUrlDialog } from "./magic-url-dialog";

const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText("https://example.com"), "https://example.com");
  await user.type(screen.getByPlaceholderText("My Magic Link"), "Launch link");
};

beforeEach(() => {
  vi.clearAllMocks();
  isPending = false;
  createMagicUrl.mockImplementation((_payload, opts) => opts?.onSuccess?.());
});

describe("MagicUrlDialog", () => {
  it("renders the dialog header and disabled Create button when invalid", () => {
    render(<MagicUrlDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Magic URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("enables Create once the form is valid and submits the payload", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<MagicUrlDialog open onOpenChange={onOpenChange} />);
    await fillValid(user);

    const createBtn = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(createBtn).toBeEnabled());
    await user.click(createBtn);

    expect(createMagicUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "https://example.com",
        name: "Launch link",
        type: 1,
        projectKey: "tenant-1",
        requestByUserId: "user-1",
      }),
      expect.any(Object),
    );
    // Success path shows a toast and closes the dialog.
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("surfaces an error toast when creation fails", async () => {
    createMagicUrl.mockImplementation((_p, opts) => opts?.onError?.(new Error("bad")));
    const user = userEvent.setup();
    render(<MagicUrlDialog open onOpenChange={vi.fn()} />);
    await fillValid(user);
    const createBtn = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(createBtn).toBeEnabled());
    await user.click(createBtn);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("reveals the usage-limit input when the switch is toggled", async () => {
    const user = userEvent.setup();
    render(<MagicUrlDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("switch", { name: /Set Usage Limit/ }));
    expect(screen.getByPlaceholderText("Enter usage limit")).toBeInTheDocument();
  });

  it("reveals the date picker when auto-expiry is toggled on", async () => {
    const user = userEvent.setup();
    render(<MagicUrlDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("switch", { name: /Set Auto Expiry Date/ }));
    expect(screen.getByRole("button", { name: /Pick a date/ })).toBeInTheDocument();
  });

  it("prefills fields from initialData when opened", () => {
    render(
      <MagicUrlDialog
        open
        onOpenChange={vi.fn()}
        initialData={
          {
            uri: "https://seed.example.com",
            name: "Seeded",
            type: "1",
            requestMethod: "GET",
            usageLimit: 5,
            persistent: true,
            expiryDate: new Date().toISOString(),
          } as never
        }
      />,
    );
    expect(screen.getByDisplayValue("https://seed.example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Seeded")).toBeInTheDocument();
    // usageLimit > 0 pre-checks the switch and shows the value.
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });

  it("cancels and closes without creating", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<MagicUrlDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createMagicUrl).not.toHaveBeenCalled();
  });
});
