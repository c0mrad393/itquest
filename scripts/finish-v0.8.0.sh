#!/usr/bin/env bash
# Finishes the v0.8.0 release: re-runs verification, then commits and pushes.
#
# WHY THIS EXISTS: the agent session that wrote v0.8.0 lost its shell (the
# working directory's inode was invalidated mid-session, after which every
# command failed on getcwd). All the code is on disk and was verified — tsc,
# 152/152 spec assertions, a clean production build and a live browser pass —
# but the commit never ran. This script does the rest from a fresh shell.
#
# Run from anywhere:  bash scripts/finish-v0.8.0.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "== typecheck =="
npx tsc --noEmit

echo "== spec =="
npm run test:physics

echo "== production build =="
npm run build >/dev/null && echo "compiled"

echo "== zero-emoji scan (the one check that did not get to run) =="
node -e '
const fs = require("fs"), path = require("path");
const roots = ["lib", "components", "app", "tests"];
const bad = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        for (const ch of line) {
          const cp = ch.codePointAt(0);
          // Emoji blocks only. Typographic dingbats (checkmarks, crosses) are
          // permitted by the project constraint and are used deliberately.
          if ((cp >= 0x1f000 && cp <= 0x1faff) || cp === 0xfe0f || cp === 0x2b50 || cp === 0x2705 || cp === 0x274c) {
            bad.push(`${p}:${i + 1} U+${cp.toString(16).toUpperCase()} ${ch}`);
          }
        }
      });
    }
  }
};
roots.forEach(walk);
console.log(bad.length ? bad.join("\n") : "zero-emoji clean");
if (bad.length) process.exit(1);
'

rm -rf .next .test-build

echo "== commit =="
git add -A
git reset -q .claude 2>/dev/null || true

git commit -q -F - <<'MSG'
Fictionalise the platform and deepen the directory

Every product a sysadmin would recognise now has a parody name, written
down in exactly one place (lib/core/branding.ts) so a screen cannot drift
back to a trademark: ServerOS by Macrohard, Enterprise Directory Services,
Centralized Fleet Policies, FleetShare, DeskOS. The parodies are
deliberately transparent — a learner should read "Enterprise Directory
Services" and know what their workplace calls it. The CONCEPTS are real
and keep their real behaviour.

Fleet Policies are the part worth simulating. Anyone can attach a setting
to a container; the skill is working out which of four policies won and
why the one you just edited did nothing. lib/core/policy.ts implements the
four real rules — scope, closest-wins, blocked inheritance, and enforced
links that ignore blocking and reverse precedence — and `resolveSetting`
returns the winning value AND the policy that supplied it, so tickets
grade the LINK rather than a value that might have arrived from elsewhere.

EDS gains the account lifecycle: create, disable, delete, reset with
force-change-at-next-login, unlock, and the job title / department /
manager attributes. Delete is refused while an account is still enabled —
that rule is the lesson, not the button.

Connect to Endpoint opens a support session on the machine that person
actually uses. The mapping is DERIVED from a hash of the logon name rather
than stored, because a third table joining several hundred accounts to a
fleet of endpoints would need keeping consistent through every hire,
leaver and growth milestone.

Five wiki articles teach the concepts under the fictional names: nested
groups, disable versus delete, policy inheritance and precedence, lockout
policy, and verifying a change on the user's own machine.

Save v23 -> v24.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG

echo "== push =="
git push origin main
git log --oneline -1
