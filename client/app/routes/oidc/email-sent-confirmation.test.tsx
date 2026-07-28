import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@blocks-idp/authentication/pages/oidc/email-sent-confirmation/email-sent-confirmation",
  () => ({
    OidcEmailConfirmation: ({ email }: { email: string }) => (
      <div>email:{email}</div>
    ),
  }),
);

import OidcEmailSentConfirmationPage from "./email-sent-confirmation";

describe("oidc/email-sent-confirmation OidcEmailSentConfirmationPage", () => {
  it("forwards the email query param to the confirmation screen", () => {
    render(
      <MemoryRouter initialEntries={["/oidc/email-sent?email=a@b.com"]}>
        <OidcEmailSentConfirmationPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("email:a@b.com")).toBeInTheDocument();
  });

  it("defaults the email to an empty string when absent", () => {
    render(
      <MemoryRouter initialEntries={["/oidc/email-sent"]}>
        <OidcEmailSentConfirmationPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("email:")).toBeInTheDocument();
  });
});
