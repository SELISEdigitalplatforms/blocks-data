import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepperContext } from "./context";
import { useStepper } from "./use-stepper";

const steps = [{ label: "One" }, { label: "Two", optional: true }, { label: "Three" }];

function wrapperFor(activeStep: number) {
  const value = {
    steps,
    activeStep,
    initialStep: 0,
    nextStep: () => {},
    prevStep: () => {},
    resetSteps: () => {},
    setStep: () => {},
  } as never;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <StepperContext.Provider value={value}>
        {children}
      </StepperContext.Provider>
    );
  };
}

describe("useStepper", () => {
  it("computes derived flags for a middle optional step", () => {
    const { result } = renderHook(() => useStepper(), {
      wrapper: wrapperFor(1),
    });
    expect(result.current.isOptionalStep).toBe(true);
    expect(result.current.currentStep).toEqual(steps[1]);
    expect(result.current.isLastStep).toBe(false);
    expect(result.current.hasCompletedAllSteps).toBe(false);
    expect(result.current.isDisabledStep).toBe(false);
  });

  it("marks step 0 as disabled", () => {
    const { result } = renderHook(() => useStepper(), {
      wrapper: wrapperFor(0),
    });
    expect(result.current.isDisabledStep).toBe(true);
    expect(result.current.isOptionalStep).toBe(false);
  });

  it("detects the last step", () => {
    const { result } = renderHook(() => useStepper(), {
      wrapper: wrapperFor(2),
    });
    expect(result.current.isLastStep).toBe(true);
  });

  it("detects completion when activeStep equals the step count", () => {
    const { result } = renderHook(() => useStepper(), {
      wrapper: wrapperFor(3),
    });
    expect(result.current.hasCompletedAllSteps).toBe(true);
    expect(result.current.currentStep).toBeUndefined();
  });
});
