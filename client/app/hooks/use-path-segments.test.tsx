import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import useRoutePathSegments from "./use-path-segments";

const wrapperFor = (path: string) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

describe("useRoutePathSegments", () => {
  it("builds cumulative hrefs and title-cased labels", () => {
    const { result } = renderHook(() => useRoutePathSegments(), {
      wrapper: wrapperFor("/data-gateway/schema-structure"),
    });

    expect(result.current).toEqual([
      { href: "/data-gateway", label: "Data Gateway" },
      {
        href: "/data-gateway/schema-structure",
        label: "Schema Structure",
      },
    ]);
  });

  it("returns an empty list for the root path", () => {
    const { result } = renderHook(() => useRoutePathSegments(), {
      wrapper: wrapperFor("/"),
    });
    expect(result.current).toEqual([]);
  });
});
