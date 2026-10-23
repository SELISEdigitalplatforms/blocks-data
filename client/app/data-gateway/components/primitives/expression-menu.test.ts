import { describe, expect, it } from "vitest";
import { insertAt } from "./expression-menu";

describe("insertAt", () => {
  it("adds to the end when the caret is unknown, spaced from the word before", () => {
    expect(insertAt("Dr.", "{{Employee.LastName}}", null)).toEqual({ text: "Dr. {{Employee.LastName}}", caret: 25 });
  });

  it("goes in at the caret, spaced on both sides only where needed", () => {
    expect(insertAt("Hi there", "{{Auth.Email}}", 2)).toEqual({ text: "Hi {{Auth.Email}} there", caret: 17 });
    expect(insertAt("Hi ", "{{Auth.Email}}", 3)).toEqual({ text: "Hi {{Auth.Email}}", caret: 17 });
    expect(insertAt("", "{{Auth.Email}}", 0)).toEqual({ text: "{{Auth.Email}}", caret: 14 });
  });
});
