import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { HttpError } from "@/lib/http-client";
import { storageService } from "../services/storage.service";
import { buildZipDownloadUrl } from "../services/storage-file.service";
import { useZipDownloadStore } from "./use-zip-download-store";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

const response = {
  ticket: "tick+et",
  tenantId: "tenant/1",
  fileCount: 3,
  totalBytes: 24_000_000,
  zipName: "Project-Docs.zip",
};

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("useZipDownloadStore", () => {
  let prepare: ReturnType<typeof vi.spyOn>;
  let click: ReturnType<typeof vi.spyOn>;
  let clickedHrefs: string[];

  beforeEach(() => {
    useZipDownloadStore.getState().close();
    clickedHrefs = [];
    prepare = vi.spyOn(storageService.file, "prepareZipDownload");
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedHrefs.push(this.href);
    });
  });

  afterEach(() => {
    useZipDownloadStore.getState().close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const rows = () => useZipDownloadStore.getState().rows;

  it("labels files-only as 'Zipping 3 files' and mixed as 'Zipping 2 items'", async () => {
    prepare.mockReturnValue(new Promise(() => {}));

    void useZipDownloadStore.getState().start({ fileIds: ids(3), directoryIds: [] });
    void useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: ["d"] });

    expect(rows().map((r) => [r.label, r.status])).toEqual([
      ["Zipping 3 files", "preparing"],
      ["Zipping 2 items", "preparing"],
    ]);
  });

  it("gives rows distinct ids without crypto.randomUUID (non-secure origins)", () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new TypeError("crypto.randomUUID is not available on insecure origins");
    });
    prepare.mockReturnValue(new Promise(() => {}));

    void useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });
    void useZipDownloadStore.getState().start({ fileIds: ["g"], directoryIds: [] });

    const rowIds = rows().map((r) => r.id);
    expect(rowIds).toHaveLength(2);
    expect(new Set(rowIds).size).toBe(2);
  });

  it("success marks the row started and clicks a hidden download link", async () => {
    prepare.mockResolvedValue(response);

    const outcome = await useZipDownloadStore
      .getState()
      .start({ fileIds: ["f"], directoryIds: [], configurationName: "cfg" });

    expect(outcome).toBe("started");

    expect(prepare).toHaveBeenCalledWith(
      { fileIds: ["f"], directoryIds: [], configurationName: "cfg" },
      expect.any(AbortSignal),
    );
    expect(rows()[0]).toMatchObject({
      status: "started",
      zipName: "Project-Docs.zip",
      totalBytes: 24_000_000,
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedHrefs[0]).toBe(buildZipDownloadUrl("tick+et", "tenant/1"));
    expect(document.body.querySelector("a[download]")).toBeNull();
  });

  it.each([
    ["zip_limit_exceeded", "Too large to zip (max 2 GB / 5,000 files)"],
    ["zip_nothing_to_download", "Nothing here can be downloaded"],
  ])("maps %s to its message", async (code, message) => {
    prepare.mockRejectedValue(new HttpError(400, { errors: { zip: code } }));

    const outcome = await useZipDownloadStore
      .getState()
      .start({ fileIds: ["f"], directoryIds: [] });

    expect(outcome).toBe("failed");
    expect(rows()[0]).toMatchObject({ status: "failed", error: message });
    expect(click).not.toHaveBeenCalled();
  });

  it('maps any other error to "Couldn\'t prepare the download"', async () => {
    prepare.mockRejectedValueOnce(new HttpError(400, { errors: { fileIds: "too_many" } }));
    prepare.mockRejectedValueOnce(new Error("network"));

    await useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });
    await useZipDownloadStore.getState().start({ fileIds: ["g"], directoryIds: [] });

    expect(rows().map((r) => r.error)).toEqual([
      "Couldn't prepare the download",
      "Couldn't prepare the download",
    ]);
  });

  it("close aborts preparing rows and never clicks the link for them", async () => {
    let resolvePrepare!: (value: typeof response) => void;
    let signal!: AbortSignal;
    prepare.mockImplementation((_payload: unknown, s: AbortSignal) => {
      signal = s;
      return new Promise((resolve) => {
        resolvePrepare = resolve;
      });
    });

    const pending = useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });
    useZipDownloadStore.getState().close();

    expect(signal.aborted).toBe(true);
    expect(rows()).toEqual([]);

    resolvePrepare(response); // late result is ignored
    await expect(pending).resolves.toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
    expect(rows()).toEqual([]);
  });

  it("close ignores a late AbortError rejection", async () => {
    let rejectPrepare!: (reason: unknown) => void;
    prepare.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectPrepare = reject;
        }),
    );

    const pending = useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });
    useZipDownloadStore.getState().close();
    rejectPrepare(new DOMException("aborted", "AbortError"));
    await expect(pending).resolves.toBe("cancelled");

    expect(rows()).toEqual([]);
  });

  it("toggleCollapsed flips the flag", () => {
    useZipDownloadStore.getState().toggleCollapsed();
    expect(useZipDownloadStore.getState().collapsed).toBe(true);
    useZipDownloadStore.getState().toggleCollapsed();
    expect(useZipDownloadStore.getState().collapsed).toBe(false);
  });

  describe("auto-close", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("clears all rows 10s after every row started", async () => {
      prepare.mockResolvedValue(response);
      await useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });

      vi.advanceTimersByTime(9_999);
      expect(rows()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(rows()).toHaveLength(0);
    });

    it("restarts the countdown when a new row is added and waits for it", async () => {
      prepare.mockResolvedValueOnce(response);
      await useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });
      vi.advanceTimersByTime(8_000);

      prepare.mockReturnValueOnce(new Promise(() => {}));
      void useZipDownloadStore.getState().start({ fileIds: ["g"], directoryIds: [] });
      vi.advanceTimersByTime(60_000);

      expect(rows()).toHaveLength(2); // second row still preparing: no auto-close
    });

    it("keeps the card open when a row failed", async () => {
      prepare.mockResolvedValueOnce(response);
      prepare.mockRejectedValueOnce(new Error("boom"));
      await useZipDownloadStore.getState().start({ fileIds: ["f"], directoryIds: [] });
      await useZipDownloadStore.getState().start({ fileIds: ["g"], directoryIds: [] });

      vi.advanceTimersByTime(60_000);

      expect(rows().map((r) => r.status)).toEqual(["started", "failed"]);
    });
  });
});
