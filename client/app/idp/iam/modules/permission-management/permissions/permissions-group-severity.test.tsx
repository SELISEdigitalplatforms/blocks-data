import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let severityData: unknown;
let loading = false;
vi.mock("@blocks-idp/iam/hooks/use-permission", () => ({
  useGetPermissionsGroupBySeverity: () => ({ data: severityData, isLoading: loading }),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));
let captured: { data: unknown; isLoading: boolean } | null = null;
vi.mock("@blocks-idp/iam/components/permission-severity/permission-severity", () => ({
  PermissionSeverity: (props: { data: unknown; isLoading: boolean }) => {
    captured = props;
    return <div data-testid="permission-severity" />;
  },
}));

import { PermissionsGroupBySeverity } from "./permissions-group-severity";

afterEach(() => {
  vi.clearAllMocks();
  captured = null;
  loading = false;
});

describe("PermissionsGroupBySeverity", () => {
  it("passes the fetched severity data through to PermissionSeverity", () => {
    severityData = [{ severity: 1, count: 3 }];
    render(<PermissionsGroupBySeverity />);
    expect(screen.getByTestId("permission-severity")).toBeInTheDocument();
    expect(captured?.data).toEqual([{ severity: 1, count: 3 }]);
  });

  it("falls back to an empty array when there is no data", () => {
    severityData = undefined;
    loading = true;
    render(<PermissionsGroupBySeverity />);
    expect(captured?.data).toEqual([]);
    expect(captured?.isLoading).toBe(true);
  });
});
