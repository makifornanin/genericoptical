# Generic optical platform

Two applications for an optical shop. Each one is a self-contained Next.js 16 project, with its own `package.json`, tests and Vercel project:

| Folder | What it is | Vercel project |
| --- | --- | --- |
| [`dashboard/`](dashboard/README.md) | **Specta**, the staff dashboard: POS, orders, inventory, purchasing, CRM, appointments, reports, staff permissions, and the GoHighLevel integration. PostgreSQL (Drizzle). It also serves the public API that the website uses. | `optical-management-dashboard` |
| [`customer-website/`](customer-website/README.md) | The customer-facing demo store: catalogue, lens selection, bag, pickup checkout (simulated card, nothing is charged), order tracking, and GoHighLevel form, booking and chat embeds. It reads and writes only through the dashboard's public API, server to server, with a site key. | `optical-customer-website` |

The website never touches the database. Everything goes through `dashboard`'s `/api/public/v1` (documented in [`dashboard/docs/PUBLIC_API.md`](dashboard/docs/PUBLIC_API.md)).

## Running locally

Each project is installed and run from its own folder:

```bash
cd dashboard && npm install && cp .env.example .env.local   # then follow dashboard/README.md
cd customer-website && npm install && cp .env.example .env.local   # then follow customer-website/README.md
```

Secrets live only in each project's `.env.local` (git-ignored) and in Vercel's environment variables. Never commit them.

## Status

- Latest status reports: [`dashboard/docs/PHASE5_STATUS.md`](dashboard/docs/PHASE5_STATUS.md) and [`dashboard/docs/PHASE6_STATUS.md`](dashboard/docs/PHASE6_STATUS.md).
- This is a demonstration build. The seeded demo business, its staff sign-ins and the demo store are not for real customer data.
- Change the demo staff passwords before any real use.

## History

Both projects were developed in separate repositories and combined here with `git subtree`, so their full commit histories are kept under each folder.
