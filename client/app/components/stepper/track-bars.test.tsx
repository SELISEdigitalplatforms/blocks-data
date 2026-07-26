import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const goToStep = vi.fn();
vi.mock("@/components/stepper/stepper-provider", () => ({
  useStepper: () => ({
    currentStep: 2,
    totalSteps: 3,
    completedSteps: [true, false, false],
    goToStep,
    getSteps: () => [
      { id: 1, title: "Name" },
      { id: 2, title: "Resources" },
      { id: 3, title: "Environments" },
    ],
  }),
}));

import StepHorizontalTrackBar from "./horizontal-track-bar";
import StepVerticalTrackBar from "./vertical-track-bar";

afterEach(() => vi.clearAllMocks());

describe("stepper track bars", () => {
  it("renders horizontal steps and navigates on click", () => {
    render(<StepHorizontalTrackBar />);
    expect(screen.getByText("Resources")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button")[2]);
    expect(goToStep).toHaveBeenCalledWith(3);
  });

  it("renders vertical steps with titles and connector lines", () => {
    render(<StepVerticalTrackBar />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Environments")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(goToStep).toHaveBeenCalledWith(1);
  });
});
