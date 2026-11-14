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
| `ANTHROPIC_API_KEY` | yes, for real lessons | the Claude API key. Without it the dev stub answers and every page shows a "Dev stub" banner (see docs/INTEGRATION.md) |
| `SETUP_MODEL`, `LESSON_MODEL`, `CHAT_MODEL`, `SETUP_EFFORT`, `LESSON_EFFORT` | optional | defaults `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `low`, `medium` |
| `ID_CAP_PER_IP_HOUR` | optional | new IDs per IP per hour, default 300 (a venue can put everyone behind one address) |
| `LESSON_CAP_PER_LEARNER`, `LESSON_CAP_PER_IP`, `LESSON_CAP_GLOBAL` | optional | model calls per rolling 24 h, defaults 25 / 600 / 1000. The global cap bounds total spend |

Without `TURSO_DATABASE_URL`, every API call on Vercel fails with a server error and `/api/health` returns 503. This is by design: there is no writable local database there.

4. **Schema:** nothing to run. Migrations in `lib/migrations.ts` apply automatically on the first request and are recorded in `schema_migrations`.

## Verify

```bash
curl https://<your-app>/api/health        # expect {"ok":true,"database":{"ok":true,...},"ai":"real","sample":"real"}
node scripts/e2e.mjs https://<your-app>    # full juror path; spends 3 lesson generations
```

`"ai": "stub"` means `ANTHROPIC_API_KEY` is missing in that environment: set it and redeploy. With the key set, each model call writes one line to the function log (`ai lesson: model=… input_tokens=… output_tokens=… ms=…`), and a failed call logs its reason (`writeLesson failed: …`).

Then open `https://<your-app>/` in a private window. It should go to `/enter`, and "Try it with a sample PMP course" should reach a lesson in under two minutes. "Use my own course" takes pasted text (1,500 to 60,000 characters) through the setup call, which can take up to a minute.

Keys live only in Vercel environment variables. `.env*` is git-ignored; never commit one.
