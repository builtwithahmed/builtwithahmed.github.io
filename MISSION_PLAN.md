# GROUND CONTROL — Portfolio Redesign & Build Plan
**Repo:** builtwithahmed.github.io · **Deploy:** GitHub Pages · **Executor:** Claude Code (Opus)
**Author of plan:** Claude Fable 5 · **Status:** Ready to build

---

## 0. How to use this document (read first, Opus)

- This file is the contract. Phases 0–4 are prescriptive: follow coordinates, tokens,
  and rules exactly. Phase 5 is where you exercise judgment.
- After EVERY phase: run the dev server, take screenshots at scroll positions
  t = 0, 0.1, 0.2 … 1.0 (Playwright, 1440×900 and 390×844), and check each against
  the **Rule of the Empty Half** (§4). If any screenshot violates it, fix the
  keyframe or the content anchor — never shrink or hide the 3D to "make room."
- Never add a floating glass card that covers the scene. That was v1's failure mode.
- Keep a `NOTES.md` log of what you tried and rejected, so later passes don't repeat it.

---

## 1. Concept

**The portfolio is a drone Ground Control Station (GCS), and the visitor is the operator.**

Not a website with 3D decoration — an instrument you fly by scrolling. Every piece of
content is diegetic: skills are the drone's own components, projects are mission
waypoints on a tactical map, services are an inspection scan's findings, contact is
Return-To-Launch. Text never sits *on top of* the world; it is *part of the interface
reading* the world.

**Signature elements (the three things nobody else has):**
1. **Exploded drone anatomy** — the drone disassembles mid-air; leader lines connect
   each floating component to a skill label. Skills section = hardware teardown.
2. **Holographic mission map** — projects as waypoints on a top-down wireframe terrain;
   the flight path draws with scroll; callouts are anchored to projected 3D positions.
3. **Rule of the Empty Half** — a hard compositional law (§4) that makes text/3D
   occlusion structurally impossible.

**Anti-goals (reject these if you catch yourself doing them):**
- Glassmorphism cards floating over the scene
- Generic "particles + bloom + big heading" hero
- Content that would read the same on any developer's portfolio
- Effects that don't serve the GCS fiction

---

## 2. Design tokens

### Color — "tarmac at night"
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#05080a` | world/void |
| `--bg-raised` | `#0a1013` | docked consoles, terminal |
| `--grid` | `#0f2b31` | terrain wireframe, hairlines |
| `--ink` | `#d9e2e2` | primary text |
| `--ink-dim` | `#6f8181` | secondary text |
| `--signal` | `#4fccd8` | brand cyan: HUD, path, links (keep — it's the existing brand) |
| `--armed` | `#3ddc84` | OK states, reached waypoints |
| `--warn` | `#ffb03a` | attention, active waypoint, prices |
| `--alert` | `#ff5449` | REC dot, tower beacon |

Discipline: the scene is near-monochrome cyan-on-black. **Amber appears only on the
currently-active/interactive thing.** One amber element on screen at a time, max.
That scarcity is what makes it read as an instrument, not a theme.

### Type
| Role | Face (Google Fonts) | Notes |
|---|---|---|
| Display | **Chakra Petch** 600/700 | squarish, aeronautical; headlines + section titles, tracking -1% |
| Data/HUD | **Space Mono** 400/700 | all telemetry, callout labels, eyebrows, prices |
| Body | **Space Grotesk** 400/500 | paragraphs only |

Scale: hero `clamp(3rem, 8vw, 7.5rem)`; section titles `clamp(2rem, 4vw, 3.4rem)`;
HUD fixed at 11–12px (instruments don't scale with viewport).

### Motion
- Scroll damping: `1 − e^(−4.2·dt)` on a normalized scroll value `T ∈ [0,1]`
- UI transitions: 180–350ms, `cubic-bezier(0.16, 1, 0.3, 1)`
- `prefers-reduced-motion`: no ambient animation (bob, pulses, particles, boot
  typing); scroll still moves camera (direct user input), but undamped

---

## 3. Tech architecture

```
/
├─ index.html
├─ vite.config.js            # base: '/', build → dist/
├─ package.json              # three, gsap (ScrollTrigger), lenis (optional), vite
├─ .github/workflows/deploy.yml   # build + deploy dist/ to Pages on push to main
└─ src/
   ├─ main.js                # boot, tier detect, wire everything
   ├─ director.js            # THE scroll choreography: keyframes, sampling, safe-side
   ├─ scene/
   │  ├─ world.js            # renderer, camera, lights, fog, resize
   │  ├─ drone.js            # drone group + explode(t) API (§6.2)
   │  ├─ terrain.js          # wireframe ground shader w/ scan sweep
   │  ├─ map.js              # mission map: path, waypoints, holo-terrain
   │  ├─ tower.js            # inspection structure + scan ring
   │  └─ post.js             # EffectComposer: UnrealBloom (subtle), vignette, grain
   ├─ hud/
   │  ├─ boot.js             # loader = GCS boot terminal
   │  ├─ telemetry.js        # ALT/SPD/BAT/MODE, tied to director state
   │  └─ callouts.js         # leader-line labels anchored via Vector3.project()
   ├─ content/data.js        # all copy as data (skills, projects, services, links)
   └─ styles/                # tokens.css, layout.css, hud.css
```

Decisions already made — don't relitigate:
- **Vite + npm three** (not single-file CDN): you now have Claude Code, so use real
  modules, tree-shaking, and a build. GH Actions deploys `dist/`.
- **GSAP ScrollTrigger** for pinning sections + timeline scrubbing; keep the custom
  damped `T` for the 3D director so scene motion stays silky between triggers.
- **Post-processing:** UnrealBloomPass strength ≤ 0.55, threshold ≥ 0.75 — glow the
  emissives only. Add film grain at 0.03 opacity. This is the single biggest visual
  upgrade over v1. Disable composer entirely on TIER_LOW.
- **Callout system:** each callout = `{object3D, label, side}`; per frame, project
  anchor to screen space, draw an SVG leader line (elbow style: diagonal then
  horizontal) to a text label docked in the empty half. Hide when behind camera.

### Performance tiers (mobile strategy — decide up front, not as an afterthought)
| Tier | Trigger | Gets |
|---|---|---|
| HIGH | desktop, dpr ≤ 2 | everything, AA, bloom, 900 particles |
| MED | mobile/tablet, decent GPU | no AA, dpr 1.5, bloom off, 300 particles, simplified terrain |
| LOW | WebGL fail or `getParameter(GL_RENDERER)` blacklist | **no canvas**: static hero image (export one beauty render during dev), content as clean stacked sections |

Budget: 60fps HIGH / 30fps MED, JS ≤ 220KB gz, LCP < 2.5s, CLS < 0.05.

---

## 4. THE RULE OF THE EMPTY HALF (the occlusion law)

Every keyframe in `director.js` declares `focus: 'L' | 'R' | 'C'`:

- `L` — 3D focal point composed in the **left** half → DOM content may render only in
  the right half (`.stage-right`, max-width 46vw, right-aligned grid column).
- `R` — mirror of the above.
- `C` — 3D owns the center (hero, landing) → text only in the top or bottom **third**,
  center-aligned, and never taller than 32vh.

Enforcement, not convention:
1. Camera keyframes are *designed* so the drone/focus object sits at NDC x ∈ [−0.9,−0.1]
   (for `L`) — verify with the screenshot loop.
2. Content containers are positioned by the same `focus` value (a `data-side`
   attribute the director sets on `<body>`; CSS grid does the rest). When focus flips
   between sections, content cross-fades sides (250ms).
3. Callout labels always dock in the empty half; leader lines cross the seam.
4. Backgrounds of content: **none, or a ≤ 40% left/right gradient scrim** —
   `linear-gradient(to left, rgba(5,8,10,.82), transparent 60%)`. Never a box.
   Legibility comes from the scrim + text-shadow, not from panels.

This rule replaces v1's panels entirely. Delete the `.panel` concept.

---

## 5. Scroll choreography (the film)

Total scroll ≈ 900vh. `T` = damped normalized scroll. Camera keyframes below are
starting values — tune against screenshots, but preserve each row's `focus` side
and narrative beat.

| T range | Act | Camera (pos → look) | Drone | focus | DOM content behavior |
|---|---|---|---|---|---|
| 0.00–0.08 | **PREFLIGHT** (hero) | slow 15° orbit around pad, (0,1.8,7)→(0,0.8,0) | on pad, rotors spooling from 0 | C | Name/title bottom third; HUD reads STANDBY→ARMED; scroll cue |
| 0.08–0.16 | **TAKEOFF** | pull back+up, drone rises past camera | climbs 0→3.2m, dust ring shader burst on liftoff | C | text exits down; pure cinema beat — no content. Earn the wow here |
| 0.16–0.38 | **TEARDOWN** (skills) | dolly to (−4.5,2.6,−8) look (1.5,2.6,−9) | hovers at (1.8,2.6,−9); **explodes**: components separate radially, slow rotation of whole assembly | L→(flip)→R midway | 6 skills appear one-per-sub-beat as callouts anchored to their component (§6.2 mapping); active callout amber, others dim cyan; body copy docked in empty half |
| 0.38–0.44 | reassemble + climb | crane up to top-down | drone reassembles, banks toward map | C | empty — transition beat |
| 0.44–0.70 | **MISSION MAP** (projects) | top-down orthographic-feel, (0,16,−26) look (0,0,−28), slow drift | flies the CatmullRom path as it draws; path z −20…−36 | R | left: holo-map fills; right: docked project console — one project at a time, scroll-stepped (ScrollTrigger snap), WPT-01…06; reached waypoints turn `--armed`; console shows title/desc/tags/GitHub link |
| 0.70–0.76 | descend to structure | swing down to (5,4.5,−40) | approaches tower | C | empty transition |
| 0.76–0.90 | **INSPECTION** (services) | slow 120° orbit of tower | drone orbits opposite the camera, gimbal aimed at tower; scan ring travels up | L | services tick in as terminal "scan findings" in right half, monospace, each with price (`--warn`); typed-line effect (skip on reduced motion) |
| 0.90–1.00 | **RTL / LANDING** (contact) | settle behind pad, (0,4.5,−49) look (0,0.4,−55) | descends, legs touch, rotors wind down, nav LEDs → steady green | C | "MISSION COMPLETE" + contact links bottom third: Upwork, Fiverr, LinkedIn, mailto:the.ahmed.hq@gmail.com; HUD: LAND → DISARMED, BAT rests at 32% |

HUD is global and persistent (top-layer, corners + telemetry), driven by director
state — it is the connective tissue that makes it one instrument, not five scenes.

---

## 6. Scene specs

### 6.1 World
- Fog `#05080a`, near 14, far 85. Hemisphere light (sky `#1b4a52`, ground `#05080a`,
  0.7) + key directional `#9adfe8` 0.8 + drone point light cyan.
- **Terrain shader** (replaces v1 GridHelper): plane 240×240, custom ShaderMaterial —
  wireframe-style grid in fragment (fwidth-based lines), gentle vertex noise hills
  toward edges (flat corridor down the flight line), and a cyan **scan sweep** band
  that travels the corridor every 9s. This is atmosphere; keep it at 12% brightness.
- 10–14 dark industrial silhouettes at |x| 14–34 with amber/red rooftop beacons.
- Dust particles per tier; drift only on HIGH.

### 6.2 Drone + explode API
Build from primitives as v1 (body, canopy, 4 arms/motors/rotor discs, gimbal+lens,
skids, nav LEDs), but structured for teardown. `drone.explode(k)` with k ∈ [0,1]:
each component lerps from assembled position to an exploded offset along its radial
axis (offsets 0.6–1.4m), plus slight individual rotation. Component→skill mapping
(these are the callout anchors):

| Component | Skill label | Tags |
|---|---|---|
| Flight controller (canopy box) | Drone Systems & ArduPilot | ArduPilot · MAVLink · PX4 · Mission Planner |
| Gimbal + camera lens | Data & Log Analysis | .BIN parsing · Telemetry · Pipelines |
| ESC / arms cluster | Python Automation | Python · Scripts · Apps Script |
| Antenna mast (add: thin cylinder + sphere, rear) | APIs & Cloud | FastAPI · Supabase · R2 · Render |
| Rotor set | Full-Stack Web Dev | JS · HTML/CSS · GAS backends |
| Battery slab (add: box under body) | Deployment & CI/CD | GitHub · Actions · Pages |

(Note two new small parts to build: antenna, battery — they exist to carry skills.)

### 6.3 Mission map
- Path: CatmullRom through 6 waypoints (reuse v1 points, z −20…−36); tube-less
  `Line` with drawRange scrub + a fading ground trace.
- Waypoints: octahedrons, amber→green on pass; active one pulses.
- Under the map act only: a secondary finer grid + faint concentric range rings
  centered on the path start fade in (opacity 0.15) — tactical map feel.
- Project data lives in `content/data.js` (6 projects from current site, WPT-01…06,
  real GitHub links when Ahmed provides them; placeholder `https://github.com` until then).

### 6.4 Tower
- v1 stacked-box chimney + red beacon + rising scan ring is good; add 3 amber
  "defect markers" that blink on as the scan passes them (they're what the services
  callouts point at conceptually).

### 6.5 Boot loader
Terminal types 5 lines (~1.2s total): `GCS v2.1 … LINK ESTABLISHED … GPS 3D FIX (14 SAT)
… IMU CAL OK … MOTORS ARMED`. Then the terminal *becomes* the HUD (morph, don't cut).
Reduced motion / TIER_LOW: instant.

---

## 7. Content (all real, from current site — keep verbatim tone)

- Identity: Ahmed — "Python Dev & Drone Engineer", Jamshedpur IN, remote worldwide,
  open to freelance. Brand mark: existing DevDrone SVG.
- Projects (6): ArduPilot Log Parser · FastAPI Backend Starter · Drone Telemetry
  Dashboard · Google Sheets Automation · File Storage API (R2+FastAPI) · YouTube Tools Suite.
- Services (5, with prices): REST APIs from $150 · Python Automation from $80 ·
  Drone/ArduPilot from $100 · Full-Stack Apps from $200 · Consulting $30/hr.
- Contact: Upwork, Fiverr, LinkedIn (`linkedin.com/in/sahil-ahmed-369231293`),
  `the.ahmed.hq@gmail.com`.
- SEO: real text must exist in DOM (the docked consoles are real HTML). Keep title/
  meta description; add OpenGraph image = the beauty render from the LOW tier.

---

## 8. Build phases (execute in order; each has a gate)

**P0 — Skeleton (½ day):** Vite + three + deploy workflow green on Pages. Empty scene
renders fog + terrain shader. *Gate: live URL updates on push.*

**P1 — Director & drone (1 day):** keyframe system with `focus` sides, damped T,
drone v2 with explode API (k=0), HUD telemetry live. *Gate: full scroll flythrough,
no content yet, 60fps desktop; screenshot loop shows focus object in declared half
at every keyframe.*

**P2 — Acts I–II (1 day):** hero, takeoff beat (dust burst), teardown with callout
system + 6 skills. *Gate: screenshots at t=0.05…0.38 pass Empty-Half; callout leader
lines track during camera motion without jitter.*

**P3 — Acts III–V (1–1.5 days):** mission map + stepped project console, tower scan +
services terminal, landing + contact. *Gate: every project reachable by scroll AND
rail click; all links work; landing settles exactly on pad.*

**P4 — Tiers, a11y, fallback (½ day):** MED/LOW tiers, reduced motion, keyboard nav
(rail focusable, sections reachable), LOW static page with beauty render. *Gate:
Lighthouse ≥ 90 perf on MED profile, ≥ 95 a11y; site fully readable with WebGL
force-disabled.*

**P5 — Polish (open-ended, your judgment, Opus):** bloom tuning, grain, takeoff dust,
rotor blur at speed, sound design toggle (off by default), micro-interactions.
One rule: run the screenshot critique after every change; if an addition doesn't
serve the GCS fiction, cut it.

---

## 9. Prompts for the human to use with Claude Code

1. Kickoff: *"Read MISSION_PLAN.md fully. Restate the Rule of the Empty Half and the
   phase gates in your own words before writing any code. Then execute P0."*
2. Per phase: *"Execute P[n]. Before marking it done, run the Playwright screenshot
   loop at t=0…1 and paste your critique against §4 and §5."*
3. If Opus proposes deviating: require it to name which section of this plan it's
   overriding and why. Concept, tokens, and §4 are not overridable; coordinates and
   timings are.
