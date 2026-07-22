# NOTES

Log of what was tried and rejected, per MISSION_PLAN.md §0, so later phases
don't repeat dead ends. Newest entries at the top.

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
