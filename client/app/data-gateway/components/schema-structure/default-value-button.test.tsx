import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui-kits/tooltip/tooltip";
import { DefaultValueButton } from "./default-value-button";

function renderButton(props: Partial<Parameters<typeof DefaultValueButton>[0]> = {}) {
  const onOpen = vi.fn();
  render(
    <TooltipProvider>
      <DefaultValueButton fieldName="Tags" fieldType="String" isNewField={false} defaultValue={null} onOpen={onOpen} {...props} />
    </TooltipProvider>,
  );
  return onOpen;
}

describe("DefaultValueButton", () => {
  it("opens the default value of a system property that can take one", async () => {
    const onOpen = renderButton();
    await userEvent.setup().click(screen.getByRole("button", { name: "Default value for Tags" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it.each([
    [{ fieldName: "CreatedDate", fieldType: "DateTime" }, "CreatedDate is set by the platform on every save"],
    [{ fieldName: "ItemId" }, "ItemId is set by the platform on every save"],
    [{ isNewField: true }, "Save the field before setting a default value"],
    [{ fieldName: "Address", fieldType: "Address" }, "Default values are only available for text, number, true/false, date-time and enum properties"],
    [{ isEditMode: true }, "Exit edit mode to manage the default value"],
  ])("is disabled for %j", (props, reason) => {
    renderButton(props);
    expect(screen.getByRole("button", { name: reason })).toBeDisabled();
  });

  it("names the default in its label once one is set", () => {
    renderButton({ fieldName: "HrYearRenewDate", fieldType: "DateTime", defaultValue: { kind: "Now", offset: { days: 365, hours: 0, minutes: 0, seconds: 0 } } });
    expect(screen.getByRole("button", { name: "Default value for HrYearRenewDate (365 days after the record is created)" })).toBeEnabled();
  });

  it("shows as open while its panel is in the inspector", () => {
    renderButton({ active: true });
    expect(screen.getByRole("button", { name: "Default value for Tags" })).toHaveAttribute("aria-expanded", "true");
  });
});
