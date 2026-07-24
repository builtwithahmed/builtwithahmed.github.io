# NOTES

Log of what was tried and rejected, per MISSION_PLAN.md §0, so later phases
don't repeat dead ends. Newest entries at the top.

## 2026-07-24 — v1.2.1 determinism: seeded RNG, latch bugs, capture-freeze scope, AA floor

**Unseeded-RNG skyline trap.** environment.js's createHorizon() called
Math.random() directly for building placement/height — invisible in a
single session, but two fresh sessions at the identical scroll position
never rendered the same skyline. Math.random() can't be seeded, so this
wasn't a tunable parameter, it was a hard trap: any code path that feeds
persistent scene layout (as opposed to one-shot per-frame jitter) needs
its own seedable PRNG instance, not the global one. Grepped for every
other Math.random() call site before touching any of them — the rest
are all per-frame jitter that doesn't feed layout, so left untouched.
Fixed with a local mulberry32(HORIZON_SEED) instance inside
createHorizon() itself, scoped to that function only.

**HORIZON_SEED=2.** Seed choice was deliberately not mine to make — Ahmed
picks the skyline he composes best with. Rendered t=0.00 and t=0.24
desktop stills for 3 candidate seeds, held for his pick: seed 2. Marked
provisional in code (not "immutable") pending the full Step 6 capture
set — if any of the five desktop / two mobile frames it ships in
composes badly, it gets re-picked, not defended.

**Latch-vs-convergence: two instances, same shape.** Both were found by
demanding the byte-identity proof rather than trusting "looks the same":
drone.js's yaw only updates `if (speed > 0.15)` — below that threshold
rotation just stops being touched and holds whatever value it last had.
tower.js's frozen branch set scanRing.position.y but never
scanMat.opacity, so opacity held whatever the brief unfrozen startup
window left it at. Neither is a convergence problem (more wait time
doesn't fix either) and neither showed up as a numeric mismatch in
casual state inspection — both only surfaced by diffing __debugNDC()/
material state field-by-field between two sessions after every other
known source of drift was already eliminated. Fixed by forcing both to a
fixed resting value under captureFreeze instead of trusting whatever
session history left them at. Worth naming as a pattern: any state that
updates conditionally (`if (x > threshold)`) rather than every frame is a
latch-bug candidate, not just these two.

**Capture-freeze scope: the CSS grep undersold it.** The brief's own
starting hypothesis (STOP 1 amendment 3c) was CSS animation:/transition:
declarations — and grepping for those found real bugs (hud-blink,
decode-caret-blink, every one-shot transition). But fixing all of them
and re-running the proof still left ~8,757px of diff. The actual bulk of
the nondeterminism was JS-driven and invisible to that grep: rotor spin
(an unbounded rotation accumulator, easily the largest single
contributor), drone hover bob, tower scan/beacon/defect glow, and the
mission-map's waypoint-0 pulse (active even before T reaches the
mission-map act — a scoping bug independent of this task, caught as a
side effect). Lesson for next time a capture/gate script needs
determinism: grep the stylesheets, but don't stop there — anything
reading `time`/`performance.now()`/an rAF-accumulated value in a
per-frame update() is a candidate regardless of which layer it's in.

**~0.022% residual: SwiftShader AA floor, verified not assumed.** After
every fix above, two fresh sessions at t=0.24/1440x900 still differed by
282 of 1,296,000 px (0.022%), y=385-387 only. Numeric diff confirmed
every piece of inspectable state (drone position/rotation, all 6
component NDC positions, tower/horizon/map children) bit-identical
between sessions — the pixels differ with nothing upstream differing.
First pass wrongly called this "horizon silhouette antialiasing" off an
eyeballed crop, without proof. Correct method: captured a third session
with `__debugLayers.drone.visible = false` at the same settled state and
diffed actual pixel colors at the 282 coordinates against that render —
274/282 changed when the drone was hidden (confirmed drone body/rotor-
line edge, not horizon), the remaining 8 sit immediately adjacent and are
almost certainly the same AA gradient just under the match threshold. 0
of 282 fall inside any text or HUD rect (checked against precise
getBoundingClientRect() data). Same page re-screenshotted 3x:
byte-identical (rules out frame jitter). Same process, fresh page: still
differs (rules out process-level variance). Forced non-Vulkan SwiftShader
ANGLE backend: same ~0.02% magnitude (rules out that specific backend
flag as a fix). WEBGL_debug_renderer_info confirms SwiftShader/Subzero
(its JIT shader compiler) as the actual GL backend — a plausible source
of tiny floating-point shader-evaluation differences across separate
context/compilation instances, and outside application control. Treated
as the accepted determinism floor, not chased further.

## 2026-07-23 — v1.2 motion & text system: splines, decode.js, font A/B

**A. Continuous flight.** director.js's per-segment `smoothstep(uRaw)` before
every `lerp3` had zero derivative at both ends of its own [0,1] domain —
and that domain WAS one keyframe segment, so velocity hit exactly zero at
every keyframe. Replaced cam/look/drone sampling with one
`CatmullRomCurve3` per channel (`curveType: 'centripetal'`, three's own
default, passed explicitly), built from every keyframe's position in
array order.

The curve's `getPoint(u)` parameterizes `u` *uniformly by control-point
index* (three.js: `p = (points.length-1)*u`), not by each keyframe's real
`t` — this rig's keyframe spacing is deliberately uneven (teardown
lingers, mission-map cruises, `t=0.20->0.22` is a 0.02-wide segment right
next to `t=0.46->0.60` at 0.14 wide) and that unevenness *is* the hand-
tuned pacing. Sampling the curve directly with raw T would have silently
discarded all of it. Fix: `sampleKeyframes` keeps its existing t-bracket
search (segment index `i`, local fraction `uRaw`) and remaps into the
curve's own index-uniform space (`uCurve = (i + uRaw) / (KEYFRAMES.length
- 1)`) — real per-keyframe timing is preserved exactly, the curve only
supplies continuous SHAPE between the same points at the same T values
the old lerp used. Position sampling uses raw `uRaw`, not smoothstepped —
smoothstep is what caused the zero-derivative bug, so it had to come out
of the position path entirely (kept only for the unrelated mobileGap/
mobileLook scalar blends, which weren't part of the bug).

Verification (both required by the brief, both actually run, not just
reasoned through):
- **NDC-at-exact-keyframe-t vs. pre-change baseline** (`__debugNDC`, all
  15 keyframe t's, both viewports): max diff 0.0285 without camera drift,
  0.0765 with drift active — both comfortably under the 0.1 budget, 0
  failures. Makes sense by construction (a Catmull-Rom curve passes
  through its own control points exactly at `uRaw=0/1`, same as the old
  lerp did at its segment boundaries) but measured anyway rather than
  assumed.
- **Continuous-scroll SPD sampling** (real wall-clock scroll in ~25ms
  steps, not jump-and-settle — jump-and-settle always reads SPD->0
  eventually regardless of interpolation method, since T stops changing
  once converged, so it can't distinguish the bug from correct behavior).
  Baseline showed a sharp V-shaped dip at literally every one of the 13
  intermediate keyframes (e.g. t=0.20: 0.9 -> 0.1 -> 1.1 m/s across a
  ~50ms window); the spline build showed no dip pattern anywhere across
  400 samples, SPD staying in a smooth 1.7-15.4 range through every same
  crossing. 0 samples read exactly 0.0 in either build within T(0.01,
  0.99) — the zero-hit was narrower than my 25ms sampling interval even
  in the old build, which is exactly why "0.0 in every capture" needed
  the *dip pattern*, not a literal zero count, as the diagnostic.

Camera drift: constant sine offset (±0.05, three different frequencies/
phases per axis so it doesn't read as a circular orbit) applied to
`camera.position` in main.js's tick — AFTER copying the damped `camPos`,
never written back into it, so it can't compound across frames or drag
the real damped trajectory off course. `lookAt` runs after the drift is
applied, so orientation naturally follows (gentle parallax, not a
separate look-at wobble). Disabled on reduced-motion.

**B. Text decode system.** New `src/hud/decode.js`: character scramble-to-
lock for headings/row titles (glyph set `A-Z0-9/|\_`, ~180ms/char,
stagger derived from a 600ms/line cap so long lines don't blow the
budget), terminal type-on + double-blink caret for eyebrows, per-line
stagger+blur (no scramble) for body copy, one shared 150ms opacity-out
exit for all three. All batched-per-rAF-frame (one `textContent` write
per animation frame regardless of line length, never one write per
character) and reduced-motion-instant.

Caught and fixed my own mistake before it shipped: first pass left
teardown/project/inspection/landing's eyebrow/h2/sub EMPTY at construction
time, populating them only when decode.js's activation fires. This is a
pure client-rendered SPA with no server fallback — MISSION_PLAN §7's "real
text must exist in DOM" can only mean *present once the page has loaded*,
since a crawler has to execute JS to see anything on this site at all, and
typically doesn't simulate scroll gestures. Gating section text behind a
scroll-triggered reveal would have made it invisible to any crawler that
doesn't scroll — a real SEO regression, and a worse outcome than the
plain-fade version this replaced. Fixed by keeping the real text baked
into the initial `innerHTML` (as it always was) and having decode.js's
functions treat that as a visual layer on top — they clear and rebuild an
element's contents to animate it, always ending on the exact text that
was already there.

Activation is edge-driven everywhere (content.js/callouts.js/
projectCallouts.js each track their own previous-visible boolean and only
call into decode.js on the false->true transition), never per scroll
frame, per the brief's own rule. content.js's block-level `setVisible`
also gained the 150ms fade-out on the falling edge — previously an
instant `display:none` cut with no exit at all.

gate.mjs's anti-emptiness check relaxed from requiring `.content-block`
opacity>=0.9 to just `display !== 'none'` — "a line counts as visible
from the moment its reveal starts," per the brief. Left the OVERLAP
check's own opacity>=0.9 threshold untouched (rect-collection for "does
this visually collide with the drone" should stay conservative; a
barely-visible mid-decode line isn't a meaningful collision surface the
same way a solid one is). In practice this pass's own architecture
(blocks jump straight to opacity:1 on activation; only their child TEXT
elements animate) meant the anti-emptiness check would have passed either
way, but the rule is now explicit rather than incidental.

**C. Font A/B.** `--font-display` was already a variable (no change
needed there). Took the Chakra Petch shot against the current committed
build, then temporarily edited `index.html` (added Rajdhani to the Google
Fonts URL, weights 600;700 — loaded 700 too even though the brief said
"600" specifically, so the existing `font-weight:700` heading rule
wouldn't force a synthesized/faux-bold render and skew the comparison)
and `tokens.css` (`--font-display: 'Rajdhani', sans-serif`), rebuilt,
captured the Rajdhani shot, then reverted both files. Rebuilt again and
confirmed the output bundle hash was byte-identical to the pre-experiment
build (`index-CmBc_qSv.js` both times) — proof the revert left zero trace
in the committed diff, not just an eyeballed one.

**Gate result:** build 154.44 kB gz (well under the 165 kB target, still
under v1.1-B's own budget despite the new spline/decode/drift code).
`npm run gate`: 0 overlap failures and 0 anti-emptiness failures across
both viewports, all 51 steps each — the overlap result specifically is
the brief's own named risk ("framing may shift") for the spline change,
and it's clean. 6 failures remain, all `type: overflow`, all mobile-only,
all the identical pre-existing residuals already documented in the
2026-07-22 entry below (teardown-block 349-357px vs. 346px budget,
inspection-block 351px vs. 346px) — unchanged in T-location and magnitude
by this pass's work, confirming decode.js's word-span DOM restructuring
renders pixel-identical to plain text once settled (as designed).

## 2026-07-23 — Flagged for next pass (live review after v1.1-B, not fixed yet)

Three real issues from live-site review, deliberately not fixed in the same
pass that flagged them — logging first so the next pass starts here instead
of rediscovering them:

1. **`scripts/gate.mjs`'s overlap check doesn't cover SVG leader lines**,
   only the DOM rects listed in its `rects` array (`.content-block`,
   `.callout-label.visible`, `.console-row.visible`) against drone
   component points. It has no notion of the `.callout-line`/
   `.project-callouts-svg` path geometry at all, so a leader line crossing
   a heading (confirmed on the live site, mobile t=0.30, a line crosses
   the "What I Work With" text) is structurally invisible to it — the same
   category of "the gate can't see this" gap the 2026-07-21 anti-emptiness
   entry describes for a different case. Needs either a point-sampled
   check along each line's `d` attribute against content rects, or a
   pixel-overlap read (`__debugSilhouetteOverlap`-style) restricted to the
   SVG layer.
2. **Mission-map waypoints are visible during the hero frame.** Live
   review, not yet measured against any keyframe/T range — likely the
   waypoint octahedrons (map.js) aren't gated to only fade in once the
   mission-map act's own camera framing is active, unlike callouts (which
   already window). Worth checking whether this is a `map.js` opacity/
   visibility gap or just the hero camera's FOV/position happening to
   catch waypoints placed along z -20..-36 that were never meant to be
   hero-visible. Consider an act-scoped fade tied to T, mirroring how
   dustRing/phase-readout are already gated to their own T windows rather
   than always rendering.
3. **Mobile landing camera shows only a sliver of Pad-B** at the T~0.97
   framing — the v1.1-B pass made the pad itself more visible
   (brighter ring, small emissive) but didn't touch the mobile camera
   framing/FOV for the landing beat, so more of the pad is now legible
   where it *is* on screen without changing how much of it fits in frame.
   This is a `director.js` mobile keyframe (`mobileLook`) or FOV concern,
   same category as the Amendment B mobile-framing work — likely needs the
   same per-keyframe empirical tuning against `__debugNDC`, not a quick
   CSS/material fix.

## 2026-07-23 — v1.1-B legibility pass: gate now permanent, caught and fixed 3 real pre-existing bugs

Five areas (teardown legibility, Pad-B visibility, global brightness, text
contrast/scrim, mobile row windowing) plus formalizing the overflow check
NOTES.md flagged as "not fixed, out of scope" on 2026-07-22 into a real,
committed `scripts/gate.mjs` (both viewports, 51 steps, run via `npm run
gate`) instead of a scratch script re-derived every pass.

**Emissive intensity alone can't fix "near-invisible" if the base emissive
color is near-black.** First attempt at teardown legibility (#1) only raised
`emissiveIntensity` on the exploded components' cloned materials
(+0.3 at full explode, per spec). Visually this did almost nothing —
`mats.dark`/`mats.body`'s own emissive colors (`0x0a1618`, `0x0f2226`) are so
close to black that even a higher multiplier on them stays close to black.
Fixed by ALSO lerping the emissive *color* toward a lit rim-tone
(`0x4f757c`, matching environment.js's fresnel rim color) as k ramps, not
just the intensity scalar — confirmed visually (t=0.24 desktop screenshot)
before/after, not just by the number changing. If a future "make X more
visible via emissive" request doesn't move the needle, check the base
emissive color before reaching for a bigger multiplier.

**Pad-B's brighter ring (#2) reintroduced the P2.6 hero-stain bug even
without emissive.** Re-tested against the exact P2.7 Stage 1 methodology
(behind-headline vs. side-region luminance, composer on) after adding a
small ring-only emissive — regression (~2.8x ratio, same magnitude as the
original bug). Removed the emissive, kept only the brighter base color —
ratio dropped but a direct screenshot still showed a visible soft teal oval
behind the headline; a composer-on/off comparison showed *zero* bloom
contribution to that ratio, proving it wasn't bloom at all. Reverted the
hero pad's ring/H color too, back to its exact pre-v1.1-B material — and
the oval was STILL faintly there. Isolated via `git stash` against the true
pre-v1.1-B build: baseline ratio 1.71 (never zero) — the residual glow is
the *existing, permanent, unrelated* vignette (post.js), which brightens
screen-center over screen-edges regardless of the pad. **Lesson: a plain
luminance-ratio check between two regions can't tell "bloom stain" from
"the vignette naturally brightens the middle" apart — always cross-check
composer-on vs. composer-off on the same rects (zero bloom contribution =
not a bloom stain) AND look at an actual screenshot, not just the number.**
End state: hero pad completely unchanged from pre-v1.1-B; only Pad-B (the
landing pad, a separate material instance) got the brighter color + ring
emissive — `createHelipad`'s new `brightPad` param defaults on, hero's call
site passes `false`.

**The new permanent gate (overlap + anti-emptiness + overflow, both
viewports) caught 3 real bugs immediately, none of them things v1.1-B's
own changes were about:**
1. **Hero overflows its own 32vh budget on desktop, ~305px vs 288px,
   present at every T 0.00-0.10.** Pre-existing since v1.1-A's 42ch line
   cap (2026-07-22) — that pass's own ad-hoc overflow check only ran
   *mobile*, so this shipped to production undetected. Root cause: 42ch
   wrapped the hero sub to a 4th line the budget can't afford. Fixed with a
   hero-specific `max-width: 58ch` (fits the same copy in 3 lines, like
   before 42ch existed) plus trimming the hero-only eyebrow/h1/.ctas
   margins and the block's own padding — none of it touches the
   services/landing subs 42ch was actually written for.
2. **`.project-block`'s mobile height override had zero effect** — the
   exact CSS-specificity trap this file already documents twice (the
   landing-block fix, 2026-07-21): `body[data-layout='stack']
   .project-block` (2 attr/class parts) loses to content.css's own
   `body[data-layout='stack'][data-side='R'] .content-block` (3 parts)
   regardless of source order. Selector had to match that exact shape.
   **Third time this trap has bitten a per-block override in this repo —
   worth grepping for `body[data-layout=` before adding any future one.**
3. **Teardown content (starts T=0.13, content.js) laid out under the
   *centered* 32vh budget instead of the L/R dock's much larger one for
   T 0.13-0.15**, because director.js's C->L focus flip happens at a
   keyframe segment's interpolation *midpoint* (T=0.15 for the
   [0.10,0.20] segment) — a timing gap the exact same shape as the one the
   2026-07-19 "Focus label timing" fix and the P2.6 fix already in this
   file both patched, just never checked against content.js's own T
   thresholds until this gate ran on desktop too. Fixed the same way as
   precedent: relabeled the t=0.10 keyframe C->L (numerics untouched) so
   the flip isn't needed inside this segment at all, rather than nudging
   the midpoint later again.
Also found: `body[data-layout='split'][data-side='C'] .hero-block`
overrides written *before* the generic C-rule of equal specificity
silently lost the cascade tie to it (whichever equal-specificity rule is
declared *last* wins) — moved below the generic rule to actually apply.

**6 minor overflow failures remain (mobile only, teardown-block and
inspection-block, 3-11px over a 346px budget) — not chased further.**
Same "diminishing returns once the real fix lands" call as Table D's
2026-07-19 precedent. Windowing (below) took inspection-block from up to
704px to 351px; the residual 5px is what's left of the h2 size bump
(v1.1-A) on an otherwise-fitting block.

**Mobile row windowing (#5):** services (content.js) had no windowing at
all — rows revealed and simply stayed visible for the rest of the act,
which was the actual root cause of the overflow flagged (not fixed) on
2026-07-22. Gave it the exact previous/active/next window
callouts.js/projectCallouts.js already use (`windowMin`/`windowMax` off
`bandIndex`, 2 visible mobile / 3 desktop) — same `.visible`/`.active`
CSS classes already drive the existing opacity/transform/max-height
transition, so no new instant pops. Project rows were already windowed
this way pre-v1.1-B; their overflow was `.project-block`'s CSS-specificity
bug (above), not a windowing gap.

## 2026-07-22 — v1.1-A typography/placement pass: gate clean, one pre-existing overflow surfaced (not fixed, out of scope)

Nine targeted fixes (email uppercase/@ collision, h2 scale+tracking+margin,
`--ink-dim-blurb` for body copy only, 42ch line caps, tag chip size, `.content-block
h2 { text-wrap: balance }`, mobile phase-readout/content-band suppression, landing-block
vertical nudge, unified `--content-inset` for HUD corners + left-docked content). Official
gate (build gz, verify, 51-step point-based overlap + anti-emptiness, both viewports) is
clean — 0 failures.

**A stricter check invented for this pass (not part of the official gate) found something
real but out of scope.** Added a `scrollHeight > clientHeight` clip check on top of the
official overlap/anti-emptiness gate, since #2 and #4 touch heading size and line length —
the things most likely to push content past its mobile budget. It flagged `project-block`
and `inspection-block` overflowing their 41vh (346px) mobile budget by up to ~360px at
T 0.78-0.86. Verified via `git stash` against the pre-pass build: **this already existed**
(baseline overflow up to ~337px at the same T values) — root cause is that `.console-row`/
project cards accumulate and stay visible for the rest of their act once revealed (no
windowing), unlike `callouts.js` which caps its visible window at 2-3 items specifically to
avoid this. The h2 size bump (item 2, explicitly requested) adds ~21px more on top of an
already-broken budget; capping `.console-row p`/`.callout-label p` at 42ch (item 4) measured
zero additional effect (rows were already narrower than 42ch on mobile). **Not fixed here** —
giving services/projects the same reveal-and-window treatment callouts.js already has is a
real scope item for a future pass, not a typography fix, and this pass's brief was
explicitly "not a redesign." Flagging the cost before committing to a fix, per the Amendment
B precedent below.

## 2026-07-21 — Back-half content pass: verification found 3 issues, all fixed

A first pass at back-half content (mission console, services terminal,
landing/contact — done via a different coding agent, then verified here)
built everything but shipped three real defects the existing gates didn't
catch, because none of them were a Rule-of-Empty-Half overlap:

1. **A literal dead frame at T 0.875-0.90.** The services terminal ends
   at T=0.87, the landing block starts at T~0.90 — nothing was scheduled
   in between. Confirmed by direct DOM inspection (zero visible
   `.content-block`, no `#phase-readout`), not just by eyeballing a
   screenshot. Fixed with a phase-readout beat ("RTL · PAD-B"). This
   is also why a **permanent anti-emptiness assertion** was added to the
   gate script pattern (not committed as a script, but every future gate
   run should include it): at every T step, assert at least one of
   {visible content-block, visible callout-label, visible console-row,
   phase-readout} is at opacity >= 0.9. Re-running this stricter check
   against the *whole* timeline (not just the new beat) surfaced two more
   sub-threshold dips at t=0.12 and t=0.44 that predate this phase
   entirely — same root cause, smaller, previously below what any prior
   gate checked for.
2. **Landing contact links clipped** — 2 of 4 on desktop, 3 of 4 on
   mobile — because the block was capped at the generic centered-act
   32vh/41vh budget while its real content needed roughly double that.
3. **The cap in #2 existed because of a silent rule violation**: the
   landing keyframes were labelled `focus:'C'` but a CSS override forced
   the block into a side dock anyway, invisibly, with no comment. The
   honest fix — relabel the keyframes so the layout matches what's
   actually drawn (see below), not raise a centered block's height until
   it collides with the 3D subject.

**Root-cause pattern for #1 (write this down, it will recur):** any beat
boundary where a phase-readout's fade-out ends exactly on the T value
where the next `.content-block` starts being drawn is a latent gap,
because damped `T` approaches a scroll target asymptotically and *never
exactly reaches it* (documented elsewhere in this file) — a screenshot
taken at nominal "t=0.90" may have actually converged to T=0.8991, just
under a `T >= 0.90` display threshold. The fix isn't a wider fade *inside*
the named span, it's padding the fade *outside* it: `{ from: to - FADE,
to: boundary + FADE }` so the plateau (both fade-in and fade-out clamp to
1) covers exactly the span that must read as solid, with the actual
crossfade happening entirely before/after. Applied to all three affected
beats (`hud/phase.js`).

**Focus-label semantics, restated because it's easy to get backwards:**
in this codebase, `focus:'L'` means the 3D subject is on the left and
content docks RIGHT; `focus:'R'` is the mirror. A request to "put the
drone on the right and dock content left" is `focus:'R'`, not `'L'` —
confirm against `content.css`'s `[data-side='L']`/`[data-side='R']`
rules before relabeling a keyframe, not by intuition about what L/R
"should" mean.

**CSS specificity trap when overriding a generic per-side rule:** the
first attempt at widening the mobile landing block's height budget used
`body[data-layout='stack'] .landing-block { max-height: 62vh; }` and had
*zero effect* — silently outweighed by content.css's own
`body[data-layout='stack'][data-side='L'] .content-block,
[data-side='R'] .content-block { max-height: 41vh; ... }`, which has
one more attribute selector and therefore wins the cascade regardless of
import order. Any override of a `[data-layout][data-side] .content-block`
rule must match that same selector shape — `[data-layout='stack']
[data-side='R'] .landing-block` — or it silently loses. Don't assume "my
rule loads later" is enough; check specificity first.

**Off-axis static geometry, not camera-angle-only framing, for a new
focus side:** to get the drone/Pad-B to project into the right half at
the new landing framing, Pad-B was moved off the world-x=0 centerline to
x=3.0 (main.js) — the same pattern the inspection tower already used
(x=-4.2) — rather than trying to fake the offset with camera angle alone
while the pad stayed centered. Verified empirically via
`__debugNDC().ndcX` at each keyframe (target: 0.05-0.9), not hand-derived
— consistent with every other framing decision in this file.

## 2026-07-21 — P2.7 Stage 2: a scene-wide light bump can't fix "this one object's" contrast

Ahmed's addendum to the Stage 2 gate: the takeoff frame (t=0.12) lost drone
contrast after Stage 1's ambient-floor raise — measured via a new
`__debugDroneContrast` hook (main.js, behind `?debug`) that reads mean
luminance inside the drone's projected bbox vs. a margin strip just outside
it (not a whole-frame or fixed-corner sample — see the P2.6 note below on
why fixed/whole-frame background sampling is unreliable in this scene).
Baseline: t=0.12 contrastDelta 2.70 (the weak point), t=0.55 4.30, t=0.85
4.08.

First attempt: raise the rim `DirectionalLight` 0.85 -> 1.2 (world.js).
Fixed t=0.12 (2.70 -> 4.42) but *dropped* t=0.85 (4.08 -> 2.88) — that
keyframe now has the new inspection tower (tower.js, this same phase)
sitting right next to the drone in frame, and the same directional light
relit the tower's ordinary `MeshStandardMaterial` faces too, raising the
"background" side of the measurement right along with the drone. **A
scene-wide light change can't distinguish "the drone" from "whatever's
near the drone right now" — it isn't a per-object control, and adding more
static geometry to the scene (map/tower) means there's more for it to
accidentally also relight.**

Reverted the light, instead gave the drone's `body`/`dark` materials
(drone.js) a small constant `emissive`/`emissiveIntensity: 0.5` — a
luminance floor that belongs to the drone's own materials, independent of
which way any light points or what's behind it that keyframe. Result: all
three improved with no cross-talk (t=0.12 2.70->4.87, t=0.55 4.30->5.02,
t=0.85 4.08->4.62). **When a lighting fix needs to target one specific
object's readability rather than the whole scene's, prefer a material
property on that object over a scene light — a light's effect is never
scoped to "just this thing," only a material change is.**

## 2026-07-20 — P2.6 (live review corrections): what the 11-step gate structurally can't catch

Ahmed's live scroll surfaced four real bugs the P2.5 gate's 11-step
screenshot sampling never saw, because each one only existed *between*
sampled points or only showed up under a specific (untested) toggle:

1. **The "dark red diagonal line."** `terrain.js`'s ground plane was
   `PlaneGeometry(240, 240, 1, 1)` — exactly two triangles meeting on one
   corner-to-corner diagonal. `gridLine()`'s `fwidth()`-based line
   thickness is a per-triangle screen-space derivative; at the seam, a
   2x2-pixel derivative sample straddling both triangles produced a
   spurious bright line, invisible in the raw render (confirmed by
   toggling `post.setEnabled(false)`) but amplified by UnrealBloomPass
   into a visible line — ACES tone mapping shifts blown highlights warm/
   red, which is where "red" came from on an otherwise cyan-only shader.
   Fixed by raising plane segments to 48x48 (spreads any seam artifact
   across many imperceptible edges instead of one long diagonal one). If
   a future ground/floor shader reintroduces a low-segment-count plane
   with a derivative-based line function, expect this again.
2. **The hero "stain."** The helipad ring/H-mark was emissive
   (`emissiveIntensity` was the whole point — "give bloom something to
   catch"). That's exactly backwards for anything meant to read as subtle
   ground texture under the hero scrim: bloom amplifies precisely the
   things you emissive-tag. Removed `emissive` entirely from the pad
   material; it now reads via ordinary key/rim lighting only. **Lesson:
   emissive is for actual light sources (LEDs, lens, active indicators),
   never for "make bloom notice this."**
3. **Nested scrollbar.** `overflow-y: auto` on content-block/callout-
   stack was a real second scroll surface once six callouts could be
   simultaneously laid out. Root fix was upstream: cap simultaneously-
   *rendered* (not just simultaneously-opaque) callouts via a real fade
   transition (opacity/transform/max-height, 250ms, `visibility: hidden`
   only after the fade completes) instead of instant `display:none`
   toggling — see `callouts.css`. All `overflow-y: auto` is gone;
   remaining `overflow: hidden` is a clip-only safety net, never a
   visible scrollbar.
4. **Section id / scroll-range mismatch.** Shortening the takeoff beat
   (0.16->0.13, see below) moved where teardown content actually starts
   displaying, but `layout.css`'s section min-heights (which is what
   controls where `#skills` etc. actually sit in the scroll) weren't
   touched. **Any time a T-threshold in director.js/content.js/
   callouts.js changes, check whether layout.css's section heights still
   proportion correctly against it** — they're two independent systems
   (content timing vs. scroll-length allocation) that have to be kept in
   sync by hand, nothing enforces it structurally.

Also found mid-fix, not part of Ahmed's original list: relabeling a
keyframe's `focus` from 'C' to 'L' (director.js t=0.20) closed 5 small
real overlaps between exploding components (battery, mostly) and
newly-earlier teardown content — the camera-hold-neutral keyframe was
tuned for mobile Table D reasons and kept its CSS-facing focus label at
'C' (centered/full-width layout) well past where content now needs to be
docked to a side. Confirmed via testing that only the `focus` *label*
needed to change, not the cam/look/drone numerics underneath.

**Gate methodology notes for next time:**
- The "real" overlap test needed ANOTHER revision. P2.5 moved from a
  Box3 proxy to a pixel-brightness-threshold canvas read. That flaked
  hard here too: Amendment D's drone-proximity terrain brightening made
  the *grid itself* cross a brightness threshold across large areas
  (up to ~30% of a mobile content rect), which isn't what the Rule of
  the Empty Half cares about at all. Landed on a **point-based test**:
  project the drone's own origin plus its 6 named components (already
  exposed via `__debugNDC().components`), and check whether any of those
  points — not a brightness threshold, not a bounding box — fall inside
  a visible content rect. This is the same methodology P2.5's Table E
  already vetted as trustworthy; it should be the default for any future
  "does the subject overlap this DOM region" check, not a threshold or a
  proxy shape.
- A background-luminance sample from a fixed screen corner is not
  reliable in this scene: `environment.js`'s horizon silhouettes/beacons
  are placed with `Math.random()` per page load, so a fixed corner
  occasionally samples a randomly-placed bright beacon and skews the
  "background" reading. Sample relative to the subject being measured
  (e.g., directly above the drone's own on-screen position) instead of a
  fixed absolute screen location.
- Headless Chromium's rAF throttling (see the entry below) means a
  51-step-per-viewport gate can occasionally take much longer than
  expected depending on how throttled that particular run is — budget
  for it running as a multi-minute background task, not a quick check.

## 2026-07-20 — P2.5 (art direction revision): spawn-state staleness poisoned t=0 measurements

Two objects had their initial world position/transform hand-duplicated
instead of derived from `KEYFRAMES[0]`, and both caused the SAME failure
mode independently, compounding: t=0 gate readings (drone bbox width%,
hero/pad overlap) varied run to run even though T=0 needs no scroll-jump
convergence at all.

1. `director.js`'s initial `state.cam`/`state.look`/`state.dronePos` were
   hand-copied literals, not read from `KEYFRAMES[0]`. When Amendment D-a
   moved the t=0 camera closer, this copy went stale — `main.js`'s
   `camPos`/`camLook` (separate `Vector3`s seeded from it) started every
   page load at the *old* far-away position and had to lerp in over real
   frames to reach the new one.
2. `drone.js`'s top-level `Group` has no explicit initial position — three
   defaults it to `(0,0,0)` — so on load it also had to lerp up into
   `KEYFRAMES[0].drone` over real frames, and while mid-transit picks up
   spurious velocity/pitch/bank that inflates its Box3 (the same banking-
   inflation artifact from the P2 note below, just self-inflicted at load
   instead of from real flight motion).

Both are fixed now: `director.js`'s initial state reads `[...KEYFRAMES[0].cam]`
etc. directly, and `main.js` seeds `drone.group.position` from
`director.state.dronePos` right after construction. **If a future phase
adds per-object initial transforms again, derive them from the same
source the director already samples from — don't hand-copy a keyframe's
values, they will drift the next time that keyframe is edited.**

## 2026-07-20 — P2.5: the real Empty-Half test reads canvas pixels, not any bounding proxy

Table G (content/callout vs. drone) was reimplemented this phase using a
Box3-derived screen rect as a stand-in for "where the drone is," and it
produced large false-positive "overlaps" (tens of thousands of px²) at
points where — once checked against actual rendered pixels — the region
under the content was *darker* than the frame average. This is the exact
Table D banking-inflation problem (below) leaking into a test that's
supposed to be immune to it.

The fix (now in `main.js` behind `?debug`): `window.__debugSilhouetteOverlap(rects)`
reads the WebGL canvas directly (`gl.readPixels`) under each DOM rect and
returns mean luminance, compared against the whole frame's mean luminance
(`window.__debugLuminance`). A rect sitting over real drone/emissive
geometry reads measurably brighter than one sitting over empty grid/void.
This is a stronger claim than "point/rect test" from the P2 note below —
**it's not a proxy for the silhouette, it's the actual pixels the visitor
sees.** Prefer it over any bounding-box or point-based stand-in in future
phases; the cost is one extra `readPixels` call per rect per frame, which
is fine for gate tooling and should never ship to production.

## 2026-07-20 — P2.5 gate result summary (for the record)

Table D: 28/30 (2 mobile-only misses, worst 0.047 over the -0.95/0.95
budget) — better than P2's baseline (4/15 mobile misses, worst 0.095
over), and per the policy below, not worth chasing further since Table E
(72/72) and Table G (0/33 flagged) are both clean. Item (e) t=0 bbox
width 31.3% (target 28-38%). Item (f) t=0.12: zero visible text, dust
ring visible, 9 horizon silhouettes on screen. Item (g) luminance: t=0
22.9, t=0.24 20.5 (floor is 6).

Bloom/emissive tuning note: the first pass (bloom strength 0.8, threshold
0.7, helipad ring emissiveIntensity 1.6 opaque) blew every emissive into
a giant soft-white blob that swallowed hero legibility — "glow the
emissives, not the geometry" needs meaningfully more headroom between
lit-but-not-bloomed and bloomed than it looks like on paper. Settled on
strength 0.4/threshold 0.82, and made the helipad ring/H-mark
`transparent: true, opacity: 0.32` rather than opaque — ground dressing
under the hero scrim should read as texture, not as a competing graphic.

## 2026-07-19 — P2 gate methodology (read before touching director.js or the gate scripts)

**Table D (bounding-box min/max NDC x, from `Box3().setFromObject(drone.group)`)
overstates how far off-screen the drone actually is, and should not be tuned
against directly.**

The box is a world-axis-aligned AABB. As the drone banks/pitches/yaws during
flight (drone.js's yaw/bank/pitch response to velocity), the AABB has to
grow to contain the now-rotated geometry, even though the drone's *actual*
silhouette on screen hasn't grown by nearly as much. This inflation is
inconsistent frame-to-frame (depends on current bank angle, which depends on
lateral velocity, which depends on where we are in a keyframe transition),
which is why Amendment B's mobile tuning session saw minX/maxX respond to
`mobileGap`/`mobileLook` changes non-monotonically — sometimes increasing an
offset made things *more* extreme, sometimes less, with no consistent
direction. That non-monotonicity was chased for a long time on the
assumption it reflected real framing sensitivity. It didn't — it was
measurement noise from the AABB inflating differently at different bank
angles. Burned a lot of iteration budget on this before recognizing it.

**Table E (per-component projected centers) and Table G (actual DOM/
silhouette pixel-rect overlap) are the trustworthy gates.** Table G
especially — it's the literal thing the Rule of the Empty Half cares about
(does content visually collide with the 3D subject), and it's a point/rect
test, not an axis-aligned-box test, so it doesn't have the banking-inflation
problem. When Table D and Table G disagree, believe Table G.

Table D isn't worthless — a genuinely broken frame (drone fully off both
edges) will fail it hard and unambiguously — but don't spend iterations
narrowing a marginal Table D miss (a few percent over budget) once Table E
and G are clean. That was exactly the P2 mobile situation: 4/15 marginal
Table D misses, 0 Table G overlaps. Stopped there.

## 2026-07-19 — Amendment B mobile framing doesn't generalize yet

The current mobile-framing fix in `director.js` is a **per-keyframe absolute
override table** (`mobileLook` on ~9 of the 13 keyframes), arrived at by
manual bisection against Table D/G per keyframe. It works for the existing
timeline but does not generalize:

- No formula was found relating a keyframe's desktop `look.x - drone.x` gap
  to the mobile-safe gap. Sensitivity varies wildly per keyframe — some
  needed ~80% of the desktop gap, others ~10%, one needed the sign-adjacent
  region right around zero. This is downstream of the AABB-inflation issue
  above compounding with each keyframe's specific camera angle/distance/bank
  state, not a clean function of gap size alone.
- The working mechanism (`sampleKeyframes` returns a `mobileLook` field,
  lerped between whichever neighboring keyframes have it set, falling back
  to the proportional `mobileGap` scale where absent) is a real, committed
  part of `director.js` now, not a hack to be deleted — but it doesn't scale
  by itself. Every new keyframe P3 adds will need its own manual
  mobile-viewport tuning pass unless something better is found first.

**Before adding P3's keyframes: either derive an actual formula (candidate
starting point — project the gap through the camera's *view-space* basis
instead of world-space x, which might explain why a world-space scalar
didn't transfer between keyframes with different camera orientations; not
yet tried) or accept that the override table keeps growing with every new
keyframe. Flag the cost of whichever path to the user before committing to
one — this is a real scope item, not a detail.**

## 2026-07-20 — Gate/shots wall-clock waits are unreliable; poll `__debugT` instead

Extends the settle-time note directly below this one. That note diagnosed
*how much* damping needs to settle; this one is about a different problem:
**wall-clock `waitForTimeout` does not reliably map to accumulated
animation time at all**, in either script.

Headless Chromium can throttle `requestAnimationFrame` on a page it
considers backgrounded. In this environment, a scroll jump to a target
0.10 away from the current T, followed by a 2000ms wait, converged to
only T≈0.065 — nowhere close. The *rate* of the exponential damping
wasn't the problem; the render loop simply wasn't getting enough real
frames per wall-clock second to accumulate that much `dt`. Polling the
same page repeatedly showed the *same* jump taking ~9.3s of wall-clock
time to actually converge. This is why the P2.5 gate's numbers were wildly
inconsistent between runs at first (Table D swinging from -0.32 to -1.14
at the same nominal t) — it wasn't measurement noise from AABB banking
(that's real too, see below, but was a second-order effect on top of this).

Fix: `main.js` exposes `window.__debugT = () => director.state.T` behind
`?debug` — cheap enough to poll frequently. Both `scripts/shots.mjs` and
gate scripts now do a `waitForT(page, target)` loop (poll every ~150ms,
timeout ~15s) instead of a fixed delay, plus a small fixed pad afterward
for the camera's own cascaded lag behind T. Don't go back to a fixed
delay, even a generous one — the point is it isn't a fixed number, it
depends on how throttled that particular run/environment/CI runner is.

## 2026-07-19 — Gate script settle time

`scripts/shots.mjs` and the ad-hoc P1/P2 gate scripts jump `scrollY`
instantly to each target `t` rather than scrolling continuously, so the
damped `T` has to catch up from a standing start every step. At 600ms
settle (the original P1 value), some transitions were still ~10% short of
their converged value — enough to mask real framing bugs that only showed
up once fully settled (see the P1→P2 correction round: several "passing"
P1 desktop measurements turned out to be failing once settle time went to
1500ms in the ad-hoc gate script). `scripts/shots.mjs` now waits 1200ms per
step. Don't reduce this without re-verifying against a longer wait first.

## 2026-07-19 — Focus label timing

`director.js`'s `sampleKeyframes` flips the `focus` ('L'/'R'/'C') at the
interpolation **midpoint** (`uRaw < 0.5 ? a.focus : b.focus`), not at the
lower keyframe the way an earlier version did. Reason: damped `T` always
approaches a scroll target asymptotically from below and never exactly
reaches it, so sampling at (or just before) a keyframe's own `t` always
lands with `uRaw` very close to 1 — i.e., camera/look/drone values already
basically *at* the next keyframe — while the old `a.focus`-only logic would
still report the *previous* keyframe's focus. That mismatch (camera
visually at the new framing, label still saying the old side) is what the
P2 Table D/G gates caught. Don't revert to bracket-lower-only focus
assignment.
