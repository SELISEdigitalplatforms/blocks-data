import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form } from "@/components/ui-kits/form/form";
import { SSOProviderConfigFormField } from "./index";

const fields = [
  { id: "1", name: "sel", type: "select", label: "Region", options: [{ label: "EU", value: "eu" }] },
  { id: "2", name: "multi", type: "multi-select", label: "Scopes", options: [{ label: "Read", value: "read" }] },
  {
    id: "3",
    name: "rad",
    type: "radio",
    label: "Mode",
    description: "Pick a mode",
    options: [
      { label: "On", value: "on" },
      { label: "Off", value: "off" },
    ],
  },
  { id: "4", name: "pass", type: "password", label: "Secret" },
  { id: "5", name: "txt", type: "input", label: "Client Id" },
] as never;

function Harness({ formFields = fields }: { formFields?: typeof fields }) {
  const form = useForm({
    defaultValues: { sel: "", multi: [], rad: "on", pass: "", txt: "" },
  });
  return (
    <Form {...form}>
      <SSOProviderConfigFormField fields={formFields} form={form} />
    </Form>
  );
}

describe("SSOProviderConfigFormField", () => {
  it("renders a field of each configured type with its label", () => {
    render(<Harness />);
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Scopes")).toBeInTheDocument();
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("Secret")).toBeInTheDocument();
    expect(screen.getByText("Client Id")).toBeInTheDocument();
    // Radio description renders.
    expect(screen.getByText("Pick a mode")).toBeInTheDocument();
  });

  it("changes the radio selection", () => {
    render(<Harness />);
    const off = screen.getByLabelText("Off");
    fireEvent.click(off);
    expect(off).toBeInTheDocument();
  });

  it("types into the text input field", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Client Id");
    fireEvent.change(input, { target: { value: "abc" } });
    expect((input as HTMLInputElement).value).toBe("abc");
  });

  it("does not change a disabled radio group", () => {
    const disabledFields = [
      {
        id: "3",
        name: "rad",
        type: "radio",
        label: "Mode",
        isDisabled: true,
        options: [
          { label: "On", value: "on" },
          { label: "Off", value: "off" },
        ],
      },
    ] as never;
    render(<Harness formFields={disabledFields} />);
    expect(screen.getByLabelText("Off")).toBeDisabled();
  });
});
