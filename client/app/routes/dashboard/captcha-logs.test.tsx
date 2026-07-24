import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import CaptchaLogsPage from "./captcha-logs";

describe("dashboard/captcha-logs CaptchaLogsPage", () => {
  it("redirects to the captcha tab of secret management", () => {
    render(
      <MemoryRouter initialEntries={["/services/captcha-logs"]}>
        <Routes>
          <Route path="/services/captcha-logs" element={<CaptchaLogsPage />} />
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
