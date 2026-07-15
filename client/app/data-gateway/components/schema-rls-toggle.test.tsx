import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const setRowColumnPermission = vi.fn();
vi.mock("../hooks/use-configuration", () => ({
  useSetRowColumnPermission: () => ({
    mutateAsync: setRowColumnPermission,
    isPending: false,
  }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { SchemaRlsToggle } from "./schema-rls-toggle";

function renderToggle(props = {}) {
  render(
    <TooltipProvider>
      <SchemaRlsToggle schemaId="s1" projectKey="pk" {...props} />
    </TooltipProvider>,
  );
}

describe("SchemaRlsToggle", () => {
  beforeEach(() => {
    setRowColumnPermission.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
  });

  it("renders the labelled switch", () => {
    renderToggle();
    expect(screen.getByText("Row Level Security")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Toggle row level security" }),
    ).toBeInTheDocument();
  });

  it("opens the enable-confirmation dialog when toggled on", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(
      screen.getByRole("switch", { name: "Toggle row level security" }),
    );
    expect(
      await screen.findByText("Enable row level security?"),
    ).toBeInTheDocument();
  });

  it("calls the permission mutation and shows success on confirm", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockResolvedValue({ isSuccess: true });
    renderToggle();

    await user.click(
      screen.getByRole("switch", { name: "Toggle row level security" }),
    );
    await user.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() =>
      expect(setRowColumnPermission).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: "pk", schemaId: "s1", operation: 1 }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("shows an error toast when the mutation reports failure", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockResolvedValue({ isSuccess: false });
    renderToggle();

    await user.click(
      screen.getByRole("switch", { name: "Toggle row level security" }),
    );
    await user.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
