import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateField } from "@/data-gateway/models/schema-preview.types";

import { FilterPopover } from "./filter-popover";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

const fields: TemplateField[] = [
  { name: "title", type: "string" },
  { name: "count", type: "int" },
  { name: "active", type: "boolean" },
  { name: "tags", type: "string", isArray: true },
  { name: "createdAt", type: "datetime" },
];

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Filter"));
}

// Selects the field then operator in the first condition row.
async function pickFieldAndOperator(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  operator: string,
) {
  const combos = screen.getAllByRole("combobox");
  await user.click(combos[0]); // field select
  await user.click(await screen.findByRole("option", { name: field }));
  const combosAfter = screen.getAllByRole("combobox");
  await user.click(combosAfter[1]); // operator select
  await user.click(await screen.findByRole("option", { name: operator }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FilterPopover", () => {
  it("renders the trigger, inactive when no filter applied", () => {
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    const trigger = screen.getByTitle("Filter");
    expect(trigger).toHaveClass("text-muted-foreground");
  });

  it("marks the trigger active when a filter is applied", () => {
    render(<FilterPopover fields={fields} appliedFilter={'{"a":1}'} onApply={vi.fn()} />);
    expect(screen.getByTitle("Filter")).toHaveClass("text-primary");
  });

  it("builds an equals filter for a string field", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "equals");
    await user.type(screen.getByPlaceholderText("Value"), "hello");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ title: "hello" }));
  });

  it("builds a contains regex filter", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "contains");
    await user.type(screen.getByPlaceholderText("Value"), "abc");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ title: { $regex: "abc", $options: "i" } }),
    );
  });

  it("builds an $in filter for is one of on a string field", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "is one of");
    await user.type(screen.getByPlaceholderText("a, b, c"), "a, b, c");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ title: { $in: ["a", "b", "c"] } }),
    );
  });

  it("builds a greater than filter for a number field", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "count", "greater than");
    await user.type(screen.getByPlaceholderText("Value"), "5");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ count: { $gt: 5 } }));
  });

  it("builds a boolean is true filter with no value input", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "active", "is true");
    // No value input for is true.
    expect(screen.queryByPlaceholderText("Value")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(JSON.stringify({ active: true }));
  });

  it("builds an is empty ($exists false) filter", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "tags", "is empty");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ tags: { $exists: false } }),
    );
  });

  it("builds an array does not contain filter", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "tags", "does not contain");
    await user.type(screen.getByPlaceholderText("Value"), "x");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ tags: { $not: { $regex: "x", $options: "i" } } }),
    );
  });

  it("combines multiple conditions with the OR logic toggle", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "equals");
    await user.type(screen.getByPlaceholderText("Value"), "a");
    // Add a second condition.
    await user.click(screen.getByRole("button", { name: /Add condition/ }));
    const rows = screen.getAllByRole("combobox");
    // rows: [field1, op1, field2, op2] -> configure field2/op2.
    await user.click(rows[2]);
    await user.click(await screen.findByRole("option", { name: "count" }));
    const rows2 = screen.getAllByRole("combobox");
    await user.click(rows2[3]);
    await user.click(await screen.findByRole("option", { name: "equals" }));
    const values = screen.getAllByPlaceholderText("Value");
    await user.type(values[1], "2");
    // Switch to OR.
    await user.click(screen.getByRole("button", { name: "OR" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(
      JSON.stringify({ $or: [{ title: "a" }, { count: 2 }] }),
    );
  });

  it("shows the date picker trigger for a date field equals operator", async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    await openPopover(user);
    await pickFieldAndOperator(user, "createdAt", "equals");
    // Date-typed value input renders the "Pick a date" trigger, not a text box.
    expect(screen.getByRole("button", { name: "Pick a date" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Value")).not.toBeInTheDocument();
  });

  it("clears the filter and calls onApply with empty string", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter={'{"title":"a"}'} onApply={onApply} />);
    await openPopover(user);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onApply).toHaveBeenCalledWith("");
  });

  it("removes a condition via its remove button, keeping at least one row", async () => {
    const user = userEvent.setup();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={vi.fn()} />);
    await openPopover(user);
    const remove = screen.getByTitle("Remove condition");
    await user.click(remove);
    // Still at least one field selector present.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
  });

  it("applies an empty string when no valid condition is present", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FilterPopover fields={fields} appliedFilter="" onApply={onApply} />);
    await openPopover(user);
    // No field/operator chosen -> buildFilterString yields "".
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith("");
  });

  it("reopening after apply restores the saved draft", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { rerender } = render(
      <FilterPopover fields={fields} appliedFilter="" onApply={onApply} />,
    );
    await openPopover(user);
    await pickFieldAndOperator(user, "title", "equals");
    await user.type(screen.getByPlaceholderText("Value"), "keep");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    // Simulate the parent reflecting the applied filter and reopen.
    rerender(<FilterPopover fields={fields} appliedFilter={'{"title":"keep"}'} onApply={onApply} />);
    await openPopover(user);
    expect(screen.getByDisplayValue("keep")).toBeInTheDocument();
  });

  /**
   * GeoJson fields (SPEC #345 H6). A geometry compares whole or not at all, so
   * this category offers equality only — without its own branch the field
   * would fall through to "string" and offer contains/startsWith, which the
   * server has no operators for.
   */
  describe("GeoJson fields", () => {
    const geoFields: TemplateField[] = [
      ...fields,
      { name: "location", type: "GeoJson" },
    ];
    const point = '{"type":"Point","coordinates":[8.5417,47.3769]}';
    const placeholder = '{"type":"Point","coordinates":[8.54,47.37]}';

    it("offers equality, the geospatial operators and emptiness — nothing string-like", async () => {
      const user = userEvent.setup();
      render(<FilterPopover fields={geoFields} appliedFilter="" onApply={vi.fn()} />);
      await openPopover(user);

      const combos = screen.getAllByRole("combobox");
      await user.click(combos[0]);
      await user.click(await screen.findByRole("option", { name: "location" }));
      await user.click(screen.getAllByRole("combobox")[1]);

      const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
      expect(options).toEqual([
        "equals",
        "not equals",
        "near",
        "within",
        "intersects",
        "is empty",
        "is not empty",
      ]);
    });

    it("sends the parsed geometry, not the raw text", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn();
      render(<FilterPopover fields={geoFields} appliedFilter="" onApply={onApply} />);
      await openPopover(user);
      await pickFieldAndOperator(user, "location", "equals");
      fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: point } });
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onApply).toHaveBeenCalledWith(
        JSON.stringify({ location: { type: "Point", coordinates: [8.5417, 47.3769] } }),
      );
    });

    it("negates with $ne for not equals", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn();
      render(<FilterPopover fields={geoFields} appliedFilter="" onApply={onApply} />);
      await openPopover(user);
      await pickFieldAndOperator(user, "location", "not equals");
      fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: point } });
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onApply).toHaveBeenCalledWith(
        JSON.stringify({ location: { $ne: { type: "Point", coordinates: [8.5417, 47.3769] } } }),
      );
    });

    /**
     * Geospatial operators (SPEC #346). This popover emits a raw Mongo filter,
     * so `near` is $geoWithin + $centerSphere in radians (meters / 6378100).
     */
    describe("geospatial operators", () => {
      const polygon =
        '{"type":"Polygon","coordinates":[[[8.5,47.3],[8.6,47.3],[8.6,47.4],[8.5,47.4],[8.5,47.3]]]}';
      const polygonPlaceholder = polygon;

      async function apply(
        operator: string,
        fill: () => void,
      ): Promise<ReturnType<typeof vi.fn>> {
        const user = userEvent.setup();
        const onApply = vi.fn();
        render(<FilterPopover fields={geoFields} appliedFilter="" onApply={onApply} />);
        await openPopover(user);
        await pickFieldAndOperator(user, "location", operator);
        fill();
        await user.click(screen.getByRole("button", { name: "Apply" }));
        return onApply;
      }

      const type = (placeholder: string, value: string) =>
        fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

      it("near sends a $centerSphere around the point, distance in radians", async () => {
        const onApply = await apply("near", () => {
          type(placeholder, point);
          type("Max (m)", "5000");
        });

        expect(onApply).toHaveBeenCalledWith(
          JSON.stringify({
            location: { $geoWithin: { $centerSphere: [[8.5417, 47.3769], 5000 / 6378100] } },
          }),
        );
      });

      it("near with a minimum distance also excludes the inner circle", async () => {
        const onApply = await apply("near", () => {
          type(placeholder, point);
          type("Max (m)", "10000");
          type("Min (m)", "1000");
        });

        expect(onApply).toHaveBeenCalledWith(
          JSON.stringify({
            $and: [
              { location: { $geoWithin: { $centerSphere: [[8.5417, 47.3769], 10000 / 6378100] } } },
              {
                location: {
                  $not: { $geoWithin: { $centerSphere: [[8.5417, 47.3769], 1000 / 6378100] } },
                },
              },
            ],
          }),
        );
      });

      it.each([
        ["no distance", "", ""],
        ["a negative distance", "-5", ""],
        ["a zero distance", "0", ""],
        ["a minimum not below the maximum", "100", "100"],
      ])("near with %s produces no condition", async (_label, max, min) => {
        const onApply = await apply("near", () => {
          type(placeholder, point);
          if (max) type("Max (m)", max);
          if (min) type("Min (m)", min);
        });

        expect(onApply).toHaveBeenCalledWith("");
      });

      it("near with a non-Point reference produces no condition", async () => {
        const onApply = await apply("near", () => {
          type(placeholder, polygon);
          type("Max (m)", "100");
        });

        expect(onApply).toHaveBeenCalledWith("");
      });

      it("within sends $geoWithin $geometry for a polygon", async () => {
        const onApply = await apply("within", () => type(polygonPlaceholder, polygon));

        expect(onApply).toHaveBeenCalledWith(
          JSON.stringify({ location: { $geoWithin: { $geometry: JSON.parse(polygon) } } }),
        );
      });

      it("within rejects a Point reference rather than sending a query Mongo cannot answer", async () => {
        const onApply = await apply("within", () => type(polygonPlaceholder, point));

        expect(onApply).toHaveBeenCalledWith("");
      });

      it("intersects accepts any geometry", async () => {
        const onApply = await apply("intersects", () => type(polygonPlaceholder, point));

        expect(onApply).toHaveBeenCalledWith(
          JSON.stringify({ location: { $geoIntersects: { $geometry: JSON.parse(point) } } }),
        );
      });

      it("shows the distance inputs only for near", async () => {
        const user = userEvent.setup();
        render(<FilterPopover fields={geoFields} appliedFilter="" onApply={vi.fn()} />);
        await openPopover(user);

        await pickFieldAndOperator(user, "location", "within");
        expect(screen.queryByPlaceholderText("Max (m)")).not.toBeInTheDocument();

        await user.click(screen.getAllByRole("combobox")[1]);
        await user.click(await screen.findByRole("option", { name: "near" }));
        expect(screen.getByPlaceholderText("Max (m)")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Min (m)")).toBeInTheDocument();
      });
    });

    // Half-typed JSON must not become a filter matching the literal string.
    it("produces no condition while the JSON is unparseable", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn();
      render(<FilterPopover fields={geoFields} appliedFilter="" onApply={onApply} />);
      await openPopover(user);
      await pickFieldAndOperator(user, "location", "equals");
      fireEvent.change(screen.getByPlaceholderText(placeholder), {
        target: { value: '{"type":"Point"' },
      });
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onApply).toHaveBeenCalledWith("");
    });
  });
});
