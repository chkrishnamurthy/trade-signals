import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository's own source, read from disk, for the architecture guards.
 *
 * The guards used to shell out to `git grep` and treat any failure as "no
 * matches" — so where git is not on the PATH they passed without having looked
 * at a single file. Walking the tree needs nothing but Node, and a guard that
 * finds no files fails instead of passing (see `expectSourceTree`).
 */

export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Folders that hold no source of ours: dependencies, build output, docs. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'docs',
  'android',
  'storybook-static',
]);

const SOURCE_FILE = /\.(ts|tsx|js|mjs|yaml)$/;

/** Comment lines. Prose explaining a rule must not trip the rule. */
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

function walk(dir: string, base: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) return [];
      return walk(join(dir, entry.name), rel);
    }
    return entry.isFile() && SOURCE_FILE.test(entry.name) ? [rel] : [];
  });
}

/** Every source file, as repo-relative paths with forward slashes. Tests included. */
export const ALL_FILES: readonly string[] = walk(REPO_ROOT, '');

interface SourceFile {
  readonly file: string;
  readonly lines: readonly string[];
}

/** Product code: every source file except the tests. */
const CODE_FILES: readonly SourceFile[] = ALL_FILES.filter(
  (file) => !file.endsWith('.test.ts'),
).map((file) => ({
  file,
  lines: readFileSync(join(REPO_ROOT, file), 'utf8').split(/\r?\n/),
}));

/** How many product files the guards read. A guard asserts this is not zero. */
export const CODE_FILE_COUNT = CODE_FILES.length;

export interface Hit {
  readonly file: string;
  readonly line: number;
}

/** Lines of actual code (comments skipped) matching `pattern`, in files `only` accepts. */
export function codeHits(pattern: string, only: (file: string) => boolean = () => true): Hit[] {
  const regex = new RegExp(pattern);
  const hits: Hit[] = [];
  for (const { file, lines } of CODE_FILES) {
    if (!only(file)) continue;
    lines.forEach((code, index) => {
      if (!COMMENT.test(code) && regex.test(code)) hits.push({ file, line: index + 1 });
    });
  }
  return hits;
}
