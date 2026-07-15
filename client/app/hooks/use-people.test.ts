import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { peopleService } from "@/identifier/services/people.service";
import {
  useGetPeople,
  useInvitePeople,
  useResendInvitation,
  useRemoveAccess,
  useRemoveEnvironmentAccess,
  useConfirmInvitation,
  useTransferOwnership,
} from "./use-people";

vi.mock("@/identifier/services/people.service", () => ({
  peopleService: {
    getPeople: vi.fn(),
    invitePeople: vi.fn(),
    resendInvitation: vi.fn(),
    removeAccess: vi.fn(),
    removeEnvironmentAccess: vi.fn(),
    confirmInvitation: vi.fn(),
    transferOwnership: vi.fn(),
  },
}));

const mockUseProjectStore = vi.fn(() => ({ selectedTenantGroup: "group-1" }));
vi.mock("@/store/useProjectStore", () => ({
  useProjectStore: () => mockUseProjectStore(),
}));

describe("use-people hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue({ selectedTenantGroup: "group-1" });
  });

  describe("useGetPeople", () => {
    it("fetches and selects people data", async () => {
      vi.mocked(peopleService.getPeople).mockResolvedValue({
        peoples: [{ id: "p1" }],
        totalCount: 1,
        isOwner: true,
      } as never);

      const { result } = renderHook(
        () => useGetPeople({ page: 0, pageSize: 10, filter: "" }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        peoples: [{ id: "p1" }],
        totalCount: 1,
        isOwner: true,
      });
      expect(peopleService.getPeople).toHaveBeenCalledWith({
        page: 0,
        pageSize: 10,
        filter: "",
        projectGroupId: "group-1",
      });
    });

    it("is disabled when there is no tenant group", async () => {
      mockUseProjectStore.mockReturnValue({ selectedTenantGroup: "" });

      const { result } = renderHook(
        () => useGetPeople({ page: 0, pageSize: 10, filter: "" }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(peopleService.getPeople).not.toHaveBeenCalled();
    });
  });

  describe("mutation hooks", () => {
    it("useInvitePeople calls the service", async () => {
      vi.mocked(peopleService.invitePeople).mockResolvedValue({} as never);
      const { result } = renderHook(() => useInvitePeople(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ email: "a@b.c" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(peopleService.invitePeople).toHaveBeenCalledWith(
        { email: "a@b.c" },
        expect.anything(),
      );
    });

    it("useResendInvitation calls the service", async () => {
      vi.mocked(peopleService.resendInvitation).mockResolvedValue({} as never);
      const { result } = renderHook(() => useResendInvitation(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ id: "1" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(peopleService.resendInvitation).toHaveBeenCalledWith(
        { id: "1" },
        expect.anything(),
      );
    });

    it("useRemoveAccess calls the service", async () => {
      vi.mocked(peopleService.removeAccess).mockResolvedValue({} as never);
      const { result } = renderHook(() => useRemoveAccess(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ userId: "u" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(peopleService.removeAccess).toHaveBeenCalled();
    });

    it("useRemoveEnvironmentAccess calls the service", async () => {
      vi.mocked(peopleService.removeEnvironmentAccess).mockResolvedValue(
        {} as never,
      );
      const { result } = renderHook(() => useRemoveEnvironmentAccess(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ userId: "u" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(peopleService.removeEnvironmentAccess).toHaveBeenCalled();
    });

    it("useConfirmInvitation calls the service", async () => {
      vi.mocked(peopleService.confirmInvitation).mockResolvedValue({} as never);
      const { result } = renderHook(() => useConfirmInvitation(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ code: "c" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(peopleService.confirmInvitation).toHaveBeenCalled();
    });

    it("useTransferOwnership calls the service", async () => {
      vi.mocked(peopleService.transferOwnership).mockResolvedValue({} as never);
      const { result } = renderHook(() => useTransferOwnership(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ userId: "u" } as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(peopleService.transferOwnership).toHaveBeenCalled();
    });

    it("surfaces mutation errors", async () => {
      vi.mocked(peopleService.invitePeople).mockRejectedValue(
        new Error("failed"),
      );
      const { result } = renderHook(() => useInvitePeople(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ email: "a@b.c" } as never);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
