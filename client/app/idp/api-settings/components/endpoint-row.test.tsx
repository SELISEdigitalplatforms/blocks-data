import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EndpointRow } from "./endpoint-row";
import type { IApiEndpoint } from "../models/api-endpoint.model";

const endpoint = {
  itemId: "e1",
  controller: "users",
  method: "delete",
  description: "Delete a user",
  isMFARequired: false,
  isCaptchaRequired: false,
} as IApiEndpoint;

describe("EndpointRow", () => {
  it("renders the endpoint path, description and a Critical badge for DELETE", () => {
    render(
      <EndpointRow
        endpoint={endpoint}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleMfa={vi.fn()}
        onToggleCaptcha={vi.fn()}
      />,
    );
    expect(screen.getByText("Delete a user")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("DELETE")).toBeInTheDocument();
  });

  it("fires onSelect when the checkbox is toggled", () => {
    const onSelect = vi.fn();
    render(
      <EndpointRow
        endpoint={endpoint}
        isSelected={false}
        onSelect={onSelect}
        onToggleMfa={vi.fn()}
        onToggleCaptcha={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelect).toHaveBeenCalledWith("e1", true);
  });

  it("fires the MFA and Captcha toggle handlers", () => {
    const onToggleMfa = vi.fn();
    const onToggleCaptcha = vi.fn();
    render(
      <EndpointRow
        endpoint={{ ...endpoint, method: "get", description: "" }}
        isSelected
        onSelect={vi.fn()}
        onToggleMfa={onToggleMfa}
        onToggleCaptcha={onToggleCaptcha}
      />,
    );
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);
    fireEvent.click(switches[1]);
    expect(onToggleMfa).toHaveBeenCalled();
    expect(onToggleCaptcha).toHaveBeenCalled();
    // No Critical badge for a GET endpoint.
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
  });
});
