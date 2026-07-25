import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextStep = vi.fn();
vi.mock("@/components/stepper/stepper-provider", () => ({
  useStepper: () => ({ nextStep }),
}));

const setFormData = vi.fn();
let formData: Record<number, Record<string, unknown>>;
vi.mock("../../utils", () => ({
  useCreateProjectFormState: () => ({ formData, setFormData }),
}));

const refetchAuthorization = vi.fn();
let authData: Record<string, unknown> | undefined;
let repoUser: Record<string, unknown> | undefined;
vi.mock("@/repository-integration/hooks/use-github-integration", () => ({
  useValidateAuthorization: () => ({ data: authData, refetch: refetchAuthorization }),
  useGetRepositoryUser: () => ({ data: repoUser }),
}));

vi.mock("@/repository-integration/components/render-provider", () => ({
  default: () => <div data-testid="providers" />,
}));

let lastSelectionProps: Record<string, unknown> = {};
vi.mock("@/components/repository-selection-modal/repository-selection-modal", () => ({
  RepositorySelectionModal: (props: Record<string, unknown>) => {
    lastSelectionProps = props;
    return props.open ? <div data-testid="select-modal" /> : null;
  },
}));

vi.mock("@/repository-integration/models/github-info", () => ({
  iconMap: { github: "/github.svg" },
}));

import { CreateProjectResourcesForm } from "./create-project-resources-form";

beforeEach(() => {
  formData = { 0: { name: "proj" }, 1: { assets: [] } };
  authData = undefined;
  repoUser = undefined;
  lastSelectionProps = {};
});
afterEach(() => vi.clearAllMocks());

describe("CreateProjectResourcesForm", () => {
  it("renders the heading and add repository button", () => {
    render(<CreateProjectResourcesForm />);
    expect(screen.getByText("Add resource")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add repository/i })).toBeInTheDocument();
  });

  it("shows the auth account and selected repos when present", () => {
    repoUser = { login: "octocat", name: "Octo", avatar_url: "" };
    formData = { 0: { name: "proj" }, 1: { assets: [{ id: 1, name: "repo", full_name: "octo/repo", html_url: "u" }] } };
    render(<CreateProjectResourcesForm />);
    expect(screen.getByText("octocat")).toBeInTheDocument();
    expect(screen.getByText("(Octo)")).toBeInTheDocument();
    expect(screen.getByText(/Git repos \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("octo/repo")).toBeInTheDocument();
  });

  it("opens the select modal when already authorized", async () => {
    const user = userEvent.setup();
    refetchAuthorization.mockResolvedValue({ data: { isSuccess: true } });
    render(<CreateProjectResourcesForm />);
    await user.click(screen.getByRole("button", { name: /Add repository/i }));
    await waitFor(() => expect(screen.getByTestId("select-modal")).toBeInTheDocument());
  });

  it("opens the provider dialog when not authorized", async () => {
    const user = userEvent.setup();
    refetchAuthorization.mockResolvedValue({ data: { isSuccess: false } });
    render(<CreateProjectResourcesForm />);
    await user.click(screen.getByRole("button", { name: /Add repository/i }));
    await waitFor(() => expect(screen.getByText("Connect repository")).toBeInTheDocument());
  });

  it("falls back to the provider dialog when the auth check throws", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    refetchAuthorization.mockRejectedValue(new Error("boom"));
    render(<CreateProjectResourcesForm />);
    await user.click(screen.getByRole("button", { name: /Add repository/i }));
    await waitFor(() => expect(screen.getByText("Connect repository")).toBeInTheDocument());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("adds a selected repository through the selection modal callback", async () => {
    render(<CreateProjectResourcesForm />);
    const onSelect = lastSelectionProps.onSelectRepository as (r: unknown) => void;
    act(() => {
      onSelect({ id: 5, name: "new", full_name: "me/new", html_url: "url" });
    });
    expect(await screen.findByText("me/new")).toBeInTheDocument();
  });
});
