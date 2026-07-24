import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const saveJWTClaim = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const jwtDecode = vi.fn();
let existingJwtClaim: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false };

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@blocks-idp/authentication/hooks/use-jwt-claim", () => ({
  useAddJwtClaim: () => ({ mutateAsync: saveJWTClaim, isPending: false }),
  useGetJwtClaim: () => existingJwtClaim,
}));
vi.mock("jwt-decode", () => ({ jwtDecode: (...a: unknown[]) => jwtDecode(...a) }));

import MapJwtClaimModal from "./map-jwt-claim-modal";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

beforeEach(() => {
  vi.clearAllMocks();
  existingJwtClaim = { data: undefined, isLoading: false };
  saveJWTClaim.mockResolvedValue({ isSuccess: true });
});

describe("MapJwtClaimModal", () => {
  it("renders the drawer with the JWT input and empty mapping prompt", () => {
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Map JWT Claim")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste here...")).toBeInTheDocument();
    expect(
      screen.getByText("Please paste a valid JWT above to view and map its fields."),
    ).toBeInTheDocument();
  });

  it("validates that a JWT is required before decoding", async () => {
    const user = userEvent.setup();
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(screen.getByText("JWT is required.")).toBeInTheDocument();
    expect(jwtDecode).not.toHaveBeenCalled();
  });

  it("decodes a valid JWT and reveals the mapping table with keys", async () => {
    jwtDecode.mockReturnValue({ sub: "123", email: "a@b.com", profile: { name: "Jane" } });
    const user = userEvent.setup();
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Paste here..."), "a.b.c");
    await user.click(screen.getByRole("button", { name: "Decode" }));
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    // Required property labels are rendered as table rows.
    expect(screen.getByText("User Id")).toBeInTheDocument();
    expect(screen.getByText("Roles")).toBeInTheDocument();
  });

  it("shows an error for an undecodable JWT", async () => {
    jwtDecode.mockImplementation(() => {
      throw new Error("bad token");
    });
    const user = userEvent.setup();
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Paste here..."), "garbage");
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(screen.getByText("Invalid JWT Token.")).toBeInTheDocument();
  });

  it("shows an empty-keys error when the token has no properties", async () => {
    jwtDecode.mockReturnValue({});
    const user = userEvent.setup();
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Paste here..."), "a.b.c");
    await user.click(screen.getByRole("button", { name: "Decode" }));
    expect(screen.getByText("Invalid JWT Token: No properties found.")).toBeInTheDocument();
  });

  it("saves the mapping when existing data enables the Save button", async () => {
    existingJwtClaim = {
      data: {
        itemId: "claim-1",
        userId: "sub",
        email: "email",
        name: "name",
        userName: "preferred_username",
        roles: "roles",
      },
      isLoading: false,
    };
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<MapJwtClaimModal open onOpenChange={onOpenChange} />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() =>
      expect(saveJWTClaim).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "claim-1", projectKey: "tenant-1" }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast when saving fails", async () => {
    existingJwtClaim = { data: { itemId: "claim-1", userId: "sub" }, isLoading: false };
    saveJWTClaim.mockResolvedValue({ isSuccess: false });
    const user = userEvent.setup();
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });

  it("shows skeletons while the existing claim loads", () => {
    existingJwtClaim = { data: undefined, isLoading: true };
    render(<MapJwtClaimModal open onOpenChange={vi.fn()} />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
