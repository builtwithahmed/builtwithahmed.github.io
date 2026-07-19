// All copy sourced verbatim (or near-verbatim, see note on `skills`) from
// reference/v1-prototype.html — the REJECTED prototype's architecture is
// off-limits, but its real content (project names, prices, contact links,
// skill descriptions) is exactly what MISSION_PLAN.md says to reuse.

export const identity = {
  name: 'Ahmed',
  title: 'Python Dev & Drone Engineer',
  location: 'Jamshedpur, India',
  availability: 'Armed · Open to freelance', // v1 .hero-badge
  heroHeadlineLines: ['Python Dev &', 'Drone Engineer'], // v1 #hero h1 (two lines, accent on line 2)
  heroSub:
    'I build production-grade REST APIs, automation systems, and drone telemetry tools. ArduPilot specialist. Based in Jamshedpur, India — flying globally.',
  ctaPrimary: { label: 'Fly the Mission', href: '#projects' },
  ctaSecondary: { label: 'Get in Touch', href: '#contact' },
};

export const teardown = {
  eyebrow: 'Systems check', // v1 #skills .eyebrow
  heading: 'What I Work With', // v1 #skills h2
  sub: 'From drone firmware to cloud APIs — full technical stack, all systems nominal.', // v1 #skills .sub
};

// §6.2's component -> skill-label -> tags mapping is authoritative (it's
// MISSION_PLAN's own table, not invented copy); blurbs are the closest
// matching real sentence from v1. "APIs & Cloud" and "Deployment &
// CI/CD" don't have a 1:1 title match in v1 — both originally reused
// v1's single "Cloud & Storage" sentence as a placeholder; provided
// directly (pending Ahmed's confirmation) as of 2026-07-19.
export const skills = [
  {
    componentKey: 'flightController',
    title: 'Drone Systems & ArduPilot',
    blurb: 'ArduPilot firmware, MAVLink protocol, .BIN log analysis, flight controller configuration.',
    tags: ['ArduPilot', 'MAVLink', 'PX4', 'Mission Planner'],
  },
  {
    componentKey: 'gimbal',
    title: 'Data & Log Analysis',
    blurb: 'Telemetry parsing, flight data extraction, analysis pipelines, Sheets automation.',
    tags: ['.BIN parsing', 'Telemetry', 'Pipelines'],
  },
  {
    componentKey: 'escArms',
    title: 'Python Automation',
    // v1 #services row (exact title match), not the #skills "Python & FastAPI" row.
    blurb: 'Process automation, data pipelines, Google Sheets scripts, web scrapers.',
    tags: ['Python', 'Scripts', 'Apps Script'],
  },
  {
    componentKey: 'antenna',
    title: 'APIs & Cloud',
    // Pending Ahmed's confirmation — see comment above.
    blurb: 'FastAPI services on Supabase and Postgres, object storage on Cloudflare R2, deployed to Render.',
    tags: ['FastAPI', 'Supabase', 'R2', 'Render'],
  },
  {
    componentKey: 'rotors',
    title: 'Full-Stack Web Dev',
    blurb: 'Modern JS + HTML/CSS frontends on FastAPI or Google Apps Script backends.',
    tags: ['JS', 'HTML/CSS', 'GAS backends'],
  },
  {
    componentKey: 'battery',
    title: 'Deployment & CI/CD',
    // Pending Ahmed's confirmation — see comment above.
    blurb: 'GitHub Actions pipelines, automated builds, static hosting on Pages.',
    tags: ['GitHub', 'Actions', 'Pages'],
  },
];
