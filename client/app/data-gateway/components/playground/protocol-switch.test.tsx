import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deprecated = vi.hoisted(() => ({ value: false }));

vi.mock("../../utils/graphql-deprecation", () => ({
  isGraphQLDeprecated: () => deprecated.value,
}));

import { ProtocolSwitch, type Protocol } from "./protocol-switch";

function Harness({ initial = "rest", onChange }: { initial?: Protocol; onChange?: (value: Protocol) => void }) {
  const [value, setValue] = useState<Protocol>(initial);
  return (
    <ProtocolSwitch
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

const rest = () => screen.getByRole("radio", { name: /REST/ });
const graphql = () => screen.getByRole("radio", { name: /GraphQL/ });

beforeEach(() => {
  deprecated.value = false;
});

describe("ProtocolSwitch", () => {
  it("is a radio group of REST and GraphQL with the value selected", () => {
    render(<Harness initial="graphql" />);
    expect(screen.getByRole("radiogroup", { name: "Protocol" })).toBeInTheDocument();
    expect(graphql()).toHaveAttribute("aria-checked", "true");
    expect(rest()).toHaveAttribute("aria-checked", "false");
  });

  it("puts only the selected radio in the tab order", () => {
    render(<Harness initial="rest" />);
    expect(rest()).toHaveAttribute("tabindex", "0");
    expect(graphql()).toHaveAttribute("tabindex", "-1");

    fireEvent.click(graphql());
    expect(graphql()).toHaveAttribute("tabindex", "0");
    expect(rest()).toHaveAttribute("tabindex", "-1");
  });

  it("tabs into the selected radio and out of the group in one step", async () => {
    render(
      <>
        <button type="button">before</button>
        <Harness initial="graphql" />
        <button type="button">after</button>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();
    await userEvent.tab();
    expect(graphql()).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "after" })).toHaveFocus();
  });

  it.each(["{ArrowRight}", "{ArrowDown}"])("%s moves to the next radio, selects it and focuses it", async (key) => {
    const onChange = vi.fn();
    render(<Harness initial="rest" onChange={onChange} />);
    rest().focus();
    await userEvent.keyboard(key);
    expect(onChange).toHaveBeenCalledWith("graphql");
    expect(graphql()).toHaveAttribute("aria-checked", "true");
    expect(graphql()).toHaveFocus();
  });

  it.each(["{ArrowLeft}", "{ArrowUp}"])("%s moves to the previous radio, selects it and focuses it", async (key) => {
    const onChange = vi.fn();
    render(<Harness initial="graphql" onChange={onChange} />);
    graphql().focus();
    await userEvent.keyboard(key);
    expect(onChange).toHaveBeenCalledWith("rest");
    expect(rest()).toHaveAttribute("aria-checked", "true");
    expect(rest()).toHaveFocus();
  });

  it("wraps from the last radio to the first and back", async () => {
    render(<Harness initial="graphql" />);
    graphql().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(rest()).toHaveFocus();
    expect(rest()).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowLeft}");
    expect(graphql()).toHaveFocus();
    expect(graphql()).toHaveAttribute("aria-checked", "true");
  });

  it.each(["Alt", "Control", "Meta", "Shift"])(
    "leaves an arrow key alone while %s is held, so browser shortcuts still work",
    async (modifier) => {
      const onChange = vi.fn();
      render(<Harness initial="rest" onChange={onChange} />);
      rest().focus();
      const notPrevented = fireEvent.keyDown(rest(), {
        key: "ArrowLeft",
        altKey: modifier === "Alt",
        ctrlKey: modifier === "Control",
        metaKey: modifier === "Meta",
        shiftKey: modifier === "Shift",
      });
      expect(notPrevented).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
      expect(rest()).toHaveAttribute("aria-checked", "true");
      expect(rest()).toHaveFocus();
    },
  );

  it("ignores other keys", async () => {
    const onChange = vi.fn();
    render(<Harness initial="rest" onChange={onChange} />);
    rest().focus();
    await userEvent.keyboard("ab{Home}{End}");
    expect(onChange).not.toHaveBeenCalled();
    expect(rest()).toHaveAttribute("aria-checked", "true");
  });

  it("tags GraphQL deprecated only while the flag is set", () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByText("deprecated")).not.toBeInTheDocument();
    unmount();

    deprecated.value = true;
    render(<Harness />);
    expect(graphql()).toHaveTextContent("deprecated");
    expect(rest()).not.toHaveTextContent("deprecated");
  });
});
