import { describe, expect, it } from "vitest";
import type { IDataSourceResponse } from "../../models/data-service";
import {
  buildSavePayload,
  dataSourceFormDefaultValues,
  toFormValues,
  validateSource,
} from "./utils";

const custom: IDataSourceResponse = {
  projectKey: "t1",
  databaseName: "mydb",
  connectionType: "Custom",
  itemId: "item-1",
  isActive: true,
  isCollectionNameEditable: true,
  collectionNamePattern: "x_{SchemaName}_y",
};
const blocks: IDataSourceResponse = {
  ...custom,
  connectionType: "Default",
  databaseName: "default",
};

describe("toFormValues", () => {
  it("returns defaults when there is no configuration", () => {
    expect(toFormValues(undefined)).toEqual(dataSourceFormDefaultValues);
  });
  it("never fills the connection string, keeps the database name for Custom", () => {
    expect(toFormValues(custom)).toMatchObject({ connectionString: "", databaseName: "mydb" });
  });
  it("blanks the database name for Default", () => {
    expect(toFormValues(blocks).databaseName).toBe("");
  });
});

describe("validateSource", () => {
  it("needs nothing for Blocks DB", () => {
    expect(validateSource("blocks", { connectionString: "", databaseName: "" })).toEqual({});
  });
  it("lets an existing own-DB config keep its secret with an empty string", () => {
    expect(validateSource("others", { connectionString: "", databaseName: "d" }, true)).toEqual({});
    expect(
      validateSource("others", { connectionString: "", databaseName: "" }, true),
    ).toHaveProperty("databaseName");
  });
  it("requires both fields for own DB", () => {
    expect(
      Object.keys(validateSource("others", { connectionString: " ", databaseName: "" })),
    ).toEqual(["connectionString", "databaseName"]);
  });
});

describe("buildSavePayload", () => {
  const values = {
    ...dataSourceFormDefaultValues,
    connectionString: " mongodb://h ",
    databaseName: "d",
  };
  it("sends the plain trimmed string for own DB", () => {
    const p = buildSavePayload("others", values, undefined, "t1");
    expect(p).toMatchObject({
      connectionString: "mongodb://h",
      databaseName: "d",
      projectKey: "t1",
    });
    expect(p).not.toHaveProperty("itemId");
  });
  it("omits connectionString when an own-DB config keeps its secret", () => {
    const p = buildSavePayload("others", { ...values, connectionString: "" }, custom, "t1");
    expect(p).not.toHaveProperty("connectionString");
    expect(p).toMatchObject({ databaseName: "d", itemId: "item-1" });
  });
  it("still sends the string on a first own-DB save and when switching from Blocks DB", () => {
    expect(buildSavePayload("others", values, blocks, "t1").connectionString).toBe("mongodb://h");
    expect(buildSavePayload("others", values, undefined, "t1").connectionString).toBe(
      "mongodb://h",
    );
  });
  it("sends default for Blocks DB and carries the itemId of an existing config", () => {
    const p = buildSavePayload("blocks", values, custom, "t1");
    expect(p).toMatchObject({
      connectionString: "default",
      databaseName: "default",
      itemId: "item-1",
    });
  });
});
