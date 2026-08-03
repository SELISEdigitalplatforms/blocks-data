import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import { DataJsonView } from "./data-json-view";

describe("DataJsonView", () => {
  it("renders each record with a 1-based index label", () => {
    render(
      <DataJsonView
        data={[
          { name: "Alice" },
          { name: "Bob" },
        ]}
      />,
    );
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    // Plain JSON path (no PII) renders the raw values
    expect(screen.getByText(/"Alice"/)).toBeInTheDocument();
  });

  it("masks PII fields and hides their real value", () => {
    render(
      <TooltipProvider>
        <DataJsonView
          data={[{ name: "Alice", ssn: "123-45-6789" }]}
          piiFields={new Set(["ssn"])}
        />
      </TooltipProvider>,
    );
    // The real secret value must not appear anywhere
    expect(screen.queryByText(/123-45-6789/)).not.toBeInTheDocument();
    // The mask should be present
    expect(screen.getByText(/••••••••/)).toBeInTheDocument();
  });

  it("renders normally when the PII set is empty", () => {
    render(<DataJsonView data={[{ email: "x@y.z" }]} piiFields={new Set()} />);
    expect(screen.getByText(/"x@y.z"/)).toBeInTheDocument();
  });
});
