import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** userEvent reads "{" and "[" as key descriptors; doubled, they type themselves. */
const literal = (text: string) => text.replaceAll("{", "{{").replaceAll("[", "[[");

/** Opens the box's Expression menu and returns what it offers, by label. */
async function openExpressionMenu(user: ReturnType<typeof userEvent.setup>, box = "Value") {
  await user.click(screen.getByRole("button", { name: `Add an expression to ${box}` }));
  return (await screen.findAllByRole("option")).map((option) => option.textContent);
}

describe("DefaultValuePanel", () => {
  beforeAll(() => {
    // Radix and cmdk use APIs jsdom does not implement.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    setFieldDefault.mockReset().mockResolvedValue({ isSuccess: true });
  });

  it("has one value box and no Source tabs", () => {
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });
    expect(screen.queryByRole("group", { name: "Source" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Value" })).toBeInTheDocument();
    expect(screen.getByText("Fixed")).toBeInTheDocument();
  });

  it.each([
    ["Int", false],
    ["Float", false],
    ["DateTime", true],
  ])("offers the Expression menu on %s only when something dynamic fits", (fieldType, hasMenu) => {
    renderPanel({ fieldName: "P", fieldType });
    expect(Boolean(screen.queryByRole("button", { name: "Add an expression to Value" }))).toBe(hasMenu);
  });

  it("saves plain text as a fixed value", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Country", fieldType: "String" });

    await user.type(screen.getByRole("textbox", { name: "Value" }), "Bangladesh");
    expect(screen.getByTestId("will-store")).toHaveTextContent('"Bangladesh"');
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: { kind: "Static", value: "Bangladesh" } })),
    );
  });

  it("mixes fixed text and inserted values in one box, saved as an expression (UC3)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });

    const box = screen.getByRole("textbox", { name: "Value" });
    await user.type(box, "Dr.");
    // Single values only: the list property and the list Auth values are left out.
    expect(await openExpressionMenu(user)).toEqual([
      "FirstNameEmployee.FirstName",
      "LastNameEmployee.LastName",
      "User IDAuth.UserId",
      "EmailAuth.Email",
      "OrganizationAuth.OrganizationId",
    ]);
    await user.click(screen.getByRole("option", { name: /^LastName/ }));

    expect(box).toHaveValue("Dr. {{Employee.LastName}}");
    expect(screen.getByText("Filled at insert time")).toBeInTheDocument();
    expect(screen.getByTestId("will-store")).toHaveTextContent("Dr. Employee.LastName");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: { kind: "Template", value: "Dr. {{Employee.LastName}}" } })),
    );
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

  it("offers the signed-in user's lists only to a list property", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Read.Roles", fieldType: "String", isArray: true });
    const offered = await openExpressionMenu(user, "Value 1");
    expect(offered).toContain("RolesAuth.Roles");
    expect(offered).toContain("PermissionsAuth.Permissions");
  });

  it("refuses a value of the wrong type with the server's message", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Score", fieldType: "Int" });

    await user.type(screen.getByLabelText("Value"), "1.5");

    expect(screen.getByRole("alert")).toHaveTextContent('"1.5" is not a whole number');
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a syntax error as you type and clears it once fixed (UC15)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "DisplayName", fieldType: "String" });

    const input = screen.getByRole("textbox", { name: "Value" });
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

    await user.type(screen.getByRole("textbox", { name: "Value" }), literal("{{FirstName}}"));
    expect(screen.getByRole("alert")).toHaveTextContent("Missing prefix at position 1: write {{Employee.FirstName}} or {{Auth.…}}");
  });

  it("picks the current date & time from Expression and saves it as Now with its adjustment (UC9)", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "HrYearRenewDate", fieldType: "DateTime" });

    expect(await openExpressionMenu(user)).toEqual(["Current date & timewhen the record is created"]);
    await user.click(screen.getByRole("option", { name: /Current date & time/ }));

    expect(screen.getByText("Taken when each record is created")).toBeInTheDocument();
    expect(screen.getByText("The date and time the record is created")).toBeInTheDocument();
    const days = screen.getByLabelText("Days");
    await user.clear(days);
    await user.type(days, "365");
    expect(screen.getByText("365 days after the record is created")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultValue: { kind: "Now", value: null, offset: { days: 365, hours: 0, minutes: 0, seconds: 0 } },
        }),
      ),
    );
  });

  it("moves the current date & time earlier with one sign for every part", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "ReminderAt", fieldType: "DateTime" });

    await openExpressionMenu(user);
    await user.click(screen.getByRole("option", { name: /Current date & time/ }));
    await user.click(screen.getByRole("radio", { name: "Earlier" }));
    const hours = screen.getByLabelText("Hours");
    await user.clear(hours);
    await user.type(hours, "2");

    expect(screen.getByText("2 hours before the record is created")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(
        expect.objectContaining({ defaultValue: { kind: "Now", value: null, offset: { days: 0, hours: -2, minutes: 0, seconds: 0 } } }),
      ),
    );
  });

  it("opens a saved earlier adjustment as Earlier, and goes back to a fixed date on request", async () => {
    const user = userEvent.setup();
    renderPanel({
      fieldName: "ReminderAt",
      fieldType: "DateTime",
      initialDefault: { kind: "Now", offset: { days: -1, hours: 0, minutes: 0, seconds: 0 } },
    });
    expect(screen.getByRole("radio", { name: "Earlier" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Days")).toHaveValue("1");
    expect(screen.getAllByText("1 day before the record is created").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Use a fixed date" }));
    expect(screen.getByLabelText("Value")).toHaveAttribute("type", "datetime-local");
  });

  it("saves a fixed date typed into the box", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "StartsOn", fieldType: "DateTime" });

    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "2026-01-01T09:00" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(setFieldDefault).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: { kind: "Static", value: "2026-01-01T09:00" } })),
    );
  });

  it("picks an enum value from its chips, and a second click clears it", async () => {
    const user = userEvent.setup();
    renderPanel({ fieldName: "Status", fieldType: "Enum", enumValues: ["Active", "Pending", "Closed"] });

    expect(screen.queryByRole("button", { name: /Add an expression/ })).not.toBeInTheDocument();
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

    await user.type(screen.getByRole("textbox", { name: "Value" }), "Hello");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'Unknown property "Employee.FirstNme" at position 1 (did you mean Employee.FirstName?)',
    );
  });
});
