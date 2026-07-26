import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const saveProject = vi.fn();
let isPending = false;
vi.mock("@/hooks/use-project", () => ({
  useProjectForm: () => ({ isPending, saveProject }),
}));

const setFormData = vi.fn();
let formData: Record<number, unknown> = { 2: { environments: [] } };
vi.mock("../../utils", () => ({
  useCreateProjectFormState: () => ({ formData, setFormData }),
}));

import { CreateProjectEnvironmentsForm } from "./create-project-environments-form";

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
  formData = { 2: { environments: [] } };
});

describe("CreateProjectEnvironmentsForm", () => {
  it("renders the environment options with checkboxes", () => {
    render(<CreateProjectEnvironmentsForm />);
    expect(screen.getByText("Select environments")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").length).toBe(8);
  });

  it("submits the selected environments sorted by their configured index", async () => {
    const user = userEvent.setup();
    formData = { 2: { environments: [{ value: "prod" }, { value: "dev" }] } };
    render(<CreateProjectEnvironmentsForm />);

    const submit = screen.getByRole("button");
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(saveProject).toHaveBeenCalled());
    expect(setFormData).toHaveBeenCalledWith(2, {
      environments: [{ value: "dev" }, { value: "prod" }],
    });
  });

  it("keeps the submit disabled when no environment is selected", () => {
    render(<CreateProjectEnvironmentsForm />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
