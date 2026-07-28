# NOTES

Log of what was tried and rejected, per MISSION_PLAN.md §0, so later phases
don't repeat dead ends. Newest entries at the top.

## 2026-07-27 — v1.4 convergence pass: analytic reference pose, nameplate
## X-column audit, gate reaches its target clean state

Closes both threads the previous entry (below) flagged but didn't resolve —
the rotation-reset artifact and the vertical-segment X-column crossing —
plus a systematic audit that found three more instances of the same
X-column pattern. Full gate (4 drift phases, both viewports, freeze +
dilation) now reports **only** the four pre-existing mobile teardown
overflow residuals; nothing else, at every phase.

**Analytic reference pose (item 1) — replaces the flat (0,0,0) captureFreeze
forced before.** The previous entry's rotation-reset finding was real: live
flight's `drone.rotation` is a damped response to frame-to-frame position
deltas, never (0,0,0) during actual motion, so forcing it to zero for
determinism was ALSO changing where components land on screen relative to a
live visitor. Fix: `director.js`'s `sampleKeyframes` now also returns
`tangent` — `droneCurve.getTangent(uCurve)`, three.js's own stock
finite-difference tangent, a pure function of `uCurve` (itself a pure
function of T, see the existing `uCurve` comment) with no wall-clock/dt
anywhere in it. A new `sampleDroneRotation(tangent)` derives yaw/bank/pitch
from this unit direction using the SAME formulas `drone.js`'s live branch
already uses (`atan2` for yaw, `-x*0.6` for bank, speed-scaled tilt for
pitch) — fed an implicit "speed=1" (the tangent is normalized) rather than a
live frame-rate-dependent magnitude, since `getTangent`'s own parameter
(`uCurve`) doesn't track this rig's uneven per-segment pacing (teardown
lingers, mission-map cruises) the way real T does — only its DIRECTION is a
meaningful, pacing-independent quantity here. `state.droneRotation` is set
every `director.update()`; `main.js` threads it into `drone.update()` as
`analyticRotation`; `drone.js`'s `captureFreeze` branch now does
`drone.rotation.set(analyticRotation.x, analyticRotation.y,
analyticRotation.z)` instead of `.set(0, 0, 0)`. Still a pure function of T
(same determinism guarantee the zero pose had — two sessions at the same T
still render bit-identical rotation), just a representative flight pose
instead of a flat one.

**Gate certifies the representative pose; a byte-identity screenshot proof
would certify a fixed reference pose — these are different needs, not
competing answers to the same question.** No currently committed script
does the latter (the 2026-07-24 AA-floor determinism check that cared about
byte-identity was a one-off manual investigation, and it only needed
"same T → same pixels," which the analytic pose satisfies exactly as well as
zero did). Left `drone.js`'s `captureFreeze` branch single-purpose rather
than adding an unused `zeroPose` toggle — the change is one line
(`drone.rotation.set(0, 0, 0)`) if a future script ever needs literal zero
specifically, and there's no committed caller to keep in sync in the
meantime.

**Re-classifying the three mobile "rotation-reset" overlaps (item 2) against
the analytic pose:**

- **t=0.32/0.34 (gimbal vs. battery's nameplate) and t=0.50 (gimbal vs.
  `.project-block`): ARTIFACT, confirmed gone.** Both were absent from the
  very first re-run under the analytic pose (drift phase 0) and every phase
  after. A direct live-vs-frozen NDC comparison (a scratch script, not
  committed) also shows the analytic pose tracking live rotation far more
  closely than zero did at these T's — e.g. t=0.50 mobile's gimbal delta
  dropped from the previously-measured ~28px (~0.066 NDC) down to ~6px
  (~0.015 NDC) — small enough that neither collision reappears.
- **t=0.22 (flightController vs. escArms's nameplate): REAL, not an
  artifact — confirmed present under LIVE rotation too, not just frozen.**
  Sampled 5 live (unfrozen) frames at this T plus one frozen frame (a
  scratch script): flightController's projected point sat inside escArms's
  nameplate rect in literally every sample, live or frozen. This was never
  actually a rotation-reset side effect — captureFreeze (any pose) just
  made a pre-existing collision deterministic enough to reliably catch, the
  same way the freeze surfaced the decode.js blurb-guard bug in the
  previous entry. Fixed by the escArms nudge below (item 3) — the same
  offset change that resolves the desktop X-column crossing also resolves
  this, since it moves escArms's nameplate away from the same cluster of
  adjacent-in-sequence components on both viewports at once.

**NAMEPLATE X-AUDIT (item 3) — the reported escArms/antenna crossing was one
instance of a repeating pattern, not a one-off.** Built a two-stage tool
(scratch, not committed): a capture script dumps every nameplate rect + every
visible leader line's `d`-path geometry at 0.005 T-resolution (vs. the gate's
own 0.02) across the full teardown range, both viewports, under the same
freeze+dilation the real gate uses; a pure-Node analysis script then replays
the gate's own two collision checks (point-in-rect, line-segment-vs-rect)
against that data, reconstructing any candidate offset's rect from the
component's own captured dot position — so a candidate `NAMEPLATE_OFFSETS`
fix could be tried instantly against the whole sampled range without a
rebuild+rerun per guess, only re-verifying the winning candidate against the
real Playwright gate at the end.

Root cause, stated once for all four instances found: a leader line's elbow
routing (`callouts.js`'s `elbowX`) keeps its VERTICAL run at a fixed X —
either the dock-column seam, or, when a component's own dot already sits
past that seam, the component's own screen X. A Y-only offset (all the
previous pass had) can dodge a line's HORIZONTAL run (pinned at a roughly
fixed content-column Y) but structurally cannot dodge a vertical run, which
by construction spans a large Y range. Any nameplate sitting in that X
column gets crossed regardless of its Y offset. Four instances, all fixed by
increasing the magnitude of an axis that component's offset already used
(no new direction introduced):

1. **escArms vs. antenna's line — the originally reported case, and it
   turned out to be two separate overlaps, not one.** The existing -18px Y
   shift (previous entry) only cleared the UNDILATED rect; dilated by the
   gate's own +10px, the margin was consumed again at nearby sub-T's
   (T~0.245-0.255, not the exact T=0.24 originally measured) — same graze,
   not a new one. Separately, escArms's nameplate (X unchanged until now)
   sat squarely inside antenna's line's own vertical column. Fixed with
   `x: -24 -> -60`, `y: -18 -> -34` — both re-verified against the full
   fine-grained sweep, not just the one originally reported T.
2. **gimbal vs. escArms's OWN line, T~0.215-0.235 desktop.** escArms's line
   routes its horizontal run into its own label at a fixed content-column Y
   (~471); gimbal's nameplate had no Y offset at all (`y: 0`) and its
   dilated bottom edge reached that Y early in the ramp before gimbal's own
   dot had climbed further away. Fixed with `y: 0 -> -20`.
3. **rotors' line vs. antenna's nameplate, T~0.30-0.305 desktop.** Same
   vertical-column pattern as #1, mirrored: rotors' line's vertical run
   sits at rotors' own screen X once past the dock seam, and antenna's
   nameplate (unchanged since #1's fix was still being tuned) reached into
   that column. Fixed with antenna's `x: -32 -> -45` (the same fix as #1
   already needed a larger magnitude; this pushed it further still).
4. **antenna vs. battery's nameplate, mobile only, T~0.37-0.375 (the
   reassembly window, right before battery's own explode-threshold
   cutoff).** Not a leader-line case — antenna's DOT simply passes through
   the box battery's `y: -17` offset put its nameplate in as the drone
   reassembles. Tried sliding battery along X first (its own existing axis
   of separation from the rest of the mobile cluster) — made it worse (14-18
   new failures swept from -10 through -30): mobile's tight
   `EXPLODE_SCALE_MOBILE=0.45` cluster means moving battery's nameplate left
   moves it INTO escArms/gimbal's own positions, not away from antenna's.
   Y was the right axis: `y: -17 -> -10` (back toward battery's own dot,
   smaller upward shift) clears antenna's transient path without re-entering
   anyone else's position. Confirmed via the same full-range sweep — 0
   failures, not just 0 at the two originally-observed T's.

**Full gate re-run (item 4): 4 drift phases, both viewports, freeze +
dilation + analytic pose — identical result at every phase, and it's now
the target state exactly, nothing left to restate as an accepted
residual:**

| T / viewport | Type | What | Status |
|---|---|---|---|
| t=0.14, 0.16 mobile | overflow | `teardown-block` 357px vs. 346px | pre-existing since v1.1-B/v1.2, unchanged in value |
| t=0.24, 0.26 mobile | overflow | `teardown-block` 349px vs. 346px | pre-existing since v1.1-B/v1.2, unchanged in value |

Zero overlap, zero leader-line-overlap, zero blurb-guard, zero empty-frame
failures at every T, every viewport, every one of the 4 pinned drift phases
— strictly cleaner than the previous entry's table (which still carried 3
desktop leader-line grazes and 3 "suspected artifact" mobile overlaps as
accepted residuals). The determinism claim is also now simpler to state:
previously there was still sub-pixel hitCount drift between phases on the
leader-line grazes; with nothing left to graze, every phase's failure list
is byte-for-byte identical, not just "the same category, tiny drift."

**Copy check, re-confirmed:** `git status`/`data.js` still shows the v1.4
six-card copy and new hero subline (unchanged by this pass — no copy edits
made).

**escArms/antenna graze (review item 1) — fixed the reported crossing,
then a stricter check (below) found a second one the fix didn't touch.**
Measured exact geometry at t=0.24 desktop: escArms's un-offset nameplate
rect (top 458.6/bottom 474.6) overlapped antenna's own leader line's fixed
horizontal run (y=473.97, pinned by CSS layout — confirmed stable across
sessions/drift phases, not live-position-driven) by 0.66px. Shifted
escArms -18px in y (`escArms: { x: -24, y: -18 }`, callouts.js) — minimum
shift for ~15px clearance against that specific horizontal segment.
Verified against the frozen reference (below): the RENDERED, undilated
nameplate no longer touches that line. **But** the dilated leader-line
check (below) still flags t=0.22/0.24/0.30 desktop, and tracing the exact
geometry shows why: antenna's elbow has a VERTICAL segment too (dot down
to dock height, x pinned at antenna's own screen x, y spanning ~420-474),
and escArms's nameplate sits close enough in X to that column that the
vertical run crosses it independent of escArms's Y — a Y-only shift
can't fix an X-column crossing. Not chased further this pass; flagged
for whoever picks this up next rather than papered over.

**Gate determinism (review item 2) — captureFreeze enabled, and it
immediately surfaced a real, previously-latent bug.** `npm run gate`
now calls `window.__setCaptureFreeze(true)` unconditionally per viewport,
before the T-step loop (gate.mjs). Re-running the identical command
at the identical pinned drift phase had shown 6 failures once and 5 the
next time (previous entry) — direct proof the un-frozen check was
sensitive to live wall-clock state, not measuring a stable defect.

That same freeze broke check 4 immediately: ~40 new `blurb-guard`
failures, every one a `.blurb` stuck "revealing" past its 700ms budget.
Root cause: `decodeBody` (decode.js) clears `dataset.revealing` from a
`transitionend` listener on the last word-span; `html[data-capture-
freeze] * { transition-duration: 0s !important }` (tokens.css, existing)
means every transition the freeze touches now has a computed duration of
0 — and per the CSS Transitions spec, a transition never starts to begin
with, so `transitionend` never fires. Not a browser bug, not something
the existing `!important` override could route around. Fixed by giving
`decodeBody` a `captureFrozen()` check (reads `document.documentElement.
hasAttribute('data-capture-freeze')`, the same signal the CSS itself
already keys off) and folding it into the SAME early-return branch
`reducedMotion()` already uses — final text placed instantly, no spans,
nothing ever marked revealing, mirroring how a real prefers-reduced-
motion visitor is already handled. Zero production effect (the attribute
is only ever set behind main.js's `?debug` guard). `decodeHeading`/
`decodeEyebrow` don't share this bug (their own completion signal is a
`requestAnimationFrame` timing loop, not a CSS transition) — left
untouched, narrower fix than "make everything capture-freeze-aware."

**Nameplate rect dilation (review item 2, continued) — measured, then
corrected the math once the flood of new failures didn't add up.**
Measured each viewport's real pixel swing directly: held T=0.24 fixed,
sampled a component's projected position for 12s (>1 full ~3s bob
period) once speed settled toward 0 — 1440x900 swung ~19.2px (x) /
~13.9px (y) peak-to-peak, 390x844 ~1.7px (x) / ~9.6px (y). First
implementation dilated nameplate rects by the FULL swing on every side
(reasoning: "the frozen sample could land anywhere in the range") —
padded a 16px-tall rect out to 56px and flooded the leader-line check
with dozens of encroachments that didn't represent real visual risk.
Wrong reasoning, caught before trusting the output: `!captureFreeze`
gates the entire hover-bob term in drone.js, so a frozen capture is
never a random sample of the oscillation — it's always exactly the
undisplaced center. The true live range is center +/- amplitude (half
the swing), so dilating the known-center frozen rect by the amplitude on
every side is what actually covers it; dilating by the full swing
double-counts and overshoots. Corrected to `{ '1440x900': 10, '390x844':
5 }` (gate.mjs's `NAMEPLATE_DILATE_PX`), applied only in the leader-line
check per the review's own scope (check 1's plain overlap test is
untouched).

**New, separate finding: captureFreeze also forces `drone.rotation` to
exactly (0,0,0) (drone.js, pre-existing, unrelated to this pass) — and
that changes where components land on screen during active flight, not
just whether the pose is deterministic.** Confirmed directly: at t=0.50
mobile, gimbal's projected point sits at y=557.6 frozen vs. y=529.9 live
(same T, same everything else, only `__setCaptureFreeze` toggled) — a
~28px real shift, enough to cross into `.project-block`'s rect under
frozen conditions only. During active banked flight the drone's natural
rotation is presumably NOT (0,0,0), so the frozen reference pose here is
neither "the live experience" nor obviously "a deterministic version of
it" — it's a third, artificial pose a real visitor's rotation never
actually settles into. This likely explains the mobile "overlap" entries
below at t=0.22/0.32/0.34/0.50 that never appeared in any pre-freeze run
(escArms-vs-flightController, battery-vs-gimbal, and the project-block
one) — flagging this distinctly rather than folding it into "accepted
nameplate residuals," since its root cause (rotation reset, not offset
tuning) is a different problem than anything else in this file's
nameplate work. Not investigated further or fixed this pass — surfaced
for a decision on whether the reference pose should hold live rotation
at frozen T instead of always zeroing it.

**Complete current residual table** (full gate, 4 drift phases, both
viewports, captureFreeze + dilation as above — identical failure
structure at every phase, confirming the freeze delivers real
determinism now; only sub-pixel coordinate drift between phases, one
extra near-miss at phase 0.75 crossing at t=0.32 mobile in addition to
the t=0.34 all four phases share):

| T / viewport | Type | What | Status |
|---|---|---|---|
| t=0.22 desktop | leader-line-overlap | escArms's line vs. a DILATED nameplate rect (hitCount 27) | new since freeze+dilation; not present against the undilated render |
| t=0.24 desktop | leader-line-overlap | antenna's line's vertical segment vs. escArms's (DILATED) nameplate (hitCount 8) | the "second crossing" above; real even before dilation on the vertical segment, per the X-column analysis |
| t=0.30 desktop | leader-line-overlap | rotors' line vs. a DILATED nameplate rect (hitCount 3) | new since dilation |
| t=0.14, 0.16, 0.24, 0.26 mobile | overflow | `teardown-block` 357/357/349/349px vs. 346px | pre-existing since v1.1-B/v1.2, confirmed UNCHANGED in value — the two inspection-block entries from the same historical ledger are gone, see below |
| t=0.22 mobile | overlap | flightController's point vs. escArms's nameplate (undilated) | new since captureFreeze; suspected rotation-reset artifact |
| t=0.32 (phase 0.75 only) / t=0.34 (all phases) mobile | overlap | gimbal's point vs. battery's nameplate (undilated) | new since captureFreeze; suspected rotation-reset artifact |
| t=0.50 mobile | overlap | gimbal's point vs. `.project-block` | new since captureFreeze; confirmed rotation-reset artifact (isolated above, disappears with rotation live) |

**Where the inspection-block residuals (2 of the historical 6) went:**
confirmed via a runtime-only `--font-display` A/B (no file edit) that
Rajdhani renders "Drone / ArduPilot Integration" (service row 3) on one
line (21px) where the prior face wrapped it to two (36px) at the same
container width — a 15px saving that happened to close a 5px-over gap.
Unplanned; the font swap's own metrics-risk assessment only checked
headings, not individual service titles.

**Copy check:** current build has the v1.4 copy (new hero subline, all
six new project titles) — not the old WPT set. Confirmed by reading
data.js directly, not inferred.

## 2026-07-25 — v1.4 identity pass: font lock, teardown nameplates, real copy

**Font lock (1a).** `--font-display` Chakra Petch -> Rajdhani (tokens.css),
Google Fonts URL's Chakra Petch segment replaced outright, not left
alongside (grepped repo-wide afterward: zero remaining references, no dead
font download). Confirmed beforehand that all three `--font-display` sites
(hero/section h1+h2, callout h3, console-row h3) inherit their character-
count width budgets from `--font-body`, never from the display face itself
— none of the `ch`-based caps needed re-tuning for the swap. Build gz
unaffected within noise (154.92 kB immediately after, vs 154.90 kB
pre-pass).

**Teardown nameplates (1b) — three real fixes, in order, each verified
against the gate before moving to the next.** Built into callouts.js's
existing per-frame loop (not a new module), one `<div class="nameplate">`
per skill item appended to `<body>` directly (outside `.content-block`,
so the anti-emptiness check can't see it without any special-casing) and
positioned every frame at the same `sx,sy` the dot already computes.

1. **First pass: nameplates visible for the whole explode ramp once
   revealed (independent of the label's own prev/active/next window), one
   shared `(+14, 0)` screen-space offset from the dot.** Extended
   `gate.mjs` checks 1 (overlap) and 5 (leader-line) to include
   `.nameplate` rects as new surfaces (self-excluded via
   `dataset.component` / a new `path.dataset.sourceComponent`, parallel to
   the existing `targetLabel`/`ownLabel` pattern) — immediately caught 18
   real failures. Root cause: with persistence independent of the label
   window, up to 6 nameplates render simultaneously late in the ramp: no
   small constant offset separates that many dense text tags.
2. **Tried a per-component hexagon-spread offset next** (six directions,
   the two most frequent colliding pairs — gimbal/escArms, antenna/rotors
   — placed 180° apart), reasoning from each component's own 3D explode
   direction. Made it WORSE (58 failures) — 2D on-screen clustering across
   a moving camera doesn't reliably follow from 3D explode-direction
   reasoning alone; geometry intuition isn't a substitute for measuring.
3. **Real fix: bind nameplate visibility to the SAME prev/active/next
   window the label/dot/line already use**, instead of "visible for the
   whole ramp." This is a simplification, not just a fix (folds back into
   one shared `hide()`) and dropped failures 58 -> 19. Remaining 19
   clustered exactly at the T range where `state.explode` (director.js's
   sampleExplode, one shared k for all six components) is still low —
   right after BAND_START (k ramping up from 0) and right before
   reassembly finishes (k ramping back down) — confirmed by checking the
   actual sampleExplode curve against the failing T values, not guessed.
   At low k every component sits close to the drone's assembled core
   regardless of its own explode direction, so no offset can separate
   tags anchored that close together. Added `EXPLODE_VISIBLE_THRESHOLD =
   0.35`: a nameplate additionally requires `state.explode >= 0.35` to
   show (label/dot/line don't have this problem — the label docks off in
   the content column, the dot/line just track wherever the part actually
   is). Dropped 19 -> 5, clearing every failure except a narrow band
   around T=0.23-0.26 (antenna's own reveal edge). One more offset
   iteration (antenna moved off a shared "down" direction with battery,
   which also explodes screen-downward, onto an unused up-left direction)
   cleared every mobile failure and left **3 single-sample-point
   leader-line grazes** (desktop only, T~0.23-0.25, out of 36+ samples per
   line) — accepted per the same diminishing-returns precedent as this
   file's other residuals (Table D 2026-07-19, the mobile overflow
   entries below). Full gate at all 4 drift phases confirms this is
   stable: identical result at phases 0/0.25/0.5, one extra hairline graze
   at 0.75 (2 hits instead of 1, same T window) — drift shifting a
   near-miss by a few pixels, not a new systemic issue.
   Amber dim/active state uses opacity only (0.5 -> 1), not a color
   switch like the dot/line's cyan->amber — nameplates are amber at every
   visible state per the brief, so color has nowhere "up" to shift to.

**Copy integration (1c).** Hero subline changed and measured in isolation
FIRST, before any other Step 2 work, per instruction: 0px overflow both
viewports (272/272 desktop, 232/232 mobile) — real margin, not a near
miss, despite the new copy being a similar length to the old. Six project
cards replaced 1:1 in the existing WPT-01..06 slots (map.js/director.js
untouched, confirmed map.js's waypoint math is parametric over array
length but the WAYPOINTS coordinates themselves are hand-placed along the
flight corridor — additive would have been a real spatial-design task, not
a copy edit, which is why replacement was the right call). New titles
measure shorter than the old longest (`WPT-02 · Crash Forensics` ~35 chars
vs the old `WPT-05 · File Storage API (R2 + FastAPI)` ~40) — no title-wrap
regression risk. Added a `link: null` field to each project (data-only —
projectCallouts.js's template doesn't reference it, so null renders
exactly as before the field existed; matches this file's own established
precedent of not building unreached rendering code, and the "re-add both
together once real URLs exist" comment already on this array from when
`github` was removed).

**Real finding while checking the flagged blurb-length risk: mobile (and
even desktop) project cards never show two FULLY EXPANDED rows
simultaneously under real continuous scroll, contrary to this file's own
prior "previous, active, next" framing of the windowing design.** Traced
through the reveal math: a windowed "next" item's own reveal threshold
(`T >= BAND_START + i*BAND_WIDTH`) is the exact same T value where
`bandIndex` itself advances to make it active — so under continuous
(non-reduced) motion, the moment an item becomes revealed is the same
moment the window shifts to exclude whatever was previously showing.
Verified with a dense 0.005-step sweep, both viewports, across the full
cards 1-2 transition: mobile shows exactly one project card at a time,
desktop genuinely shows two (previous does NOT drop the reveal-edge
coincidence, since a *previous* item was already revealed and stays so
once the window includes it). 0px overflow at every sampled point either
way, including desktop's genuine two-simultaneous case with the new,
longer blurbs (140-160 chars vs the old ~95-108) — the flagged risk didn't
materialize, and this "next slot is a phantom under continuous motion"
detail is worth remembering if a future pass ever wants a true
2-simultaneous mobile reveal (it doesn't currently exist, despite reading
that way from the code comments alone).

**Gate result:** build 155.40 kB gz (Rajdhani's 600/700 weights net
roughly the same payload as Chakra Petch's did — no meaningful budget
movement from the font swap itself; the nameplate JS/CSS + new copy
account for the ~0.5 kB delta from the pre-pass baseline). `npm run
verify`: PASS (only benign SwiftShader `GPU stall due to ReadPixels`
performance warnings from the `?debug` instrumentation, no errors). Full
gate at drift phases 0/0.25/0.5/0.75, both viewports: consistent
across all four — the 3 accepted nameplate grazes (2 at phase 0.75) plus
the same 4 pre-existing mobile teardown-block overflow entries already
documented in the 2026-07-23/24 entries below, unchanged in value
(357/357/349/349px vs the 346px budget) confirming this pass didn't grow
them. Fresh screenshots (desktop t=0.00/0.24/0.30/0.72/0.97, mobile
t=0.30/0.97) spot-checked visually: hero fits its budget on 3 lines
cleanly, nameplate dim/active contrast reads correctly (dim ANTENNA vs.
bright ROTORS matching the active band), no visible collisions at any
sampled frame. Recordings (0->1->0, continuous scroll, not
jump-and-settle — ambient motion left live, no captureFreeze/DRIFT_PHASE
pin): desktop captured at tier=LOW per this pass's own instruction (cost
mitigation for a continuous capture, labeled in both filename and script
output) — real capture time 23s vs. 14s nominal (~1.6x, tracking
NOTES.md's own tier=LOW inflation estimate); mobile at tier=HIGH default,
41s vs. 14s nominal (~2.9x, tracking the tier=HIGH estimate). Notably the
LOW-tier desktop recording (3.27MB) is smaller than the HIGH-tier mobile
one (5.39MB) despite more pixels — the inverse of the v1.3 pass's own
recording-size note, and directly explained by it: no composer
(bloom/vignette/grain) compresses far better, and this pass's script uses
a separate `browser.newContext` per viewport rather than one shared
launch, so there's no warm-up-cost asymmetry to fight against the pixel-
count difference this time.

## 2026-07-24 — v1.3 visual debt pass: tier pinning, hero material fix, mobile
## framing generalized, leader-line gate check

**Tier pinning (2.0).** Headless Chromium's WebGL context is SwiftShader
(software), which `scene/tier.js`'s renderer blacklist self-reports as
`tier: LOW` — and LOW makes `post.js` skip the whole composer (bloom/
vignette/grain) silently. `gate.mjs`/`shots.mjs`/`verify.mjs` were all doing
this unpinned, meaning every prior gate/shots run (this entire file's history
included) was checking the no-composer path, not what a real HIGH-tier
desktop visitor's GPU renders. All three now default to `?tier=HIGH` via a
`CAPTURE_TIER` env var (override to LOW/MED to deliberately test that path).
Caught while diagnosing 1A below — the first composer-on/off A/B under plain
`?debug` produced identical numbers both ways, which should have been the
tell.

**Hero oval (2.1) — corrects the 2026-07-23 v1.1-B conclusion below.** That
entry attributed the residual glow behind the hero headline to `post.js`'s
vignette. Rigorous re-check (composer fully disabled via
`__debugSetComposer(false)`, and separately hiding the hero pad object via
`__debugLayers.helipad.visible = false`) showed the oval survives — and
reads *more* clearly — with the composer off, ruling out bloom/vignette
outright; hiding the pad object removes it completely. Root cause: the
hero pad's ring/mark material (`environment.js`'s `brightPad: false`
branch — metalness 0.5, roughness 0.35) produces a broad, soft specular
lobe from the key/hemi lights at this camera's grazing angle — an ordinary
lit-metal highlight, never emissive, never bloom. Tried reducing metalness
(down to 0) first: made it *worse* — less metalness sharpens the response
back down to the ring's true geometric edge, which reads as an even more
legible outline traced behind the text. Fix that actually worked: raise
roughness to 0.68 (same metalness, 0.5) to spread the same reflected energy
thin enough that neither a soft blob nor a crisp edge survives, plus a
modest color darken (`0x1c4650` -> `0x122a30`) for the last bit of residual
brightness. Verified at both tier=HIGH and tier=LOW (LOW has no vignette to
help mask it, so a fainter residual remains there — accepted, since further
darkening for LOW's sake started to visibly under-light Pad-B's own
diegetic reading on HIGH, the majority case). Pad-B (`brightPad: true`)
untouched, confirmed via direct material read.

**Mobile framing (2.2): `mobileLook` generalized from an x-only scalar to a
per-axis `{x, y}` vector** (one mechanism, `blendMobileAxis` in
`director.js`, backward-compatible with every existing x-only entry).
Landing x retuned (t=0.90/0.93/1.00: -0.8/0.2/0.8, was -2.0/-1.5/-1.5) so the
mobile gap shrinks instead of holding flat/matching desktop while drone.x
climbs toward off-axis Pad-B. Teardown y added (t=0.22/0.30/0.36:
1.05/1.1/1.35) to lift the exploded drone into its mobile vertical
allocation. **First pass at the landing x retune introduced a real overlap
regression**, caught by the same point-based Table E method the gate
already uses (not just eyeballing): pulling the drone further on-screen
horizontally, at the same vertical framing, dropped it low enough to
overlap the mobile `.landing-block`'s content rect — mobile stack layout has
no L/R split to dodge into, content claims the full width, so the only
dodge is vertical. Fixed by adding landing-keyframe y overrides too
(t=0.90/0.93/1.00: 0.3/-0.3/-1.4). Re-verified: 0 overlaps at
t=0.90/0.93/0.95/0.97/1.00. Desktop proven byte-stable: two independent
before/after `__debugNDC()` captures across all 15 keyframes (git-stashed
`director.js` for a clean "before" build) — origin and per-component NDC
(Table E, the trustworthy metric) differ by ≤0.00095, floating-point noise;
raw AABB corners (Table D, already documented as noisy from explode-state
sensitivity to T-convergence timing) differ by ≤0.0034 with a long enough
settle, confirming that metric's own noise floor rather than a real
regression — first attempt at this same proof used a looser epsilon/settle
and saw up to 0.07 AABB delta, which evaporated entirely once settle time
was extended, not from any code change.

**Inspection entry retime (2.3) — tried, reverted per the brief's own
instruction.** Nudging row 1's reveal ~0.01 earlier (desktop entry-edge
sparse-column finding, T=0.72) also fires on mobile: mobile's window
already includes `bandIndex+1` the same way desktop's does (only
`windowMin` differs between them, not `windowMax`), and
`.inspection-block` was already at its mobile overflow budget — the extra
row pushed a new overflow at t=0.74 from ~351px to 418px. Dropped rather
than adding a mobile-only carve-out the instruction didn't ask for.

**Contact cards (2.4).** Sub-copy shortened (`Hire on Upwork`->`Hire me`,
`Connect with me`->`Connect`, `Direct message`->`Message me`; `Order a gig`
unchanged) — each one previously repeated the label directly above it,
which is exactly the redundancy that left no width budget in the 2-up
grid. Added a real floor: `.platform-links` grid columns
`minmax(0,1fr)` -> `minmax(132px,1fr)`, sub-copy font-size 0.82rem ->
0.75rem plus `white-space: nowrap` on both label and sub (turns "shouldn't
wrap given current copy" into "structurally cannot wrap"). Verified 0
wraps, both viewports, all 8 cards (4 x 2).

**Leader-line gate check (Step 3) — two real bugs in the check itself,
caught before trusting its output.** (1) First version excluded a line's
own destination label as one entry in the shared rect list, but the label
is nested inside its parent `.content-block` — a sample point legitimately
inside the label is geometrically also inside that parent's bounding rect,
so entering its own destination still registered as a false hit against
the parent. Fixed by skipping any sample point inside the own label
entirely, before testing it against anything. (2) Even fixed, the routing
patch (below) still showed hits against `.content-block` specifically in
the gap between a content block's own outer padding and where its
heading/labels actually start (content.css blocks all use `padding: 4vh
3vw` or similar) — real empty space, not text. The drone-overlap check's
existing `rects` array (whole padded content-block) is the right proxy for
"is the drone silhouette under the content column," but is too coarse for
"does this line cross rendered text" — switched the leader-line check
specifically to `.teardown-header` (shared markup across every content
variant) + visible rows/labels, which is what the brief's own wording
("heading, sub, row") actually asked for. Confirmed the known mobile
t≈0.30 failure fails this refined check too (4 real hits against
`teardown-header`) before fixing anything.
Fix: `callouts.js`/`projectCallouts.js`'s elbow routing now keeps the
vertical run outside the docked content BLOCK's own span (not just the
narrower label's, which sits inset within it — margining off the label's
edge alone measurably wasn't enough, still crossed the block's own
padding). Verified clean (0 hits) across t=0.13-0.70 at 0.02 resolution,
both viewports, and via the full 51-step gate at all 4 drift phases.

**Step 4 gate result:** build 154.90 kB gz. `npm run verify`: PASS. Full
gate at drift phases 0/0.25/0.5/0.75, both viewports: identical result
every time — 0 overlap, 0 empty, 0 leader-line-overlap, 0 blurb-guard, and
exactly the same 6 pre-existing mobile overflow failures already documented
in the 2026-07-22/23 entries below (teardown-block 349-357px vs. 346px,
inspection-block 351px vs. 346px) — unchanged in location and magnitude,
confirming nothing in this pass touched that pre-existing gap.

**Measured cost of tier=HIGH pinning (2.0), so a future pass can budget for
it rather than be surprised by it.** A full 51-step x 2-viewport gate run,
timed wall-clock, same machine, back-to-back: `CAPTURE_TIER=LOW` 171s,
`CAPTURE_TIER=HIGH` 495s — **~2.9x**, not the ~4x this pass initially
assumed going in; corrected against the actual measurement rather than left
as a guess. The end-to-end ratio is smaller than the raw rendering-cost
difference because a lot of each gate step's wall-clock budget is
tier-independent fixed cost (the `waitForT` poll, the 400ms settle pad, the
blurb-guard poll). Isolating just the scroll+settle step itself (a 101-step
probe, fresh `chromium.launch()` per tier, no other gate overhead) showed a
much starker gap: ~424ms real time per step on desktop at tier=HIGH
against a nominal 40ms wait (~10.6x inflation) vs. ~67ms per step at
tier=LOW (~1.7x inflation) — tier=HIGH's real bloom/vignette/grain/tonemap
shader work dominates the step cost, the scripted 40ms pacing is nearly
irrelevant next to it. Budget gate/shots/recording runs at tier=HIGH as a
multi-minute-per-viewport cost, not the faster tier=LOW timing this repo's
history was implicitly tuned against before 2.0.

**Why the Step 4 desktop recording is ~20MB against ~5.5MB for mobile** —
not just the ~3.9x pixel-count difference (1440x900 vs 390x844) it might
look like at a glance. The recording script's `SCROLL_DURATION_MS=7000`
(x2 directions) is a scripted *pacing* target, not a guarantee — per the
per-step probe above, real wall-clock time per scroll step at tier=HIGH
runs several times the nominal 40ms wait, so both recordings' actual
runtime is dominated by real rendering cost, not the intended ~14s-per-
direction pacing. The two recordings share one `chromium.launch()`
(desktop recorded first, then mobile in the same already-warmed-up
browser/context), so desktop alone absorbs the one-time shader-compile/
JIT warm-up cost the isolated per-tier probe pays fresh each time — this is
why the observed file-size ratio (~3.66x) tracks close to the pure pixel-
count ratio (~3.94x) rather than compounding with a much larger duration
difference: the fixed warm-up cost is real but is a one-time cost paid
once per session, not per recording. If a future pass re-runs this and
wants tighter, comparable durations for both recordings, launch a fresh
browser per recording (trading a slower total run for isolating each one's
own warm-up cost) rather than sharing one across viewports.

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
