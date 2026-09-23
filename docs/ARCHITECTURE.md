# Architecture

How the pieces fit, and the two rules that explain most of the decisions.

---

## The two rules

### Store what happened, derive what is true

Anything computable is computed on read. Examples in the codebase:

| Stored | Derived from it |
|---|---|
| `xp` | operator level (capped by the plan), job title, growth phase, which apps are unlocked |
| the server's service state | whether a user's mapped drive is connected |
| `day` + `used` | how many tickets are left in the shift, when the next one starts |
| the ledger a run writes | everything the instructor console shows |

The failure this prevents is two screens disagreeing. Most of this project's real
bugs were exactly that: a level stored at award time while three other screens
recomputed it, a job title written once at seed and never again, a plan's growth
phase kept as a second constant beside the level cap. Each was invisible in review
because the names differed.

### One model, many surfaces

The terminal, the Windows GUI, the directory console, the firewall appliance and
the win-condition grader all read and write one `InfrastructureState`. If two
views can disagree about a fact, that is a bug in the model, not a display issue.

---

## Layers

```
lib/core/         domain types + pure logic. No React, no stores.
lib/org/          deterministic world generation from a seed
lib/infra/        the single mutable store; every surface writes through it
lib/tickets/      scenario library + the factory that binds them to a world
lib/vm/           sandboxed Linux interpreter, Windows Update model
lib/progression/  levels, unlocks, skill tracks, standing
lib/platform/     plans, entitlements, shift allowance
lib/persistence/  save slot, schema versioning, migrations
components/host/  DeskOS shell: window manager, taskbar, apps
components/host/remote/  nested RDP/SSH sessions
app/              routes: landing, /desktop, /admin, /org, /pricing
```

The dependency direction is one-way: `core` knows nothing about stores, stores
know nothing about components. That is what lets the spec suite run the whole
model layer on bare Node.

---

## World generation

`generateWorld(seed, phase)` is a pure function. Same seed, same estate, down to
the IP addresses and the staff names. Four growth phases scale it:

| Phase | Staff | Nodes | Racks |
|---|---|---|---|
| 1 · Startup | 35 | 33 | 1 |
| 2 · Small business | 150 | 118 | 1 |
| 3 · Mid-market | 300 | 225 | 2 |
| 4 · Enterprise | 450 | — | — |

Most workstations carry a `fleet-endpoint` tag that keeps them off the Remote
Gateway list — a gateway listing 216 desktops is not a tool. They are reached the
way a real desk reaches them: through the directory, per person
(`endpointForUser`), which is also the mapping the Directory Console's Remote
Connect uses.

---

## The ticket pipeline

```
ticketLibrary(infra)          hand-written matrix + procedural families, cached per seed
        │
        ▼
generateTicketQueue(infra, level)
        │   filters by unlocked tiers and by templateMinLevel(tags)
        ▼
buildTicket(template, infra, rng)
        │   makeContext → bind, or null and skip
        │   nextTicketCode() → TCK-nnnn
        ▼
applyQueueFaults(infra, faults)   injectFault mutates a draft
        │
        ▼
TicketReconciler (1 Hz)      calls win(infra, ctx); resolves, scores, awards XP
```

The reconciler grades from live state on a timer. Nothing tells it what you did.

---

## State

Zustand stores, each with one job:

| Store | Holds |
|---|---|
| `useInfraStore` | the estate — the big one |
| `useTicketStore` | the queue, filters, mail threads |
| `useHostStore` | desktop shell, windows, operator record |
| `useDialogueStore` | conversations, emotion, CSAT |
| `useSlaStore` | a shared 1 Hz clock; the only ticking thing |
| `useEntitlementStore` | plan and shift counter |

`useSlaStore` deserves a note: one clock drives every countdown in the product.
Components that need minute resolution subscribe to a minute-bucketed selector so
they re-render once a minute rather than once a second.

---

## Persistence

One `localStorage` slot, schema-versioned. Reading it distinguishes four
outcomes — empty, current, migratable, unreadable — which sounds obvious and was
not: for a long time all four returned `null`, so a save written by an older build
was treated as "no save" and overwritten by the autosave four seconds later.

Now: forward migrations walk a save up one version at a time, and anything that
cannot be walked is copied aside before the autosave can reach it, with the
operator told.

---

## The theme layer

Every colour resolves through a CSS custom property, and `tailwind.config.ts`
remaps the raw Tailwind families onto semantic ones — `amber` and `orange` are
both `warn`, `sky`/`blue`/`cyan`/`indigo` are all `info`. That gives correct
light-mode contrast everywhere without a per-component sweep.

The consequence is worth knowing before you pick a colour: **two different
Tailwind names can be the same paint.** `lib/ui/swatch.ts` resolves a class to its
token identity so a spec can assert that no two entries in a colour map render
alike — which they did, for six of eleven entries in the ticket queue's two
primary codings.

---

## Testing philosophy

`tests/rack-physics.mjs` is one file, no framework, run on bare Node after the
model layer is transpiled by the project's own `tsc`.

Beyond unit tests it asserts **properties**, several added after a bug that
everything else had passed through:

- no ticket is solved by its own injected fault
- every level-1 scenario binds on every seed tried, not just one
- no two entries of a colour map render identically
- endpoint work spreads across many machines, not one
- a transfer scenario fails if you grant new access without removing the old
- the free tier is never offered content a starter estate cannot host

The pattern worth copying: when a bug is found, ask what property would have made
it impossible, and assert that instead of the instance.
