import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MaskedText } from "./masked-text";

describe("MaskedText", () => {
  it("masks the whole string by default", () => {
    const { container } = render(<MaskedText text="secret" />);
    expect(container.textContent).toBe("******");
  });

  it("reveals the first N characters", () => {
    const { container } = render(<MaskedText text="abcdef" showFirstN={2} />);
    // 2 visible + 4 masked
    expect(container.textContent).toBe("ab****");
  });

  it("reveals the last N characters", () => {
    const { container } = render(<MaskedText text="abcdef" showLastN={2} />);
    expect(container.textContent).toBe("****ef");
  });

  it("reveals both ends and masks the middle", () => {
    const { container } = render(<MaskedText text="abcdefgh" showFirstN={2} showLastN={2} />);
    // 2 + 4 masked + 2
    expect(container.textContent).toBe("ab****gh");
  });

  it("uses a custom mask character", () => {
    const { container } = render(<MaskedText text="abcd" char="#" />);
    expect(container.textContent).toBe("####");
  });

  it("uses the explicit length to pad the mask beyond text length", () => {
    const { container } = render(<MaskedText text="ab" length={6} showFirstN={2} />);
    // firstVisible "ab" + masked count = 6 - 2 - 0 = 4
    expect(container.textContent).toBe("ab****");
  });

  it("never produces a negative mask count", () => {
    const { container } = render(<MaskedText text="ab" showFirstN={5} showLastN={5} />);
    expect(container.textContent).toBe("abab");
  });
});
