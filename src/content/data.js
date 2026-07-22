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
export const missionLog = {
  eyebrow: 'Mission log', // v1 #projects .eyebrow
  heading: 'Featured Projects', // v1 #projects h2
  sub: 'Each waypoint on the flight path behind this panel is a shipped tool — real work, not tutorials.',
};

// §6.3's WPT-01..06 order matches the flight path/map waypoints 1:1 (map.js
// WAYPOINTS array) — real GitHub links pending Ahmed's confirmation, so
// every entry uses the same placeholder MISSION_PLAN.md §6.3 specifies.
export const projects = [
  {
    wpt: 'WPT-01',
    title: 'ArduPilot Log Parser',
    blurb: 'Parses ArduPilot .BIN flight logs — GPS, IMU, attitude, battery, and error data into structured CSV/JSON.',
    tags: ['Python', 'MAVLink', 'Data'],
    github: 'https://github.com',
  },
  {
    wpt: 'WPT-02',
    title: 'FastAPI Backend Starter',
    blurb: 'Production template — JWT auth, CRUD, Supabase, CORS, Render deploy config. Fork and ship.',
    tags: ['FastAPI', 'Supabase', 'JWT'],
    github: 'https://github.com',
  },
  {
    wpt: 'WPT-03',
    title: 'Drone Telemetry Dashboard',
    blurb: 'Real-time web dashboard for flight telemetry — GPS path, altitude, battery, anomalies over live MAVLink.',
    tags: ['Python', 'MAVLink', 'Charts'],
    github: 'https://github.com',
  },
  {
    wpt: 'WPT-04',
    title: 'Google Sheets Automation',
    blurb: 'Apps Script system automating workflows — data sync, reports, email triggers, dashboards.',
    tags: ['Apps Script', 'Sheets API'],
    github: 'https://github.com',
  },
  {
    wpt: 'WPT-05',
    title: 'File Storage API (R2 + FastAPI)',
    blurb: 'Upload/download REST API on Cloudflare R2 — presigned URLs, metadata, access control.',
    tags: ['FastAPI', 'R2', 'S3 API'],
    github: 'https://github.com',
  },
  {
    wpt: 'WPT-06',
    title: 'YouTube Tools Suite',
    blurb: 'Content automation — subtitle generation, thumbnail batching, metadata via YouTube Data API.',
    tags: ['Python', 'YouTube API'],
    github: 'https://github.com',
  },
];

export const inspection = {
  eyebrow: 'Inspection report', // v1 #services .eyebrow
  heading: 'What I Can Build For You', // v1 #services h2
  sub: "Fast turnaround, clean code, no fluff. Let's ship something great.",
};

export const services = [
  {
    num: '01',
    title: 'REST API Development',
    blurb: 'FastAPI backends with auth, CRUD, Supabase/PostgreSQL, Render deployment.',
    price: 'from $150',
  },
  {
    num: '02',
    title: 'Python Automation',
    blurb: 'Process automation, data pipelines, Google Sheets scripts, web scrapers.',
    price: 'from $80',
  },
  {
    num: '03',
    title: 'Drone / ArduPilot Integration',
    blurb: 'MAVLink scripts, .BIN log parsers, telemetry dashboards, parameter tuning.',
    price: 'from $100',
  },
  {
    num: '04',
    title: 'Full-Stack Web Apps',
    blurb: 'End-to-end apps — modern JS frontend, Python backend, deployed.',
    price: 'from $200',
  },
  {
    num: '05',
    title: 'Consulting & Code Review',
    blurb: 'ArduPilot debugging, API architecture review, drone system consulting.',
    price: '$30/hr',
  },
];

export const landing = {
  eyebrow: 'Cleared to land', // v1 #contact .eyebrow
  heading: "Let's Work Together", // v1 #contact h2
  sub: 'Currently available for freelance projects. Fast response, reliable delivery, clean code every time.',
  direct: 'the.ahmed.hq@gmail.com',
};

export const contact = [
  { label: 'Upwork', sub: 'Hire on Upwork', href: 'https://upwork.com', icon: 'U' },
  { label: 'Fiverr', sub: 'Order a gig', href: 'https://fiverr.com', icon: 'F' },
  { label: 'LinkedIn', sub: 'Connect with me', href: 'https://linkedin.com/in/sahil-ahmed-369231293/', icon: 'in' },
  { label: 'Email', sub: 'Direct message', href: 'mailto:the.ahmed.hq@gmail.com', icon: '@' },
];

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
