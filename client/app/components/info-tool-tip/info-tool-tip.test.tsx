import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import { InfoTooltip } from "./info-tool-tip";

function renderTooltip(content = "Helpful hint") {
  return render(
    <TooltipProvider delayDuration={0}>
      <InfoTooltip content={content} />
    </TooltipProvider>,
  );
}

describe("InfoTooltip", () => {
  it("renders a trigger button", () => {
    renderTooltip();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("reveals the content on hover", async () => {
    const user = userEvent.setup();
    renderTooltip("Helpful hint");
    await user.hover(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getAllByText("Helpful hint").length).toBeGreaterThan(0);
    });
  });
});
