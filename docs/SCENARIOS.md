# Writing a scenario

A scenario is one kind of thing that can go wrong in the estate, and the way it
is judged fixed. This is the most valuable thing you can contribute, and it is
deliberately small: most families are 60–120 lines and touch one file.

---

## The idea in one paragraph

You do **not** script a solution. You bind to real assets in the generated world,
break something, and write a function that reads the world and says whether it is
better. However the player gets there — GUI, terminal, directory console — the
same function decides. That is what makes multiple solutions work for free.

---

## The contract

Every scenario, hand-written or procedural, is a `TicketTemplate`:

```ts
{
  id, category, track, difficulty, severity, priority,
  slaDuration, responseSeconds, xpReward, personaId, tags, origin,

  /** Bind to this world. Return null if this estate cannot host the scenario. */
  makeContext: (infra: InfrastructureState, rng: Rng) => TicketDynamicContext | null,

  /** Break the world. Mutates a draft; the real state is never touched here. */
  injectFault?: (draft: InfrastructureState, ctx: TicketDynamicContext) => void,

  /** Read the world. True when the estate is actually fixed. */
  win: (infra: InfrastructureState, ctx: TicketDynamicContext) => boolean,

  title, description, requester, hints, summary,
}
```

### `makeContext` — bind, do not assume

```ts
makeContext: (infra, r) => {
  const hit = staffEndpoint(infra, r, "Spooler");
  if (!hit) return null;
  return {
    targetNodeId: hit.node.nodeId,
    targetHostname: hit.node.hostname,
    targetUserId: hit.user.samAccountName,
    targetUserName: hit.user.displayName,
    department: hit.user.department,
  };
}
```

Returning `null` means "this world cannot host this scenario", and the factory
quietly skips the template. That is correct behaviour — and it is also the single
easiest way to ship content that silently does not exist.

> **Filter first, then pick.** Never `pick()` an asset and then reject it with a
> guard. A starter estate has two workstations and one is a Mac; picking at random
> and rejecting the wrong answer makes your family unhostable half the time, with
> no error anywhere. Build the list of assets that *can* carry the ticket, then
> pick from that list. Three separate families had this bug.

### `injectFault` — break exactly one thing

```ts
injectFault: (draft, ctx) => {
  const n = draft.nodes[String(ctx.targetNodeId)];
  if (!n || n.os !== "windows") return;
  const svc = n.services.Spooler;
  if (!svc) return;
  svc.status = "Stopped";
  svc.pid = null;
}
```

### `win` — read the world, never the player

```ts
win: (infra, ctx) => {
  const n = infra.nodes[String(ctx.targetNodeId)];
  if (!n || n.os !== "windows") return false;
  const svc = n.services.Spooler;
  return !!svc && svc.status === "Running" && svc.startupType !== "Disabled";
}
```

Grade **what the complaint actually was**. If the user said "it keeps coming
back", a running-but-disabled service is not a fix — it is the same fault after
the next reboot. Accepting it teaches the wrong lesson.

---

## Procedural families

A family is a win-condition archetype crossed with variant axes, in
`lib/tickets/procedural.ts`:

```ts
{
  id: "gen-print-spooler",
  category: "System & Web Services",
  track: "helpdesk",
  tags: ["print", "service", "endpoint"],
  tiers: ["Tier_1_Easy", "Tier_2_Medium"],
  variants: 3,
  build: ({ rng, tier, id }) => base({ … }, tier, id, { /* the contract above */ }),
}
```

`variants × tiers` templates are minted. Vary the **constraint**, not the prose:
which service, which department, which subsystem. Two variants that differ only
in wording are filler.

Tiers are a real difficulty axis, not a number. A good Tier 2 is usually the same
complaint as its Tier 1 with the fault somewhere the symptom is not — the client
fix is the obvious first move and it fails, which is the lesson.

---

## Tags decide who ever sees your ticket

`tags` are not decoration. `lib/progression/unlocks.ts` maps them to the app the
scenario needs, and that app's unlock level becomes the ticket's minimum level.

```
"rack"      → Datacenter Floor (level 5)
"hardware"  → Hardware Lab     (level 3)
"congestion"→ Edge Gateway     (level 2)
"shares"    → Remote Gateway   (level 1)
```

The free tier caps at level 4. **A tag that maps to a level-5 app puts your
scenario permanently out of reach for free players** — which may be exactly right
for a datacentre scenario, and exactly wrong for a helpdesk one. Choose
deliberately.

---

## Before you open the PR

```bash
npm test
```

The suite will already check a lot about your scenario automatically:

- it binds to a starter estate, on **every** random seed tried — not just one
- it is **not** already solved by its own injected fault
- if it is level 1, it keeps the first-shift breadth properties true

Then look at it in the product:

1. `npm run dev`, launch the lab, skip sign-in
2. Open **DevTools** in the taskbar → **Tickets** → search your family → spawn it
3. Solve it the way you expect a player to
4. Solve it a *different* way and check it still closes

Finally open `/admin/library` and find your family. It should say **Ready** on the
estates you intend it for. "Cannot bind" or "Binds sometimes" means it is not
finished.

---

## Things that make a scenario good

- **One clear fault with an honest symptom.** The description should describe what
  a real person would report, not what is wrong.
- **A diagnosis worth making.** If the title says "restart the spooler", there is
  nothing to learn.
- **Rule-outs in the text.** "Other machines print fine" is what turns a guess
  into a deduction.
- **A fix that matches the complaint.** See the startup-type example above.
- **A named person where it is somebody's machine.** "Iris Takeda cannot print"
  is a better ticket than "Nothing prints from WS-430" — and finding her machine
  by finding her is the point.
