import { describe, expect, it } from "vitest";
import type { IStorageConfiguration } from "@/storage/models/storage.model";
import {
  storageConfigurationFormDefaultValue,
  storageConfigurationFormSchema,
  toStorageConfigurationFormValues,
} from "./utils";

const nulls = {
  secretKey: null,
  accessKey: null,
  cloudStorageRegionEndPoint: null,
  connectionString: null,
  host: null,
  port: null,
  userName: null,
  password: null,
  remoteBasePath: null,
};

/** Phase 1 upload-security fields, matching the documented defaults, for cases not exercising them. */
const phase1Defaults = {
  uploadUrlExpirySeconds: "600",
  downloadUrlExpirySeconds: "300",
  maxFileSizeInMb: "5",
  uploadCompletionRequiredFor: [],
};

describe("storageConfigurationFormSchema", () => {
  it("requires a name", () => {
    const result = storageConfigurationFormSchema.safeParse({
      ...nulls,
      name: "",
      storageStrategy: "Amazon",
      secretKey: "s",
      accessKey: "a",
      cloudStorageRegionEndPoint: "r",
    });
    expect(result.success).toBe(false);
  });

  it("Amazon requires secret/access key and region", () => {
    const bad = storageConfigurationFormSchema.safeParse({
      ...nulls,
      name: "cfg",
      storageStrategy: "Amazon",
    });
    expect(bad.success).toBe(false);

    const ok = storageConfigurationFormSchema.safeParse({
      ...nulls,
      ...phase1Defaults,
      name: "cfg",
      storageStrategy: "Amazon",
      secretKey: "s",
      accessKey: "a",
      cloudStorageRegionEndPoint: "us-east-1",
    });
    expect(ok.success).toBe(true);
  });

  it("Azure requires a connection string", () => {
    const bad = storageConfigurationFormSchema.safeParse({
      ...nulls,
      name: "cfg",
      storageStrategy: "Azure",
    });
    expect(bad.success).toBe(false);

    const ok = storageConfigurationFormSchema.safeParse({
      ...nulls,
      ...phase1Defaults,
      name: "cfg",
      storageStrategy: "Azure",
      connectionString: "conn",
    });
    expect(ok.success).toBe(true);
  });

  it("SftpStorage requires host/port/credentials and coerces the port to a string", () => {
    const ok = storageConfigurationFormSchema.safeParse({
      ...nulls,
      ...phase1Defaults,
      name: "cfg",
      storageStrategy: "SftpStorage",
      host: "h",
      port: "22",
      userName: "u",
      password: "p",
      remoteBasePath: "/base",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.port).toBe("22");
  });

  it("S3Compatible requires access/secret key and host", () => {
    const bad = storageConfigurationFormSchema.safeParse({
      ...nulls,
      name: "cfg",
      storageStrategy: "S3Compatible",
      accessKey: "a",
    });
    expect(bad.success).toBe(false);
  });

  describe("Phase 1 upload-security fields", () => {
    const validBase = {
      ...nulls,
      ...phase1Defaults,
      name: "cfg",
      storageStrategy: "Azure" as const,
      connectionString: "conn",
    };

    it.each(["0", "-1", "604801", "not-a-number"])(
      "rejects an out-of-range uploadUrlExpirySeconds of %s",
      (value) => {
        const result = storageConfigurationFormSchema.safeParse({
          ...validBase,
          uploadUrlExpirySeconds: value,
        });
        expect(result.success).toBe(false);
      },
    );

    it.each(["1", "600", "604800"])(
      "accepts an in-range uploadUrlExpirySeconds of %s",
      (value) => {
        const result = storageConfigurationFormSchema.safeParse({
          ...validBase,
          uploadUrlExpirySeconds: value,
        });
        expect(result.success).toBe(true);
      },
    );

    it.each(["0", "-1"])("rejects a non-positive maxFileSizeInMb of %s", (value) => {
      const result = storageConfigurationFormSchema.safeParse({
        ...validBase,
        maxFileSizeInMb: value,
      });
      expect(result.success).toBe(false);
    });

    it("accepts an empty uploadCompletionRequiredFor and both allowed values", () => {
      expect(
        storageConfigurationFormSchema.safeParse({ ...validBase, uploadCompletionRequiredFor: [] })
          .success,
      ).toBe(true);
      expect(
        storageConfigurationFormSchema.safeParse({
          ...validBase,
          uploadCompletionRequiredFor: ["Public", "Private"],
        }).success,
      ).toBe(true);
    });

    it("rejects an access modifier other than Public/Private", () => {
      const result = storageConfigurationFormSchema.safeParse({
        ...validBase,
        uploadCompletionRequiredFor: ["Secure"],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("toStorageConfigurationFormValues", () => {
  const baseConfiguration: IStorageConfiguration = {
    storageStrategy: "Azure",
    accessKey: null,
    cloudStorageRegionEndPoint: null,
    connectionString: "conn",
    createdBy: "me",
    createdDate: "2024-01-01",
    itemId: "cfg-1",
    lastUpdatedBy: "me",
    lastUpdatedDate: "2024-01-02",
    name: "azure-store",
    organizationIds: [],
    secretKey: null,
    tags: [],
    host: null,
    port: null,
    userName: null,
    password: null,
    remoteBasePath: null,
  };

  it("falls back to the documented defaults for a new configuration", () => {
    expect(toStorageConfigurationFormValues(undefined)).toEqual(
      storageConfigurationFormDefaultValue,
    );
  });

  it("falls back to the documented defaults for a configuration that predates Phase 1", () => {
    const values = toStorageConfigurationFormValues(baseConfiguration);

    expect(values.uploadUrlExpirySeconds).toBe("600");
    expect(values.downloadUrlExpirySeconds).toBe("300");
    expect(values.maxFileSizeInMb).toBe("5");
    expect(values.uploadCompletionRequiredFor).toEqual([]);
  });

  it("converts a configured maxFileSizeInBytes to MB for display", () => {
    const values = toStorageConfigurationFormValues({
      ...baseConfiguration,
      uploadUrlExpirySeconds: 900,
      downloadUrlExpirySeconds: 120,
      maxFileSizeInBytes: 10_485_760,
      uploadCompletionRequiredFor: ["Public"],
    });

    expect(values.uploadUrlExpirySeconds).toBe("900");
    expect(values.downloadUrlExpirySeconds).toBe("120");
    expect(values.maxFileSizeInMb).toBe("10");
    expect(values.uploadCompletionRequiredFor).toEqual(["Public"]);
  });
});
