import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./endpoint-row", () => ({
  EndpointRow: ({ endpoint }: { endpoint: { itemId: string } }) => (
    <div data-testid="endpoint-row">{endpoint.itemId}</div>
  ),
}));
vi.mock("./security-presets-popover", () => ({
  SecurityPresetsPopover: ({
    onEnableAllMfa,
    onEnableAllCaptcha,
  }: {
    onEnableAllMfa: () => void;
    onEnableAllCaptcha: () => void;
  }) => (
    <div>
      <button data-testid="enable-mfa" onClick={onEnableAllMfa}>
        mfa
      </button>
      <button data-testid="enable-captcha" onClick={onEnableAllCaptcha}>
        captcha
      </button>
    </div>
  ),
}));

import { ServiceGroupCard } from "./service-group-card";

const endpoints = [
  { itemId: "e1" },
  { itemId: "e2" },
] as never[];

function renderCard(overrides: Record<string, unknown> = {}) {
  const props = {
    controller: "UserController",
    endpoints,
    selectedIds: new Set<string>(),
    onSelectEndpoint: vi.fn(),
    onSelectGroup: vi.fn(),
    onToggleMfa: vi.fn(),
    onToggleCaptcha: vi.fn(),
    onBulkGroupMfa: vi.fn(),
    onBulkGroupCaptcha: vi.fn(),
    ...overrides,
  };
  render(<ServiceGroupCard {...(props as never)} />);
  return props;
}

afterEach(() => vi.clearAllMocks());

describe("ServiceGroupCard", () => {
  it("renders the controller name and endpoint count", () => {
    renderCard();
    expect(screen.getByText("UserController")).toBeInTheDocument();
    expect(screen.getByText("2 Endpoints")).toBeInTheDocument();
  });

  it("singularizes the endpoint badge for a single endpoint", () => {
    renderCard({ endpoints: [{ itemId: "e1" }] as never[] });
    expect(screen.getByText("1 Endpoint")).toBeInTheDocument();
  });

  it("selects the whole group via the header checkbox", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByRole("checkbox"));
    expect(props.onSelectGroup).toHaveBeenCalledWith(["e1", "e2"], true);
  });

  it("expands to reveal endpoint rows", async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.queryByTestId("endpoint-row")).not.toBeInTheDocument();
    await user.click(screen.getByText("UserController"));
    expect(screen.getAllByTestId("endpoint-row")).toHaveLength(2);
  });

  it("triggers bulk MFA and captcha enable through the presets popover", async () => {
    const user = userEvent.setup();
    const props = renderCard();
    await user.click(screen.getByTestId("enable-mfa"));
    await user.click(screen.getByTestId("enable-captcha"));
    expect(props.onBulkGroupMfa).toHaveBeenCalledWith(["e1", "e2"], true);
    expect(props.onBulkGroupCaptcha).toHaveBeenCalledWith(["e1", "e2"], true);
  });
});
