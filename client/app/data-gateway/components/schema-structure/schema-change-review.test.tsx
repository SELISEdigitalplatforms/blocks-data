import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SchemaDiff } from "../../utils/schema-diff";
import { SchemaChangeReview } from "./schema-change-review";

const diff = (over: Partial<SchemaDiff> = {}): SchemaDiff => ({
  changes: [],
  count: 0,
  losesData: false,
  ...over,
});

describe("SchemaChangeReview", () => {
  it("lists each change with the names involved", () => {
    render(
      <SchemaChangeReview
        diff={diff({
          count: 3,
          changes: [
            { kind: "added", name: "Nickname" },
            { kind: "modified", name: "Email", attributes: ["PII"] },
            { kind: "renamed", from: "Phone", to: "Mobile", attributes: [] },
          ],
        })}
      />,
    );

    expect(screen.getByText("Nickname")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText(/PII/)).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
  });

  it("says nothing alarming when only attributes changed", () => {
    render(
      <SchemaChangeReview
        diff={diff({
          count: 1,
          changes: [{ kind: "modified", name: "Email", attributes: ["description"] }],
        })}
      />,
    );

    expect(screen.queryByText(/not carried over/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deletes the stored values/i)).not.toBeInTheDocument();
  });

  // The whole reason the phase exists: the API keys fields by name, so this is
  // a delete and an add however it was typed.
  it("warns that a rename does not carry the values over", () => {
    render(
      <SchemaChangeReview
        diff={diff({
          count: 1,
          losesData: true,
          changes: [{ kind: "renamed", from: "Phone", to: "Mobile", attributes: [] }],
        })}
      />,
    );

    expect(screen.getByText(/saved as a delete and an add/i)).toBeInTheDocument();
  });

  it("warns that a removal deletes the stored values", () => {
    render(
      <SchemaChangeReview
        diff={diff({
          count: 1,
          losesData: true,
          changes: [{ kind: "removed", name: "Phone" }],
        })}
      />,
    );

    expect(screen.getByText(/deletes the stored values/i)).toBeInTheDocument();
  });

  it("labels a new row that has no name yet", () => {
    render(
      <SchemaChangeReview
        diff={diff({ count: 1, changes: [{ kind: "added", name: "" }] })}
      />,
    );

    expect(screen.getByText("Unnamed field")).toBeInTheDocument();
  });
});
