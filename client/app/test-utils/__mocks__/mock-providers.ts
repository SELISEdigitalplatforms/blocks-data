import { vi } from "vitest";

/** Hoist-safe factory for `vi.mock("@/hooks/use-toast", () => mockToastFactory())` */
export const mockToastFactory = () => ({
  useToast: vi.fn().mockReturnValue({ toast: vi.fn() }),
  toast: vi.fn(),
  showSuccessToast: vi.fn(),
  showInfoToast: vi.fn(),
  showErrorToast: vi.fn(),
});

/** Hoist-safe factory for `vi.mock("@/store/useProjectStore", () => mockProjectStoreFactory())` */
export const mockProjectStoreFactory = (overrides?: {
  selectedProject?: Record<string, unknown> | null;
  projects?: unknown[];
}) => ({
  useProjectStore: vi.fn().mockReturnValue({
    projects: overrides?.projects ?? [],
    selectedProject: overrides?.selectedProject ?? {
      itemId: "mock-project-id",
      tenantId: "mock-tenant-id",
      tenantGroupId: "mock-tenant-group-id",
      name: "Mock Project",
    },
    selectedTenantGroup: "mock-tenant-group-id",
    setSelectedProject: vi.fn(),
    resetSelectedProject: vi.fn(),
    setProjects: vi.fn(),
    resetProject: vi.fn(),
    reset: vi.fn(),
    setTennantGroup: vi.fn(),
    resetTennantGroup: vi.fn(),
  }),
});
