import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem } from "@/components/ui-kits/form/form";
import { MultiSelectDropdown } from "./multi-select-dropdown";

const options = [
  { label: "Alpha", value: "a" },
  { label: "Beta", value: "b" },
  { label: "Gamma", value: "c" },
];

type Props = React.ComponentProps<typeof MultiSelectDropdown>;

const Harness = (props: Props) => {
  const form = useForm({ defaultValues: { field: props.value } });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="field"
        render={() => (
          <FormItem>
            <MultiSelectDropdown {...props} />
          </FormItem>
        )}
      />
    </Form>
  );
};

const render_ = (props: Props) => render(<Harness {...props} />);

afterEach(() => vi.clearAllMocks());

describe("MultiSelectDropdown", () => {
  it("shows the placeholder when nothing is selected", () => {
    render_({ options, value: [], onChange: vi.fn(), placeholder: "Pick" });
    expect(screen.getByText("Pick")).toBeInTheDocument();
  });

  it("shows the joined labels of the selected values", () => {
    render_({ options, value: ["a", "c"], onChange: vi.fn() });
    expect(screen.getByText("Alpha, Gamma")).toBeInTheDocument();
  });

  it("adds an option when clicked, preserving option order", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render_({ options, value: ["c"], onChange });
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Alpha"));
    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  it("removes an already-selected option when clicked again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render_({ options, value: ["a", "b"], onChange });
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Beta"));
    expect(onChange).toHaveBeenCalledWith(["a"]);
  });

  it("clears the selection through the clear item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render_({ options, value: ["a"], onChange });
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Clear selection"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render_({ options, value: [], onChange: vi.fn(), disabled: true });
    await user.click(screen.getByRole("button"));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});
