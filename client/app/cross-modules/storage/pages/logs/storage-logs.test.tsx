import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BREADCRUMB_CUSTOM_TITLES } from "@/constant/breadcrumb-custom-title";
import { StorageLogs } from "./storage-logs";

const logsViewerSpy = vi.hoisted(() =>
  vi.fn((props: { services: unknown[]; predefinedQueries?: string[] }) => (
    <div data-testid="logs-viewer-mock" data-services-count={props.services.length} />
  )),
);

vi.mock("@blocks-lmt/components", () => ({
  LogsViewer: (props: { services: unknown[]; predefinedQueries?: string[] }) =>
    logsViewerSpy(props),
}));

const breadcrumbSpy = vi.hoisted(() => vi.fn(() => <nav data-testid="breadcrumb-mock" />));
vi.mock("@/components/breadcrumb/breadcrumb", () => ({
  __esModule: true,
  default: (props: { breadcrumbIndex?: number }) => breadcrumbSpy(props),
}));

const STORAGE_KEYS = ["/services/storage", "/services/storage/logs"] as const;

function snapshotBreadcrumbKeys() {
  return STORAGE_KEYS.reduce(
    (acc, key) => {
      acc[key] = BREADCRUMB_CUSTOM_TITLES[key] ?? null;
      return acc;
    },
    {} as Record<string, string | null | undefined>,
  );
}

let breadcrumbSnapshot: Record<string, string | null | undefined>;

describe("StorageLogs", () => {
  beforeEach(() => {
    breadcrumbSnapshot = snapshotBreadcrumbKeys();
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of STORAGE_KEYS) {
      const prev = breadcrumbSnapshot[key];
      if (prev === undefined || prev === null) {
        delete BREADCRUMB_CUSTOM_TITLES[key];
      } else {
        BREADCRUMB_CUSTOM_TITLES[key] = prev;
      }
    }
  });

  it("renders breadcrumb and LogsViewer once", () => {
    const { getByTestId } = render(<StorageLogs />);
    expect(getByTestId("breadcrumb-mock")).toBeInTheDocument();
    expect(getByTestId("logs-viewer-mock")).toBeInTheDocument();
    expect(breadcrumbSpy).toHaveBeenCalledTimes(1);
    expect(logsViewerSpy).toHaveBeenCalledTimes(1);
  });

  it("passes breadcrumbIndex 2 to PageBreadcrumb", () => {
    render(<StorageLogs />);
    expect(breadcrumbSpy).toHaveBeenCalledWith(expect.objectContaining({ breadcrumbIndex: 2 }));
  });

  it("passes api and worker services to LogsViewer", () => {
    render(<StorageLogs />);
    expect(logsViewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        services: [
          { id: "blocks-uds-api", label: "Api", serviceName: "blocks-uds-api" },
          { id: "blocks-uds-worker", label: "Worker", serviceName: "blocks-uds-worker" },
        ],
      }),
    );
  });

  it("passes storage predefined queries to LogsViewer in order", () => {
    render(<StorageLogs />);
    expect(logsViewerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        predefinedQueries: [
          "Has anyone faced any storage issues?",
          "Any errors in storage in the last hour?",
          "Show me all storage issues in the last 7 days",
        ],
      }),
    );
  });

  it("sets breadcrumb custom titles synchronously on render", () => {
    render(<StorageLogs />);
    expect(BREADCRUMB_CUSTOM_TITLES["/services/storage"]).toBe("Storage");
    expect(BREADCRUMB_CUSTOM_TITLES["/services/storage/logs"]).toBe("Logs");
  });

  it("keeps LogsViewer props stable on rerender", () => {
    const { rerender } = render(<StorageLogs />);
    const firstCall = logsViewerSpy.mock.calls[0][0];
    rerender(<StorageLogs />);
    const secondCall = logsViewerSpy.mock.calls[1][0];
    expect(secondCall.services).toEqual(firstCall.services);
    expect(secondCall.predefinedQueries).toEqual(firstCall.predefinedQueries);
  });

  it("overwrites any pre-seeded storage breadcrumb title", () => {
    BREADCRUMB_CUSTOM_TITLES["/services/storage"] = "WRONG";
    render(<StorageLogs />);
    expect(BREADCRUMB_CUSTOM_TITLES["/services/storage"]).toBe("Storage");
  });
});
