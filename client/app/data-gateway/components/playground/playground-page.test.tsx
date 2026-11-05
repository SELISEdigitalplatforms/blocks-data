import { fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RestDraft } from "../rest-playground/rest-workspace";

const deprecated = vi.hoisted(() => ({ value: false }));

vi.mock("../../utils/graphql-deprecation", () => ({
  isGraphQLDeprecated: () => deprecated.value,
}));

// The real peek and clear, wrapped so the tests can count calls.
vi.mock("../../utils/playground-handoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/playground-handoff")>();
  return {
    ...actual,
    peekPlaygroundHandoff: vi.fn(actual.peekPlaygroundHandoff),
    clearPlaygroundHandoff: vi.fn(actual.clearPlaygroundHandoff),
  };
});

// A light stand-in: shows what it was handed, and keeps a draft of its own so a
// test can tell whether it stayed mounted across a tab switch.
vi.mock("../rest-playground/rest-workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../rest-playground/rest-workspace")>();
  function RestWorkspace({ incoming }: { incoming?: { draft: RestDraft; nonce: number } }) {
    const [draft, setDraft] = useState("");
    return (
      <div data-testid="rest-workspace">
        <span data-testid="rest-incoming">{incoming?.draft.requestLine}</span>
        <span data-testid="rest-nonce">{incoming?.nonce}</span>
        <input aria-label="REST draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </div>
    );
  }
  return { ...actual, RestWorkspace };
});

vi.mock("../rest-playground/requests-drawer", () => ({
  RequestsDrawer: ({
    open,
    onUseRequest,
  }: {
    open: boolean;
    onUseRequest: (draft: RestDraft) => void;
  }) =>
    open ? (
      <div data-testid="requests-drawer">
        <button
          type="button"
          onClick={() => onUseRequest({ method: "GET", requestLine: "/Product?pageSize=10", bodyText: "" })}
        >
          use product
        </button>
        <button
          type="button"
          onClick={() => onUseRequest({ method: "DELETE", requestLine: "/Order/{itemId}", bodyText: "" })}
        >
          use order
        </button>
      </div>
    ) : null,
}));

vi.mock("../graphql-playground/graphql-playground-page", () => ({
  GraphQLWorkspace: ({ initialQuery, schemasOpen }: { initialQuery?: string; schemasOpen: boolean }) => (
    <div data-testid="graphql-workspace">
      <textarea data-testid="monaco-query" value={initialQuery ?? ""} readOnly />
      {schemasOpen ? <div data-testid="schemas-drawer" /> : null}
    </div>
  ),
}));

vi.mock("../graphql-playground/clean-test-data-modal", () => ({
  CleanTestDataModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="clean-modal" /> : null,
}));

import {
  clearPlaygroundHandoff,
  peekPlaygroundHandoff,
  writePlaygroundHandoff,
} from "../../utils/playground-handoff";
import { PlaygroundPage } from "./playground-page";

const restPanel = () => screen.getByTestId("rest-workspace").parentElement as HTMLElement;
const graphqlPanel = () => screen.getByTestId("graphql-workspace").parentElement as HTMLElement;
const tab = (name: RegExp) => screen.getByRole("radio", { name });

beforeEach(() => {
  vi.clearAllMocks();
  deprecated.value = false;
  localStorage.clear();
});

describe("PlaygroundPage", () => {
  it("renders the header with the Playground title", () => {
    render(<PlaygroundPage />);
    expect(screen.getByRole("heading", { name: "Playground" })).toBeInTheDocument();
  });

  it("opens on the REST tab by default", () => {
    render(<PlaygroundPage />);
    expect(tab(/REST/)).toHaveAttribute("aria-checked", "true");
    expect(tab(/GraphQL/)).toHaveAttribute("aria-checked", "false");
    expect(restPanel()).not.toHaveClass("hidden");
    expect(graphqlPanel()).toHaveClass("hidden");
  });

  it("shows no deprecated tag while GraphQL is not deprecated", () => {
    render(<PlaygroundPage />);
    expect(screen.queryByText("deprecated")).not.toBeInTheDocument();
  });

  it("tags the GraphQL segment deprecated when the flag is set", () => {
    deprecated.value = true;
    render(<PlaygroundPage />);
    expect(within(tab(/GraphQL/)).getByText("deprecated")).toBeInTheDocument();
    expect(within(tab(/REST/)).queryByText("deprecated")).not.toBeInTheDocument();
  });

  it("opens a rest handoff on the REST tab with that request", () => {
    writePlaygroundHandoff({ protocol: "rest", method: "GET", path: "/Product", query: [["pageSize", "10"]] });
    render(<PlaygroundPage />);
    expect(tab(/REST/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("rest-incoming")).toHaveTextContent("/Product?pageSize=10");
    expect(screen.getByTestId("rest-nonce")).toHaveTextContent("1");
    expect(screen.getByTestId("monaco-query")).toHaveValue("");
  });

  it("opens a graphql handoff on the GraphQL tab with that query", () => {
    writePlaygroundHandoff({ protocol: "graphql", query: "query { getProducts { totalCount } }" });
    render(<PlaygroundPage />);
    expect(tab(/GraphQL/)).toHaveAttribute("aria-checked", "true");
    expect(graphqlPanel()).not.toHaveClass("hidden");
    expect(restPanel()).toHaveClass("hidden");
    expect(screen.getByTestId("monaco-query")).toHaveValue("query { getProducts { totalCount } }");
    expect(screen.getByTestId("rest-incoming")).toBeEmptyDOMElement();
  });

  // Moved from graphql-playground-page.test.tsx: the shell now reads the legacy key (R-SDD4, R-SDD21).
  it("loads a stored query from localStorage and clears it", () => {
    localStorage.setItem("graphql-playground-query", "query { getFoo }");
    render(<PlaygroundPage />);
    expect(screen.getByTestId("monaco-query")).toHaveValue("query { getFoo }");
    expect(localStorage.getItem("graphql-playground-query")).toBeNull();
  });

  it("applies the handoff once and clears both keys after mount, under StrictMode and re-renders", () => {
    writePlaygroundHandoff({ protocol: "graphql", query: "query { getFoo }" });
    localStorage.setItem("graphql-playground-query", "query { legacy }");
    const { rerender } = render(
      <StrictMode>
        <PlaygroundPage />
      </StrictMode>,
    );
    // Mounted: the handoff was applied and both keys are gone.
    expect(screen.getByTestId("monaco-query")).toHaveValue("query { getFoo }");
    expect(localStorage.getItem("data-gateway-playground-handoff")).toBeNull();
    expect(localStorage.getItem("graphql-playground-query")).toBeNull();
    expect(clearPlaygroundHandoff).toHaveBeenCalled();

    // A later handoff is neither read nor cleared by re-renders or a tab switch: it is for the next mount.
    const peeks = vi.mocked(peekPlaygroundHandoff).mock.calls.length;
    const clears = vi.mocked(clearPlaygroundHandoff).mock.calls.length;
    writePlaygroundHandoff({ protocol: "graphql", query: "query { next }" });
    rerender(
      <StrictMode>
        <PlaygroundPage />
      </StrictMode>,
    );
    fireEvent.click(tab(/REST/));
    expect(vi.mocked(peekPlaygroundHandoff)).toHaveBeenCalledTimes(peeks);
    expect(vi.mocked(clearPlaygroundHandoff)).toHaveBeenCalledTimes(clears);
    expect(screen.getByTestId("monaco-query")).toHaveValue("query { getFoo }");
    expect(localStorage.getItem("data-gateway-playground-handoff")).not.toBeNull();
  });

  it("does not lose the handoff when a render is discarded before mount", () => {
    writePlaygroundHandoff({ protocol: "graphql", query: "query { getFoo }" });
    // Renders without mounting: no effects run, as with a render React throws away.
    renderToString(<PlaygroundPage />);
    expect(localStorage.getItem("data-gateway-playground-handoff")).not.toBeNull();

    render(<PlaygroundPage />);
    expect(tab(/GraphQL/)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("monaco-query")).toHaveValue("query { getFoo }");
    expect(localStorage.getItem("data-gateway-playground-handoff")).toBeNull();
  });

  it("keeps both workspaces mounted, so the REST draft survives a tab switch", () => {
    render(<PlaygroundPage />);
    fireEvent.change(screen.getByLabelText("REST draft"), { target: { value: "/Product/42" } });

    fireEvent.click(tab(/GraphQL/));
    expect(tab(/GraphQL/)).toHaveAttribute("aria-checked", "true");
    expect(restPanel()).toHaveClass("hidden");
    expect(graphqlPanel()).not.toHaveClass("hidden");

    fireEvent.click(tab(/REST/));
    expect(restPanel()).not.toHaveClass("hidden");
    expect(screen.getByLabelText("REST draft")).toHaveValue("/Product/42");
  });

  it("shows Requests and Clean test data on REST, Schemas and Clean test data on GraphQL", () => {
    render(<PlaygroundPage />);
    expect(screen.getByRole("button", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clean test data" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schemas" })).not.toBeInTheDocument();

    fireEvent.click(tab(/GraphQL/));
    expect(screen.getByRole("button", { name: "Schemas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clean test data" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Requests" })).not.toBeInTheDocument();
  });

  // Moved from graphql-playground-page.test.tsx: the header buttons now live in the shell (R-SDD20, R-SDD21).
  it("opens the schemas drawer and clean-data modal from the toolbar", async () => {
    render(<PlaygroundPage />);
    fireEvent.click(tab(/GraphQL/));
    fireEvent.click(screen.getByRole("button", { name: "Schemas" }));
    expect(await screen.findByTestId("schemas-drawer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clean test data" }));
    expect(await screen.findByTestId("clean-modal")).toBeInTheDocument();
  });

  it("opens the clean-data modal from the REST tab", () => {
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByRole("button", { name: "Clean test data" }));
    expect(screen.getByTestId("clean-modal")).toBeInTheDocument();
  });

  it("hands each request picked in the Requests drawer to the REST workspace with a new nonce", () => {
    render(<PlaygroundPage />);
    expect(screen.queryByTestId("requests-drawer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "use product" }));
    expect(screen.getByTestId("rest-incoming")).toHaveTextContent("/Product?pageSize=10");
    expect(screen.getByTestId("rest-nonce")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "use order" }));
    expect(screen.getByTestId("rest-incoming")).toHaveTextContent("/Order/{itemId}");
    expect(screen.getByTestId("rest-nonce")).toHaveTextContent("2");
  });

  it("continues the nonce after a rest handoff", () => {
    writePlaygroundHandoff({ protocol: "rest", method: "GET", path: "/Product", query: [] });
    render(<PlaygroundPage />);
    fireEvent.click(screen.getByRole("button", { name: "Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "use order" }));
    expect(screen.getByTestId("rest-nonce")).toHaveTextContent("2");
  });
});
