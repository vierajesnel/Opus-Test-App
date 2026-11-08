/**
 * Code that runs on the UI thread must be made of worklets: calling a plain
 * JS function from a worklet crashes on device, but works fine on web and in
 * Jest. That makes it the one class of bug our other tests cannot see, so we
 * check it statically: every function in a UI-thread module must open with
 * the 'worklet' directive, and expression-bodied arrows (which cannot carry
 * one) are forbidden.
 *
 * The worklet compiler also snapshots a function's free variables at the
 * moment the function is defined, so a worklet that calls another worklet
 * declared *later* in the same module captures `undefined`. Hoisting hides
 * this everywhere except the UI thread, so we forbid it here too.
 */
import { parse } from '@babel/parser';
import traverse, { type NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const UI_THREAD_DIRS = ['src/engine', 'src/render/worklets', 'src/game/worklets'];

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.join(abs, e.name));
}

type FnNode = t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;

function violations(file: string): string[] {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const found: string[] = [];
  const check = (p: NodePath<FnNode>) => {
    const node = p.node;
    const line = node.loc?.start.line ?? 0;
    const name = (node.type !== 'ArrowFunctionExpression' && node.id?.name) || '<anonymous>';
    if (node.body.type !== 'BlockStatement') {
      found.push(`${path.relative(ROOT, file)}:${line} ${name} is an expression-bodied arrow`);
      return;
    }
    const isWorklet = node.body.directives.some((d) => d.value.value === 'worklet');
    if (!isWorklet) found.push(`${path.relative(ROOT, file)}:${line} ${name} lacks 'worklet'`);
  };
  // @babel/traverse ships as CJS with a default export under interop.
  const walk = (traverse as unknown as { default?: typeof traverse }).default ?? traverse;
  walk(ast, {
    FunctionDeclaration: check,
    FunctionExpression: check,
    ArrowFunctionExpression: check,
  });
  found.push(...forwardReferences(ast, file));
  return found;
}

/** Top-level functions referenced from a function declared before them. */
function forwardReferences(ast: t.File, file: string): string[] {
  const declaredAt = new Map<string, number>();
  for (const stmt of ast.program.body) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' && stmt.declaration ? stmt.declaration : stmt;
    if (decl.type === 'FunctionDeclaration' && decl.id) {
      declaredAt.set(decl.id.name, decl.start ?? 0);
    }
  }
  const found: string[] = [];
  const walk = (traverse as unknown as { default?: typeof traverse }).default ?? traverse;
  walk(ast, {
    Identifier(p) {
      const target = declaredAt.get(p.node.name);
      if (target === undefined || !p.isReferencedIdentifier()) return;
      const owner = p.findParent((q) => q.isFunction() && q.parentPath?.isProgram() === true)
        ?? p.findParent((q) => q.isFunction() && q.parentPath?.isExportNamedDeclaration() === true);
      if (!owner || (owner.node.start ?? 0) > target) return;
      const line = p.node.loc?.start.line ?? 0;
      found.push(`${path.relative(ROOT, file)}:${line} uses ${p.node.name} before it is defined`);
    },
  });
  return found;
}

describe('UI-thread modules', () => {
  const files = UI_THREAD_DIRS.flatMap(sourceFiles);

  it('finds the modules it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s marks every function as a worklet',
    (_rel, file) => {
      expect(violations(file)).toEqual([]);
    },
  );
});
