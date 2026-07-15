import { render, screen, waitFor } from "@testing-library/react";
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
});
