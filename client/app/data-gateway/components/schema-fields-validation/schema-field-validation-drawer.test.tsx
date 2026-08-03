import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const createValidation = vi.fn();
const updateValidation = vi.fn();
const deleteValidation = vi.fn();
const generateRegex = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("../../hooks/use-configuration", () => ({
  useGetSchemaFieldValidation: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
  }),
  useCreateSchemaFieldValidation: () => ({
    mutateAsync: createValidation,
    isPending: false,
  }),
  useUpdateSchemaFieldValidation: () => ({
    mutateAsync: updateValidation,
    isPending: false,
  }),
  useDeleteSchemaFieldValidation: () => ({
    mutateAsync: deleteValidation,
    isPending: false,
  }),
  useGenerateRegex: () => ({ mutateAsync: generateRegex, isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { SchemaFieldValidationDrawer } from "./schema-field-validation-drawer";

function renderDrawer(
  initialValidationData: unknown = null,
) {
  render(
    <TooltipProvider>
      <SchemaFieldValidationDrawer
        fieldName="email"
        schemaId="s1"
        projectKey="pk"
        initialValidationData={initialValidationData as never}
        open
        onOpenChange={vi.fn()}
      />
    </TooltipProvider>,
  );
}

const existing = {
  itemId: "v1",
  validations: [
    {
      type: 1,
      value: "^[a-z]+$",
      secondaryValue: "",
      errorMessage: "Only lowercase",
      isActive: true,
    },
  ],
};

describe("SchemaFieldValidationDrawer", () => {
  beforeEach(() => {
    createValidation.mockReset();
    updateValidation.mockReset();
    deleteValidation.mockReset();
    generateRegex.mockReset();
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("lists existing validations with their active state", () => {
    renderDrawer(existing);
    expect(screen.getByText("^[a-z]+$")).toBeInTheDocument();
    expect(screen.getByText("Only lowercase")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows the empty state and an Add validation button", () => {
    renderDrawer(null);
    expect(screen.getByText("No validations added yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add validation/ }),
    ).toBeInTheDocument();
  });

  it("creates a validation from the add form", async () => {
    const user = userEvent.setup();
    createValidation.mockResolvedValue({ isSuccess: true });
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    await user.type(screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$"), "^x$");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(createValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaId: "s1",
          fieldName: "email",
          projectKey: "pk",
          validations: [expect.objectContaining({ value: "^x$" })],
        }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("generates a regex pattern from a prompt", async () => {
    const user = userEvent.setup();
    generateRegex.mockResolvedValue({ pattern: "^gen$", errorMessage: "" });
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    await user.type(
      screen.getByPlaceholderText(/Generate a regex pattern/),
      "an email",
    );
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(generateRegex).toHaveBeenCalledWith({ description: "an email" }),
    );
    // The generated pattern flows into the regex textarea
    await waitFor(() =>
      expect(screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$")).toHaveValue("^gen$"),
    );
  });

  it("deletes an existing validation after confirmation", async () => {
    const user = userEvent.setup();
    deleteValidation.mockResolvedValue({ isSuccess: true });
    renderDrawer(existing);

    // The delete control is an icon-only button (Trash icon, no text label)
    const trashIcon = document.querySelector("svg.lucide-trash");
    await user.click(trashIcon!.closest("button")!);

    // Confirmation dialog appears with its own text "Delete" button
    const confirm = await screen.findByRole("button", { name: "Delete" });
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteValidation).toHaveBeenCalledWith(
        expect.objectContaining({ id: "v1", projectKey: "pk" }),
      ),
    );
  });

  it("prefills the form when editing an existing validation", async () => {
    const user = userEvent.setup();
    renderDrawer(existing);

    const pencil = document.querySelector("svg.lucide-pencil");
    await user.click(pencil!.closest("button")!);

    expect(screen.getByText("Edit validation")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$")).toHaveValue(
      "^[a-z]+$",
    );
    expect(
      screen.getByPlaceholderText("e.g. Only letters are allowed"),
    ).toHaveValue("Only lowercase");
  });

  it("updates an existing validation and reports success", async () => {
    const user = userEvent.setup();
    updateValidation.mockResolvedValue({ isSuccess: true });
    renderDrawer(existing);

    const pencil = document.querySelector("svg.lucide-pencil");
    await user.click(pencil!.closest("button")!);

    const textarea = screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$");
    // Brackets are special to userEvent.type, so set the value directly.
    fireEvent.change(textarea, { target: { value: "^[A-Z]+$" } });
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(updateValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: "v1",
          schemaId: "s1",
          fieldName: "email",
          validations: [expect.objectContaining({ value: "^[A-Z]+$" })],
        }),
      ),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("shows an error toast when saving fails", async () => {
    const user = userEvent.setup();
    createValidation.mockResolvedValue({ isSuccess: false, errors: ["nope"] });
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    await user.type(screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$"), "^y$");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: ["nope"] }),
    );
  });

  it("flags an invalid regex pattern and re-validates on change", async () => {
    const user = userEvent.setup();
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    const textarea = screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$");
    // Brackets are special to userEvent.type, so set the value directly.
    fireEvent.change(textarea, { target: { value: "[" } });
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Invalid regex pattern")).toBeInTheDocument();
    expect(createValidation).not.toHaveBeenCalled();

    // Editing the field while an error is present re-runs validation.
    fireEvent.change(textarea, { target: { value: "[a-z]" } });
    expect(screen.queryByText("Invalid regex pattern")).not.toBeInTheDocument();
  });

  it("shows an error when regex generation returns no pattern", async () => {
    const user = userEvent.setup();
    generateRegex.mockResolvedValue({});
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    await user.type(
      screen.getByPlaceholderText(/Generate a regex pattern/),
      "an email",
    );
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["Failed to generate regex"],
      }),
    );
  });

  it("shows an error when regex generation throws", async () => {
    const user = userEvent.setup();
    generateRegex.mockRejectedValue(new Error("boom"));
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    await user.type(
      screen.getByPlaceholderText(/Generate a regex pattern/),
      "an email",
    );
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: ["Error generating regex"],
      }),
    );
  });

  it("edits the error message and toggles the active checkbox", async () => {
    const user = userEvent.setup();
    createValidation.mockResolvedValue({ isSuccess: true });
    renderDrawer(null);

    await user.click(screen.getByRole("button", { name: /Add validation/ }));
    await user.type(screen.getByPlaceholderText("e.g. ^[a-zA-Z]+$"), "^z$");
    await user.type(
      screen.getByPlaceholderText("e.g. Only letters are allowed"),
      "must be z",
    );
    const activeBox = screen.getByRole("checkbox");
    await user.click(activeBox);
    expect(activeBox).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(createValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          validations: [
            expect.objectContaining({
              value: "^z$",
              errorMessage: "must be z",
              isActive: false,
            }),
          ],
        }),
      ),
    );
  });

  it("does nothing when deleting without an item id", async () => {
    const user = userEvent.setup();
    renderDrawer({ itemId: null, validations: existing.validations });

    const trashIcon = document.querySelector("svg.lucide-trash");
    await user.click(trashIcon!.closest("button")!);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Delete validation?"),
      ).not.toBeInTheDocument(),
    );
    expect(deleteValidation).not.toHaveBeenCalled();
  });

  it("shows an error toast when a delete fails", async () => {
    const user = userEvent.setup();
    deleteValidation.mockResolvedValue({ isSuccess: false, errors: ["del"] });
    renderDrawer(existing);

    const trashIcon = document.querySelector("svg.lucide-trash");
    await user.click(trashIcon!.closest("button")!);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: ["del"] }),
    );
  });

  it("closes the delete confirmation from its Cancel button", async () => {
    const user = userEvent.setup();
    renderDrawer(existing);

    const trashIcon = document.querySelector("svg.lucide-trash");
    await user.click(trashIcon!.closest("button")!);
    expect(await screen.findByText("Delete validation?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Delete validation?")).not.toBeInTheDocument(),
    );
    expect(deleteValidation).not.toHaveBeenCalled();
  });
});
