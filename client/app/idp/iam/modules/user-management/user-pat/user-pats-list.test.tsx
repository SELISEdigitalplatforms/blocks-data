import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPATResponse } from "@blocks-idp/iam/models/user";

let isMobile = false;

vi.mock("@/hooks/use-is-mobile", () => ({ default: () => isMobile }));
vi.mock("./generate-pat-modal", () => ({
  GenerateTokenModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>generate-pat-modal-open</div> : null,
}));

import { UserPATList } from "./user-pats-list";

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const pat = (over: Partial<IPATResponse> = {}): IPATResponse =>
  ({
    note: "CI token",
    code: "pat-secret-code",
    expiryDate: future,
    ...over,
  }) as IPATResponse;

beforeEach(() => {
  isMobile = false;
  vi.clearAllMocks();
});

describe("UserPATList", () => {
  it("renders a loading skeleton while loading", () => {
    const { container } = render(<UserPATList isLoading data={[]} id="u1" />);
    expect(container.querySelectorAll(".rounded-xl").length).toBeGreaterThan(0);
  });

  it("shows the empty placeholder when there are no tokens", () => {
    render(<UserPATList isLoading={false} data={[]} id="u1" />);
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("renders a token row with its name and an active status", () => {
    render(<UserPATList isLoading={false} data={[pat()]} id="u1" />);
    expect(screen.getByText("CI token")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("marks an expired token", () => {
    render(<UserPATList isLoading={false} data={[pat({ expiryDate: past })]} id="u1" />);
    expect(screen.getByText("expired")).toBeInTheDocument();
  });

  it("falls back to an em dash when the note is empty", () => {
    render(<UserPATList isLoading={false} data={[pat({ note: "" })]} id="u1" />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("opens the generate PAT modal from the header button", async () => {
    const user = userEvent.setup();
    render(<UserPATList isLoading={false} data={[pat()]} id="u1" />);
    expect(screen.queryByText("generate-pat-modal-open")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate PAT" }));
    expect(screen.getByText("generate-pat-modal-open")).toBeInTheDocument();
  });
});
