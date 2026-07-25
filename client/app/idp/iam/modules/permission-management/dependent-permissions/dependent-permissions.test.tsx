import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let capturedOnAdd: ((perms: { resource: string }[]) => void) | undefined;
vi.mock("./add-dependent-permission", () => ({
  AddDependentPermission: ({ onAdd }: { onAdd: (p: { resource: string }[]) => void }) => {
    capturedOnAdd = onAdd;
    return <button onClick={() => onAdd([{ resource: "new:perm" }])}>add-dep</button>;
  },
}));

import { DependentPermissions } from "./dependent-permissions";

afterEach(() => {
  vi.clearAllMocks();
  capturedOnAdd = undefined;
});

describe("DependentPermissions", () => {
  it("renders existing permission resources as badges", () => {
    render(
      <DependentPermissions
        permissionsResource={["read:x", "write:y"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("read:x")).toBeInTheDocument();
    expect(screen.getByText("write:y")).toBeInTheDocument();
  });

  it("appends newly added permission resources through onChange", () => {
    const onChange = vi.fn();
    render(<DependentPermissions permissionsResource={["read:x"]} onChange={onChange} />);
    fireEvent.click(screen.getByText("add-dep"));
    expect(onChange).toHaveBeenCalledWith(["read:x", "new:perm"]);
  });

  it("removes a permission resource when its badge close icon is clicked", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DependentPermissions
        permissionsResource={["read:x", "write:y"]}
        onChange={onChange}
      />,
    );
    const closeIcon = container.querySelector("svg.cursor-pointer") as SVGElement;
    fireEvent.click(closeIcon);
    expect(onChange).toHaveBeenCalledWith(["write:y"]);
  });
});
