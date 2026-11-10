# GraphRelay Architecture Overview

## What GraphRelay Is

GraphRelay serves a React UI and Express API from one Node.js process. The server calls Microsoft Graph, applies configured To Do actions and renders iCalendar feeds. SQLite and JSON profiles under the mounted data directory hold persistent state.

## Core Model

| Data | Storage | Purpose |
|---|---|---|
| App state | SQLite `state` | Setup, Microsoft token cache, network settings, account, To Do directory and snapshots, and per-list settings |
| List enrollment | SQLite `lists` | Managed lists, grouping mode and automatic cleanup opt-in |
| Title tracking | SQLite `titles` and `pending_titles` | Original names, applied names and recovery of interrupted Graph writes |
| To Do activity | SQLite `activity` | Per-list history for changes and sync issues |
| Calendar discovery, feeds and events | SQLite `calendar_directory`, `calendar_settings`, `calendar_feeds`, `calendar_view_snapshots` | Account-scoped discovery and events, feed configuration, and cached iCalendar output |
| Web sessions | SQLite `web_sessions` | Encrypted admin session payloads and expiry |
| Grouping profiles | `todo/groupings/*.json` | Shared portable matching rules and group order |

## Deployment Model

One process owns the SQLite database, schedulers and in-memory progress. Run one GraphRelay instance against each config directory. [Deployment](deployment.md)

## Database Migrations

SQLite uses WAL mode. Startup creates missing tables, adds the automatic cleanup flag to older list schemas, migrates old grouping profiles into JSON and upgrades old single-calendar feed rows while retaining their tokens and cached content. Existing profile files take precedence during migration. Older list snapshots remain readable and gain raw Microsoft titles on their next successful sync.

## Auth And Setup

The web UI uses a local admin username and password. The password has a salted scrypt hash. Older password-only setups use `admin` as the username. GraphRelay encrypts setup, the MSAL token cache and persisted web session payloads with AES-256-GCM. The same persistent key also underlies cookie signing. A valid session survives a container replacement using the same key and data directory. Session records expire after seven days of inactivity. **Settings → General → Change Password** verifies the current password, stores a new salted hash and revokes all web sessions in one transaction. The username and Microsoft connection are preserved. Login and password-change failures share a per-client limit of 10 failed requests per 15 minutes. Successful requests do not consume that allowance; validation and other 4xx/5xx responses do. Unauthenticated password-change requests are rejected before that limiter. Legacy environment-managed passwords are configured outside the UI.

Microsoft OAuth uses a separate delegated connection. GraphRelay stores the OAuth state and PKCE verifier in the admin session and checks them on callback. Most API routes require an admin session. Mutating API requests also require the app’s request header. Tokenized calendar subscriptions are separate from the admin API and scoped to the connected calendar account. [Microsoft setup](microsoft.md)

## Request Limits

An app-wide per-client limiter allows 3,000 requests per minute, covering calendar subscriptions, API routes and the web shell before body parsing or session access. Built assets under `/assets/` and the favicon are exempt. App pages and unmatched paths, including `/images/`, remain counted. Limits use the client IP (grouping IPv6 addresses by the library's default subnet); enable Trust Proxy only behind one trusted proxy that overwrites forwarded headers. Counters are held in memory and reset when the process restarts.

Limited requests return HTTP 429 with a JSON error and standard rate-limit/retry headers. Only the first rejection per client per window is logged. Limiter logs omit request paths and URLs so calendar tokens and Microsoft authorization parameters stay private. The Microsoft callback remains a GET using the existing Lax session cookie, OAuth state and PKCE checks.

## Major Subsystems

| Subsystem | Entry points |
|---|---|
| Web shell, To Do, and Settings | [App.tsx](../src/client/App.tsx), [Layout.tsx](../src/client/components/Layout.tsx) |
| Dashboard and its local counts | [Dashboard.tsx](../src/client/Dashboard.tsx) and `/api/dashboard` |
| Microsoft auth, To Do API and scheduler | [index.ts](../src/server/index.ts) |
| Title planning, grouping and duplicate identity | [ordering.ts](../src/server/ordering.ts), [profile-matcher.ts](../src/server/profile-matcher.ts), [grouping-store.ts](../src/server/grouping-store.ts), [duplicates.ts](../src/server/duplicates.ts) |
| Calendar admin, subscription and event cache | [calendar-feeds.ts](../src/server/calendar-feeds.ts), [calendar-view.ts](../src/server/calendar-view.ts) |
| Browser session persistence | [session-store.ts](../src/server/session-store.ts), [api.ts](../src/client/lib/api.ts) |

## Important Invariants

- Ordinary reads show local snapshots. Background jobs and explicit commands handle Graph calls.
- To Do operations that write titles or remove duplicates coordinate per list. A pending unenrollment blocks automation.
- Keep original title tracking separate from grouping rules. Prefix recovery and duplicate identity both depend on it.
- A failed calendar refresh can keep serving a prior snapshot for the same source selection and range. A changed source selection or range invalidates the earlier feed.
- Treat logs, activity and snapshots as potentially sensitive. API errors should omit tokens and raw provider responses.
