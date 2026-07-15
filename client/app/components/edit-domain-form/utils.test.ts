import { describe, expect, it } from "vitest";
import { editDomainFormSchema } from "./utils";

describe("editDomainFormSchema", () => {
  it("accepts a valid single-label subdomain entry", () => {
    // isValidSubdomain splits on "." and requires each label to carry the
    // protocol, so only a single-label host (no dots) passes.
    const result = editDomainFormSchema.safeParse({
      domains: [
        {
          itemId: "item-1",
          repoUrl: "https://github.com/x/repo",
          customDeploymentUrl: "https://my-app",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a multi-label host because each dot-separated label must carry the protocol", () => {
    const result = editDomainFormSchema.safeParse({
      domains: [{ itemId: "item-1", customDeploymentUrl: "https://app.example.com" }],
    });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty itemId", () => {
    const result = editDomainFormSchema.safeParse({
      domains: [{ itemId: "", customDeploymentUrl: "https://app.example.com" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Repository ID is required")).toBe(true);
    }
  });

  it("requires a non-empty custom deployment url", () => {
    const result = editDomainFormSchema.safeParse({
      domains: [{ itemId: "item-1", customDeploymentUrl: "" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === "Custom Deployment URL is required"),
      ).toBe(true);
    }
  });

  it("rejects a custom deployment url without protocol", () => {
    const result = editDomainFormSchema.safeParse({
      domains: [{ itemId: "item-1", customDeploymentUrl: "app.example.com" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.startsWith("Invalid subdomain"))).toBe(true);
    }
  });

  it("treats repoUrl as optional", () => {
    const result = editDomainFormSchema.safeParse({
      domains: [{ itemId: "item-1", customDeploymentUrl: "https://sub" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty domains array", () => {
    expect(editDomainFormSchema.safeParse({ domains: [] }).success).toBe(true);
  });
});
