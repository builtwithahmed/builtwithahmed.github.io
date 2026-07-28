// v1.2 #B: reusable text reveal system, replacing the plain opacity fades
// content.js/callouts.js/projectCallouts.js used everywhere. Three reveal
// kinds (see MISSION_PLAN.md-adjacent spec, v1.2 prompt B), one exit:
//   - decodeHeading: character scramble-to-lock, sweeping left to right.
//   - decodeEyebrow: terminal type-on with a caret that blinks twice.
//   - decodeBody: per-line stagger (translateY + opacity + blur), no
//     scramble — scrambling a whole paragraph reads as noise, not reveal.
//   - decodeOut: the one shared exit for all three — opacity out, 150ms,
//     no reverse-scramble/reverse-type.
//
// Every entry point is meant to be called ONCE per activation (a row/
// section transitioning from hidden to shown), never per scroll frame —
// callers own that edge detection (see content.js/callouts.js/
// projectCallouts.js: each tracks its own previous-visible boolean and
// only calls in on the false->true transition). Nothing here polls T or
// runs continuously once a reveal completes.
import '../styles/decode.css';

const SCRAMBLE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/|\\_';
// Per-character scramble duration, mid-range of the 150-300ms spec.
const CHAR_DURATION = 180;
// Hard cap on a single line's total reveal (first char starts -> last
// char locks), per spec — stagger is derived FROM this, not the other way
// round, so a very long heading still finishes on time.
const MAX_LINE_DURATION = 600;
const MIN_STAGGER = 2;
const MAX_STAGGER = 40;
const FADE_OUT_MS = 150;
const TYPE_CHAR_MS = 16;
// v1.2.1 #4: re-entry fade for headings/row titles AND .blurb — a plain
// opacity fade, never the scramble/stagger a first-time reveal gets.
const REENTRY_FADE_MS = 150;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// v1.4 Step 3 (post-review): a CSS transition with a computed duration of
// 0 never fires `transitionend` at all (no transition instance is created
// to fire it from) — per spec, not a browser bug. decodeBody's first-time
// reveal path clears `dataset.revealing` from exactly that event, so
// enabling captureFreeze in gate.mjs (tokens.css's `html[data-capture-
// freeze] * { transition-duration: 0s !important }`) left every blurb
// stuck "revealing" forever once triggered — confirmed by the gate itself
// immediately after enabling freeze (dozens of blurb-guard failures where
// none existed before). Reusing reducedMotion()'s existing early-return
// (final text placed instantly, no spans, nothing ever marked revealing)
// for captureFreeze too is the minimal fix: that branch already handles
// "skip the animation, show the settled state" for real visitors with
// prefers-reduced-motion, and captureFreeze wants exactly the same
// outcome for a different reason. `data-capture-freeze` is only ever set
// behind main.js's `?debug` guard, so this has zero effect in production.
function captureFrozen() {
  return document.documentElement.hasAttribute('data-capture-freeze');
}

function randomGlyph() {
  return SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
}

// Every active reveal on an element is tracked here so a re-trigger (or
// decodeOut) can cancel the in-flight rAF loop instead of leaving two
// loops fighting over the same textContent.
const active = new WeakMap();

function cancel(el) {
  const prev = active.get(el);
  if (prev) {
    cancelAnimationFrame(prev.raf);
    active.delete(el);
  }
}

// v1.2.1 #4: "scramble runs once per element per SESSION, not per
// activation." Elements are created once at page load and only ever
// toggled hidden/shown (never recreated), so a WeakSet keyed by element
// reference correctly remembers "already decoded" across re-entries and
// naturally resets on a fresh page load.
const everDecoded = new WeakSet();

// Forces the browser to flush the opacity:0 it just painted before the
// transition below is applied — otherwise same-frame style writes can
// coalesce into one paint and the fade never visibly plays.
function flush(el) {
  void el.offsetWidth;
}

// Character scramble-to-lock. `text` is the final plain-text content —
// this owns el.textContent for the duration of the reveal. Not for
// elements with nested markup (hero's h1 has a <br>/<span class="accent">
// and is handled by decodeHeadingLines below instead).
export function decodeHeading(el, text) {
  cancel(el);
  if (reducedMotion()) {
    el.textContent = text;
    everDecoded.add(el);
    return;
  }
  if (everDecoded.has(el)) {
    // Re-entry: plain fade, never re-scramble. The scramble path below
    // never touches opacity (full opacity, always) — this is the one
    // deliberate exception, and it replaces the scramble entirely rather
    // than layering on top of it.
    el.textContent = text;
    el.style.transition = 'none';
    el.style.opacity = '0';
    flush(el);
    el.style.transition = `opacity ${REENTRY_FADE_MS}ms ease`;
    el.style.opacity = '1';
    return;
  }
  everDecoded.add(el);
  const n = text.length;
  if (n === 0) {
    el.textContent = '';
    return;
  }
  const stagger = n > 1 ? Math.max(MIN_STAGGER, Math.min(MAX_STAGGER, (MAX_LINE_DURATION - CHAR_DURATION) / (n - 1))) : 0;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    let out = '';
    let allLocked = true;
    for (let i = 0; i < n; i++) {
      const ch = text[i];
      if (ch === ' ') {
        out += ' ';
        continue;
      }
      const lockAt = i * stagger + CHAR_DURATION;
      if (elapsed >= lockAt) {
        out += ch;
      } else {
        out += randomGlyph();
        allLocked = false;
      }
    }
    // One textContent write per frame regardless of line length — DOM
    // writes batched, never one per character.
    el.textContent = out;
    if (allLocked) {
      active.delete(el);
    } else {
      const raf = requestAnimationFrame(frame);
      active.set(el, { raf });
    }
  }
  const raf = requestAnimationFrame(frame);
  active.set(el, { raf });
}

// Hero's h1 is two lines ("Python Dev &" / accent-spanned "Drone
// Engineer") around a <br> — scrambling it needs to preserve that
// structure rather than clobbering it with a single textContent write.
// Runs both lines as independent scrambles (same left-to-right sweep,
// same timing) so they lock together rather than one visibly lagging.
export function decodeHeadingLines(el, lines) {
  cancel(el);
  el.innerHTML = '';
  const spans = lines.map((_, i) => {
    const span = document.createElement('span');
    if (i === lines.length - 1) span.className = 'accent';
    el.appendChild(span);
    if (i < lines.length - 1) el.appendChild(document.createElement('br'));
    return span;
  });
  spans.forEach((span, i) => decodeHeading(span, lines[i]));
}

// Terminal type-on: reveals `text` left to right at a steady per-character
// rate (distinct from the heading scramble — no glyph noise, just a
// caret advancing), then blinks the caret twice and removes it.
export function decodeEyebrow(el, text) {
  cancel(el);
  el.textContent = '';
  const textNode = document.createTextNode('');
  el.appendChild(textNode);
  const caret = document.createElement('span');
  caret.className = 'decode-caret';
  el.appendChild(caret);

  if (reducedMotion()) {
    textNode.textContent = text;
    caret.remove();
    return;
  }

  const n = text.length;
  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    const shown = Math.min(n, Math.floor(elapsed / TYPE_CHAR_MS));
    textNode.textContent = text.slice(0, shown);
    if (shown < n) {
      const raf = requestAnimationFrame(frame);
      active.set(el, { raf });
    } else {
      active.delete(el);
      caret.addEventListener('animationend', () => caret.remove(), { once: true });
    }
  }
  const raf = requestAnimationFrame(frame);
  active.set(el, { raf });
}

// Per-line stagger (translateY 12px + opacity, 1px blur -> sharp), 80ms
// between lines. No scramble — operates on el's EXISTING text, splitting
// it into words, wrapping each in a span, then grouping by measured
// offsetTop (the actual rendered line breaks, not assumed ones) so this
// works regardless of container width/viewport.
export function decodeBody(el) {
  cancel(el);
  // v1.2.1 #4: tags every decodeBody target as the gate's ".blurb" hook —
  // the only element class allowed the "visible from reveal-start" anti-
  // emptiness allowance (scripts/gate.mjs) and the only one subject to its
  // 700ms revealing-duration guard.
  el.classList.add('blurb');
  const text = el.textContent;
  if (reducedMotion() || captureFrozen() || !text.trim()) {
    everDecoded.add(el);
    return; // text is already in place; nothing to animate
  }
  if (everDecoded.has(el)) {
    // Re-entry: one block fade — no per-line stagger, no blur settle. The
    // existing .decode-word spans from the first-time reveal are left
    // exactly as they are (already settled at decode-word-in); only this
    // element's own opacity animates.
    el.dataset.revealing = 'true';
    el.style.transition = 'none';
    el.style.opacity = '0';
    flush(el);
    el.style.transition = `opacity ${REENTRY_FADE_MS}ms ease`;
    el.style.opacity = '1';
    setTimeout(() => {
      delete el.dataset.revealing;
    }, REENTRY_FADE_MS);
    return;
  }
  everDecoded.add(el);
  const tokens = text.split(/(\s+)/); // keep whitespace as its own tokens
  el.textContent = '';
  const words = [];
  for (const token of tokens) {
    if (token === '') continue;
    if (/^\s+$/.test(token)) {
      el.appendChild(document.createTextNode(token));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'decode-word';
    span.textContent = token;
    el.appendChild(span);
    words.push(span);
  }
  if (words.length === 0) return;

  // Group by rendered line (offsetTop), not word count — this is a real
  // layout read, which is why decodeBody is a one-shot activation call,
  // never a per-frame one.
  const lines = [];
  let lastTop = null;
  for (const w of words) {
    const top = w.offsetTop;
    if (top !== lastTop) {
      lines.push([]);
      lastTop = top;
    }
    lines[lines.length - 1].push(w);
  }
  lines.forEach((lineWords, i) => {
    for (const w of lineWords) w.style.transitionDelay = `${i * 80}ms`;
  });
  // v1.2.1 #4: gate.mjs's 700ms guard reads this while the stagger is in
  // flight — cleared once the LAST word (highest transitionDelay, so the
  // last to finish) actually completes its transition, the same event-
  // based completion pattern decodeEyebrow's caret uses below, rather than
  // a hand-computed timeout that could drift from the real CSS timing.
  el.dataset.revealing = 'true';
  words[words.length - 1].addEventListener(
    'transitionend',
    () => {
      delete el.dataset.revealing;
    },
    { once: true }
  );
  // Next frame so the initial (hidden) styles have actually painted before
  // the revealed class flips — otherwise the browser can coalesce both
  // states into one paint and skip the transition entirely.
  requestAnimationFrame(() => {
    for (const w of words) w.classList.add('decode-word-in');
  });
}

// The one shared exit for all three reveal kinds above: opacity out,
// 150ms, no reverse-scramble/reverse-type. Cancels whatever reveal is
// still in flight on `el` first.
export function decodeOut(el) {
  cancel(el);
  if (reducedMotion()) {
    el.style.opacity = '0';
    return;
  }
  el.style.transition = `opacity ${FADE_OUT_MS}ms ease`;
  el.style.opacity = '0';
}

export const DECODE_FADE_OUT_MS = FADE_OUT_MS;
