import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from "./drawer";

describe("Drawer", () => {
  it("renders the trigger and hides content when closed", () => {
    render(
      <Drawer>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Title</DrawerTitle>
            <DrawerDescription>Desc</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>Footer</DrawerFooter>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
  });

  it("renders the content, title, description and footer when open", () => {
    render(
      <Drawer open>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>My Title</DrawerTitle>
            <DrawerDescription>My Desc</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>My Footer</DrawerFooter>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My Desc")).toBeInTheDocument();
    expect(screen.getByText("My Footer")).toBeInTheDocument();
  });
});
