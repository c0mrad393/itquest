# Contributing to ITQuest

Thanks for looking. This project is no longer actively developed by its author,
but it is maintained enough to accept good contributions, and it is designed so
that the most useful ones are also the easiest.

## The short version

```bash
npm install
npm run dev      # http://localhost:3000 → Launch lab → Skip sign-in
npm test         # typecheck + 1521 specs. Must pass before a PR.
```

## What is most wanted

1. **New scenarios.** Self-contained, no need to understand the whole codebase,
   and the thing that makes the project more useful to everyone.
   → [docs/SCENARIOS.md](docs/SCENARIOS.md)
2. **Making an existing subsystem actionable.** Several things are modelled and
   displayed but cannot be *changed* by the player — the hosts file, local users,
   per-node firewall rules. Each one you make editable unlocks several scenarios.
3. **Accessibility.** Icon-only buttons without accessible names, modals without
   `aria-modal` or an Escape handler. Small, high-value, easy to verify.
4. **Translations.** The UI strings are inline; a proper i18n pass would be a
   substantial and welcome contribution.

## House style

The code has a strong voice and it would be good to keep it.

- **No emoji anywhere in the product.** SVG icons from `components/ui/icons.tsx`,
  or typographic glyphs (`✓ ○ ⚠ ✕ ★`). This is a hard rule.
- **Semantic colour tokens**, not raw palette values. `text-danger-strong`, not a
  hex. Note that `amber` and `orange` are the *same* token — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-theme-layer).
- **Comments explain why.** The codebase is heavily commented and almost none of
  it describes what the line does — it records the decision, or the bug that
  shaped it. If you fix something subtle, leave the reason behind.
- **Derive, do not store.** If a value can be computed from another, compute it.
  See the first rule in the architecture doc.
- **Strict TypeScript.** No `any`, no `@ts-expect-error` without a note.

## Tests

`npm test` runs `tsc --noEmit` and the spec suite. Both must be green.

The suite has no framework — it is one file that runs on bare Node. To add a
case, follow the shape already there: `group("…")` then `eq(name, got, want)`.

When you fix a bug, prefer asserting the **property** that makes it impossible
over the instance that was wrong. Most of the existing specs came from exactly
that, and the commit messages say which bug each one came from.

## Pull requests

- One concern per PR.
- Say what was wrong and why the fix is right, not just what changed.
- Screenshots for anything visual — before and after if you are changing
  something that exists.
- If you touched a scenario, say how you verified it in the product, not only
  that the specs pass.

## Reporting bugs

Please include the growth phase and operator level, since almost everything is
gated by one or both. A world seed makes a report reproducible — the estate is a
pure function of it.

One trap worth knowing: **hot-reload staleness produces convincing phantom
errors.** Before reporting a `ReferenceError`, reload in a fresh tab. It cost the
author several false reports.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

Contributions are accepted under the [MIT Licence](LICENSE).
