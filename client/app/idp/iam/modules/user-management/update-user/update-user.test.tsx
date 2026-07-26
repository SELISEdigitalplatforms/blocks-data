import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;
let userData: unknown;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData, isLoading: false, isFetching: false }),
  useUpdateUser: () => ({ isPending: false, mutateAsync }),
}));

import { UpdateUser } from "./update-user";

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Edit User/ }));
  await screen.findByPlaceholderText("Enter first name");
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  userData = {
    data: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
  };
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("UpdateUser", () => {
  it("renders the trigger", () => {
    render(<UpdateUser id="u1" projectKey="t1" />);
    expect(screen.getByRole("button", { name: /Edit User/ })).toBeInTheDocument();
  });

  it("prefills the name fields from the fetched user", async () => {
    const user = userEvent.setup();
    render(<UpdateUser id="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lovelace")).toBeInTheDocument();
  });

  it("keeps Save disabled until a field changes", async () => {
    const user = userEvent.setup();
    render(<UpdateUser id="u1" projectKey="t1" />);
    await open(user);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the edited user and reports success", async () => {
    const user = userEvent.setup();
    render(<UpdateUser id="u1" projectKey="t1" />);
    await open(user);
    const first = screen.getByDisplayValue("Ada");
    await user.clear(first);
    await user.type(first, "Grace");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.firstName).toBe("Grace");
    expect(payload.itemId).toBe("u1");
    expect(payload.projectKey).toBe("t1");
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "User updated successfully" });
  });

  it("shows an error toast when the update is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<UpdateUser id="u1" projectKey="t1" />);
    await open(user);
    const first = screen.getByDisplayValue("Ada");
    await user.clear(first);
    await user.type(first, "Grace");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });
});
