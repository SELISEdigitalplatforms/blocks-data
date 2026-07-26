import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pats: { isLoading: boolean; isFetching: boolean; data: unknown } = {
  isLoading: false,
  isFetching: false,
  data: [],
};
vi.mock("@blocks-idp/iam/hooks/use-activity", () => ({
  useGetPats: () => pats,
}));
vi.mock("./user-pats-list", () => ({
  UserPATList: () => <div data-testid="pat-list" />,
}));
let modalOpen = false;
vi.mock("./generate-pat-modal", () => ({
  GenerateTokenModal: ({ isOpen }: { isOpen: boolean }) => {
    modalOpen = isOpen;
    return isOpen ? <div data-testid="generate-modal" /> : null;
  },
}));

import { UserPats } from "./user-pats";

afterEach(() => {
  vi.clearAllMocks();
  modalOpen = false;
});

describe("UserPats", () => {
  it("shows the empty state and opens the generate modal", async () => {
    pats = { isLoading: false, isFetching: false, data: [] };
    render(<UserPats id="u1" />);
    expect(screen.getByText(/No PAT available/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate PAT" }));
    expect(await screen.findByTestId("generate-modal")).toBeInTheDocument();
  });

  it("renders the PAT list when tokens exist", () => {
    pats = { isLoading: false, isFetching: false, data: [{ itemId: "p1" }] };
    render(<UserPats id="u1" />);
    expect(screen.getByTestId("pat-list")).toBeInTheDocument();
  });
});
