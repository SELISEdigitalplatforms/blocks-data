import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InfiniteScroll } from "./infinite-scroller";

const renderItem = (item: string, index: number) => <div key={index}>item:{item}</div>;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks scrollTo on elements.
  Element.prototype.scrollTo = vi.fn();
});

describe("InfiniteScroll", () => {
  it("renders the provided items", () => {
    render(
      <InfiniteScroll<string>
        initialData={["a", "b"]}
        renderItem={renderItem}
        topFn={vi.fn().mockResolvedValue([])}
        pollingFn={vi.fn().mockResolvedValue([])}
        pollingInterval={100000}
        loadingIndicator={<div>loading</div>}
        hasTopMore={false}
        bottomIndicator={() => <div>bottom</div>}
      />,
    );
    expect(screen.getByText("item:a")).toBeInTheDocument();
    expect(screen.getByText("item:b")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    render(
      <InfiniteScroll<string>
        initialData={[]}
        renderItem={renderItem}
        topFn={vi.fn().mockResolvedValue([])}
        pollingFn={vi.fn().mockResolvedValue([])}
        pollingInterval={100000}
        loadingIndicator={<div>loading</div>}
        hasTopMore={false}
        bottomIndicator={() => <div>bottom</div>}
      />,
    );
    expect(screen.getByText("No logs found")).toBeInTheDocument();
  });

  it("fetches older data when the container scrolls to the top", async () => {
    const topFn = vi.fn().mockResolvedValue(["older"]);
    const { container } = render(
      <InfiniteScroll<string>
        initialData={["a"]}
        renderItem={renderItem}
        topFn={topFn}
        pollingFn={vi.fn().mockResolvedValue([])}
        pollingInterval={100000}
        loadingIndicator={<div>loading</div>}
        hasTopMore
        bottomIndicator={() => <div>bottom</div>}
      />,
    );
    const scrollBox = container.querySelector(".overflow-scroll") as HTMLElement;
    Object.defineProperty(scrollBox, "scrollTop", { value: 0, writable: true, configurable: true });
    scrollBox.dispatchEvent(new Event("scroll"));

    await waitFor(() => expect(topFn).toHaveBeenCalled());
    expect(await screen.findByText("item:older")).toBeInTheDocument();
  });

  it("polls for newer data and appends it, then shows the bottom indicator", async () => {
    const pollingFn = vi.fn().mockResolvedValue(["fresh"]);
    render(
      <InfiniteScroll<string>
        initialData={["a"]}
        renderItem={renderItem}
        topFn={vi.fn().mockResolvedValue([])}
        pollingFn={pollingFn}
        pollingInterval={20}
        loadingIndicator={<div>loading</div>}
        hasTopMore={false}
        bottomIndicator={(cb) => (
          <button onClick={cb}>jump-to-bottom</button>
        )}
      />,
    );
    await waitFor(() => expect(pollingFn).toHaveBeenCalled());
    expect(await screen.findByText("item:fresh")).toBeInTheDocument();
    // New data available -> bottom indicator rendered; clicking it scrolls down.
    const jump = await screen.findByText("jump-to-bottom");
    const user = userEvent.setup();
    await user.click(jump);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });
});
