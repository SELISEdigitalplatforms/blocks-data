import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../page-bar", () => ({
  DataGatewayPageBar: () => <div data-testid="page-bar" />,
}));
vi.mock("./graphql-playground-page", () => ({
  GraphQLPlaygroundPage: () => <div data-testid="playground-page" />,
}));

import { GraphQLPlayground } from "./graphql-playground";

describe("GraphQLPlayground", () => {
  // The breadcrumb went with the page bar: its own title plus the highlighted
  // Playground tab say the same thing, and the tabs also lead back out.
  it("composes the page bar and the playground page", () => {
    render(<GraphQLPlayground />);
    expect(screen.getByTestId("page-bar")).toBeInTheDocument();
    expect(screen.getByTestId("playground-page")).toBeInTheDocument();
    expect(screen.queryByTestId("breadcrumb")).not.toBeInTheDocument();
  });
});
