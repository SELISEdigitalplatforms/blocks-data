import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StepperProvider, { useStepper } from "./stepper-provider";
import type { Steps } from "./stepper-models";

const steps: Steps = [
  { id: 1, title: "One" },
  { id: 2, title: "Two" },
  { id: 3, title: "Three" },
];

function Harness() {
  const { currentStep, completedSteps, totalSteps, nextStep, previousStep, goToStep, getSteps } =
    useStepper();
  return (
    <div>
      <span data-testid="current">{currentStep}</span>
      <span data-testid="completed">{completedSteps.join(",")}</span>
      <span data-testid="total">{totalSteps}</span>
      <span data-testid="titles">{getSteps().map((s) => s.title).join("|")}</span>
      <button onClick={nextStep}>next</button>
      <button onClick={previousStep}>prev</button>
      <button onClick={() => goToStep(3)}>go3</button>
      <button onClick={() => goToStep(2)}>go2</button>
    </div>
  );
}

const renderProvider = (props: Partial<React.ComponentProps<typeof StepperProvider>> = {}) =>
  render(
    <StepperProvider steps={steps} {...props}>
      <Harness />
    </StepperProvider>,
  );

describe("StepperProvider", () => {
  it("exposes the initial step, total and step list", () => {
    renderProvider();
    expect(screen.getByTestId("current")).toHaveTextContent("1");
    expect(screen.getByTestId("total")).toHaveTextContent("3");
    expect(screen.getByTestId("titles")).toHaveTextContent("One|Two|Three");
  });

  it("advances and records completed steps with nextStep", async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByText("next"));
    expect(screen.getByTestId("current")).toHaveTextContent("2");
    expect(screen.getByTestId("completed")).toHaveTextContent("1");
  });

  it("does not advance beyond the last step", async () => {
    const user = userEvent.setup();
    renderProvider({ initialStep: 3 });
    await user.click(screen.getByText("next"));
    expect(screen.getByTestId("current")).toHaveTextContent("3");
  });

  it("goes back with previousStep", async () => {
    const user = userEvent.setup();
    renderProvider({ initialStep: 2 });
    await user.click(screen.getByText("prev"));
    expect(screen.getByTestId("current")).toHaveTextContent("1");
  });

  it("blocks jumping ahead to an unreachable step via goToStep", async () => {
    const user = userEvent.setup();
    renderProvider();
    // Step 3 requires step 2 completed; from step 1 it must not navigate.
    await user.click(screen.getByText("go3"));
    expect(screen.getByTestId("current")).toHaveTextContent("1");
  });

  it("allows goToStep when the previous step is completed", async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByText("next")); // now on step 2, step 1 completed
    await user.click(screen.getByText("go2"));
    expect(screen.getByTestId("current")).toHaveTextContent("2");
  });

  it("respects the isStepValid guard", async () => {
    const user = userEvent.setup();
    renderProvider({ initialStep: 2, isStepValid: () => false });
    await user.click(screen.getByText("go2"));
    // Guard rejects, so it stays where it started.
    expect(screen.getByTestId("current")).toHaveTextContent("2");
  });

  it("throws when useStepper is used outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow(/useStepper must be used within a StepperProvider/);
    spy.mockRestore();
  });
});
