# NOTES

Log of what was tried and rejected, per MISSION_PLAN.md §0, so later phases
don't repeat dead ends. Newest entries at the top.

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
