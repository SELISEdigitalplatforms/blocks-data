import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import userEvent from "@testing-library/user-event";

import { FieldFlags, FlagToggleChip, flagsFromField } from "./field-flags";

describe("flagsFromField", () => {
  it("derives only the three genuine booleans, in a stable order", () => {
    expect(flagsFromField({ isArray: true, isPIIData: true, isUniqueData: true })).toEqual([
      "ARR",
      "PII",
      "UQ",
    ]);
  });

  it("omits flags that are false or absent", () => {
    expect(flagsFromField({ isArray: false, isPIIData: true, isUniqueData: false })).toEqual([
      "PII",
    ]);
    expect(flagsFromField({ isArray: false })).toEqual([]);
  });
});

describe("FieldFlags", () => {
  it("renders nothing when a property has no flags", () => {
    const { container } = render(<FieldFlags flags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gives PII, ARR and UQ one shared blue tint", () => {
    render(<FieldFlags flags={["ARR", "PII", "UQ"]} />);

    const arrClass = screen.getByText("ARR").className;
    const piiClass = screen.getByText("PII").className;
    const uqClass = screen.getByText("UQ").className;

    // The same faint blue for all three; the label is what tells them apart.
    [piiClass, arrClass, uqClass].forEach((className) => {
      expect(className).toContain("bg-primary/5");
      expect(className).not.toMatch(/flag-pii|access-custom/);
    });

    expect(new Set([arrClass, piiClass, uqClass]).size).toBe(1);
  });

  it("spells each abbreviation out in a title", () => {
    render(<FieldFlags flags={["ARR", "PII", "UQ"]} />);

    expect(screen.getByTitle("Array")).toBeInTheDocument();
    expect(screen.getByTitle("Personally identifiable data")).toBeInTheDocument();
    expect(screen.getByTitle("Unique")).toBeInTheDocument();
  });
});
describe("FlagToggleChip", () => {
  it("reports its pressed state and fires the toggle on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<FlagToggleChip flag="ARR" active={false} onToggle={onToggle} />);

    const chip = screen.getByRole("button", { name: "Array" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("gives PII, ARR and UQ one shared blue tint when active", () => {
    render(
      <>
        <FlagToggleChip flag="PII" active onToggle={vi.fn()} />
        <FlagToggleChip flag="ARR" active onToggle={vi.fn()} />
        <FlagToggleChip flag="UQ" active onToggle={vi.fn()} />
      </>,
    );

    const piiClass = screen.getByRole("button", { name: "Personally identifiable data" }).className;
    const arrClass = screen.getByRole("button", { name: "Array" }).className;
    const uqClass = screen.getByRole("button", { name: "Unique" }).className;

    // The same faint blue for all three; the label is what tells them apart.
    [piiClass, arrClass, uqClass].forEach((className) => {
      expect(className).toContain("bg-primary/5");
      expect(className).not.toMatch(/flag-pii|access-custom/);
    });

    expect(new Set([piiClass, arrClass, uqClass]).size).toBe(1);
  });

  // Off should read as "not set, but settable" — a border, not a fill — so it
  // is never confused for a disabled control.
  it("drops the fill and takes a border when inactive", () => {
    render(<FlagToggleChip flag="ARR" active={false} onToggle={vi.fn()} />);
    const chip = screen.getByRole("button", { name: "Array" });

    expect(chip.className).not.toContain("bg-primary/5");
    expect(chip.className).toContain("border-border/50");
  });

  it("disables the button and refuses the click when disabled", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<FlagToggleChip flag="ARR" active={false} disabled onToggle={onToggle} />);

    const chip = screen.getByRole("button", { name: "Array" });
    expect(chip).toBeDisabled();

    await user.click(chip);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
