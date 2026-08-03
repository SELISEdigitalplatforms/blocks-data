import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoCard } from "./info-card";

describe("InfoCard", () => {
  it("renders the title and message", () => {
    render(<InfoCard title="Heads up" message="Something to know" />);
    expect(
      screen.getByRole("heading", { name: "Heads up" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Something to know")).toBeInTheDocument();
  });
});
