import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
let configData: unknown = undefined;
let isConfigLoading = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/magic-url/hooks/use-magic-url", () => ({
  useGetMagicUrlConfig: () => ({ data: configData, isLoading: isConfigLoading }),
}));
vi.mock("@/magic-url/utils/url.util", () => ({
  getDefaultShortUrlBase: () => "https://short.example.com/",
  isValidUrl: (u: string) => /^https?:\/\//.test(u),
}));

import { MagicUrlConfigDialog } from "./magic-url-config-dialog";

const renderDialog = (props: Record<string, unknown> = {}) =>
  render(
    <MagicUrlConfigDialog
      open
      onOpenChange={vi.fn()}
      projectKey="tenant-1"
      {...props}
    />,
    { wrapper: createWrapper() },
  );

beforeEach(() => {
  vi.clearAllMocks();
  configData = { isSuccess: true, config: null };
  isConfigLoading = false;
});

describe("MagicUrlConfigDialog", () => {
  it("shows a loading spinner while the config is loading", () => {
    isConfigLoading = true;
    renderDialog();
    // Dialog content is portaled to document.body.
    expect(document.body.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("seeds default values when no existing config is present", async () => {
    configData = { isSuccess: true, config: null };
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Context Name/)).toHaveValue("Default"),
    );
    expect(screen.getByLabelText(/Short URL Base/)).toHaveValue(
      "https://short.example.com/",
    );
  });

  it("prefills values from an existing config", async () => {
    configData = {
      isSuccess: true,
      config: { contextName: "MyCtx", shortUrlBase: "https://s.io/" },
    };
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Context Name/)).toHaveValue("MyCtx"),
    );
  });

  it("validates required and malformed fields before saving", async () => {
    const user = userEvent.setup();
    configData = { isSuccess: true, config: null };
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Context Name/)).toHaveValue("Default"),
    );
    // Clear both fields to trigger required errors.
    await user.clear(screen.getByLabelText(/Context Name/));
    await user.clear(screen.getByLabelText(/Short URL Base/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Context name is required")).toBeInTheDocument();
    expect(screen.getByText("Short URL base is required")).toBeInTheDocument();
  });

  it("rejects a URL that does not end with a slash", async () => {
    const user = userEvent.setup();
    configData = { isSuccess: true, config: null };
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Short URL Base/)).toHaveValue(
        "https://short.example.com/",
      ),
    );
    const input = screen.getByLabelText(/Short URL Base/);
    await user.clear(input);
    await user.type(input, "https://no-slash.io");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("URL must end with a forward slash (/)"),
    ).toBeInTheDocument();
  });

  it("saves a valid config and shows success", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    configData = { isSuccess: true, config: { contextName: "C", shortUrlBase: "https://s.io/" } };
    renderDialog({ onSave, onOpenChange });
    await waitFor(() =>
      expect(screen.getByLabelText(/Context Name/)).toHaveValue("C"),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(showSuccessToast).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast when the config response was not successful", async () => {
    const user = userEvent.setup();
    configData = {
      isSuccess: false,
      errorMessage: "save failed",
      config: { contextName: "C", shortUrlBase: "https://s.io/" },
    };
    renderDialog();
    await waitFor(() =>
      expect(screen.getByLabelText(/Context Name/)).toHaveValue("C"),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "save failed" }),
    );
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("does nothing on save when no projectKey is provided", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    configData = { isSuccess: true, config: { contextName: "C", shortUrlBase: "https://s.io/" } };
    renderDialog({ projectKey: undefined, onSave });
    await waitFor(() => screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders a trigger that opens the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <MagicUrlConfigDialog
        open={false}
        onOpenChange={onOpenChange}
        projectKey="tenant-1"
        trigger={<span>Open config</span>}
      />,
      { wrapper: createWrapper() },
    );
    await user.click(screen.getByText("Open config"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
