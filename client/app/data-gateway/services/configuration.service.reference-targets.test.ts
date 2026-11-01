import { describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { SCHEMA_ENDPOINTS } from "../constants/endpoint.constant";
import { configurationService } from "./configuration.service";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

/** The target picker's schemas (validation and access rules plan, section 8). */
describe("configurationService.getReferenceTargets", () => {
  it("searches by keyword", async () => {
    await configurationService.getReferenceTargets("cust");
    expect(http.get).toHaveBeenLastCalledWith(`${SCHEMA_ENDPOINTS.REFERENCE_TARGETS}?keyword=cust`);
  });

  it("asks for one schema by its exact name, which a capped search could miss", async () => {
    await configurationService.getReferenceTargets("", "User");
    expect(http.get).toHaveBeenLastCalledWith(`${SCHEMA_ENDPOINTS.REFERENCE_TARGETS}?keyword=&schemaName=User`);
  });
});
