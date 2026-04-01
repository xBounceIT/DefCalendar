import React from "react";

interface SafeHtmlBodyProps {
  html: string;
}

const BLOCKED_HTML_TAGS = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
]);

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function renderSafeHtmlNodes(value: string): (React.JSX.Element | string)[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  if (typeof DOMParser !== "function") {
    return [trimmedValue];
  }

  const parsed = new DOMParser().parseFromString(trimmedValue, "text/html");
  const rootNodes = [...parsed.body.childNodes];
  return rootNodes
    .map((node, index) => toSafeHtmlNode(node, `safe-html-${index}`))
    .filter((node): node is React.JSX.Element | string => node !== null);
}

function toSafeHtmlNode(node: Node, key: string): null | React.JSX.Element | string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (BLOCKED_HTML_TAGS.has(tag)) {
    return null;
  }

  const children = [...element.childNodes]
    .map((childNode, index) => toSafeHtmlNode(childNode, `${key}-${index}`))
    .filter((childNode): childNode is React.JSX.Element | string => childNode !== null);

  if (!ALLOWED_HTML_TAGS.has(tag)) {
    if (children.length === 0) {
      return null;
    }

    return <React.Fragment key={key}>{children}</React.Fragment>;
  }

  if (tag === "br" || tag === "hr") {
    return React.createElement(tag, { key });
  }

  if (tag === "a") {
    const href = sanitizeRenderedLink(element.getAttribute("href"));
    if (!href) {
      if (children.length === 0) {
        return null;
      }

      return <React.Fragment key={key}>{children}</React.Fragment>;
    }

    return (
      <a
        className="notes-html-link"
        href={href}
        key={key}
        rel="noreferrer noopener"
        target="_blank"
      >
        {children}
      </a>
    );
  }

  if (tag === "table") {
    return (
      <div className="notes-html-table-scroll" key={key}>
        <table>{children}</table>
      </div>
    );
  }

  return React.createElement(tag, { key }, children);
}

function sanitizeRenderedLink(value: null | string): null | string {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function SafeHtmlBody({ html }: SafeHtmlBodyProps): React.JSX.Element | null {
  const renderedNodes = renderSafeHtmlNodes(html);
  if (renderedNodes.length === 0) {
    return null;
  }

  return <>{renderedNodes}</>;
}

export default SafeHtmlBody;
