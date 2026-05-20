import { vi } from "vitest";

/** Hoist-safe factory for `vi.mock("@/lib/http-client", () => mockHttpClientFactory())` */
export const mockHttpClientFactory = () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
  },
  HttpClient: vi.fn(),
  HttpError: class HttpError extends Error {
    status: number;
    errors: Record<string, string | string[]>;
    constructor(status: number, error: { errors: Record<string, string | string[]> }) {
      super(String(error));
      this.status = status;
      this.errors = error.errors;
    }
  },
});
