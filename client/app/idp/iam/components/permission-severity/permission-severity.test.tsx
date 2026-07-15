import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionSeverity } from "./permission-severity";

describe("PermissionSeverity", () => {
  const data = [
    { severityLevel: "Critical", count: 5 },
    { severityLevel: "High", count: 12 },
  ];

  it("renders the overview title and a card per severity level", () => {
    render(<PermissionSeverity data={data} isLoading={false} />);

    expect(screen.getByText("Permission Severity Overview")).toBeInTheDocument();
    expect(screen.getByText("Critical Risk")).toBeInTheDocument();
    expect(screen.getByText("High Risk")).toBeInTheDocument();
    expect(screen.getByText("Medium Risk")).toBeInTheDocument();
    expect(screen.getByText("Low Risk")).toBeInTheDocument();
  });

  it("pads matched counts and defaults unmatched levels to 00", () => {
    render(<PermissionSeverity data={data} isLoading={false} />);

    // Critical count 5 -> "05"
    expect(screen.getByText("05")).toBeInTheDocument();
    // High count 12 -> "12"
    expect(screen.getByText("12")).toBeInTheDocument();
    // Medium and Low have no data -> "00" for each
    expect(screen.getAllByText("00")).toHaveLength(2);
    // One "Permissions" label per card
    expect(screen.getAllByText("Permissions")).toHaveLength(4);
  });

  it("defaults every level to 00 when data is empty", () => {
    render(<PermissionSeverity data={[]} isLoading={false} />);
    expect(screen.getAllByText("00")).toHaveLength(4);
  });

  it("shows skeleton placeholders and hides counts while loading", () => {
    render(<PermissionSeverity data={data} isLoading={true} />);

    // Labels still render...
    expect(screen.getByText("Critical Risk")).toBeInTheDocument();
    // ...but the count values and their label are replaced by skeletons.
    expect(screen.queryByText("05")).not.toBeInTheDocument();
    expect(screen.queryByText("Permissions")).not.toBeInTheDocument();
  });
});
