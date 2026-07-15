import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nextStep = vi.fn();
vi.mock("@/components/stepper/stepper-provider", () => ({
  useStepper: () => ({ nextStep }),
}));

import { CreateProjectNamingForm } from "./create-project-naming-form";
import { useCreateProjectFormState } from "../../utils";

describe("CreateProjectNamingForm", () => {
  beforeEach(() => {
    nextStep.mockClear();
    useCreateProjectFormState.getState().resetFormData();
  });

  it("keeps the Continue button disabled until the form is valid", () => {
    render(<CreateProjectNamingForm />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("enables Continue and advances the stepper once all fields are valid", async () => {
    const user = userEvent.setup();
    render(<CreateProjectNamingForm />);

    await user.type(screen.getByPlaceholderText("Enter your project name"), "My Project");
    const [useExclusively, acceptTerms] = screen.getAllByRole("checkbox");
    await user.click(useExclusively);
    await user.click(acceptTerms);

    const submit = screen.getByRole("button", { name: /continue/i });
    await waitFor(() => expect(submit).toBeEnabled());

    await user.click(submit);
    await waitFor(() => expect(nextStep).toHaveBeenCalledTimes(1));
    // form data slot 0 gets the entered project name
    expect(
      (useCreateProjectFormState.getState().formData[0] as { name: string }).name,
    ).toBe("My Project");
  });

  it("stays disabled when the project name is too short", async () => {
    const user = userEvent.setup();
    render(<CreateProjectNamingForm />);

    await user.type(screen.getByPlaceholderText("Enter your project name"), "ab");
    const [useExclusively, acceptTerms] = screen.getAllByRole("checkbox");
    await user.click(useExclusively);
    await user.click(acceptTerms);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled(),
    );
    expect(nextStep).not.toHaveBeenCalled();
  });
});
