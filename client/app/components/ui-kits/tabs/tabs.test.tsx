import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("TabsContent", () => {
  it("keeps an inactive panel out of the layout even when it carries a display utility", () => {
    render(
      <Tabs defaultValue="one" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one" className="flex flex-col gap-4">
          First
        </TabsContent>
        <TabsContent value="two" className="flex flex-col gap-4">
          Second
        </TabsContent>
      </Tabs>,
    );

    // Radix leaves the inactive panel mounted (as an empty hidden box) and only renders its
    // children when selected. `flex` on that box would override the browser's
    // `[hidden] { display: none }`, so it would still take a gap from the parent — pushing the
    // active panel down by one gap per inactive tab.
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    const inactive = panels.find((panel) => panel.getAttribute("data-state") === "inactive")!;

    expect(inactive).toHaveAttribute("hidden");
    expect(inactive.className).toContain("data-[state=inactive]:!hidden");
    expect(screen.getByText("First")).toBeInTheDocument();
  });
});
