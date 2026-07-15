import { describe, expect, it } from "vitest";
import {
  createProjectNamingFormSchema,
  createProjectNamingFormDefaultValue,
} from "./utils";

describe("createProjectNamingFormSchema", () => {
  it("has falsey defaults", () => {
    expect(createProjectNamingFormDefaultValue).toEqual({
      name: "",
      isAcceptBlocksTerms: false,
      isUseBlocksExclusively: false,
    });
  });

  it("accepts a valid, fully-accepted form", () => {
    expect(
      createProjectNamingFormSchema.safeParse({
        name: "My Project",
        isAcceptBlocksTerms: true,
        isUseBlocksExclusively: true,
      }).success,
    ).toBe(true);
  });

  it("rejects names shorter than 3 characters", () => {
    expect(
      createProjectNamingFormSchema.safeParse({
        name: "ab",
        isAcceptBlocksTerms: true,
        isUseBlocksExclusively: true,
      }).success,
    ).toBe(false);
  });

  it("requires both agreement checkboxes to be true", () => {
    expect(
      createProjectNamingFormSchema.safeParse({
        name: "My Project",
        isAcceptBlocksTerms: false,
        isUseBlocksExclusively: true,
      }).success,
    ).toBe(false);
  });
});
