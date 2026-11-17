import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import { loadTranslationFiles } from "./i18n-utils";

function mayPassCount(options: ts.Expression): boolean {
  if (ts.isStringLiteralLike(options)) {
    return false;
  }
  return (
    !ts.isObjectLiteralExpression(options) ||
    options.properties.some((property) => {
      const name = property.name;
      return (
        ts.isSpreadAssignment(property) ||
        (name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === "count")
      );
    })
  );
}

function findMissingMessages(root: string, messages: Record<string, string>): string[] {
  const missing: string[] = [];

  for (const file of readdirSync(root, { encoding: "utf8", recursive: true })) {
    if (!/\.tsx?$/.test(file)) {
      continue;
    }

    const source = ts.createSourceFile(
      file,
      readFileSync(join(root, file), "utf8"),
      ts.ScriptTarget.Latest,
    );
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const key = node.arguments[0];
        const isTranslation =
          (ts.isIdentifier(callee) && callee.text === "t") ||
          (ts.isPropertyAccessExpression(callee) &&
            callee.name.text === "t" &&
            ts.isIdentifier(callee.expression) &&
            callee.expression.text === "i18n");

        if (
          isTranslation &&
          key &&
          ts.isStringLiteralLike(key) &&
          !Object.hasOwn(messages, key.text) &&
          !(
            Object.hasOwn(messages, key.text + "_other") &&
            node.arguments.slice(1).some(mayPassCount)
          )
        ) {
          const { line } = source.getLineAndCharacterOfPosition(key.getStart(source));
          missing.push(file + ":" + (line + 1) + " " + key.text);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  return missing;
}

it("provides messages for literal renderer translation keys", () => {
  const { en } = loadTranslationFiles();
  const renderer = resolve(import.meta.dirname, "../src/renderer/src");

  expect(findMissingMessages(renderer, en)).toStrictEqual([]);
});
