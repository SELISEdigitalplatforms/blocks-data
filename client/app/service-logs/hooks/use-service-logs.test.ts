import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logService } from "../services";
import { useProjectStore } from "@seliseblocks/blocks-kit";
import { useServiceLogs } from "./use-service-logs";

vi.mock("../services", () => ({
  logService: {
    getLogsByDate: vi.fn(),
    getLiveLog: vi.fn(),
  },
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: vi.fn(() => ({ selectedProject: { tenantId: "tenant-1" } })),
}));

const log = (id: string) => ({
  timestamp: `2025-01-0${id}T00:00:00Z`,
  level: "Information",
  message: `msg-${id}`,
  traceId: `trace-${id}`,
});

describe("useServiceLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProjectStore).mockReturnValue({
      selectedProject: { tenantId: "tenant-1" },
    } as never);
  });

  describe("initial fetch", () => {
    it("loads and reverses the initial logs, then stops loading", async () => {
      vi.mocked(logService.getLogsByDate).mockResolvedValue({
        data: [log("1"), log("2"), log("3")],
        totalCount: 3,
        errors: null,
      } as never);

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.initialLogs.map((l) => l.traceId)).toEqual([
        "trace-3",
        "trace-2",
        "trace-1",
      ]);
      // totalCount (3) is not <= page(0) * pageSize(20) => still has more
      expect(result.current.hasTopMore).toBe(true);
    });

    it("builds the fetch payload from the store tenantId and filters", async () => {
      vi.mocked(logService.getLogsByDate).mockResolvedValue({
        data: [],
        totalCount: 0,
        errors: null,
      } as never);

      renderHook(() =>
        useServiceLogs({
          serviceName: "svc",
          pageSize: 50,
          startDate: "2025-01-01",
          endDate: "2025-01-31",
          level: "Error",
          search: "boom",
        }),
      );

      await waitFor(() => expect(logService.getLogsByDate).toHaveBeenCalled());
      expect(logService.getLogsByDate).toHaveBeenCalledWith({
        pageSize: 50,
        projectKey: "tenant-1",
        serviceName: "svc",
        filter: { startDate: "2025-01-01", endDate: "2025-01-31", level: "Error" },
        search: "boom",
      });
    });

    it("omits empty filter fields from the payload", async () => {
      vi.mocked(logService.getLogsByDate).mockResolvedValue({
        data: [],
        totalCount: 0,
        errors: null,
      } as never);

      renderHook(() => useServiceLogs({ serviceName: "svc" }));

      await waitFor(() => expect(logService.getLogsByDate).toHaveBeenCalled());
      expect(logService.getLogsByDate).toHaveBeenCalledWith({
        pageSize: 20,
        projectKey: "tenant-1",
        serviceName: "svc",
        filter: {},
        search: "",
      });
    });

    it("stops loading and keeps logs empty when the initial fetch rejects", async () => {
      vi.mocked(logService.getLogsByDate).mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.initialLogs).toEqual([]);
    });
  });

  describe("fetchOldLogs", () => {
    it("returns reversed older logs and sets endDate on the payload", async () => {
      vi.mocked(logService.getLogsByDate)
        // initial fetch
        .mockResolvedValueOnce({ data: [], totalCount: 0, errors: null } as never)
        // fetchOldLogs
        .mockResolvedValueOnce({
          data: [log("1"), log("2")],
          totalCount: 5,
          errors: null,
        } as never);

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let older: unknown;
      await act(async () => {
        older = await result.current.fetchOldLogs("2025-01-05T00:00:00Z");
      });

      expect((older as Array<{ traceId: string }>).map((l) => l.traceId)).toEqual([
        "trace-2",
        "trace-1",
      ]);
      // last call is the fetchOldLogs call; endDate must be threaded into the filter
      const lastCall = vi.mocked(logService.getLogsByDate).mock.calls.at(-1)?.[0];
      expect(lastCall?.filter?.endDate).toBe("2025-01-05T00:00:00Z");
    });

    it("returns an empty array when there are no older logs", async () => {
      vi.mocked(logService.getLogsByDate)
        .mockResolvedValueOnce({ data: [], totalCount: 0, errors: null } as never)
        .mockResolvedValueOnce({ data: [], totalCount: 0, errors: null } as never);

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let older: unknown;
      await act(async () => {
        older = await result.current.fetchOldLogs("2025-01-05T00:00:00Z");
      });
      expect(older).toEqual([]);
    });

    it("returns an empty array when the older-logs fetch rejects", async () => {
      vi.mocked(logService.getLogsByDate)
        .mockResolvedValueOnce({ data: [], totalCount: 0, errors: null } as never)
        .mockRejectedValueOnce(new Error("boom"));

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let older: unknown;
      await act(async () => {
        older = await result.current.fetchOldLogs("2025-01-05T00:00:00Z");
      });
      expect(older).toEqual([]);
    });
  });

  describe("fetchNewLogs", () => {
    it("returns reversed live logs", async () => {
      vi.mocked(logService.getLogsByDate).mockResolvedValue({
        data: [],
        totalCount: 0,
        errors: null,
      } as never);
      vi.mocked(logService.getLiveLog).mockResolvedValue({
        data: [log("1"), log("2")],
        totalCount: 2,
        errors: null,
      } as never);

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let live: unknown;
      await act(async () => {
        live = await result.current.fetchNewLogs("2025-01-05T00:00:00Z");
      });

      expect((live as Array<{ traceId: string }>).map((l) => l.traceId)).toEqual([
        "trace-2",
        "trace-1",
      ]);
      expect(logService.getLiveLog).toHaveBeenCalledWith({
        serviceName: "svc",
        projectKey: "tenant-1",
        lastDate: "2025-01-05T00:00:00Z",
      });
    });

    it("returns an empty array without calling the service when serviceName is empty", async () => {
      vi.mocked(logService.getLogsByDate).mockResolvedValue({
        data: [],
        totalCount: 0,
        errors: null,
      } as never);

      const { result } = renderHook(() => useServiceLogs({ serviceName: "" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let live: unknown;
      await act(async () => {
        live = await result.current.fetchNewLogs("2025-01-05T00:00:00Z");
      });

      expect(live).toEqual([]);
      expect(logService.getLiveLog).not.toHaveBeenCalled();
    });

    it("returns an empty array when the live-logs fetch rejects", async () => {
      vi.mocked(logService.getLogsByDate).mockResolvedValue({
        data: [],
        totalCount: 0,
        errors: null,
      } as never);
      vi.mocked(logService.getLiveLog).mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useServiceLogs({ serviceName: "svc" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let live: unknown;
      await act(async () => {
        live = await result.current.fetchNewLogs("2025-01-05T00:00:00Z");
      });
      expect(live).toEqual([]);
    });
  });
});
