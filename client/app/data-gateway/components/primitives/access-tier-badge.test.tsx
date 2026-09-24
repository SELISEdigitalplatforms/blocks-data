import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccessTierBadge, AccessTierDot, AccessVerbPill, tierFromLevel } from "./access-tier-badge";

describe("tierFromLevel", () => {
  it("maps every SchemaAccessLevel to its tier", () => {
    expect(tierFromLevel(0)).toBe("inherited");
    expect(tierFromLevel(1)).toBe("user");
    expect(tierFromLevel(2)).toBe("public");
    expect(tierFromLevel(3)).toBe("custom");
  });

  it("falls back to inherited for absent or unknown levels", () => {
    expect(tierFromLevel(undefined)).toBe("inherited");
    expect(tierFromLevel(null)).toBe("inherited");
    expect(tierFromLevel(99)).toBe("inherited");
  });
});

describe("AccessTierBadge", () => {
  it("renders the tier label for a level", () => {
    render(<AccessTierBadge level={2} />);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("uses only semantic access tokens, never raw palette classes", () => {
    const { container } = render(<AccessTierBadge level={1} bordered />);
    const className = container.firstElementChild?.className ?? "";

    expect(className).toContain("bg-access-user-bg");
    expect(className).toContain("text-access-user-fg");
    expect(className).toContain("border-access-user-border");
    // the hardcoded palettes this component replaced
    expect(className).not.toMatch(/amber|rose|emerald|indigo|sky/);
  });

  it("gives the same level the same colour in both shapes", () => {
    const { container: pill } = render(<AccessTierBadge level={3} />);
    const { container: cell } = render(<AccessTierBadge level={3} shape="cell">U</AccessTierBadge>);

    expect(pill.firstElementChild?.className).toContain("bg-access-custom-bg");
    expect(cell.firstElementChild?.className).toContain("bg-access-custom-bg");
  });

  it("lets children override the label for matrix cells", () => {
    render(
      <AccessTierBadge level={0} shape="cell">
        D
      </AccessTierBadge>,
    );
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.queryByText("Inherited")).not.toBeInTheDocument();
  });

  it("titles the badge with the tier so the colour is never the only signal", () => {
    render(
      <AccessTierBadge level={2} shape="cell">
        R
      </AccessTierBadge>,
    );
    expect(screen.getByTitle("Public")).toBeInTheDocument();
  });

  it("prefers an explicit tier when no level is given", () => {
    render(<AccessTierBadge tier="custom" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});

describe("AccessTierDot", () => {
  it("carries the tier colour and an accessible title", () => {
    const { container } = render(<AccessTierDot level={2} />);
    expect(container.firstElementChild?.className).toContain("bg-access-public-dot");
    expect(screen.getByTitle("Public")).toBeInTheDocument();
  });
});
describe("AccessVerbPill", () => {
  // Verb and tier used to be a bare label beside a separate coloured pill;
  // every board draws them sharing one bordered, tier-tinted pill.
  it("puts the verb and the tier value inside the same button", () => {
    render(<AccessVerbPill verb="Create" level={3} onClick={vi.fn()} />);

    const pill = screen.getByRole("button", { name: "Create Custom" });
    expect(pill).toHaveTextContent("Create");
    expect(pill).toHaveTextContent("Custom");
  });

  it("tints the pill's border and background by tier, not just the value text", () => {
    render(<AccessVerbPill verb="View" level={2} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "View Public" });

    expect(pill.className).toContain("border-access-public-border");
    expect(pill.className).toContain("bg-access-public-bg");
  });

  it("fires the click handler", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AccessVerbPill verb="Delete" level={1} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Delete Logged-in users" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
