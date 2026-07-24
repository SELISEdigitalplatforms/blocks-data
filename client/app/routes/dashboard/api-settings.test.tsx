import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetApiEndpoints = vi.fn();
const updateEndpoint = vi.fn();
const bulkUpdate = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

// Capture the props ServiceGroupCard / BulkActionBar receive so the tests can
// drive every handler on the page through realistic child callbacks.
let lastCardProps: Record<string, unknown> = {};
let lastBarProps: Record<string, unknown> = {};

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("@blocks-idp/api-settings/hooks/use-api-settings", () => ({
  useGetApiEndpoints: (...a: unknown[]) => useGetApiEndpoints(...a),
  useUpdateApiEndpoint: () => ({ mutateAsync: updateEndpoint }),
  useBulkUpdateApiEndpoints: () => ({ mutateAsync: bulkUpdate }),
}));
vi.mock("@blocks-idp/api-settings/components/service-group-card", () => ({
  ServiceGroupCard: (props: Record<string, unknown>) => {
    lastCardProps = props;
    return <div data-testid={`card-${props.controller as string}`} />;
  },
}));
vi.mock("@blocks-idp/api-settings/components/bulk-action-bar", () => ({
  BulkActionBar: (props: Record<string, unknown>) => {
    lastBarProps = props;
    return <div data-testid="bulk-bar">selected:{String(props.selectedCount)}</div>;
  },
}));

import ApiSettingsPage from "./api-settings";

const ep = (over: Partial<Record<string, unknown>> = {}) => ({
  itemId: "e1",
  service: "svc-a",
  controller: "Users",
  method: "get",
  description: "d",
  baseUrl: "https://api.example.com",
  version: "v1",
  isMFARequired: false,
  isCaptchaRequired: false,
  mfaType: 0,
  captchaProvider: 0,
  ...over,
});

const ok = { isSuccess: true, errors: null };
const fail = { isSuccess: false, errors: ["boom"] };

beforeEach(() => {
  vi.clearAllMocks();
  lastCardProps = {};
  lastBarProps = {};
  useGetApiEndpoints.mockReturnValue({ data: { data: [ep()] }, isLoading: false });
  updateEndpoint.mockResolvedValue(ok);
  bulkUpdate.mockResolvedValue(ok);
});

describe("ApiSettingsPage", () => {
  it("renders loading skeletons while fetching", () => {
    useGetApiEndpoints.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<ApiSettingsPage />);
    expect(screen.getByText("API Settings")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no endpoints", () => {
    useGetApiEndpoints.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<ApiSettingsPage />);
    expect(screen.getByText("No API endpoints configured.")).toBeInTheDocument();
  });

  it("groups endpoints by service and controller and builds swagger urls", () => {
    useGetApiEndpoints.mockReturnValue({
      data: {
        data: [
          ep({ itemId: "1", service: "svc-b", controller: "Roles", method: "post" }),
          ep({ itemId: "2", service: "svc-a", controller: "Users", method: "get" }),
          ep({ itemId: "3", service: "svc-a", controller: "Users", method: "delete" }),
        ],
      },
      isLoading: false,
    });
    render(<ApiSettingsPage />);
    // Service headings, alphabetically sorted svc-a before svc-b.
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(["svc-a", "svc-b"]);
    // Swagger json link is rendered for a service.
    expect(
      screen.getByTitle("https://api.example.com/svc-a/v1/swagger/v1/swagger.json"),
    ).toBeInTheDocument();
    // A controller card was rendered.
    expect(screen.getByTestId("card-Users")).toBeInTheDocument();
  });

  it("opens the swagger UI in a new tab from the API Docs button", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ApiSettingsPage />);
    await user.click(screen.getByRole("button", { name: /API Docs/ }));
    expect(openSpy).toHaveBeenCalledWith(
      "https://api.example.com/svc-a/v1/swagger/index.html",
      "_blank",
    );
    openSpy.mockRestore();
  });

  it("toggles MFA for a single endpoint and shows success", async () => {
    render(<ApiSettingsPage />);
    await (lastCardProps.onToggleMfa as (e: unknown, v: boolean) => Promise<void>)(ep(), true);
    expect(updateEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "e1", isMFARequired: true, projectKey: "t-1" }),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("surfaces an error toast when the single MFA update fails", async () => {
    updateEndpoint.mockResolvedValue(fail);
    render(<ApiSettingsPage />);
    await (lastCardProps.onToggleMfa as (e: unknown, v: boolean) => Promise<void>)(ep(), true);
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(expect.objectContaining({ errors: "boom" })),
    );
  });

  it("toggles Captcha for a single endpoint and reports failure text", async () => {
    updateEndpoint.mockResolvedValue({ isSuccess: false, errors: null });
    render(<ApiSettingsPage />);
    await (lastCardProps.onToggleCaptcha as (e: unknown, v: boolean) => Promise<void>)(ep(), true);
    expect(updateEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ isCaptchaRequired: true }),
    );
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("performs group-level bulk MFA / Captcha / disable-all", async () => {
    useGetApiEndpoints.mockReturnValue({
      data: { data: [ep({ itemId: "a", isCaptchaRequired: true, isMFARequired: true })] },
      isLoading: false,
    });
    render(<ApiSettingsPage />);
    await (lastCardProps.onBulkGroupMfa as (ids: string[], v: boolean) => Promise<void>)(["a"], true);
    expect(bulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isMFARequired: true, isCaptchaRequired: true, disableAll: false }),
    );

    bulkUpdate.mockResolvedValue(fail);
    await (lastCardProps.onBulkGroupCaptcha as (ids: string[], v: boolean) => Promise<void>)(
      ["a"],
      true,
    );
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("drives the bulk action bar: select, enable MFA, enable Captcha, clear", async () => {
    useGetApiEndpoints.mockReturnValue({
      data: { data: [ep({ itemId: "x" }), ep({ itemId: "y", isMFARequired: true })] },
      isLoading: false,
    });
    render(<ApiSettingsPage />);

    // Select two endpoints through the card callbacks.
    (lastCardProps.onSelectEndpoint as (id: string, c: boolean) => void)("x", true);
    (lastCardProps.onSelectGroup as (ids: string[], c: boolean) => void)(["y"], true);
    await waitFor(() =>
      expect(screen.getByTestId("bulk-bar")).toHaveTextContent("selected:2"),
    );

    await (lastBarProps.onEnableMfa as () => Promise<void>)();
    expect(bulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isMFARequired: true, itemIds: expect.arrayContaining(["x", "y"]) }),
    );

    // Re-select then enable captcha (selection was cleared after MFA success).
    (lastCardProps.onSelectEndpoint as (id: string, c: boolean) => void)("x", true);
    await (lastBarProps.onEnableCaptcha as () => Promise<void>)();
    expect(bulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isCaptchaRequired: true }),
    );

    // Deselect via clear.
    (lastCardProps.onSelectEndpoint as (id: string, c: boolean) => void)("x", true);
    (lastBarProps.onClear as () => void)();
    await waitFor(() =>
      expect(screen.getByTestId("bulk-bar")).toHaveTextContent("selected:0"),
    );
  });

  it("shows an error toast when the group disable-all bulk update fails", async () => {
    bulkUpdate.mockResolvedValue(fail);
    render(<ApiSettingsPage />);
    await (lastCardProps.onBulkGroupMfa as (ids: string[], v: boolean) => Promise<void>)(["e1"], false);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
