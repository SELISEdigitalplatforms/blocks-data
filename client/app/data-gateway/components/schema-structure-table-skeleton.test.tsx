import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SchemaStructureTableSkeleton } from "./schema-structure-table-skeleton";

describe("SchemaStructureTableSkeleton", () => {
  it("renders skeleton placeholders for the desktop and mobile layouts", () => {
    const { container } = render(<SchemaStructureTableSkeleton />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(10);
  });
});
