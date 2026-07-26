import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveSignUpSetting = vi.fn();
let settingData: unknown;

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetSignUpSetting: () => ({ data: settingData }),
  useSaveSignUpSetting: () => ({ mutateAsync: saveSignUpSetting, isPending: false }),
}));

import { SignupSettings } from "./signup-settings";

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Signup Settings/ }));
  await screen.findByText("Configure signup settings for users.");
}

beforeEach(() => {
  vi.clearAllMocks();
  settingData = {
    itemId: "s1",
    isEmailPasswordSignUpEnabled: true,
    isSSoSignUpEnabled: false,
  };
  saveSignUpSetting.mockResolvedValue({ isSuccess: true });
});

describe("SignupSettings", () => {
  it("renders the trigger", () => {
    render(<SignupSettings />);
    expect(screen.getByRole("button", { name: /Signup Settings/ })).toBeInTheDocument();
  });

  it("initialises the checkboxes from the fetched setting", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<SignupSettings />);
    await open(user);
    const allow = screen.getByRole("checkbox", { name: "Allow signup" });
    const emailPw = screen.getByRole("checkbox", { name: "Email and password" });
    expect(allow).toBeChecked();
    expect(emailPw).toBeChecked();
  });

  it("disables the sub-options and unchecks them when signup is turned off", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<SignupSettings />);
    await open(user);
    await user.click(screen.getByRole("checkbox", { name: "Allow signup" }));
    expect(screen.getByRole("checkbox", { name: "Email and password" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Email and password" })).toBeDisabled();
    // Allowing signup with no method selected keeps Save disabled.
    await user.click(screen.getByRole("checkbox", { name: "Allow signup" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the resolved sign-up methods", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<SignupSettings />);
    await open(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveSignUpSetting).toHaveBeenCalledTimes(1));
    expect(saveSignUpSetting.mock.calls[0][0]).toEqual({
      isEmailPasswordSignUpEnabled: true,
      isSSoSignUpEnabled: false,
      projectKey: "tenant-abc",
      itemId: "s1",
    });
  });
});
