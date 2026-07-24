import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Check, Circle, X } from "lucide-react";
import { Stepper, Step } from "./index";
import type { StepItem } from "./types";

const steps: StepItem[] = [
  { label: "One", description: "first" },
  { label: "Two", description: "second" },
  { label: "Three", description: "third" },
];

describe("Stepper", () => {
  it("renders horizontal steps with labels and the active step content", () => {
    render(
      <Stepper initialStep={1} steps={steps} orientation="horizontal">
        {steps.map((s, i) => (
          <Step key={i} label={s.label} description={s.description}>
            <div>content-{i}</div>
          </Step>
        ))}
      </Stepper>,
    );
    expect(screen.getAllByText("One").length).toBeGreaterThan(0);
    expect(screen.getByText("Two")).toBeInTheDocument();
    // Horizontal content shows the active step (index 1) children.
    expect(screen.getByText("content-1")).toBeInTheDocument();
  });

  it("renders vertical steps and expands their content", () => {
    render(
      <Stepper initialStep={0} steps={steps} orientation="vertical" expandVerticalSteps>
        {steps.map((s, i) => (
          <Step key={i} label={s.label} description={s.description}>
            <div>vcontent-{i}</div>
          </Step>
        ))}
      </Stepper>,
    );
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("vcontent-0")).toBeInTheDocument();
  });

  it("invokes onClickStep when a clickable step is clicked", () => {
    const onClickStep = vi.fn();
    render(
      <Stepper initialStep={0} steps={steps} orientation="horizontal" onClickStep={onClickStep}>
        {steps.map((s, i) => (
          <Step key={i} label={s.label}>
            <div>c{i}</div>
          </Step>
        ))}
      </Stepper>,
    );
    // Clicking a step button triggers the handler.
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClickStep).toHaveBeenCalled();
  });

  it("renders the error state with a custom error icon", () => {
    render(
      <Stepper
        initialStep={1}
        steps={steps}
        orientation="horizontal"
        state="error"
        errorIcon={X}
        checkIcon={Check}
      >
        {steps.map((s, i) => (
          <Step key={i} label={s.label} icon={Circle}>
            <div>e{i}</div>
          </Step>
        ))}
      </Stepper>,
    );
    expect(screen.getAllByText("One").length).toBeGreaterThan(0);
  });

  it("renders the loading state without throwing", () => {
    render(
      <Stepper initialStep={0} steps={steps} orientation="vertical" state="loading">
        {steps.map((s, i) => (
          <Step key={i} label={s.label}>
            <div>l{i}</div>
          </Step>
        ))}
      </Stepper>,
    );
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("uses the line variant with a single step (justify-end branch)", () => {
    render(
      <Stepper initialStep={0} steps={[steps[0]]} orientation="horizontal" variant="line">
        <Step label="Only">
          <div>only-content</div>
        </Step>
      </Stepper>,
    );
    expect(screen.getByText("only-content")).toBeInTheDocument();
  });

  it("throws when a non-element child is provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <Stepper initialStep={0} steps={steps}>
          {"plain string child" as unknown as React.ReactNode}
        </Stepper>,
      ),
    ).toThrow(/valid React elements/);
    spy.mockRestore();
  });
});
