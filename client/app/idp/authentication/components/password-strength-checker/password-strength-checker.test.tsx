import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let checks: Record<string, boolean>;
const requirements = [
  { key: "length", label: "At least 8 characters" },
  { key: "upper", label: "One uppercase letter" },
];

vi.mock("@blocks-idp/authentication/hooks/use-password-strength", () => ({
  usePasswordStrength: () => ({ checks, requirements }),
}));

import { PasswordStrengthChecker } from "./password-strength-checker";

beforeEach(() => {
  checks = { length: false, upper: false };
});

describe("PasswordStrengthChecker", () => {
  it("lists each requirement label", () => {
    const onMet = vi.fn();
    render(
      <PasswordStrengthChecker password="" confirmPassword="" onRequirementsMet={onMet} />,
    );
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("One uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("Passwords match")).toBeInTheDocument();
  });

  it("reports requirements unmet when checks fail", () => {
    const onMet = vi.fn();
    render(
      <PasswordStrengthChecker
        password="abc"
        confirmPassword="abc"
        onRequirementsMet={onMet}
      />,
    );
    expect(onMet).toHaveBeenLastCalledWith(false);
  });

  it("reports met when all checks pass and passwords match", () => {
    checks = { length: true, upper: true };
    const onMet = vi.fn();
    render(
      <PasswordStrengthChecker
        password="Password1"
        confirmPassword="Password1"
        onRequirementsMet={onMet}
      />,
    );
    expect(onMet).toHaveBeenLastCalledWith(true);
  });

  it("shows the exclusion requirement and fails when password matches the excluded one", () => {
    checks = { length: true, upper: true };
    const onMet = vi.fn();
    render(
      <PasswordStrengthChecker
        password="Password1"
        confirmPassword="Password1"
        excludePassword="Password1"
        excludePasswordLabel="Must differ from current"
        onRequirementsMet={onMet}
      />,
    );
    expect(screen.getByText("Must differ from current")).toBeInTheDocument();
    expect(onMet).toHaveBeenLastCalledWith(false);
  });

  it("passes when the password differs from the excluded one", () => {
    checks = { length: true, upper: true };
    const onMet = vi.fn();
    render(
      <PasswordStrengthChecker
        password="NewPass1"
        confirmPassword="NewPass1"
        excludePassword="OldPass1"
        onRequirementsMet={onMet}
      />,
    );
    expect(
      screen.getByText("New password shouldn't match current password"),
    ).toBeInTheDocument();
    expect(onMet).toHaveBeenLastCalledWith(true);
  });
});
