import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RestResponse } from "../../rest/rest-client";
import { ResponsePanel } from "./response-panel";

vi.mock("../playground/monaco-editor", () => ({
  PlaygroundMonacoEditor: ({ value, language }: { value?: string; language?: string }) => (
    <pre data-testid="monaco" data-language={language}>
      {value}
    </pre>
  ),
  usePlaygroundMonacoTheme: () => "light",
}));

type Ok = Extract<RestResponse, { kind: "response" }>;

const response = (overrides: Partial<Ok> = {}): Ok => ({
  kind: "response",
  status: 200,
  statusText: "OK",
  headers: [],
  contentType: "application/json",
  bodyText: "{}",
  durationMs: 12,
  sizeBytes: 2,
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe("ResponsePanel", () => {
  it("shows the empty state before any request", () => {
    render(<ResponsePanel response={null} isSending={false} />);
    expect(screen.getByText("Send a request to see the response.")).toBeInTheDocument();
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("shows a spinner and Sending… while a request is out", () => {
    render(<ResponsePanel response={null} isSending />);
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    expect(screen.queryByText("Send a request to see the response.")).not.toBeInTheDocument();
  });

  it("shows Sending… even when a previous response exists", () => {
    render(<ResponsePanel response={response()} isSending />);
    expect(screen.getByText("Sending…")).toBeInTheDocument();
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("says the request was cancelled", () => {
    render(<ResponsePanel response={{ kind: "aborted" }} isSending={false} />);
    expect(screen.getByText("Request cancelled.")).toBeInTheDocument();
  });

  it("shows a grey No response pill with the reason", () => {
    render(
      <ResponsePanel
        response={{ kind: "no-response", reason: "Failed to fetch", durationMs: 30 }}
        isSending={false}
      />,
    );
    expect(screen.getByText("Couldn't reach the gateway.")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    expect(screen.getByText("No response").className).toContain("bg-muted");
  });

  it("shows the status pill, timing and size, and the headers tab", async () => {
    render(
      <ResponsePanel
        response={response({
          status: 201,
          statusText: "Created",
          headers: [["location", "/data/v1/Thing/item/abc"]],
          bodyText: '{"itemId":"abc"}',
          durationMs: 87,
          sizeBytes: 16,
        })}
        isSending={false}
      />,
    );
    const pill = screen.getByText("201 Created");
    expect(pill.className).toContain("bg-emerald-500/10");
    expect(screen.getByText("87 ms · 16 B")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Headers" }));
    expect(screen.getByText("location:")).toBeInTheDocument();
    expect(screen.getByText("/data/v1/Thing/item/abc")).toBeInTheDocument();
  });

  it("formats the size in KB with one decimal from 1024 bytes", () => {
    render(<ResponsePanel response={response({ sizeBytes: 1536 })} isSending={false} />);
    expect(screen.getByText("12 ms · 1.5 KB")).toBeInTheDocument();
  });

  it.each([
    [301, "Moved", "bg-amber-500/10"],
    [404, "Not Found", "bg-red-500/10"],
    [500, "Internal Server Error", "bg-red-500/10"],
  ])("colours a %i pill", (status, statusText, colour) => {
    render(<ResponsePanel response={response({ status, statusText })} isSending={false} />);
    expect(screen.getByText(`${status} ${statusText}`).className).toContain(colour);
  });

  it("falls back to a reason phrase when the status text is empty (HTTP/2)", () => {
    render(<ResponsePanel response={response({ status: 422, statusText: "" })} isSending={false} />);
    expect(screen.getByText("422 Unprocessable Content")).toBeInTheDocument();
  });

  it("shows only the number for an unknown code with no status text", () => {
    render(<ResponsePanel response={response({ status: 418, statusText: "" })} isSending={false} />);
    expect(screen.getByText("418")).toBeInTheDocument();
  });

  it("pretty-prints a JSON body as json", () => {
    render(<ResponsePanel response={response({ bodyText: '{"a":1,"b":[2]}' })} isSending={false} />);
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveAttribute("data-language", "json");
    expect(editor.textContent).toBe(JSON.stringify({ a: 1, b: [2] }, null, 2));
  });

  it("pretty-prints numbers exactly as the server sent them", () => {
    render(
      <ResponsePanel
        response={response({ bodyText: '{"id":9007199254740993,"a":[1.0,-0,1e400],"s":"9007199254740993"}' })}
        isSending={false}
      />,
    );
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveAttribute("data-language", "json");
    expect(editor.textContent).toBe(
      '{\n  "id": 9007199254740993,\n  "a": [\n    1.0,\n    -0,\n    1e400\n  ],\n  "s": "9007199254740993"\n}',
    );
  });

  it("shows a JSON body with a duplicate key raw, as json, so no member is hidden", () => {
    const body = '{"a":1,"a":2}';
    render(<ResponsePanel response={response({ bodyText: body })} isSending={false} />);
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveAttribute("data-language", "json");
    expect(editor.textContent).toBe(body);
  });

  it("shows a JSON body nested too deep to format raw, as text, without throwing", () => {
    const body = `${'{"a":'.repeat(20_000)}1${"}".repeat(20_000)}`;
    render(<ResponsePanel response={response({ bodyText: body })} isSending={false} />);
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveAttribute("data-language", "plaintext");
    expect(editor.textContent).toBe(body);
  });

  it("summarises a problem+json body above the raw JSON", () => {
    const body = JSON.stringify({
      status: 400,
      code: "VALIDATION_ERROR",
      title: "One or more validation errors occurred",
      detail: "The request body is invalid.",
      errors: [
        { field: "Name", message: "Required", validationType: "Required" },
        { message: "Body is malformed" },
      ],
    });
    render(
      <ResponsePanel
        response={response({
          status: 400,
          statusText: "Bad Request",
          contentType: "application/problem+json",
          bodyText: body,
        })}
        isSending={false}
      />,
    );
    expect(screen.getByRole("region", { name: "Error summary" })).toBeInTheDocument();
    expect(screen.getByText("VALIDATION_ERROR · One or more validation errors occurred")).toBeInTheDocument();
    expect(screen.getByText("The request body is invalid.")).toBeInTheDocument();
    expect(screen.getByText("Name: Required (Required)")).toBeInTheDocument();
    expect(screen.getByText("Body is malformed")).toBeInTheDocument();
    expect(screen.getByTestId("monaco")).toHaveAttribute("data-language", "json");
  });

  it("skips the empty parts of the summary's first line", () => {
    const body = JSON.stringify({ status: 400, code: "BAD", title: "" });
    render(
      <ResponsePanel
        response={response({ status: 400, contentType: "application/problem+json", bodyText: body })}
        isSending={false}
      />,
    );
    expect(screen.getByText("BAD")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Error summary" })).toHaveTextContent(/^BAD$/);
  });

  it("shows a plain-text 503 as text with no summary", () => {
    render(
      <ResponsePanel
        response={response({
          status: 503,
          statusText: "Service Unavailable",
          contentType: "text/plain",
          bodyText: "upstream connect error",
        })}
        isSending={false}
      />,
    );
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveAttribute("data-language", "plaintext");
    expect(editor.textContent).toBe("upstream connect error");
    expect(screen.queryByRole("region", { name: "Error summary" })).not.toBeInTheDocument();
    expect(screen.getByText("503 Service Unavailable")).toBeInTheDocument();
  });

  it("shows (empty body) for an empty 200 body", () => {
    render(
      <ResponsePanel
        response={response({ status: 204, statusText: "No Content", bodyText: "", sizeBytes: 0 })}
        isSending={false}
      />,
    );
    expect(screen.getByTestId("monaco").textContent).toBe("(empty body)");
    expect(screen.getByText("12 ms · 0 B")).toBeInTheDocument();
  });

  it("shows no error summary for a 2xx body that only looks like a problem", () => {
    const body = JSON.stringify({ status: 200, title: "Welcome" });
    render(<ResponsePanel response={response({ status: 200, bodyText: body })} isSending={false} />);
    expect(screen.queryByRole("region", { name: "Error summary" })).not.toBeInTheDocument();
    expect(screen.getByTestId("monaco")).toHaveAttribute("data-language", "json");
  });

  it("still summarises a 400 whose body looks like a problem without the problem media type", () => {
    const body = JSON.stringify({ status: 400, title: "Bad input" });
    render(
      <ResponsePanel
        response={response({ status: 400, statusText: "Bad Request", contentType: "application/json", bodyText: body })}
        isSending={false}
      />,
    );
    expect(screen.getByRole("region", { name: "Error summary" })).toHaveTextContent("Bad input");
  });

  it("summarises a problem+json body even on a 2xx status", () => {
    const body = JSON.stringify({ title: "Heads up", detail: "Partially applied." });
    render(
      <ResponsePanel
        response={response({ status: 207, statusText: "", contentType: "application/problem+json; charset=utf-8", bodyText: body })}
        isSending={false}
      />,
    );
    expect(screen.getByRole("region", { name: "Error summary" })).toHaveTextContent("Heads up");
  });

  it("shows a whitespace-only body as-is, as text, not as (empty body)", () => {
    render(<ResponsePanel response={response({ bodyText: "  \n " })} isSending={false} />);
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveAttribute("data-language", "plaintext");
    expect(editor.textContent).toBe("  \n ");
    expect(screen.queryByText("(empty body)")).not.toBeInTheDocument();
  });

  it("shows a line when the response has no headers", async () => {
    render(<ResponsePanel response={response({ headers: [] })} isSending={false} />);
    await userEvent.click(screen.getByRole("tab", { name: "Headers" }));
    expect(screen.getByText("No headers.")).toBeInTheDocument();
  });

  it("does not show the no-headers line when there are headers", async () => {
    render(<ResponsePanel response={response({ headers: [["etag", "abc"]] })} isSending={false} />);
    await userEvent.click(screen.getByRole("tab", { name: "Headers" }));
    expect(screen.queryByText("No headers.")).not.toBeInTheDocument();
  });

  it("renders an HTML-looking body and header value only as text", async () => {
    const html = "<img src=x onerror=alert(1)>";
    const { container } = render(
      <ResponsePanel
        response={response({ contentType: "text/html", bodyText: html, headers: [["x-note", html]] })}
        isSending={false}
      />,
    );
    expect(screen.getByTestId("monaco").textContent).toBe(html);
    expect(container.querySelector("img")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Headers" }));
    expect(screen.getByText(html)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("formats a large (500 KB+) JSON body once across re-renders and renders it only in the editor", () => {
    const big = JSON.stringify({ items: Array.from({ length: 20000 }, (_, i) => ({ id: i, name: `item-${i}` })) });
    expect(big.length).toBeGreaterThan(500_000);
    const props = { response: response({ bodyText: big, sizeBytes: big.length }), isSending: false };

    const stringify = vi.spyOn(JSON, "stringify");
    const { rerender, container } = render(<ResponsePanel {...props} />);
    rerender(<ResponsePanel {...props} />);

    const forBody = stringify.mock.calls.filter(([value]) => {
      const items = (value as { items?: unknown[] } | null)?.items;
      return Array.isArray(items) && items.length === 20000;
    });
    expect(forBody).toHaveLength(1);

    const editors = screen.getAllByTestId("monaco");
    expect(editors).toHaveLength(1);
    expect(within(editors[0]).getByText(/"name": "item-19999"/)).toBeInTheDocument();
    // Nothing outside the editor holds the body.
    const outside = Array.from(container.querySelectorAll("*")).filter(
      (el) => !el.closest("[data-testid=monaco]") && el.children.length === 0 && (el.textContent ?? "").length > 10_000,
    );
    expect(outside).toHaveLength(0);
  });
});
