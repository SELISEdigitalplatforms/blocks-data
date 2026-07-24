import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./default-doc", () => ({ DefaultDoc: () => <div>default-doc</div> }));
vi.mock("./self-project", () => ({ SelfProject: () => <div>self-project</div> }));

import { Console } from "./console";

describe("Console", () => {
  it("composes the self-project and resources sections", () => {
    render(<Console />);
    expect(screen.getByText("self-project")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("default-doc")).toBeInTheDocument();
  });
});
