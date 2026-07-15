import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { dataServiceInstructions } from "../constants/instructions";
import { DataServiceInstructions } from "./data-service-instructions";

// The Configure button mounts a heavy modal — stub it out.
vi.mock("./configure-data-source", () => ({
  default: ({ mode }: { mode: string }) => (
    <div data-testid="configure-modal">configure:{mode}</div>
  ),
}));

describe("DataServiceInstructions", () => {
  it("renders the heading, description and every step", () => {
    render(<DataServiceInstructions />);

    expect(screen.getByText("Data Gateway")).toBeInTheDocument();
    expect(screen.getByText(dataServiceInstructions.description)).toBeInTheDocument();
    dataServiceInstructions.steps.forEach((step) => {
      expect(screen.getByText(step)).toBeInTheDocument();
    });
  });

  it("does not mount the configure modal until Configure is clicked", () => {
    render(<DataServiceInstructions />);
    expect(screen.queryByTestId("configure-modal")).not.toBeInTheDocument();
  });

  it("opens the configure modal in create mode on click", async () => {
    const user = userEvent.setup();
    render(<DataServiceInstructions />);

    await user.click(screen.getByRole("button", { name: "Configure" }));
    expect(await screen.findByTestId("configure-modal")).toHaveTextContent(
      "configure:create",
    );
  });
});
