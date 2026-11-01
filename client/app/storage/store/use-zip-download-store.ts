import { create } from "zustand";
import { HttpError } from "@/lib/http-client";
import { storageService } from "../services/storage.service";
import { buildZipDownloadUrl } from "../services/storage-file.service";
import type { ZipDownloadRow } from "../models/zip-download.model";

export const ZIP_AUTO_CLOSE_MS = 10_000;

export const ZIP_ERROR_MESSAGES = {
  limitExceeded: "Too large to zip (max 2 GB / 5,000 files)",
  nothingToDownload: "Nothing here can be downloaded",
  generic: "Couldn't prepare the download",
} as const;

export interface IZipDownloadSelection {
  fileIds: string[];
  directoryIds: string[];
  configurationName?: string;
}

/**
 * How a `start` ended: the browser was handed the download, prepare failed, or the row was closed
 * (aborted) before prepare finished.
 */
export type ZipDownloadOutcome = "started" | "failed" | "cancelled";

export interface IZipDownloadStore {
  rows: ZipDownloadRow[];
  collapsed: boolean;
  start: (selection: IZipDownloadSelection) => Promise<ZipDownloadOutcome>;
  toggleCollapsed: () => void;
  close: () => void;
}

const buildLabel = ({ fileIds, directoryIds }: IZipDownloadSelection): string => {
  const count = fileIds.length + directoryIds.length;
  return `Zipping ${count} ${directoryIds.length === 0 ? "files" : "items"}`;
};

/** The HTTP client throws HttpError on non-2xx; `errors` is the response body's `errors` object. */
const mapPrepareError = (error: unknown): string => {
  if (error instanceof HttpError) {
    const errors = error.errors as { zip?: unknown; errors?: { zip?: unknown } } | undefined;
    const code = errors?.zip ?? errors?.errors?.zip;
    if (code === "zip_limit_exceeded") return ZIP_ERROR_MESSAGES.limitExceeded;
    if (code === "zip_nothing_to_download") return ZIP_ERROR_MESSAGES.nothingToDownload;
  }
  return ZIP_ERROR_MESSAGES.generic;
};

const triggerBrowserDownload = (url: string, fileName?: string): void => {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName ?? "";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
};

// Row ids only need to be unique within this tab. A counter, not crypto.randomUUID, which is
// missing on non-secure (plain http) origins.
let rowSeq = 0;

export const useZipDownloadStore = create<IZipDownloadStore>()((set, get) => {
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  const clearAutoClose = () => {
    if (autoCloseTimer !== null) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  };

  /** Every state change goes through here so the auto-close timer always reflects the latest rows. */
  const commit = (update: (state: IZipDownloadStore) => Partial<IZipDownloadStore>) => {
    set(update);
    clearAutoClose();
    const { rows } = get();
    if (rows.length > 0 && rows.every((row) => row.status === "started")) {
      autoCloseTimer = setTimeout(() => {
        autoCloseTimer = null;
        get().close();
      }, ZIP_AUTO_CLOSE_MS);
    }
  };

  const updateRow = (id: string, patch: Partial<ZipDownloadRow>) =>
    commit((state) => ({
      rows: state.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));

  return {
    rows: [],
    collapsed: false,

    async start(selection) {
      const id = `zip-${++rowSeq}`;
      const controller = new AbortController();
      const row: ZipDownloadRow = {
        id,
        label: buildLabel(selection),
        status: "preparing",
        controller,
      };
      commit((state) => ({ rows: [...state.rows, row], collapsed: false }));

      // A row removed by close() while prepare was in flight must stay silent.
      const isLive = () => get().rows.some((r) => r.id === id);

      try {
        const response = await storageService.file.prepareZipDownload(
          {
            fileIds: selection.fileIds,
            directoryIds: selection.directoryIds,
            configurationName: selection.configurationName,
          },
          controller.signal,
        );
        if (controller.signal.aborted || !isLive()) return "cancelled";
        updateRow(id, {
          status: "started",
          zipName: response.zipName,
          totalBytes: response.totalBytes,
        });
        triggerBrowserDownload(
          buildZipDownloadUrl(response.ticket, response.tenantId),
          response.zipName,
        );
        return "started";
      } catch (error) {
        if (controller.signal.aborted || !isLive()) return "cancelled";
        updateRow(id, { status: "failed", error: mapPrepareError(error) });
        return "failed";
      }
    },

    toggleCollapsed() {
      set((state) => ({ collapsed: !state.collapsed }));
    },

    close() {
      clearAutoClose();
      get().rows.forEach((row) => {
        if (row.status === "preparing") row.controller.abort();
      });
      set({ rows: [], collapsed: false });
    },
  };
});
