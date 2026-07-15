import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  default: ({ breadcrumbIndex }: { breadcrumbIndex: number }) => (
    <nav data-testid="breadcrumb">idx:{breadcrumbIndex}</nav>
  ),
}));
vi.mock("../data-gateway-actions", () => ({
  DataGatewayActions: () => <div data-testid="actions" />,
}));
vi.mock("./graphql-playground-page", () => ({
  GraphQLPlaygroundPage: () => <div data-testid="playground-page" />,
}));

import { GraphQLPlayground } from "./graphql-playground";

describe("GraphQLPlayground", () => {
  it("composes the breadcrumb, actions and playground page", () => {
    render(<GraphQLPlayground />);
    expect(screen.getByTestId("breadcrumb")).toHaveTextContent("idx:3");
    expect(screen.getByTestId("actions")).toBeInTheDocument();
    expect(screen.getByTestId("playground-page")).toBeInTheDocument();
  });
});
