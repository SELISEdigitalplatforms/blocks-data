import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RateLimiterPage from "./rate-limiter";

describe("dashboard/rate-limiter RateLimiterPage", () => {
  it("renders the heading and placeholder content", () => {
    render(<RateLimiterPage />);
    expect(screen.getByText("Rate Limiter")).toBeInTheDocument();
    expect(
      screen.getByText(/Configure rate limiting policies/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Rate Limiter content coming soon/i),
    ).toBeInTheDocument();
  });
});
