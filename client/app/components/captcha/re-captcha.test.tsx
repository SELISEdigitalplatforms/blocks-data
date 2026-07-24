import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReCaptcha } from "./re-captcha";
import type { CaptchaRef } from "./index.type";

const originalGrecaptcha = window.grecaptcha;

afterEach(() => {
  window.grecaptcha = originalGrecaptcha;
  document.getElementById("blocks-recaptcha-script")?.remove();
});

describe("ReCaptcha", () => {
  it("renders the widget when grecaptcha is already available", () => {
    const render_ = vi.fn().mockReturnValue(42);
    const ready = vi.fn((cb: () => void) => cb());
    window.grecaptcha = { render: render_, ready, reset: vi.fn() } as never;
    const onVerify = vi.fn();
    render(<ReCaptcha siteKey="site-1" onVerify={onVerify} theme="dark" size="compact" />);
    expect(render_).toHaveBeenCalledTimes(1);
    const params = render_.mock.calls[0][1];
    expect(params.sitekey).toBe("site-1");
    expect(params.theme).toBe("dark");
    expect(params.size).toBe("compact");
    expect(params.callback).toBe(onVerify);
  });

  it("wires optional expired and error callbacks", () => {
    const render_ = vi.fn().mockReturnValue(1);
    window.grecaptcha = { render: render_, ready: (cb: () => void) => cb(), reset: vi.fn() } as never;
    const onExpired = vi.fn();
    const onError = vi.fn();
    render(<ReCaptcha siteKey="k" onVerify={vi.fn()} onExpired={onExpired} onError={onError} />);
    const params = render_.mock.calls[0][1];
    expect(params["expired-callback"]).toBe(onExpired);
    expect(params["error-callback"]).toBe(onError);
  });

  it("exposes an imperative reset that calls grecaptcha.reset with the widget id", () => {
    const reset = vi.fn();
    window.grecaptcha = {
      render: vi.fn().mockReturnValue(7),
      ready: (cb: () => void) => cb(),
      reset,
    } as never;
    const ref = createRef<CaptchaRef>();
    render(<ReCaptcha ref={ref} siteKey="k" onVerify={vi.fn()} />);
    ref.current?.reset();
    expect(reset).toHaveBeenCalledWith(7);
  });

  it("injects the grecaptcha script when it is not yet available", () => {
    window.grecaptcha = undefined;
    render(<ReCaptcha siteKey="k" onVerify={vi.fn()} />);
    const script = document.getElementById("blocks-recaptcha-script") as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.src).toContain("recaptcha/api.js");
  });
});
