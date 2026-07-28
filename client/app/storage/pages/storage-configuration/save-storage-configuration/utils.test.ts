import { describe, expect, it } from "vitest";
import { storageConfigurationFormSchema } from "./utils";

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
      name: "cfg",
      storageStrategy: "Azure",
      connectionString: "conn",
    });
    expect(ok.success).toBe(true);
  });

  it("SftpStorage requires host/port/credentials and coerces the port to a string", () => {
    const ok = storageConfigurationFormSchema.safeParse({
      ...nulls,
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
});
