import { render, screen } from "@testing-library/react";
import { Pen } from "lucide-react";
import { describe, expect, it } from "vitest";

import { PrimaryButton } from "./primary-button";

describe("PrimaryButton", () => {
  it("reads Add when no label is given", () => {
    render(<PrimaryButton />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("shows the label it is given", () => {
    render(<PrimaryButton label="Edit user" Icon={Pen} />);
    expect(screen.getByRole("button", { name: "Edit user" })).toBeInTheDocument();
  });
});
