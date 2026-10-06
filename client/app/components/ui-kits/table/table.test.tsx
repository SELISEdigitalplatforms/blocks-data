import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table } from "./table";

describe("Table", () => {
  it("defaults its wrapper to overflow-auto", () => {
    const { container } = render(
      <Table>
        <tbody />
      </Table>,
    );
    expect(container.firstElementChild?.className).toContain("overflow-auto");
  });

  // A `position: sticky` header inside this wrapper sticks to whichever
  // ancestor's overflow isn't `visible` — the default overflow-auto on both
  // axes makes that this wrapper itself, not an outer scroll container, so a
  // sticky header never visibly pins. wrapperClassName lets a caller hand the
  // Y axis off to something further out while keeping X-scroll here.
  it("replaces the wrapper's overflow entirely when wrapperClassName is given", () => {
    const { container } = render(
      <Table wrapperClassName="overflow-x-auto overflow-y-visible">
        <tbody />
      </Table>,
    );
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper.className).toContain("overflow-y-visible");
    expect(wrapper.className).not.toContain("overflow-auto");
  });
});
