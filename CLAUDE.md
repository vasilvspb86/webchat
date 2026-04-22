# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Classic web-based real-time chat application supporting up to **300 simultaneous users**.

**Core features:**
- User registration and authentication
- Public and private chat rooms
- One-to-one personal messaging
- Contacts/friends system
- File and image sharing
- Basic moderation and administration
- Persistent message history
- Online presence indicators and notifications

## Team Context

- **Size:** 1 person, no tech background
- **Process:** Waterfall — requirements are fully defined before development begins
- **Delivery:** It's a hackaton project, it should just be functioning accordingly to the requirements and built in 24 hours
- **AI usage:** Specs, prompt engineering, data analysis — build on this, don't re-explain basics

## Architecture Principles

- Prioritize lightweight, low-overhead solutions, quick in implementation
- Real-time communication layer is the core architectural concern — WebSocket-based (e.g., Socket.io) preferred over polling
- Persistent message history requires a durable database (not in-memory)
- Authentication must support sessions across reconnects (use cookies-based authentication)
- File/image sharing needs storage strategy (local or object storage)
- Moderation and admin features should be role-based (admin vs. moderator vs. user)
- Scale target: 300 concurrent users — single-server deployment is acceptable at this scale

### API response envelope contract
Every JSON endpoint returns `{ resource }` or `{ resources }`, never bare arrays/objects. Frontend MUST unwrap (`const { room } = await api(...)`). Treating `r` as `r.room` was a bug we shipped on `feat/rooms` — caught by browser testing, not by tests. When adding a new endpoint, follow the convention; when consuming one from the client, read the route handler first to confirm the wrapper key.

### Spec-compliant ≠ UX-correct
When implementing from a spec, surface UX gaps the spec doesn't cover. The `feat/rooms` PR shipped three intentional gaps: private rooms unreachable after creation (no "My rooms" view), no pending-invitations list in the admin modal, presence dots that always say "online" because the server doesn't track presence. All spec-compliant, all real UX gaps. Flag these as deferred follow-ups in the PR body before declaring a feature done.

## Known Bottlenecks (Team-Level)

- **QA:** Testing chat flows and AI-assisted features at scale is a pain point — prioritize testable, observable code
- **DevOps:** Keep infrastructure simple; avoid complex multi-service setups unless clearly necessary

## Hackathon acceptance criteria

- Create public github repository with your project
- Project MUST be buildable and runnable by `docker compose up` in the root repository folder

---

## Frontend Stack & Conventions

- **Vue 3 via CDN, no build step.** ES modules, vanilla CSS in `public/`. Don't introduce a bundler — it would break the hackathon "single repo, `docker compose up`" criterion.
- **Component registration:** components live in `public/components/<Name>.js`, register themselves via `app.component(name, def)`, and import shared state from `/app.js`. The Vue app is mounted via `queueMicrotask(() => app.mount('#app'))` in `app.js` so component modules can register before first render.
- **Design system:** `docs/superpowers/design-system/` is the source of truth (tokens.css + components.css + mockups). It is mirrored to `public/design-system/` for runtime — keep them in sync if you edit either.
- **Modal / event convention:** modals emit ONE outgoing event per outcome — never both `created` and `close`. Parent owns navigation; the parent navigating away unmounts the modal naturally. Two events with conflicting side effects produces a race (e.g. created → navigate to new room, close → navigate to catalog, last wins).
- **Browser cache:** ES module files are cached by the browser. After every `git pull` in a Codespace or after `npm start` restart, hard-refresh (Ctrl+Shift+R) — otherwise you're testing the previous version.

---

## Test Scenario Review (Required Before Any Test Implementation)

Before writing any tests, Claude MUST enter plan mode and present all test scenarios
in plain English (business language, not code). Each scenario must describe:
- The user action or system event
- The expected outcome
- Any edge cases or failure paths

Wait for human approval of all scenarios before proceeding to test implementation.

---

## Development Rules (TDD — Non-Negotiable)

### The Iron Law
**No production code without a failing test first.** No exceptions.

### Cycle for every feature or bug fix
1. **RED** — Write a failing test in `src/__tests__/`. Run `npm run test:run`. Confirm it fails for the right reason.
2. **GREEN** — Write the minimal code to make it pass. Run `npm run test:run`. Confirm it passes.
3. **REFACTOR** — Clean up. Run `npm run test:run`. Stay green.
4. **COMMIT** — Only commit when all tests pass. Never commit red.

### Pre-commit hook is slow — batch commits
The husky pre-commit hook runs `npm run lint` + the full test suite (~90s for 214 tests). For multi-file changes that are logically one unit (e.g. several parallel UI components, or a fix touching client + server), squash into one commit. Don't fragment a single feature into 5 commits unless you need separation for `git bisect`.

### Commands
```bash
npm run test:run      # run all tests once
npm test              # watch mode during development
npm run lint          # check for lint errors
npm run lint:fix      # auto-fix lint errors
npm run typecheck     # TypeScript type check
```

### Where tests live
- All tests in `src/__tests__/`
- Test file naming: `<module>.test.js` (mirrors the module it tests)
- Pure functions → unit tests (no mocks)
- Express routes → integration tests using `supertest`
- Socket handlers → unit tests with mocked `io` and `socket`

### What to extract for testability
Keep business logic in pure utility functions (`src/utils/`) separate from route handlers. Pure functions are easy to test without HTTP or database setup.

### Rationalizations that mean "start over"
- "I'll write the test after" → No. Delete the code. Start with the test.
- "It's too simple to test" → 30 seconds. Write it.
- "I already manually tested it" → Manual ≠ automated. Write the test.
- "Just this once" → No such thing in TDD.

---

## Known Docker / Alpine / Prisma Gotchas (learned on feat/auth-sessions)

These cost 3 rebuild cycles to find. Do NOT undo without reading the commit that added them:

1. **`Dockerfile` must use `npm ci --ignore-scripts`** (commit `4ea555b`). The `prepare` hook runs `husky` which is a devDep; without `--ignore-scripts` the production build fails with exit 127. `npx prisma generate` runs explicitly on the next line to compensate.
2. **`Dockerfile` must `apk add openssl`** (commit `ec8ce77`). Prisma's schema engine dynamically loads `libssl.so.3` at `prisma migrate deploy`; without it the client sees non-JSON stderr and throws.
3. **`schema.prisma` must pin `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`** (commit `782955e`). Prisma's libssl detector misidentifies Alpine 3.19+ and defaults to the 1.1.x engine. `native` stays first so Windows dev still works.

## Pending follow-ups (non-blocking, safe to pick up in any order)

### Docker / build hygiene
- [ ] Remove obsolete `version: '3.9'` line from `docker-compose.yml` (Docker logs a deprecation warning on every run).
- [ ] Add `.dockerignore` at repo root. Build context currently ships `node_modules/`, `.git/`, and any local `.env` into the image — wasteful and a mild secret-leak risk.
- [ ] Consider multi-stage Dockerfile OR move `@prisma/client` + `prisma` CLI out of any risk of slipping into `devDependencies`. Current `--only=production` + `--ignore-scripts` combo works only because both are in `dependencies`.

### CI
- [ ] Add `.github/workflows/ci.yml` that runs on every PR:
  ```
  docker compose up --build -d
  docker compose exec -T app npm run lint
  docker compose exec -T app npx tsc --noEmit
  docker compose exec -T -e DATABASE_URL=postgresql://webchat:webchat@postgres:5432/webchat_test app npm run test:run
  docker compose down -v
  ```
  This locks in the hackathon acceptance criterion ("`docker compose up` from root must work") — without it, the next PR could silently break the hard requirement.

### Documentation
- [ ] Expand `.env.example` with commented-out lines for `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `APP_URL`. A non-Docker clone has no way to discover these today.

### Codespace bring-up sequence (documented friction)
What we did by hand on `feat/rooms`. Codify into a `bin/codespace-setup.sh` when this becomes recurring:

```bash
docker compose up -d postgres mailhog       # NB: 1025 is NOT mapped — see step 2
docker rm -f $(docker ps -aq --filter name=mailhog) && \
  docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
cp .env.example .env && \
  sed -i "s|^APP_URL=.*|APP_URL=https://${CODESPACE_NAME}-3000.app.github.dev|" .env
npm run db:migrate
npm start
```

Permanent fixes that would remove this script entirely:
- [ ] Add `- "1025:1025"` to the `mailhog` service in `docker-compose.yml` so SMTP is reachable from the host.
- [ ] Add a `postCreateCommand` in a `.devcontainer/devcontainer.json` that runs the setup script on Codespace creation.
- [ ] Detect `CODESPACE_NAME` at server startup and use it as `APP_URL` if no env override is set — eliminates the `sed` step entirely.

### Merge
- [ ] Open PR from `feat/auth-sessions` → `main`: https://github.com/vasilvspb86/webchat/pull/new/feat/auth-sessions