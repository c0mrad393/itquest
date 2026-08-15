/**
 * Make the transpiled model modules runnable on bare node.
 *
 * TypeScript emits extensionless relative imports (`from "./rack"`), which the
 * browser bundler resolves happily and node's ESM loader does not. Rather than
 * litter the source with `.js` suffixes to satisfy a test harness, we fix the
 * OUTPUT — the source stays idiomatic and the spec still runs with no
 * dependencies.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".test-build";

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".js")) addExtensions(path);
  }
}

function addExtensions(path) {
  const src = readFileSync(path, "utf8");

  /*
   * TWO REWRITES, because the source uses two import styles.
   *
   * The core modules import each other relatively (`./poe`), and tsc emits
   * those extensionless — node's ESM loader needs the `.js`.
   *
   * Newer modules outside lib/core use the project's `@/lib/...` alias, which
   * tsc leaves verbatim because the bundler resolves it. Node has no idea what
   * `@/lib` is, so it has to become a real relative path here. Fixing the
   * OUTPUT keeps the source idiomatic — the alternative was forbidding the
   * alias in any file the spec might one day want to test, which is a rule
   * nobody would remember.
   */
  const depth = path.split("/").length - 2; // .test-build/<...>/file.js
  const upToRoot = depth <= 0 ? "./" : "../".repeat(depth);

  let fixed = src.replace(
    /(\bfrom\s+["'])@\/lib\/([^"']+?)(["'])/g,
    (_m, a, spec, b) => {
      // `@/lib/core` is a DIRECTORY with an index barrel, while
      // `@/lib/tickets/ambient` is a file. Resolved by asking the emitted
      // tree which one exists rather than by guessing from the shape of the
      // specifier — a rule based on dots or slashes breaks on the first
      // module that does not follow the convention.
      const asFile = join(ROOT, `${spec}.js`);
      const target = existsSync(asFile) ? `${spec}.js` : `${spec}/index.js`;
      return `${a}${upToRoot}${target}${b}`;
    },
  );

  fixed = fixed.replace(/(\bfrom\s+["'])(\.\.?\/[^"']+?)(["'])/g, (m, a, spec, b) =>
    spec.endsWith(".js") ? m : `${a}${spec}.js${b}`,
  );

  if (fixed !== src) writeFileSync(path, fixed);
}

walk(ROOT);
// Mark the tree as ESM so node reads the .js files as modules.
writeFileSync(join(ROOT, "package.json"), JSON.stringify({ type: "module" }));
