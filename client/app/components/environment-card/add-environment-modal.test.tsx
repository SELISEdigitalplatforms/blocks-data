import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
let isPending = false;

vi.mock("@/hooks/use-project", () => ({
  useCreateProject: () => ({ mutateAsync, isPending }),
}));

import { AddEnvironmentModal } from "./add-environment-modal";

beforeEach(() => {
  vi.clearAllMocks();
  isPending = false;
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("AddEnvironmentModal", () => {
  it("lists the available environment options", () => {
    render(<AddEnvironmentModal />);
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
  });

  it("hides pre-selected environments", () => {
    render(<AddEnvironmentModal preSelectedEnvironments={["dev"]} />);
    expect(screen.queryByText("Development")).not.toBeInTheDocument();
    expect(screen.getByText("Testing")).toBeInTheDocument();
  });

  it("keeps Add disabled until an environment is selected", async () => {
    const user = userEvent.setup();
    render(<AddEnvironmentModal tenantGroupId="tg-1" onClose={vi.fn()} />);
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    // Options render in environmentOptions order; index 0 is Development (dev).
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(add).toBeEnabled();
  });

  it("cancels with an empty selection", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddEnvironmentModal tenantGroupId="tg-1" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledWith([]);
  });

  it("creates the project and reports the sorted selection on Add", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AddEnvironmentModal
        tenantGroupId="tg-9"
        projectName="Demo"
        onClose={onClose}
      />,
    );
    // Select Production (index 7) first, then Development (index 0): the save
    // must re-sort them by environmentOptions index.
    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[7]);
    await user.click(boxes[0]);
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.name).toBe("Demo");
    expect(payload.tenantGroupId).toBe("tg-9");
    expect(payload.applicationContexts.map((c: { environment: string }) => c.environment)).toEqual(
      ["dev", "prod"],
    );
    expect(onClose).toHaveBeenCalledWith(["dev", "prod"]);
  });

  it("does nothing on Add without a tenant group", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddEnvironmentModal onClose={onClose} />);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalledWith(["dev"]);
  });
});
