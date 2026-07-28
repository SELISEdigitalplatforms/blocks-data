import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...p }: React.ComponentProps<"div">) => <div {...p}>{children}</div> },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./guideline", () => ({ GuideLine: () => <div data-testid="guideline-steps" /> }));

import { GuideLineWrapper } from "./guideline-wrapper";

const steps = [{ id: "1", description: "step one" }];

afterEach(() => vi.clearAllMocks());

describe("GuideLineWrapper", () => {
  it("returns nothing when there is no content", () => {
    const { container } = render(
      <GuideLineWrapper title="Guide" content={null as never} open onOpenChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while closed", () => {
    render(<GuideLineWrapper title="Guide" content={steps} open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Guide")).not.toBeInTheDocument();
  });

  it("renders the title and steps when open and closes via the button", () => {
    const onOpenChange = vi.fn();
    render(<GuideLineWrapper title="Guide" content={steps} open onOpenChange={onOpenChange} />);
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(screen.getByTestId("guideline-steps")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
