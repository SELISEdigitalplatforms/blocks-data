import { beforeEach, describe, expect, it } from "vitest";
import { useCreateProjectFormState, shortGuidGenerator } from "./utils";

describe("useCreateProjectFormState", () => {
  beforeEach(() => useCreateProjectFormState.getState().resetFormData());

  it("has three form-data slots by default", () => {
    expect(useCreateProjectFormState.getState().formData).toHaveLength(3);
  });

  it("setFormData updates a specific slot", () => {
    const custom = { name: "Custom" } as never;
    useCreateProjectFormState.getState().setFormData(0, custom);
    expect(useCreateProjectFormState.getState().formData[0]).toEqual(custom);
  });

  it("resetFormData restores defaults", () => {
    useCreateProjectFormState.getState().setFormData(0, { name: "X" } as never);
    useCreateProjectFormState.getState().resetFormData();
    expect(
      (useCreateProjectFormState.getState().formData[0] as { name?: string })
        .name,
    ).not.toBe("X");
  });
});

describe("shortGuidGenerator", () => {
  it("returns a lowercase string of the requested length", () => {
    const guid = shortGuidGenerator(5);
    expect(guid).toHaveLength(5);
    expect(guid).toMatch(/^[a-z]{5}$/);
  });

  it("returns an empty string for length 0", () => {
    expect(shortGuidGenerator(0)).toBe("");
  });
});
