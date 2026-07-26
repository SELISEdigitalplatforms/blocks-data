import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DefaultDoc } from "./default-doc";

describe("DefaultDoc", () => {
  it("renders the three resource cards with external links", () => {
    render(<DefaultDoc />);

    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Cloud")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    links.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
});
