import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import { DataListView } from "./data-list-view";

describe("DataListView", () => {
  it("renders each record's keys and scalar values", () => {
    render(<DataListView data={[{ name: "Alice", active: true }]} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // boolean rendered as text
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("masks top-level PII fields", () => {
    render(
      <TooltipProvider>
        <DataListView
          data={[{ email: "secret@example.com" }]}
          piiFields={new Set(["email"])}
        />
      </TooltipProvider>,
    );
    expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("expands nested arrays on click", async () => {
    const user = userEvent.setup();
    render(<DataListView data={[{ tags: ["a", "b", "c"] }]} />);

    // Collapsed by default: shows the count summary
    const toggle = screen.getByRole("button", { name: /Array/ });
    expect(screen.getByText("3 items")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("renders null for nullish values", () => {
    render(<DataListView data={[{ maybe: null }]} />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});
