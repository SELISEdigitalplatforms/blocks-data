import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";

const setFieldDefault = vi.fn();

vi.mock("../../hooks/use-configuration", () => ({
  useSetFieldDefault: () => ({ mutateAsync: setFieldDefault, isPending: false }),
  useSchemaVariableContext: () => ({
    schemaName: "Employee",
    fields: {
      FirstName: { type: "String", isArray: false, isObject: false },
      LastName: { type: "String", isArray: false, isObject: false },
      Tags: { type: "String", isArray: true, isObject: false },
    },
  }),
}));

import { DefaultValuePanel, type DefaultValuePanelProps } from "./default-value-panel";

function renderPanel(props: Partial<DefaultValuePanelProps> & Pick<DefaultValuePanelProps, "fieldName" | "fieldType">) {
  render(
    <TooltipProvider>
      <DefaultValuePanel schemaId="emp" projectKey="pk" isArray={false} {...props} />
    </TooltipProvider>,
  );
}

/** The Source picker's options, or null when the picker isn't shown (one kind is no choice). */
const kindOptions = () => {
  const group = screen.queryByRole("group", { name: "Source" });
  if (!group) return null;
  return within(group)
    .getAllByRole("radio")
    .map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent);
};

/** The variables offered for an expression, as their chips name them. */
const variableChips = () =>
  screen.getAllByRole("button", { name: /^Insert \{\{/ }).map((chip) => chip.getAttribute("aria-label")!.replace("Insert ", ""));

/** userEvent reads "{" and "[" as key descriptors; doubled, they type themselves. */
const literal = (text: string) => text.replaceAll("{", "{{").replaceAll("[", "[[");

describe("DefaultValuePanel", () => {
  beforeAll(() => {
    // Radix Select uses pointer capture, which jsdom does not implement.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
  });

  beforeEach(() => {
    setFieldDefault.mockReset().mockResolvedValue({ isSuccess: true });
  });

  it("offers only the kinds that fit the property's type", () => {
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });
    expect(kindOptions()).toEqual(["Fixed value", "Expression"]);
  });

  // A lone kind gets no picker at all: the value input is the whole form.
  it.each([
    ["DateTime", false, ["Fixed value", "Now"]],
    ["DateTime", true, null],
    ["Int", false, null],
  ])("%s (list: %s) offers %j", (fieldType, isArray, expected) => {
    renderPanel({ fieldName: "P", fieldType, isArray });
    expect(kindOptions()).toEqual(expected);
  });

  it("saves a list of fixed values for a list property (UC1)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Read.Roles", fieldType: "String", isArray: true });

    await user.type(screen.getByLabelText("Value 1"), "admin");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Value 2"), "app-user");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith({
        schemaId: "emp",
        fieldName: "Read.Roles",
        projectKey: "pk",
        defaultValue: { kind: "Static", value: ["admin", "app-user"] },
      }),
    );
    expect(await screen.findByText("Default value saved")).toBeInTheDocument();
    expect(screen.getByText('["admin", "app-user"]')).toBeInTheDocument();
  });

  it("refuses a value of the wrong type with the server's message", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Score", fieldType: "Int" });

    await user.type(screen.getByLabelText("Value"), "1.5");

    expect(screen.getByRole("alert")).toHaveTextContent('"1.5" is not a whole number');
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("builds an expression from inserted variables (UC3)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });

    await user.click(screen.getByRole("radio", { name: "Expression" }));
    // The quick row: the first record properties and the signed-in user's e-mail.
    expect(variableChips()).toEqual(["{{Employee.FirstName}}", "{{Employee.LastName}}", "{{Auth.Email}}"]);
    await user.click(screen.getByRole("button", { name: "All variables" }));
    // Single values only: the list property and the list Auth values are left out.
    expect(new Set(variableChips())).toEqual(
      new Set(["{{Employee.FirstName}}", "{{Employee.LastName}}", "{{Auth.UserId}}", "{{Auth.Email}}", "{{Auth.OrganizationId}}"]),
    );
    await user.click(screen.getAllByRole("button", { name: "Insert {{Employee.FirstName}}" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Insert {{Employee.LastName}}" })[0]);

    expect(screen.getByRole("textbox", { name: "Expression" })).toHaveValue("{{Employee.FirstName}} {{Employee.LastName}}");
    // The preview names the two properties that will be filled in.
    expect(screen.getByTestId("will-store")).toHaveTextContent("Employee.FirstName Employee.LastName");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(
        expect.objectContaining({ defaultValue: { kind: "Template", value: "{{Employee.FirstName}} {{Employee.LastName}}" } }),
      ),
    );
  });

  it("shows a syntax error as you type and clears it once fixed (UC15)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });

    await user.click(screen.getByRole("radio", { name: "Expression" }));
    const input = screen.getByRole("textbox", { name: "Expression" });
    await user.type(input, literal("{{Employee.FirstName} {{Employee.LastName}}"));

    expect(screen.getByRole("alert")).toHaveTextContent('Unclosed variable at position 1: expected "}}"');
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, literal("{{Employee.FirstName}} {{Employee.LastName}}"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows a missing prefix with the fix (UC18)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });

    await user.click(screen.getByRole("radio", { name: "Expression" }));
    await user.type(screen.getByRole("textbox", { name: "Expression" }), literal("{{FirstName}}"));
    expect(screen.getByRole("alert")).toHaveTextContent("Missing prefix at position 1: write {{Employee.FirstName}} or {{Auth.…}}");
  });

  it("saves Now with an offset and shows its summary (UC9)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "HrYearRenewDate", fieldType: "DateTime" });

    await user.click(screen.getByRole("radio", { name: "Now" }));
    const days = screen.getByLabelText("Days");
    await user.clear(days);
    await user.type(days, "365");

    expect(screen.getByText("Now + 365 days")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultValue: { kind: "Now", value: null, offset: { days: 365, hours: 0, minutes: 0, seconds: 0 } },
        }),
      ),
    );
  });

  it("picks an enum value from its chips, and a second click clears it", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Status", fieldType: "Enum", enumValues: ["Active", "Pending", "Closed"] });

    // One kind fits an enum, so there is no Source picker and no dropdown: just the values.
    expect(kindOptions()).toBeNull();
    const chips = within(screen.getByRole("radiogroup", { name: "Value" })).getAllByRole("radio");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Active", "Pending", "Closed"]);

    await user.click(screen.getByRole("radio", { name: "Pending" }));
    expect(screen.getByRole("radio", { name: "Pending" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("will-store")).toHaveTextContent("Pending");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: { kind: "Static", value: "Pending" } })),
    );

    await user.click(screen.getByRole("radio", { name: "Pending" }));
    expect(screen.getByRole("radio", { name: "Pending" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shifts Now into the past with the direction toggle (one sign for every part)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "ReminderAt", fieldType: "DateTime" });

    await user.click(screen.getByRole("radio", { name: "Now" }));
    await user.click(screen.getByRole("radio", { name: "Minus" }));
    const hours = screen.getByLabelText("Hours");
    await user.clear(hours);
    await user.type(hours, "2");

    expect(screen.getByText("Now − 2 hours")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(
        expect.objectContaining({ defaultValue: { kind: "Now", value: null, offset: { days: 0, hours: -2, minutes: 0, seconds: 0 } } }),
      ),
    );
  });

  it("reads a saved past offset back as Minus", () => {
    renderPanel({
      fieldName: "ReminderAt",
      fieldType: "DateTime",
      initialDefault: { kind: "Now", offset: { days: -1, hours: 0, minutes: 0, seconds: 0 } },
    });
    expect(screen.getByRole("radio", { name: "Minus" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Days")).toHaveValue("1");
  });

  it("clears a saved default", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "JoiningDate", fieldType: "DateTime", initialDefault: { kind: "Now", offset: null } });

    await user.click(screen.getByRole("button", { name: "Clear default" }));

    await waitFor(() => expect(setFieldDefault).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: null })));
    expect(await screen.findByText("Default value cleared")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear default" })).not.toBeInTheDocument();
    expect(screen.getByText(/Not set\./)).toBeInTheDocument();
  });

  it("shows a server refusal where the syntax errors go (UC16)", async () => {
    const user = userEvent.setup();
    setFieldDefault.mockRejectedValue({
      status: 400,
      errors: { isSuccess: false, message: 'Unknown property "Employee.FirstNme" at position 1 (did you mean Employee.FirstName?)' },
    });
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });

    await user.click(screen.getByRole("radio", { name: "Expression" }));
    await user.type(screen.getByRole("textbox", { name: "Expression" }), "Hello");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Unknown property "Employee.FirstNme" at position 1 (did you mean Employee.FirstName?)',
    );
  });
});
