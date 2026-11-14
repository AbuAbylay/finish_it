# Deploying

Next.js 15 on Vercel with a Turso (libSQL) database. Push-to-deploy from GitHub `main`.

1. **GitHub:** push this repo to a public repository.
2. **Turso:** create a database. Copy its `libsql://…` URL and create an auth token.
3. **Vercel:** import the GitHub repo (framework preset: Next.js; build and output settings stay at their defaults; Node 20 or newer). Under Settings → Environment Variables (Production) set:

| Variable | Required | Value |
|---|---|---|
| `TURSO_DATABASE_URL` | yes | `libsql://…` |
| `TURSO_AUTH_TOKEN` | yes | the Turso token |
| `APP_URL` | recommended | the production URL, used for the link in reminder emails |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | once `ai/real.ts` is switched on | see docs/INTEGRATION.md |
| `LESSON_CAP_PER_LEARNER`, `LESSON_CAP_PER_IP`, `LESSON_CAP_GLOBAL` | optional | defaults 25 / 150 / 1000 per 24 h |

Without `TURSO_DATABASE_URL`, every API call on Vercel fails with a server error and `/api/health` returns 503. This is by design: there is no writable local database there.

4. **Schema:** nothing to run. Migrations in `lib/migrations.ts` apply automatically on the first request and are recorded in `schema_migrations`.

## Verify

```bash
curl https://<your-app>/api/health        # expect {"ok":true,"database":{"ok":true,...},"ai":"stub"|"real","sample":"dev"|"real"}
node scripts/e2e.mjs https://<your-app>    # full juror path; spends 3 lesson generations
```

Then open `https://<your-app>/` in a private window. It should go to `/enter`, and "Try it with a sample PMP course" should reach a lesson in under two minutes.

Keys live only in Vercel environment variables. `.env*` is git-ignored; never commit one.
