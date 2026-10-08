import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetUnadaptedChangeLogs = vi.fn();
const reloadMutateAsync = vi.fn();
const reloadIsPending = { current: false };
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
const useSchemaVersionHistory = vi.fn();
const rollbackMutateAsync = vi.fn();

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("../../hooks/use-configuration", () => ({
  useGetUnadaptedChangeLogs: () => useGetUnadaptedChangeLogs(),
  useSchemasReload: () => ({
    mutateAsync: reloadMutateAsync,
    isPending: reloadIsPending.current,
  }),
  useSchemaVersionHistory: () => useSchemaVersionHistory(),
  useSchemaRollback: () => ({ mutateAsync: rollbackMutateAsync, isPending: false }),
}));

import { PublishControl } from "./publish-control";

describe("PublishControl", () => {
  beforeEach(() => {
    reloadMutateAsync.mockReset();
    showSuccessToast.mockReset();
    showErrorToast.mockReset();
    reloadIsPending.current = false;
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [] } });
    rollbackMutateAsync.mockReset();
    // No history by default, as for a role without the history permission.
    useSchemaVersionHistory.mockReturnValue({ data: undefined });
  });

  it("counts the waiting changes", () => {
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }, { id: "b" }] } });
    render(<PublishControl />);

    expect(screen.getByText("2 unpublished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish/ })).toBeInTheDocument();
  });

  // Reloading the gateway is still worth doing with nothing pending, so the
  // control stays clickable — it just stops competing for attention.
  it("stays available but quiet when nothing is pending", async () => {
    const user = userEvent.setup();
    reloadMutateAsync.mockResolvedValue({ isSuccess: true });
    render(<PublishControl />);

    expect(screen.queryByText(/unpublished/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(reloadMutateAsync).toHaveBeenCalled());
  });

  it("reports a successful publish", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadMutateAsync.mockResolvedValue({ isSuccess: true });
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));
    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Schemas published successfully",
      }),
    );
  });

  it("shows a retry after a rejected publish", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadMutateAsync.mockRejectedValue(new Error("boom"));
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));

    expect(await screen.findByText("Publish failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(showErrorToast).toHaveBeenCalled();
  });

  // A schema that does not build is refused with the reason, which the admin
  // needs to fix their drafts.
  it("shows why the schema could not be published", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    const reason = "The schema could not be published because it does not build: bad type";
    reloadMutateAsync.mockRejectedValue(
      Object.assign(new Error("400"), { status: 400, errors: { message: reason } }),
    );
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: { message: reason } }),
    );
  });

  // The API answers 200 with isSuccess:false, which is not an exception.
  it("treats an unsuccessful response as a failure too", async () => {
    const user = userEvent.setup();
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadMutateAsync.mockResolvedValue({ isSuccess: false });
    render(<PublishControl />);

    await user.click(screen.getByRole("button", { name: /Publish/ }));

    expect(await screen.findByText("Publish failed")).toBeInTheDocument();
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("locks the button while the reload is in flight", () => {
    useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
    reloadIsPending.current = true;
    render(<PublishControl />);

    expect(screen.getByText("Publishing…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish/ })).toBeDisabled();
  });

  describe("version history", () => {
    const history = {
      isSuccess: true,
      data: {
        currentVersion: 12,
        versions: [
          {
            version: 12,
            kind: "Publish",
            publishedDate: new Date().toISOString(),
            publishedBy: "Ada Karim",
            changeCount: 3,
            schemaCount: 4,
            isCurrent: true,
          },
          {
            version: 11,
            kind: "Publish",
            publishedDate: "2026-10-06T08:00:00Z",
            publishedBy: "Rafi Islam",
            changeCount: 1,
            schemaCount: 4,
            isCurrent: false,
          },
          {
            version: 10,
            kind: "Bootstrap",
            publishedDate: "2026-10-02T08:00:00Z",
            publishedBy: null,
            changeCount: 0,
            schemaCount: 3,
            isCurrent: false,
          },
        ],
      },
    };

    it("names the live version", () => {
      useSchemaVersionHistory.mockReturnValue({ data: history });
      render(<PublishControl />);

      expect(screen.getByText("Published · v12")).toBeInTheDocument();
    });

    it("names the live version next to pending changes", () => {
      useSchemaVersionHistory.mockReturnValue({ data: history });
      useGetUnadaptedChangeLogs.mockReturnValue({ data: { data: [{ id: "a" }] } });
      render(<PublishControl />);

      expect(screen.getByText(/live v12/)).toBeInTheDocument();
    });

    it("leaves the version and the history out without access to it", () => {
      render(<PublishControl />);

      expect(screen.getByText("Published")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Version history" })).not.toBeInTheDocument();
    });

    it("lists the kept versions with the live one marked", async () => {
      const user = userEvent.setup();
      useSchemaVersionHistory.mockReturnValue({ data: history });
      render(<PublishControl />);

      await user.click(screen.getByRole("button", { name: "Version history" }));

      expect(await screen.findByText("Live")).toBeInTheDocument();
      expect(screen.getByText(/Rafi Islam · 1 change$/)).toBeInTheDocument();
      expect(screen.getByText(/First version · from drafts/)).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Roll back" })).toHaveLength(2);
    });

    it("rolls back after the admin confirms", async () => {
      const user = userEvent.setup();
      useSchemaVersionHistory.mockReturnValue({ data: history });
      rollbackMutateAsync.mockResolvedValue({
        isSuccess: true,
        data: { version: 11, previousVersion: 12 },
      });
      render(<PublishControl />);

      await user.click(screen.getByRole("button", { name: "Version history" }));
      await user.click((await screen.findAllByRole("button", { name: "Roll back" }))[0]);

      expect(await screen.findByText("Roll back to version 11?")).toBeInTheDocument();
      expect(screen.getByText(/Your drafts don't change/)).toBeInTheDocument();
      expect(rollbackMutateAsync).not.toHaveBeenCalled();

      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Roll back" }));

      await waitFor(() => expect(rollbackMutateAsync).toHaveBeenCalledWith(11));
      await waitFor(() =>
        expect(showSuccessToast).toHaveBeenCalledWith({ description: "Version 11 is live" }),
      );
    });

    it("does nothing when the rollback is cancelled", async () => {
      const user = userEvent.setup();
      useSchemaVersionHistory.mockReturnValue({ data: history });
      render(<PublishControl />);

      await user.click(screen.getByRole("button", { name: "Version history" }));
      await user.click((await screen.findAllByRole("button", { name: "Roll back" }))[0]);
      await user.click(await screen.findByRole("button", { name: "Cancel" }));

      await waitFor(() =>
        expect(screen.queryByText("Roll back to version 11?")).not.toBeInTheDocument(),
      );
      expect(rollbackMutateAsync).not.toHaveBeenCalled();
    });

    it("shows why a rollback failed", async () => {
      const user = userEvent.setup();
      useSchemaVersionHistory.mockReturnValue({ data: history });
      rollbackMutateAsync.mockRejectedValue(
        Object.assign(new Error("404"), {
          status: 404,
          errors: { message: "Schema version 11 does not exist or is no longer kept." },
        }),
      );
      render(<PublishControl />);

      await user.click(screen.getByRole("button", { name: "Version history" }));
      await user.click((await screen.findAllByRole("button", { name: "Roll back" }))[0]);
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Roll back" }),
      );

      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith({
          errors: { message: "Schema version 11 does not exist or is no longer kept." },
        }),
      );
    });
  });
});
