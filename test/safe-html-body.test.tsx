// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import SafeHtmlBody from "../src/renderer/src/components/safe-html-body";

afterEach(cleanup);

function renderHtml(html: string): HTMLElement {
  const { container } = render(<SafeHtmlBody html={html} />);
  return container;
}

describe("safeHtmlBody — allowed content", () => {
  it("renders allowed inline tags", () => {
    const container = renderHtml("<p>Hello <b>bold</b> and <em>emph</em>.</p>");
    expect(container.querySelector("p")?.textContent).toBe("Hello bold and emph.");
    expect(container.querySelector("b")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("emph");
  });

  it("renders headings, lists, code, and pre blocks", () => {
    const container = renderHtml(
      "<h1>Title</h1><ul><li>A</li><li>B</li></ul><pre><code>x()</code></pre>",
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("pre code")?.textContent).toBe("x()");
  });

  it("self-renders <br> and <hr>", () => {
    const container = renderHtml("<p>line1<br>line2<hr></p>");
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("wraps tables in a scrollable div", () => {
    const container = renderHtml(
      "<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>",
    );
    const wrapper = container.querySelector("div.notes-html-table-scroll");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("table")).not.toBeNull();
    expect(wrapper?.querySelector("td")?.textContent).toBe("D");
  });
});

describe("safeHtmlBody — blocked tags", () => {
  it("removes script tags entirely", () => {
    const container = renderHtml('<p>before</p><script>alert("xss")</script><p>after</p>');
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("before");
    expect(container.textContent).toContain("after");
    expect(container.textContent).not.toContain("alert");
  });

  it("removes iframes, objects, and embeds", () => {
    const container = renderHtml(
      '<iframe src="evil.html"></iframe><object data="x"></object><embed src="y">',
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("object")).toBeNull();
    expect(container.querySelector("embed")).toBeNull();
  });

  it("removes style, link, meta, base, noscript, and svg", () => {
    const container = renderHtml(
      '<style>body{}</style><link rel="x" href="y"><meta charset="utf-8"><base href="/"><noscript>fallback</noscript><svg><circle/></svg><p>kept</p>',
    );
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("link")).toBeNull();
    expect(container.querySelector("meta")).toBeNull();
    expect(container.querySelector("base")).toBeNull();
    expect(container.querySelector("noscript")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("kept");
  });

  it("does not propagate inline event handlers to rendered DOM", () => {
    const container = renderHtml('<p onclick="alert(1)">click</p>');
    const paragraph = container.querySelector("p");
    expect(paragraph).not.toBeNull();
    expect(paragraph?.getAttribute("onclick")).toBeNull();
  });

  it("renders unknown tags' children inline via Fragment", () => {
    const container = renderHtml("<custom-thing><span>inner</span></custom-thing>");
    expect(container.textContent).toBe("inner");
    expect(container.querySelector("custom-thing")).toBeNull();
  });
});

describe("safeHtmlBody — link sanitization", () => {
  it("renders http and https links with secure attributes", () => {
    const container = renderHtml('<a href="https://example.com">ok</a>');
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("preserves mailto: and tel: schemes", () => {
    const mailto = renderHtml('<a href="mailto:a@b.com">mail</a>').querySelector("a");
    expect(mailto?.getAttribute("href")).toBe("mailto:a@b.com");

    const tel = renderHtml('<a href="tel:+15551234">tel</a>').querySelector("a");
    expect(tel?.getAttribute("href")).toBe("tel:+15551234");
  });

  it("strips javascript: and data: URLs", () => {
    const evil = renderHtml('<a href="javascript:alert(1)">click</a>');
    expect(evil.querySelector("a")).toBeNull();
    expect(evil.textContent).toBe("click");

    const data = renderHtml('<a href="data:text/html,<script>1</script>">x</a>');
    expect(data.querySelector("a")).toBeNull();
  });

  it("strips relative and protocol-relative URLs", () => {
    const relative = renderHtml('<a href="/secret">x</a>');
    expect(relative.querySelector("a")).toBeNull();

    const protocolRelative = renderHtml('<a href="//evil.com">x</a>');
    expect(protocolRelative.querySelector("a")).toBeNull();
  });

  it("collapses anchors with empty or whitespace href to fragment", () => {
    const empty = renderHtml('<a href="">label</a>');
    expect(empty.querySelector("a")).toBeNull();
    expect(empty.textContent).toBe("label");

    const whitespace = renderHtml('<a href="   ">label</a>');
    expect(whitespace.querySelector("a")).toBeNull();
  });

  it("removes anchor entirely when href is unsafe and there are no children", () => {
    const container = renderHtml('<p>before<a href="javascript:void(0)"></a>after</p>');
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("beforeafter");
  });
});

describe("safeHtmlBody — empty and edge inputs", () => {
  it("renders nothing for empty string", () => {
    const { container } = render(<SafeHtmlBody html="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for whitespace-only input", () => {
    const { container } = render(<SafeHtmlBody html={"   \n\t  "} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders plain text content (no markup) as a text node", () => {
    const container = renderHtml("just words");
    expect(container.textContent).toBe("just words");
  });
});
