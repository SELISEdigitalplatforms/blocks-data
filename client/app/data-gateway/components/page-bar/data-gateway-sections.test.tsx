import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const useGetDataServiceConfiguration = vi.fn();
const useSchemaList = vi.fn();
const useSecurityAndPerformanceSchemaList = vi.fn();

vi.mock("@/hooks/use-scoped-path", () => ({ useDataGatewayPath: () => "/dg" }));
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
vi.mock("../../hooks/use-configuration", () => ({
  useGetDataServiceConfiguration: () => useGetDataServiceConfiguration(),
  useSchemaList: (...a: unknown[]) => useSchemaList(...a),
  useSecurityAndPerformanceSchemaList: (...a: unknown[]) =>
    useSecurityAndPerformanceSchemaList(...a),
}));

import { DataGatewaySections } from "./data-gateway-sections";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataGatewaySections />
    </MemoryRouter>,
  );
}

const labels = () => screen.getAllByRole("link").map((link) => link.textContent);

describe("DataGatewaySections", () => {
  beforeEach(() => {
    useGetDataServiceConfiguration.mockReturnValue({
      data: { data: { analyticsConfiguration: { enableAnalytics: true } } },
    });
    // No badge by default: most tests here are about routing, not counts.
    useSchemaList.mockReturnValue({ data: undefined });
    useSecurityAndPerformanceSchemaList.mockReturnValue({ data: undefined });
  });

  it("lists every section, each pointing at its own route", () => {
    renderAt("/dg");

    expect(labels()).toEqual(["Schemas", "Security", "Playground", "Analytics"]);
    expect(screen.getByRole("link", { name: "Schemas" })).toHaveAttribute("href", "/dg");
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/dg/security",
    );
    expect(screen.getByRole("link", { name: "Playground" })).toHaveAttribute(
      "href",
      "/dg/playground",
    );
  });

  // The route stays reachable by URL, same as Configuration; only the tab
  // pointing at it is gone.
  it("carries no tab for Logs", () => {
    renderAt("/dg");
    expect(screen.queryByRole("link", { name: "Logs" })).not.toBeInTheDocument();
  });

  it("hides Analytics until the project enables it", () => {
    useGetDataServiceConfiguration.mockReturnValue({
      data: { data: { analyticsConfiguration: { enableAnalytics: false } } },
    });
    renderAt("/dg");

    expect(labels()).toEqual(["Schemas", "Security", "Playground"]);
  });

  it("marks Schemas current on the root, list params and all", () => {
    renderAt("/dg?type=all&schemaId=s1&page=1&pageSize=10");

    expect(screen.getByRole("link", { name: "Schemas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Security" })).not.toHaveAttribute("aria-current");
  });

  it("marks the matching section current on a sub-route", () => {
    renderAt("/dg/playground");

    expect(screen.getByRole("link", { name: "Playground" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Schemas" })).not.toHaveAttribute("aria-current");
  });

  // Configuration is a utility, not a section. Nothing should light up, and
  // Schemas in particular must not, since it is the empty sub-path.
  it("leaves every tab inactive on the configuration route", () => {
    renderAt("/dg/configuration");

    screen.getAllByRole("link").forEach((link) => {
      expect(link).not.toHaveAttribute("aria-current");
    });
  });

  // ── Count badges — the design puts a total on Schemas and a "needs
  //    attention" count on Security; every other tab is a plain link. ───────

  it("badges Schemas with the total schema count", () => {
    useSchemaList.mockReturnValue({ data: { data: { totalCount: 39 } } });
    renderAt("/dg");

    expect(screen.getByRole("link", { name: "Schemas 39" })).toBeInTheDocument();
  });

  it("badges Security with the number of schemas needing attention", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: {
        data: {
          schemas: {
            items: [
              { schemaName: "A", readAccessLevel: 2, writeAccessLevel: 3, editAccessLevel: 3, deleteAccessLevel: 3 },
              { schemaName: "B", readAccessLevel: 1, writeAccessLevel: 3, editAccessLevel: 3, deleteAccessLevel: 3 },
            ],
          },
        },
      },
    });
    renderAt("/dg");

    expect(screen.getByRole("link", { name: "Security 1" })).toBeInTheDocument();
  });

  // Nothing needing attention isn't worth a badge.
  it("carries no Security badge when nothing needs attention", () => {
    useSecurityAndPerformanceSchemaList.mockReturnValue({
      data: { data: { schemas: { items: [] } } },
    });
    renderAt("/dg");

    expect(screen.getByRole("link", { name: "Security" })).toBeInTheDocument();
  });

  it("carries no badge on Playground or Analytics", () => {
    useSchemaList.mockReturnValue({ data: { data: { totalCount: 39 } } });
    renderAt("/dg");

    expect(screen.getByRole("link", { name: "Playground" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analytics" })).toBeInTheDocument();
  });

  // The badge's count must come from the same cache entry the security page
  // itself reads, or the page bar opens a second 200-schema fetch on every
  // Data Gateway page instead of reusing one.
  it("requests the security count with exactly the security page's own query shape", () => {
    renderAt("/dg");

    expect(useSecurityAndPerformanceSchemaList).toHaveBeenCalledWith({
      keyword: "",
      projectKey: "t1",
      pageNo: 1,
      pageSize: 200,
      schemaType: "entity",
    });
  });
});
