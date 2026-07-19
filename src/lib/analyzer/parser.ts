import path from "node:path";
import ts from "typescript";
import type { CodeLocation } from "../../types/api";

export type ParsedImport = {
  specifier: string;
  line: number;
};

export type ParsedSymbol = {
  name: string;
  location: CodeLocation;
};

export type ParsedSourceFile = {
  absolutePath: string;
  relativePath: string;
  imports: ParsedImport[];
  components: ParsedSymbol[];
  serviceFunctions: ParsedSymbol[];
  entryPoint: boolean;
};

function scriptKindFor(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function hasJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function locationFor(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  file: string,
  functionName?: string,
): CodeLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    file,
    lineStart: start.line + 1,
    lineEnd: end.line + 1,
    functionName,
  };
}

export function parseRelativeImports(source: string, filePath = "source.tsx"): ParsedImport[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const imports: ParsedImport[] = [];

  const addImport = (specifier: string, node: ts.Node) => {
    if (!specifier.startsWith(".")) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    imports.push({ specifier, line: position.line + 1 });
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addImport(node.moduleSpecifier.text, node);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      if (
        (ts.isIdentifier(node.expression) && node.expression.text === "require") ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        addImport(node.arguments[0].text, node);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

export function detectReactComponents(source: string, filePath: string): ParsedSymbol[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const components: ParsedSymbol[] = [];
  const seen = new Set<string>();
  const add = (name: string, node: ts.Node) => {
    if (!/^[A-Z][A-Za-z0-9_$]*$/.test(name) || seen.has(name) || !hasJsx(node)) return;
    seen.add(name);
    components.push({ name, location: locationFor(sourceFile, node, filePath, name) });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      add(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      add(node.name.text, node);
    } else if (ts.isClassDeclaration(node) && node.name) {
      const extendsReactComponent = node.heritageClauses?.some((clause) =>
        clause.types.some((type) => /(?:React\.)?(?:Pure)?Component/.test(type.getText(sourceFile))),
      );
      if (extendsReactComponent) add(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return components;
}

export function detectServiceFunctions(source: string, filePath: string): ParsedSymbol[] {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const serviceModule = /(^|\/)(services?|api|clients?)(\/|$)/i.test(normalizedPath);
  if (!serviceModule) return [];

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const functions: ParsedSymbol[] = [];
  const seen = new Set<string>();
  const add = (name: string, node: ts.Node) => {
    if (seen.has(name)) return;
    seen.add(name);
    functions.push({ name, location: locationFor(sourceFile, node, filePath, name) });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      add(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      add(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return functions;
}

export function detectEntryPoint(source: string, filePath: string): boolean {
  const basename = path.basename(filePath).toLowerCase();
  return (
    /^(main|index)\.(?:[cm]?[jt]sx?)$/.test(basename) &&
    /\b(?:createRoot|hydrateRoot|ReactDOM\.render|render)\s*\(/.test(source)
  );
}

export function parseSourceFile(
  source: string,
  absolutePath: string,
  relativePath: string,
): ParsedSourceFile {
  return {
    absolutePath,
    relativePath,
    imports: parseRelativeImports(source, relativePath),
    components: detectReactComponents(source, relativePath),
    serviceFunctions: detectServiceFunctions(source, relativePath),
    entryPoint: detectEntryPoint(source, relativePath),
  };
}
