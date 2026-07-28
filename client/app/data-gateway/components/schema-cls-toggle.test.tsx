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

import { SchemaClsToggle } from "./schema-cls-toggle";

function renderToggle(props = {}) {
  render(
    <TooltipProvider>
      <SchemaClsToggle schemaId="s1" projectKey="pk" {...props} />
    </TooltipProvider>,
  );
}

describe("SchemaClsToggle", () => {
  beforeEach(() => {
    setRowColumnPermission.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
  });

  it("renders the labelled switch", () => {
    renderToggle();
    expect(screen.getByText("Column Level Security")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    ).toBeInTheDocument();
  });

  it("warns that enabling CLS also enables RLS when RLS is off", async () => {
    const user = userEvent.setup();
    renderToggle({ isRlsEnabled: false });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    expect(
      await screen.findByText("Enable column level security?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Enabling CLS will also enable RLS/i),
    ).toBeInTheDocument();
  });

  it("confirms enabling CLS and calls the mutation", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockResolvedValue({ isSuccess: true });
    renderToggle({ isRlsEnabled: true });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    await user.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() =>
      expect(setRowColumnPermission).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: "pk", schemaId: "s1" }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("reverts and shows an error toast when the mutation throws", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockRejectedValue(new Error("boom"));
    renderToggle({ isClsEnabled: false, isRlsEnabled: true });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    await user.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("enables column and row level security together when RLS is off", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockResolvedValue({ isSuccess: true });
    renderToggle({ isClsEnabled: false, isRlsEnabled: false });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    await user.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Column and row level security enabled successfully.",
      }),
    );
  });

  it("shows an error toast when the response is not successful", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockResolvedValue({ isSuccess: false });
    renderToggle({ isClsEnabled: false, isRlsEnabled: true });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    await user.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: "Something went wrong",
      }),
    );
  });

  it("disables CLS through the disable confirmation", async () => {
    const user = userEvent.setup();
    setRowColumnPermission.mockResolvedValue({ isSuccess: true });
    renderToggle({ isClsEnabled: true, isRlsEnabled: true });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    expect(
      await screen.findByText("Disable column level security?"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Column level security disabled successfully.",
      }),
    );
  });

  it("clears the pending value when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    renderToggle({ isClsEnabled: false, isRlsEnabled: true });

    await user.click(
      screen.getByRole("switch", { name: "Toggle column level security" }),
    );
    expect(
      await screen.findByText("Enable column level security?"),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByText("Enable column level security?"),
      ).not.toBeInTheDocument(),
    );
    expect(setRowColumnPermission).not.toHaveBeenCalled();
  });
});
