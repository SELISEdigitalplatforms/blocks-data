import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let queryState = { mfa_type: 0 };
vi.mock("nuqs", () => ({
  useQueryStates: () => [queryState, vi.fn()],
  parseAsInteger: { withDefault: () => ({}) },
}));

// The form has its own tests; here only the page's heading and instructions matter.
vi.mock("./mfa-check-form", () => ({ MfaCheckFrom: () => <div data-testid="mfa-form" /> }));
vi.mock("@/components/logo", () => ({ Logo: () => null }));

import { MfaCheck } from "./mfa-check";

describe("MfaCheck", () => {
  it("asks for the emailed code by default", () => {
    queryState = { mfa_type: 0 };
    render(<MfaCheck />);

    expect(screen.getByText("Verify it’s you")).toBeInTheDocument();
    expect(screen.getByText(/Check your email for the verification code/)).toBeInTheDocument();
    expect(screen.getByTestId("mfa-form")).toBeInTheDocument();
  });

  it("asks for the authenticator app code for an app-based check", () => {
    queryState = { mfa_type: 1 };
    render(<MfaCheck />);

    expect(screen.getByText(/Open your authenticator app and get the verification code/)).toBeInTheDocument();
  });
});
