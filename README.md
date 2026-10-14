# ERAM Meeting Planner — Phases 1–3

Meeting and task planner for ERAM Holdings.

## Phase 3 — Task planner and BD reports

| Feature | What works |
| --- | --- |
| Brief actions → tasks | **Every agreed action on a submitted Meeting Brief becomes a task**: same action text, owner (person, or group → its members), deadline, linked meeting and client. Assignees are emailed. Reopening and resubmitting a brief updates the same tasks (edited text / owner / deadline), creates tasks for new actions and cancels tasks of removed actions; completed tasks stay completed. Briefs submitted before Phase 3 get their tasks on the first `db:migrate` after deploying |
| Tasks | Title, description, category (Market research, MIR report, Approach, Follow-up, Presentation, General), client, linked meeting, priority, start / due date, status (Not started, Started, In progress, On hold, Completed, Cancelled), % complete, checklist, comments, activity log |
| Assignment | One or more people and/or groups. A group can be **Shared** (one task for the group) or **Individual** (a separate copy per member) |
| Views | **List** with Today / This week / Overdue / Upcoming / All open / Completed, **Board** (drag cards between status columns; a "Move to" menu on phones) and **Timeline** (six-week bars, today line, overdue outlined) |
| Emails | Task assigned, task completed (to the creator), @mentions in comments (`@username` or `@Firstname`) |
| BD Target Schedule | The **Batch schedule** sheet as a live report: one row per company with Market research / MIR / Approach / Follow-up deadlines, owners and statuses, built from that company's tasks; overdue in red; filter by batch; **Excel export** in the sheet's layout. Admins can **import** the schedule sheet (creates / updates 4 tasks per company, matches "Dana" → Danah Abdullah) or click **+ Create BD tasks** for a company |
| Task report | Counts by status, workload by person and by group (open, overdue, due in 7 days, done in 30 days), overdue list, Excel exports |
| Everywhere else | Task due dates on the calendar, Tasks tab on client pages, open tasks on group and meeting pages, open / overdue tasks on the client status board, task tiles on the dashboard |

Who sees what: Admins see every task. Users see tasks they created or are assigned to (directly, or through a group they're in). The creator or an Admin edits / deletes a task; assignees update status, progress, checklist and comments.

## Phase 2 — Client meetings and reports

| Feature | What works |
| --- | --- |
| Meeting entry | Every column of the **Client Meeting Planner** sheet: priority, client (dropdown from the client master, or "+ Add new client"), country / location, platform + venue or link, client contacts (picked from that client's contacts, plus free text), ERAM attendees (groups and/or people), meeting type, date + start/end time (Saudi time), status, objective / agenda, business units, presentation / documents, next action, action owner(s), follow-up date, notes. Picking a client pre-fills location, business units and the client's account group |
| Status flow | To Be Scheduled → Scheduled (automatic once a date is set) → Confirmed → Completed; Postponed and Cancelled. Quick buttons on the meeting page |
| Invites | Scheduling, rescheduling, confirming and cancelling email the ERAM attendees with an **.ics calendar invite** (Outlook adds / updates / removes it). Added or removed attendees get their own invite or cancellation |
| Clash warning | Shown on the meeting page when an attendee has another meeting at the same time |
| Calendar | Month grid (Sun–Sat, Fri/Sat shaded) and agenda view, filters by person / group / client, click a day to plan a meeting there, "To Be Scheduled" side panel |
| Meeting Brief | The **Meeting Brief** sheet as a form after the meeting: client attendees, attendance ticks, key discussion points, documents used, outcomes / opportunities, agreed actions (action, owner = person or group, deadline), next follow-up date. Save draft or submit; submit marks the meeting Completed, emails the brief to attendees and action owners, and creates a **follow-up meeting** (To Be Scheduled) when a follow-up date is set. Submitted briefs are locked; organiser / Admin can reopen (version +1) |
| Print / PDF | Printable brief in the sheet's two-column layout (browser "Save as PDF") |
| Activity log | Per meeting: created, rescheduled (from → to), status changes, attendees added / removed, field changes, brief saved / submitted / reopened |
| Planner report | Filterable list (status, priority, client, attendee, group, date range) + **Excel export** with the sheet's 16 columns and ERAM header |
| Excel import | Admin uploads the existing planner .xlsx. Clients are matched (including near-matches like "Sabbic" → SABIC) or added; attendees / owners matched to users by name, unmatched names kept in notes. Re-running skips rows already imported. No emails during import |
| Client status | One page for all clients: overall status (**Follow-up overdue / To be scheduled / Meeting booked / Met — no next step / No meeting yet**) with counts, BD stage (changeable inline by Admin or account owner), last meeting, next meeting, current next action + owner, follow-up date, agreed actions, meetings done. Filter by status, stage, owner; **Excel export** |
| Dashboard | My meetings this week, my open / overdue tasks, briefs to write, next 7 days; Admin: meetings this month, overdue tasks, to be scheduled, follow-ups overdue |

Who sees what: Admins see every meeting. Users see meetings they organise, attend (directly or through a group), own the next action of, or own an agreed action on the meeting's brief (as a person or as a member of the owning group). Only the organiser or an Admin edits a meeting; any attendee can write the brief.

## Phase 1 — Foundation


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
| Email | Instant emails only (welcome, reset, added to group; Phase 2 adds meeting invites and briefs). Scheduled reminders are a later phase |

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
# optional: sign in as admin → Meetings → Import Excel → upload ERAM_Meeting_Planner.xlsx
npm run dev                   # http://localhost:3000
```

Sign in with `admin` / `Admin@12345` (set by `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) and change the password under **My profile**.

**Office network blocking the database?** If you see `connect ETIMEDOUT …:5432`, your network blocks PostgreSQL's port. Neon URLs (`…neon.tech`) automatically use Neon's serverless driver over **port 443**, which normally gets through. To force a driver, set `DB_DRIVER=neon` or `DB_DRIVER=pg` in `.env`. If the database can't be reached, pages show a clear "Can't reach the database" message instead of crashing, and your session is kept.

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
  app/api/               next-auth route, CSV / Excel exports
  components/            UI helpers, sidebar, form wrapper
  db/schema.ts           all tables (Drizzle)
  db/pool.ts             picks the Neon (port 443) or pg (port 5432) driver
  db/migrate.ts, seed.ts migrations (+ brief-task catch-up), first data
  lib/actions/           server actions: auth, users, groups, clients, masters, meetings, briefs, import, tasks, target
  lib/meetings.ts        meeting labels, Saudi-time helpers, visibility rules, .ics builder
  lib/meeting-queries.ts planner list / calendar queries
  lib/client-status.ts   client status board logic
  lib/tasks.ts           task labels, visibility rules, assignment emails
  lib/task-queries.ts    task list / calendar queries
  lib/brief-tasks.ts     brief agreed actions → tasks sync (+ backfill)
  lib/target-schedule.ts BD Target Schedule report
  lib/excel.ts           branded Excel export
  lib/auth.ts            next-auth config, lockout, requireUser / requireAdmin
  lib/mail.ts            email layout + sending
  lib/audit.ts           audit log writer
  middleware.ts          sign-in required everywhere; /admin/* needs Admin
drizzle/                 SQL migrations (generated)
```

Upgrading an existing database: just deploy (or run `npm run db:migrate`). `0001_meetings` adds the meeting tables, `0002_tasks` the task tables; all data is kept, and tasks are created for briefs submitted earlier.

Changing the schema: edit `src/db/schema.ts`, run `npm run db:generate` (writes a new SQL migration), then `npm run db:migrate`.

## Next phases

- **Later:** scheduled reminders and digests (Vercel Cron), Microsoft sign-in, recurring tasks, file attachments (e.g. Vercel Blob), bulk user import from Excel, richer dashboard charts.
