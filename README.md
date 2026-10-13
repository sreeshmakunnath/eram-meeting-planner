# ERAM Meeting Planner — Phase 1

Meeting and task planner for ERAM Holdings. This first phase delivers the foundation the meeting and task modules build on:

| Module | What works |
| --- | --- |
| Login | Email or username + password, 5 failed attempts lock the account for 15 min, inactive users can't sign in, 8-hour session |
| Passwords | Welcome email with a set-password link (72 h), Forgot password (30 min link, single use), change password in profile, policy: 8+ chars, upper case, number, symbol |
| Roles | **Admin** (everything) and **User** (own groups, clients, profile). Checked in middleware *and* in every page and server action |
| Users | Admin list with search and filters, add / edit, branch, business unit, reporting manager, groups, activate / deactivate, unlock, resend password link. Users are never hard-deleted |
| Branches & BUs | Admin-managed master lists (add, rename, deactivate) |
| Groups | Any number of groups; type, lead, members, archive, delete. Users see only the groups they belong to. New members get an email |
| Client master | Client fields + contacts, search / filters, CSV export (opens in Excel). Clients that users add stay **Pending review** until an Admin approves or merges them; likely duplicates (e.g. "Sabbic" vs "SABIC") are flagged |
| Dashboard | Personal tiles + Admin organisation view (BD pipeline by stage, users by branch). Meeting and task tiles fill in Phases 2–3 |
| Audit log | Sign-ins, failed sign-ins, lockouts, password events and every change to users, groups, clients and masters |
| Email | Instant emails only (welcome, reset, added to group). Scheduled reminders are a later phase |

The 10 companies from the Client Meeting Planner / BD Target Schedule are seeded as the first clients.

## Stack

- **Next.js 14** (App Router, React 18, TypeScript): pages are React server components; forms post to **server actions** (`src/lib/actions/*`)
- **PostgreSQL** via **Drizzle ORM** (`src/db/schema.ts`): pure TypeScript, no binary engine, works well on Vercel + Neon
- **next-auth 4** (credentials provider, JWT sessions). Microsoft sign-in can be added as a second provider later
- **Tailwind CSS** with the ERAM navy `#1F3864` / blue `#2E75B6` palette
- **Nodemailer** over SMTP (Microsoft 365 or Resend)

> The design document named Prisma; Drizzle is used instead because it has no native engine to download, which also makes Vercel builds simpler. The tables match section 11 of the design.

## Run locally

Requirements: Node.js 20+ and a PostgreSQL database (local install, Docker, or a free Neon project).

```bash
# 1. Database (Docker example)
docker run -d --name eram-pg -e POSTGRES_USER=eram -e POSTGRES_PASSWORD=eram -e POSTGRES_DB=eram_planner -p 5432:5432 postgres:16

# 2. App
cp .env.example .env          # then set NEXTAUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate            # creates the tables
npm run db:seed               # branches, business units, first admin, 10 clients
npm run dev                   # http://localhost:3000
```

Sign in with `admin` / `Admin@12345` (set by `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) and change the password under **My profile**.

**Emails in development:** leave `SMTP_HOST` empty and every email (with its links) is printed in the terminal running `npm run dev`. Copy the set-password link from there to test new users.

## Deploy to Vercel + Neon

1. Create a **Neon** project (Vercel → Storage → Neon, or neon.tech). Copy the **pooled** connection string (it ends with `?sslmode=require`).
2. Push this folder to a GitHub repo and **import it in Vercel**.
3. In Vercel → Settings → Environment Variables, add:
   - `DATABASE_URL`: the Neon pooled URL
   - `NEXTAUTH_SECRET`: a long random string (`openssl rand -base64 32`)
   - `NEXTAUTH_URL` and `APP_URL`: your Vercel URL, e.g. `https://eram-meeting-planner.vercel.app`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`: see below
4. Deploy. The `vercel-build` script runs `db:migrate` before `next build`, so tables are created or updated on every deploy.
5. Seed once from your machine against Neon: `DATABASE_URL="<neon url>" npm run db:seed`.

**SMTP options**
- Microsoft 365: `smtp.office365.com`, port `587`, a licensed mailbox and password (IT must allow SMTP AUTH for it).
- Resend: `smtp.resend.com`, port `465`, user `resend`, password = API key; verify your domain in Resend first.

**Data location:** Vercel and Neon run in US / EU / Asia-Pacific regions. Check with IT whether ERAM data must stay in Saudi Arabia before going to production.

## Project layout

```
src/
  app/(auth)/            login, forgot-password, set-password
  app/(app)/             signed-in pages: dashboard, clients, groups, profile, admin/*
  app/api/               next-auth route, clients CSV export
  components/            UI helpers, sidebar, form wrapper
  db/schema.ts           all tables (Drizzle)
  db/migrate.ts, seed.ts
  lib/actions/           server actions: auth, users, groups, clients, masters
  lib/auth.ts            next-auth config, lockout, requireUser / requireAdmin
  lib/mail.ts            email layout + sending
  lib/audit.ts           audit log writer
  middleware.ts          sign-in required everywhere; /admin/* needs Admin
drizzle/                 SQL migrations (generated)
```

Changing the schema: edit `src/db/schema.ts`, run `npm run db:generate` (writes a new SQL migration), then `npm run db:migrate`.

## Next phases

- **Phase 2: Meetings.** Meeting records with every field from the Client Meeting Planner sheet, client dropdown with contacts, attendees as users and/or groups, status flow, month/week/day/agenda calendar, invitation emails with .ics, meeting activity log, Excel import of the current planner.
- **Phase 3: Tasks and reports.** Task planner (list, board, timeline), Meeting Brief with agreed actions → tasks, Planner / Target Schedule / task reports with Excel and PDF export.
- **Phase 4: Dashboards.** Individual and org-wide widgets for meetings and tasks.
- **Later:** scheduled reminders and digests (Vercel Cron), Microsoft sign-in.
