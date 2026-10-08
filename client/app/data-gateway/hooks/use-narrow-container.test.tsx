import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNarrowContainer } from "./use-narrow-container";

type Callback = (entries: Array<{ contentRect: { width: number } }>) => void;

/** Captures each observer's callback so a test can report a width by hand —
 *  jsdom never lays anything out, so nothing would fire on its own. */
const observers: Array<{ callback: Callback; observed: Element[] }> = [];

class FakeResizeObserver {
  private record: { callback: Callback; observed: Element[] };
  constructor(callback: Callback) {
    this.record = { callback, observed: [] };
    observers.push(this.record);
  }
  observe(el: Element) {
    this.record.observed.push(el);
  }
  disconnect() {
    this.record.observed = [];
  }
  unobserve() {}
}

function reportWidth(width: number) {
  act(() => {
    for (const o of observers) {
      if (o.observed.length) o.callback([{ contentRect: { width } }]);
    }
  });
}

function Probe({ ready }: { ready: boolean }) {
  const { ref, isNarrow } = useNarrowContainer<HTMLDivElement>(560);
  // Mirrors SchemaBasicInfo: a placeholder renders first and the measured
  // element only mounts once loading finishes.
  if (!ready) return <p>loading</p>;
  return <div ref={ref}>{isNarrow ? "narrow" : "wide"}</div>;
}

describe("useNarrowContainer", () => {
  const original = globalThis.ResizeObserver;

  beforeEach(() => {
    observers.length = 0;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = original;
    vi.restoreAllMocks();
  });

  it("reports narrow once the element drops below the threshold", () => {
    render(<Probe ready />);
    expect(screen.getByText("wide")).toBeInTheDocument();

    reportWidth(375);
    expect(screen.getByText("narrow")).toBeInTheDocument();

    reportWidth(800);
    expect(screen.getByText("wide")).toBeInTheDocument();
  });

  // The schema header shows a loading skeleton first. The hook used to read
  // its ref once on mount — while the skeleton was up and the ref was empty —
  // and never attached, so the header stayed "wide" on a phone.
  it("starts observing an element that mounts after the first render", () => {
    const { rerender } = render(<Probe ready={false} />);
    rerender(<Probe ready />);

    reportWidth(375);
    expect(screen.getByText("narrow")).toBeInTheDocument();
  });
});
