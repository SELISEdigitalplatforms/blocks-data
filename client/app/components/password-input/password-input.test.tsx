import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("renders a masked password field by default", () => {
    const { container } = render(<PasswordInput defaultValue="hunter2" />);
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("type", "password");
  });

  it("toggles visibility when the button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<PasswordInput defaultValue="hunter2" />);
    const input = container.querySelector("input") as HTMLInputElement;
    const toggle = screen.getByRole("button");

    expect(input).toHaveAttribute("type", "password");

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "password");
  });

  it("forwards native input props like placeholder", () => {
    render(<PasswordInput placeholder="Enter password" />);
    expect(screen.getByPlaceholderText("Enter password")).toBeInTheDocument();
  });

  it("forwards a ref to the underlying input", () => {
    let node: HTMLInputElement | null = null;
    render(<PasswordInput ref={(el) => (node = el)} />);
    expect(node).toBeInstanceOf(HTMLInputElement);
  });
});
