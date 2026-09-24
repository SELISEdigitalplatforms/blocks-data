import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { dataServiceInstructions } from "../constants/instructions";
import { DataServiceInstructions } from "./data-service-instructions";

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "http://blocks-os" }));

describe("DataServiceInstructions", () => {
  it("renders the heading, description and every step", () => {
    render(<DataServiceInstructions />);

    expect(screen.getByText("Data Gateway")).toBeInTheDocument();
    expect(screen.getByText(dataServiceInstructions.description)).toBeInTheDocument();
    dataServiceInstructions.steps.forEach((step) => {
      expect(screen.getByText(step)).toBeInTheDocument();
    });
  });

  it("opens the blocks OS data gateway admin page in a new tab on click", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<DataServiceInstructions />);

    await user.click(screen.getByRole("button", { name: "Configure" }));

    expect(openSpy).toHaveBeenCalledWith(
      "http://blocks-os/app/secret-management/data-gateway",
      "_blank",
    );
    openSpy.mockRestore();
  });
});
