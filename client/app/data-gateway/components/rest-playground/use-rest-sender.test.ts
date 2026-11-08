import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestPathError, sendRestRequest, type RestRequest, type RestResponse } from "../../rest/rest-client";
import { useRestSender } from "./use-rest-sender";

// Records every state setter call, so a send that lands after unmount can be shown to set nothing.
const setterCalls = vi.hoisted(() => ({ list: [] as unknown[][] }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, set] = actual.useState(initial);
      const recording = actual.useMemo(
        () =>
          (...args: unknown[]) => {
            setterCalls.list.push(args);
            return (set as (...a: unknown[]) => void)(...args);
          },
        [set],
      );
      return [value, recording];
    },
  };
});

vi.mock("../../rest/rest-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../rest/rest-client")>()),
  sendRestRequest: vi.fn(),
}));

const REQUEST: RestRequest = { method: "GET", path: "/Employee", query: [] };
const RESPONSE: RestResponse = {
  kind: "response",
  status: 200,
  statusText: "OK",
  headers: [],
  contentType: "application/json",
  bodyText: "{}",
  durationMs: 1,
  sizeBytes: 2,
};

/** A send that ignores its abort and settles only when the test says so. */
function deferredSend() {
  let resolve!: (response: RestResponse) => void;
  let reject!: (error: unknown) => void;
  vi.mocked(sendRestRequest).mockImplementationOnce(
    () =>
      new Promise<RestResponse>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return { resolve: (response: RestResponse) => resolve(response), reject: (error: unknown) => reject(error) };
}

beforeEach(() => {
  vi.mocked(sendRestRequest).mockReset();
  setterCalls.list.length = 0;
});

describe("useRestSender: unmount", () => {
  it("sets no state and refuses nothing when a send resolves after unmount", async () => {
    const pending = deferredSend();
    const onPathRefusal = vi.fn();
    const { result, unmount } = renderHook(() => useRestSender());

    let sent!: Promise<void>;
    act(() => {
      sent = result.current.send(REQUEST, onPathRefusal);
    });
    const callsBeforeUnmount = setterCalls.list.length;
    unmount();

    pending.resolve(RESPONSE);
    await sent;

    expect(setterCalls.list).toHaveLength(callsBeforeUnmount);
    expect(onPathRefusal).not.toHaveBeenCalled();
  });

  it("sets no state and calls no refusal handler when a send fails after unmount", async () => {
    const pending = deferredSend();
    const onPathRefusal = vi.fn();
    const { result, unmount } = renderHook(() => useRestSender());

    let sent!: Promise<void>;
    act(() => {
      sent = result.current.send(REQUEST, onPathRefusal);
    });
    const callsBeforeUnmount = setterCalls.list.length;
    unmount();

    pending.reject(new RestPathError("double-slash"));
    await sent;

    expect(setterCalls.list).toHaveLength(callsBeforeUnmount);
    expect(onPathRefusal).not.toHaveBeenCalled();
  });

  it("aborts the send still out on unmount", () => {
    let signal: AbortSignal | undefined;
    vi.mocked(sendRestRequest).mockImplementationOnce((_req, abortSignal) => {
      signal = abortSignal;
      return new Promise<RestResponse>(() => {});
    });
    const { result, unmount } = renderHook(() => useRestSender());

    act(() => {
      void result.current.send(REQUEST, vi.fn());
    });
    expect(signal?.aborted).toBe(false);
    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
