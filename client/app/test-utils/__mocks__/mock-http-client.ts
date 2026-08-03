import { vi } from "vitest";

const makeClientMock = () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  stream: vi.fn(),
});

/** Hoist-safe factory for `vi.mock("@/lib/http-client", () => mockHttpClientFactory())` */
export const mockHttpClientFactory = () => {
  const dataService = makeClientMock();
  const idpService = makeClientMock();
  const logicService = makeClientMock();
  return {
    http: dataService,
    // Each service instance shares the same shape so a service that calls
    // `serviceInstances.idpService.post(...)` (e.g. the IAM principal picker)
    // is exercisable from the same mock seam as the rest of the suite.
    serviceInstances: {
      dataService,
      idpService,
      logicService,
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
  };
};
