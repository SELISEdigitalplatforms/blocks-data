import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigate }));

import { AddProjectCard } from "./add-project-card";

afterEach(() => vi.clearAllMocks());

describe("AddProjectCard", () => {
  it("navigates to the create-project route when clicked", () => {
    render(<AddProjectCard />);
    fireEvent.click(screen.getByText("Add Project"));
    expect(navigate).toHaveBeenCalledWith("/create-project");
  });
});
