import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import MfaLogsPage from "./mfa-logs";

describe("dashboard/mfa-logs MfaLogsPage", () => {
  it("redirects to the mfa tab of secret management", () => {
    render(
      <MemoryRouter initialEntries={["/services/mfa-logs"]}>
        <Routes>
          <Route path="/services/mfa-logs" element={<MfaLogsPage />} />
          <Route
            path="/services/secret-management"
            element={<div>secret-management</div>}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("secret-management")).toBeInTheDocument();
  });
});
