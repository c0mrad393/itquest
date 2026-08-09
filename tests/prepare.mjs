/**
 * Make the transpiled model modules runnable on bare node.
 *
 * TypeScript emits extensionless relative imports (`from "./rack"`), which the
 * browser bundler resolves happily and node's ESM loader does not. Rather than
 * litter the source with `.js` suffixes to satisfy a test harness, we fix the
 * OUTPUT — the source stays idiomatic and the spec still runs with no
 * dependencies.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
  const fixed = src.replace(/(\bfrom\s+["'])(\.\.?\/[^"']+?)(["'])/g, (m, a, spec, b) =>
    spec.endsWith(".js") ? m : `${a}${spec}.js${b}`,
  );
  if (fixed !== src) writeFileSync(path, fixed);
}

walk(ROOT);
// Mark the tree as ESM so node reads the .js files as modules.
writeFileSync(join(ROOT, "package.json"), JSON.stringify({ type: "module" }));
