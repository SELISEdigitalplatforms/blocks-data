import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MagicUrlStatusBadge } from "./magic-url-status-badge";
import type { MagicUrl } from "@/magic-url/models/magic-url.model";

const item = (over: Partial<MagicUrl> = {}): MagicUrl =>
  ({
    usageLimit: 0,
    usageCount: 0,
    ...over,
  }) as MagicUrl;

describe("MagicUrlStatusBadge", () => {
  it("shows the explicit Active status", () => {
    render(<MagicUrlStatusBadge item={item({ status: "Active" })} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders Inactive and Disabled statuses verbatim", () => {
    const { rerender } = render(
      <MagicUrlStatusBadge item={item({ status: "Inactive" })} />,
    );
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    rerender(<MagicUrlStatusBadge item={item({ status: "Disabled" })} />);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("renders an unknown status through the default branch", () => {
    render(<MagicUrlStatusBadge item={item({ status: "Weird" })} />);
    expect(screen.getByText("Weird")).toBeInTheDocument();
  });

  it("derives Disabled from a ManuallyDisabled reason when no status", () => {
    render(<MagicUrlStatusBadge item={item({ expiredReason: "ManuallyDisabled" })} />);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("derives Limit Exceeded from the usage reason", () => {
    render(
      <MagicUrlStatusBadge item={item({ expiredReason: "UsageLimitExceeded" })} />,
    );
    expect(screen.getByText("Limit Exceeded")).toBeInTheDocument();
  });

  it("derives Limit Exceeded when usage count reaches the limit", () => {
    render(<MagicUrlStatusBadge item={item({ usageLimit: 5, usageCount: 5 })} />);
    expect(screen.getByText("Limit Exceeded")).toBeInTheDocument();
  });

  it("derives Expired from a TimeExpired reason", () => {
    render(<MagicUrlStatusBadge item={item({ expiredReason: "TimeExpired" })} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("derives Expired when the expiry date is in the past", () => {
    render(
      <MagicUrlStatusBadge item={item({ expiryDate: "2000-01-01T00:00:00Z" })} />,
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("derives Expired from the isExpired flag", () => {
    render(<MagicUrlStatusBadge item={item({ isExpired: true })} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("defaults to Active when nothing marks it expired", () => {
    render(
      <MagicUrlStatusBadge
        item={item({ expiryDate: "2999-01-01T00:00:00Z" })}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
