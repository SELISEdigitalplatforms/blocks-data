import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from "./toast";

const renderToast = (variant?: "default" | "destructive" | "success" | "warning" | "info") =>
  render(
    <ToastProvider>
      <Toast open variant={variant}>
        <ToastTitle>Heads up</ToastTitle>
        <ToastDescription>Something happened</ToastDescription>
        <ToastAction altText="Undo">Undo</ToastAction>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>,
  );

describe("Toast", () => {
  it("renders title, description, action and close", () => {
    renderToast();
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Something happened")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("applies the destructive variant styling", () => {
    renderToast("destructive");
    expect(screen.getByText("Heads up").closest("li")).toHaveClass("destructive");
  });

  it.each(["success", "warning", "info"] as const)("renders the %s variant", (variant) => {
    renderToast(variant);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
  });
});
