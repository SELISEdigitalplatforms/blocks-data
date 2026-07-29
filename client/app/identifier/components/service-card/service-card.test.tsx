import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Accordion, AccordionItem } from "@/components/ui-kits/accordion/accordion";
import type { RegisteredService } from "@/identifier/models/service.model";

const navigate = vi.fn();
const copy = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copy, isCopying: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: () => "https://data.example.com",
}));

import { ServiceCard } from "./service-card";

const baseService = (over: Partial<RegisteredService> = {}): RegisteredService =>
  ({
    itemId: "svc-1",
    createdDate: "",
    lastUpdatedDate: "",
    createdBy: "",
    language: "",
    lastUpdatedBy: "",
    organizationIds: [],
    tags: [],
    name: "Payments API",
    url: "",
    environment: "production",
    type: 0,
    description: "",
    serviceId: "service-id-123",
    metadata: {},
    serviceBusConnectionString: "",
    tenantId: "tenant-abc",
    serviceType: "",
    ...over,
  }) as RegisteredService;

function renderCard(service: RegisteredService) {
  return render(
    <MemoryRouter>
      <Accordion type="single" collapsible defaultValue="item">
        <AccordionItem value="item">
          <ServiceCard service={service} />
        </AccordionItem>
      </Accordion>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServiceCard", () => {
  it("renders the name and defaults the badge to backend when no serviceType", () => {
    renderCard(baseService());
    expect(screen.getByText("Payments API")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it("shows the provided serviceType in the badge", () => {
    renderCard(baseService({ serviceType: "frontend" }));
    expect(screen.getByText("frontend")).toBeInTheDocument();
  });

  it("navigates to the encoded logs route when Logs is clicked", async () => {
    const user = userEvent.setup();
    renderCard(baseService({ serviceId: "svc/space id", name: "Payments API" }));
    await user.click(screen.getByRole("button", { name: "Logs" }));
    expect(navigate).toHaveBeenCalledWith(
      "/services/logs/svc%2Fspace%20id?name=Payments%20API",
    );
  });

  it("opens Swagger and Docs in a new tab from the dropdown menu", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = renderCard(baseService());
    // The menu trigger is a div wrapping the ellipsis icon.
    const ellipsis = container.querySelector("svg.lucide-ellipsis-vertical");
    const trigger = ellipsis?.closest("[aria-haspopup]") ?? ellipsis?.parentElement;
    await user.click(trigger as Element);
    const swagger = await screen.findByText("Swagger");
    await user.click(swagger);
    expect(openSpy).toHaveBeenCalledWith(
      "https://data.example.com/identifier/v1/swagger/index.html",
      "_blank",
      "noopener,noreferrer",
    );
    // Radix closes the menu after a selection, so reopen it before Docs.
    await user.click(trigger as Element);
    const docs = await screen.findByText("Docs");
    await user.click(docs);
    expect(openSpy).toHaveBeenCalledWith(
      "https://docs.seliseblocks.com/",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("copies the Service ID and X-Blocks-Key values", async () => {
    const user = userEvent.setup();
    renderCard(baseService({ serviceId: "service-id-123", tenantId: "tenant-abc" }));
    expect(screen.getByText("Service ID")).toBeInTheDocument();
    expect(screen.getByText("X-Blocks-Key")).toBeInTheDocument();
    const copyButtons = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg.lucide-copy"));
    await user.click(copyButtons[0]);
    expect(copy).toHaveBeenCalled();
    expect(copy.mock.calls[0][0]).toBe("service-id-123");
  });

  it("shows the connection string item only for non-frontend services that have one", () => {
    renderCard(
      baseService({ serviceType: "backend", serviceBusConnectionString: "sb://conn" }),
    );
    expect(screen.getByText("Connection String")).toBeInTheDocument();
  });

  it("hides the connection string for frontend services", () => {
    renderCard(
      baseService({ serviceType: "frontend", serviceBusConnectionString: "sb://conn" }),
    );
    expect(screen.queryByText("Connection String")).not.toBeInTheDocument();
  });

  it("renders the description when present", () => {
    renderCard(baseService({ description: "Handles card payments" }));
    expect(screen.getByText("Handles card payments")).toBeInTheDocument();
  });

  it("truncates tags to four and expands the rest when the +N badge is clicked", async () => {
    const user = userEvent.setup();
    const tags = ["a", "b", "c", "d", "e", "f"];
    renderCard(baseService({ tags }));
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("e")).not.toBeInTheDocument();
    await user.click(screen.getByText("+2"));
    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.getByText("f")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
  });

  it("renders no tag row when there are no tags", () => {
    renderCard(baseService({ tags: [] }));
    expect(screen.queryByText("+1")).not.toBeInTheDocument();
  });
});
