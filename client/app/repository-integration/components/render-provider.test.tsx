import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const authenticateWithGithub = vi.fn();
const authenticateWithGitlab = vi.fn();
const authenticateWithBitbucket = vi.fn();
const authenticateWithAzure = vi.fn();
const authenticateWithAws = vi.fn();

vi.mock("@/repository-integration/services/git-provider-auth.service", () => ({
  authenticateWithGithub: (...a: unknown[]) => authenticateWithGithub(...a),
  authenticateWithGitlab: (...a: unknown[]) => authenticateWithGitlab(...a),
  authenticateWithBitbucket: (...a: unknown[]) =>
    authenticateWithBitbucket(...a),
  authenticateWithAzure: (...a: unknown[]) => authenticateWithAzure(...a),
  authenticateWithAws: (...a: unknown[]) => authenticateWithAws(...a),
}));

const useValidateAuthorization = vi.fn();
vi.mock("@/repository-integration/hooks/use-github-integration", () => ({
  useValidateAuthorization: () => useValidateAuthorization(),
}));

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/repository-integration/models/github-info", () => ({
  iconMap: {
    github: "github.png",
    gitlab: "gitlab.png",
    bitbucket: "bitbucket.png",
    azure: "azure.png",
    aws: "aws.png",
  },
}));

import ProviderButtons from "./render-provider";

afterEach(() => vi.clearAllMocks());

function renderProvider(props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <ProviderButtons destination="/dest" {...props} />
    </MemoryRouter>,
  );
}

describe("ProviderButtons", () => {
  it("renders a button for every provider", () => {
    useValidateAuthorization.mockReturnValue({ data: { isSuccess: false } });
    renderProvider();
    expect(screen.getByText("Continue with GitHub")).toBeInTheDocument();
    expect(screen.getByText("Continue with GitLab")).toBeInTheDocument();
    expect(screen.getByText("Continue with Bitbucket")).toBeInTheDocument();
    expect(screen.getByText("Continue with Azure DevOps")).toBeInTheDocument();
    expect(screen.getByText("Continue with AWS CodeCommit")).toBeInTheDocument();
  });

  it("persists the destination in localStorage", () => {
    useValidateAuthorization.mockReturnValue({ data: { isSuccess: false } });
    renderProvider();
    expect(localStorage.getItem("destination")).toBe("/dest");
  });

  it("calls onClose when github is already authorized", async () => {
    const onClose = vi.fn();
    useValidateAuthorization.mockReturnValue({ data: { isSuccess: true } });
    renderProvider({ onClose });
    await userEvent.click(screen.getByText("Continue with GitHub"));
    expect(onClose).toHaveBeenCalledWith(true);
    expect(authenticateWithGithub).not.toHaveBeenCalled();
  });

  it("starts github authentication when not authorized", async () => {
    useValidateAuthorization.mockReturnValue({ data: { isSuccess: false } });
    renderProvider({ extraState: "state-x" });
    await userEvent.click(screen.getByText("Continue with GitHub"));
    expect(authenticateWithGithub).toHaveBeenCalledWith("state-x", "t1");
  });
});
