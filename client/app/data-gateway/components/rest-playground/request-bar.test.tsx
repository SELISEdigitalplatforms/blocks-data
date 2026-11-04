import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestBar } from "./request-bar";

function Bar() {
  const [requestLine, setRequestLine] = useState("/Employee");
  const [inputRef] = useState(() => createRef<HTMLInputElement>());
  return (
    <RequestBar
      method="GET"
      onMethodChange={() => {}}
      requestLine={requestLine}
      onRequestLineChange={setRequestLine}
      entityNames={["Employee"]}
      pathError={null}
      isSending={false}
      onSend={() => {}}
      onCancel={() => {}}
      inputRef={inputRef}
    />
  );
}

const pathField = () => screen.getByRole("combobox", { name: "Request path" }) as HTMLInputElement;
const pickItemRoute = () => fireEvent.change(pathField(), { target: { value: "/Employee/{itemId}" } });

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => vi.restoreAllMocks());

const runFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
};

describe("RequestBar: selecting the {itemId} placeholder", () => {
  it("picking an item route selects the placeholder on the next frame", () => {
    render(<Bar />);
    pickItemRoute();
    expect(frames.size).toBe(1);
    runFrames();
    const input = pathField();
    expect(input).toHaveFocus();
    expect(input.value.slice(input.selectionStart!, input.selectionEnd!)).toBe("{itemId}");
  });

  it("picking a :verb route selects no placeholder", () => {
    render(<Bar />);
    fireEvent.change(pathField(), { target: { value: "/Employee:deleteMany" } });
    expect(frames.size).toBe(0);
  });

  it("a new pick cancels the frame still pending", () => {
    render(<Bar />);
    pickItemRoute();
    fireEvent.change(pathField(), { target: { value: "/Employee" } });
    pickItemRoute();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect([...frames.keys()]).toEqual([2]);
  });

  it("unmounting cancels the pending frame", () => {
    const { unmount } = render(<Bar />);
    pickItemRoute();
    expect(() => unmount()).not.toThrow();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(frames.size).toBe(0);
  });
});
