import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const resetFormData = vi.fn();
vi.mock("@/components/create-project/utils", () => ({
  useCreateProjectFormState: () => ({ resetFormData }),
}));

let tab = "1";
const setTab = vi.fn();
vi.mock("nuqs", () => ({
  useQueryState: () => [tab, setTab],
}));

const goToStep = vi.fn();
const setCompletedSteps = vi.fn();
let currentStep = 1;
vi.mock("@/components/stepper/stepper-provider", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useStepper: () => ({ currentStep, goToStep, setCompletedSteps }),
}));
vi.mock("@/components/stepper/vertical-track-bar", () => ({
  default: () => <div data-testid="vertical-track" />,
}));
vi.mock("@/components/stepper/horizontal-track-bar", () => ({
  default: () => <div data-testid="horizontal-track" />,
}));
vi.mock(
  "@/components/create-project/form/create-project-naming-form/create-project-naming-form",
  () => ({ CreateProjectNamingForm: () => <div data-testid="naming-form" /> }),
);
vi.mock(
  "@/components/create-project/form/create-project-resources-form/create-project-resources-form",
  () => ({ CreateProjectResourcesForm: () => <div data-testid="resources-form" /> }),
);
vi.mock(
  "@/components/create-project/form/create-project-environments-form/create-project-environments-form",
  () => ({ CreateProjectEnvironmentsForm: () => <div data-testid="environments-form" /> }),
);

import { CreateProjectWrapper } from "./create-project";

const renderPage = () =>
  render(
    <MemoryRouter>
      <CreateProjectWrapper />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.clearAllMocks();
  tab = "1";
  currentStep = 1;
});

describe("CreateProjectWrapper", () => {
  it("renders the naming form on step one", () => {
    currentStep = 1;
    renderPage();
    expect(screen.getAllByTestId("naming-form").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create a project").length).toBeGreaterThan(0);
  });

  it("renders the resources form on step two", () => {
    currentStep = 2;
    renderPage();
    expect(screen.getAllByTestId("resources-form").length).toBeGreaterThan(0);
  });

  it("renders the environments form on step three", () => {
    currentStep = 3;
    renderPage();
    expect(screen.getAllByTestId("environments-form").length).toBeGreaterThan(0);
  });

  it("jumps to step two and clears the tab when the tab query is '2'", () => {
    tab = "2";
    currentStep = 1;
    renderPage();
    expect(setCompletedSteps).toHaveBeenCalledWith([1]);
    expect(goToStep).toHaveBeenCalledWith(2);
    expect(setTab).toHaveBeenCalledWith("0");
  });
});
