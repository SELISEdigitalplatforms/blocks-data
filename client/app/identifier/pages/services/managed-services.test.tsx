import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./service-list", () => ({ ServiceList: () => <div data-testid="service-list" /> }));
let capturedOpen: boolean | undefined;
vi.mock("@/identifier/components/guideline/guideline-wrapper", () => ({
  GuideLineWrapper: ({ open }: { open: boolean }) => {
    capturedOpen = open;
    return <div data-testid="guideline" data-open={String(open)} />;
  },
}));
vi.mock("./guideline-docs", () => ({ managedServicesGuidelineSteps: [] }));

import { ManagedServices } from "./managed-services";

afterEach(() => {
  vi.clearAllMocks();
  capturedOpen = undefined;
});

describe("ManagedServices", () => {
  it("renders the service list and guideline (uncontrolled, closed by default)", () => {
    render(<ManagedServices />);
    expect(screen.getByTestId("service-list")).toBeInTheDocument();
    expect(capturedOpen).toBe(false);
  });

  it("uses the controlled guideOpen prop when provided", () => {
    render(<ManagedServices guideOpen onGuideOpenChange={vi.fn()} />);
    expect(capturedOpen).toBe(true);
  });
});
