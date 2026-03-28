import { describe, expect, it } from "vitest";
import { extractPlainTextFromGraphHtml } from "../src/main/graph/calendar-service";

describe("graph calendar service body conversion", () => {
  it("returns null for empty input", () => {
    expect(extractPlainTextFromGraphHtml()).toBeNull();
    expect(extractPlainTextFromGraphHtml("")).toBeNull();
  });

  it("drops script content even with malformed closing tags", () => {
    expect(extractPlainTextFromGraphHtml('<script>alert(1)</script foo="bar"><p>Agenda</p>')).toBe(
      "Agenda",
    );
  });

  it("does not double-unescape HTML entities", () => {
    expect(extractPlainTextFromGraphHtml("<p>&amp;quot; &amp;lt; &amp;amp;</p>")).toBe(
      "&quot; &lt; &amp;",
    );
  });

  it("keeps common formatting readable as plain text", () => {
    expect(
      extractPlainTextFromGraphHtml(
        "<p>Hello&nbsp;team</p><p>Line <strong>two</strong><br>Line three</p>",
      ),
    ).toBe("Hello team\n\nLine two\nLine three");
  });

  it("preserves readable plain text content", () => {
    expect(extractPlainTextFromGraphHtml("Already plain text")).toBe("Already plain text");
  });
});
