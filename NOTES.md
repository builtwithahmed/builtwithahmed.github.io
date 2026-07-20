# NOTES

Log of what was tried and rejected, per MISSION_PLAN.md §0, so later phases
don't repeat dead ends. Newest entries at the top.

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
