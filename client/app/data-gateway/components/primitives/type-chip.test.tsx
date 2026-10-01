import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TypeChip, categoryForType } from "./type-chip";
import { RequiredBadge } from "./required-badge";

describe("categoryForType", () => {
  it("classifies primitives regardless of casing", () => {
    expect(categoryForType("String")).toBe("string");
    expect(categoryForType("decimal")).toBe("numeric");
    expect(categoryForType("INT64")).toBe("numeric");
    expect(categoryForType("Boolean")).toBe("boolean");
    expect(categoryForType("DateTime")).toBe("temporal");
  });

  it("treats anything unrecognised as a child-schema reference", () => {
    expect(categoryForType("OrderItem")).toBe("reference");
    expect(categoryForType("")).toBe("reference");
    expect(categoryForType(null)).toBe("reference");
  });
});

describe("TypeChip", () => {
  it("shows the type name and colours it by category", () => {
    render(<TypeChip type="Decimal" />);
    const chip = screen.getByText(/Decimal/);
    expect(chip.className).toContain("bg-type-numeric-bg");
  });

  it("marks arrays without losing the underlying type", () => {
    render(<TypeChip type="OrderItem" isArray />);
    expect(screen.getByText(/OrderItem\[\]/)).toBeInTheDocument();
  });

  it("surfaces the rule-operator category in the title, which colour does not encode", () => {
    render(<TypeChip type="Status" isArray />);
    expect(screen.getByTitle("Status[] · array")).toBeInTheDocument();
  });

  it("falls back to a dash for a property with no type yet", () => {
    render(<TypeChip type="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("RequiredBadge", () => {
  it("keeps Insert and Update distinguishable rather than collapsing to a boolean", () => {
    const { rerender } = render(<RequiredBadge requiredOn="Insert" />);
    expect(screen.getByText("Insert")).toBeInTheDocument();

    rerender(<RequiredBadge requiredOn="Update" />);
    expect(screen.getByText("Update")).toBeInTheDocument();

    rerender(<RequiredBadge requiredOn="Both" />);
    expect(screen.getByText("Both")).toBeInTheDocument();
  });

  it("renders None as a muted dash", () => {
    render(<RequiredBadge requiredOn="None" />);
    const el = screen.getByText("—");
    expect(el.className).toContain("text-muted-foreground/60");
  });

  it("treats an absent value as None", () => {
    render(<RequiredBadge />);
    expect(screen.getByTitle("Never required")).toBeInTheDocument();
  });
});
