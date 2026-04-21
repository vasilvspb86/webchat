# Rooms — Design Spec

**Sub-project:** 2 of 8 — Section 6 of `requirements.md`
**Depends on:** Auth & Sessions (sub-project 1, completed)
**Date:** 2026-04-21

---

## Context

This sub-project delivers the room lifecycle and membership layer that messaging, presence, attachments, friends, and notifications will all sit on top of. The auth sub-project landed user identity and session handling; everything downstream now needs a "room" concept to attach to.

The scope here is deliberately bounded:

- **In scope:** room creation (public/private, unique name), public catalog with search, join/leave rules, private-room invitations, role permissions for Member/Admin/Owner (per §6.6 matrix), room ban rules (§6.7), room deletion with cascade.
- **Out of scope:** messaging inside rooms, attachments, real-time notification delivery plumbing, presence indicators, friends/personal messaging, rate limiting, audit logs.

Decisions made in brainstorming (all accepted by user):

- **Private-room invitations** are stored as rows in the existing `Notification` table (`type = ROOM_INVITE`, 7-day TTL). Rooms owns the `invite` / `accept` / `decline` actions; the Notifications sub-project later layers real-time Socket.io push, TTL cleanup, and the notifications-tab UI on top of the same rows. No new invitation model.
- **Socket.io broadcasts** on membership changes are emitted in this sub-project (not deferred). Member panels update in real time; no polling.
- **Frontend is in scope.** First step of frontend implementation is a `frontend-design` skill pass that produces mockups and a project-wide visual system (tokens, components). The existing auth UI will be re-skinned in a follow-up mini sub-project that inherits this visual system — flagged here, not done here.
- **Case-insensitive room names** via a `nameNormalized` column (lowercase trim) with `@unique`, not Postgres CITEXT.
- **Owner is always a RoomMember.** Room creation inserts both rows in one transaction, so "list members" is a uniform query with no owner special-casing.

### Decisions beyond requirements (flagged so they aren't silent)

These are design choices the spec makes that go beyond what requirements.md explicitly states. None conflict with requirements; all are called out so downstream readers can challenge them:

- **Cursor pagination on the catalog** — 20 rooms per page, sorted by `createdAt DESC`, with `nextCursor`. Requirements say "simple text search" on the catalog but are silent on pagination. 20/page + cursor is the minimum needed to avoid unbounded responses at 300 concurrent users.
- **Catalog search matches description as well as name.** Requirements say "simple text search" without specifying fields. Matching both is more useful; trivially revertible.
- **Additional Socket.io events** beyond the three listed in §12 (`member_joined`, `member_left`, `member_banned`): `member_unbanned`, `admin_granted`, `admin_revoked`, `room_updated`, `room_deleted`. Added so the UI can stay consistent without polling. Clients that don't care about them simply don't listen.
- **Extra 409 conditions on `POST /invitations`**: duplicate pending unexpired invite; caller inviting themselves. Not in §6.4 but follow from the spirit of idempotency.
- **410 Gone** as the status for expired / already-acted invitations. Requirements don't specify; 410 is standard and distinguishes "gone forever" from "not found / unknown id".
- **Re-invite after expiry is allowed.** If a prior invitation exists with `expiresAt < now` (expired but not yet cleaned up by the Notifications cron), a fresh `POST /invitations` succeeds — the service treats expired rows as absent. Duplicate guard only fires on unexpired pending invites.

---

## Architecture

### Layering

```
src/routes/rooms.js              thin HTTP handlers (rooms + admin actions)
src/routes/invitations.js        thin HTTP handlers (accept/decline)
src/services/rooms.js            business logic: create/read/update/delete/search room
src/services/roomMembership.js   business logic: join/leave/invite/accept/decline/
                                 kick/ban/unban/grant-admin/revoke-admin
src/services/roomAuthorization.js PURE — resolveRole + canDoX predicates (no DB, no HTTP)
src/middleware/roomAccess.js     requireRoomMember / requireRoomAdmin / requireRoomOwner;
                                 attaches req.roomContext = { room, role, memberRow }
src/socket/rooms.js              server→client broadcast helper (emitRoomEvent)
src/index.js                     wires new routes + broadcaster
src/utils/validate.js            extended: validateRoomName, validateRoomDescription
prisma/schema.prisma             + Room.nameNormalized, + Room.updatedAt
public/                          Vue pages/components after frontend-design pass
```

Rationale: the room-membership subset of the §6.6 matrix lives in a single pure module (`roomAuthorization.js`) so it's trivially unit-testable and there's one canonical source. Message-level permissions (e.g., "delete any message" row of §6.6) are the messaging sub-project's concern and are NOT in this module — they'll import `resolveRole` from here but add their own predicates. Every route and every socket emit reads role from this module. Business logic in `services/*` means tests exercise behaviour without spinning up Express. Per `CLAUDE.md` — "Keep business logic in pure utility functions separate from route handlers."

### Middleware ordering

All rooms routes are mounted behind `requireAuth` (from auth sub-project) first, then `requireRoomMember`/`requireRoomAdmin`/`requireRoomOwner` as appropriate. `requireAuth` refuses sessions for soft-deleted users (auth spec §Middleware); `roomAccess` middleware loads the room + caller's RoomMember + RoomBan rows once and attaches `req.roomContext = { room, role, memberRow }` so downstream handlers don't re-query.

### Soft-delete propagation

Because users are soft-deleted (auth sub-project sets `User.deletedAt` + tombstones `email`/`username`), rooms must filter them in two places:

1. **`GET /rooms/:id/members`** — filter rows where the joined `User.deletedAt IS NOT NULL`. Do NOT surface tombstoned usernames like `deleted-<uuid>-alice`.
2. **`POST /rooms/:id/invitations`** — target userId must resolve to an active user (`deletedAt IS NULL`); otherwise return 404 (treat as "user does not exist" from the caller's vantage point).

RoomMember / RoomBan rows for soft-deleted users stay in the DB (for historical integrity and later hard-delete audit), but are excluded from read responses.

### Ownership transfer (explicit non-feature)

Per §6.5, no ownership transfer is supported. The only way to end a room's life is for the owner to delete it. No endpoint transfers ownership, and the spec adds no affordance for it.

### Socket.io usage

- **Server → client only** in this sub-project.
- Convention: room events are emitted to the Socket.io room `room:<roomId>`.
- Subscription (`socket.join('room:' + roomId)`) is owned by the messaging sub-project because it's about subscribing to message streams. If no one is listening yet when Rooms emits, the emit is a no-op — fine.
- No new client→server socket events defined here.

---

## Data Model Changes

One Prisma migration. The existing `Room`, `RoomMember`, `RoomBan` models are kept as-is apart from the two additions below.

### 1. `Room` changes

```prisma
model Room {
  // ...existing fields, EXCEPT: drop @unique from `name`...
  name           String             // NO LONGER @unique — see migration note
  nameNormalized String   @unique
  updatedAt      DateTime @updatedAt
}
```

- **Migration MUST drop the existing `@unique` on `name`** and replace it with `@unique` on `nameNormalized`. Keeping both would be redundant (and confusing — two indexes covering the same logical constraint).
- `nameNormalized` stores `name.trim().toLowerCase()`. Set in the service layer on create and on name-changing edits. `name` keeps original casing for display.
- Backfill in the migration: `UPDATE "Room" SET "nameNormalized" = lower(trim(name))` before the `@unique` is added, then add the unique index. Existing auth-sub-project rooms (if any) are handled.
- `updatedAt` supports settings-edit tracking (admin modal shows last-modified).

### 2. Notification payload shape (documented, not schema-enforced)

For `type = ROOM_INVITE`:

```json
{
  "roomId": "<uuid>",
  "roomName": "<string at invite time>",
  "invitedByUserId": "<uuid>",
  "invitedByUsername": "<string at invite time>"
}
```

`roomName` and `invitedByUsername` are denormalized so the notifications tab can render without a join, even if the room is later renamed. `expiresAt = now + 7 days` per §9.2.

### 3. Invariants maintained by services (not DB constraints)

- **Owner is a RoomMember.** `createRoom` is a single `$transaction` that inserts Room and `RoomMember(userId=ownerId, isAdmin=true)`.
- **No member + ban collision.** Remove-member is a single `$transaction` that deletes the RoomMember row and inserts the RoomBan row. Unban deletes only the RoomBan row; the user does not auto-rejoin.
- **Name uniqueness is on `nameNormalized`.** Service trims and lowercases before the uniqueness check and before storing.

---

## HTTP Endpoints (all under `/api`)

| Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|
| POST   | `/rooms`                               | ✓ | any | Create room (name, description?, isPublic) |
| GET    | `/rooms`                               | ✓ | any | Public catalog with `?q=&cursor=` |
| GET    | `/rooms/:id`                           | ✓ | public OR member | Room info; 404 if private and non-member |
| PATCH  | `/rooms/:id`                           | ✓ | owner | Edit name / description / visibility |
| DELETE | `/rooms/:id`                           | ✓ | owner | Delete room; cascades messages/attachments/members/bans |
| GET    | `/rooms/:id/members`                   | ✓ | member | List members with role + joinedAt |
| POST   | `/rooms/:id/join`                      | ✓ | any | Join a public room; privacy wins (see precedence note) |
| POST   | `/rooms/:id/leave`                     | ✓ | member | Leave; 409 if owner |
| DELETE | `/rooms/:id/members/:userId`           | ✓ | admin | Remove (= delete RoomMember + insert RoomBan in one tx) |
| POST   | `/rooms/:id/admins`                    | ✓ | admin | Grant admin (body: `{ userId }`) |
| DELETE | `/rooms/:id/admins/:userId`            | ✓ | admin | Revoke admin; 403 if target is owner |
| GET    | `/rooms/:id/bans`                      | ✓ | admin | List bans with `bannedBy` + `bannedAt` |
| DELETE | `/rooms/:id/bans/:userId`              | ✓ | admin | Unban (user does NOT auto-rejoin) |
| POST   | `/rooms/:id/invitations`               | ✓ | member (private only) | Invite user — writes Notification row; non-member on private → 404 (see precedence note) |
| POST   | `/invitations/:notificationId/accept`  | ✓ | invitee | Add caller to room; delete notification |
| POST   | `/invitations/:notificationId/decline` | ✓ | invitee | Delete notification; no membership change |

### Response shapes

- `GET /rooms` (catalog):
  ```json
  { "rooms": [ { "id", "name", "description", "memberCount", "createdAt" } ], "nextCursor": "<iso>" | null }
  ```
  20 per page, sorted by `createdAt DESC`. Search uses `ILIKE '%q%'` against `name` and `description`. `memberCount` is a subquery per row.
- `GET /rooms/:id`: `{ id, name, description, isPublic, ownerId, createdAt, updatedAt, memberCount }`.
- `GET /rooms/:id/members`: `[ { userId, username, isAdmin, isOwner, joinedAt } ]`. `isOwner` is derived at query time from `userId === room.ownerId` (not a stored column). Ordering: owner first, then admins, then members; within each group, sorted by username. Rows for soft-deleted users are excluded.
- `GET /rooms/:id/bans`: `[ { userId, username, bannedById, bannedByUsername, bannedAt } ]`.

### Error code conventions

| Code | When |
|---|---|
| 400 | Validation failure (name length, body shape) |
| 401 | Missing/invalid session |
| 403 | Authenticated but role insufficient; also room-banned user calling `/join` |
| 404 | Room not found **OR** private-room existence hidden from non-member **OR** target user not in expected state |
| 409 | Conflict: name taken, already a member, duplicate invite, owner trying to leave |
| 410 | Invitation expired or already acted on |

**Privacy rule:** private-room existence is never leaked. Non-members get 404 on `GET /rooms/:id`, `POST /rooms/:id/join`, and `POST /rooms/:id/invitations`, never 403. This rule takes precedence over role/ban responses.

**Status-code precedence (evaluated in order — first match wins):**

1. Auth missing → **401**
2. Target does not exist from the caller's vantage point (unknown room id, OR private room where caller is not a member and not a pending-invitee) → **404**
3. Validation failure on body/params → **400**
4. Wrong-state conflict (e.g., public room being invited to, owner trying to leave, duplicate membership, duplicate invite) → **409**
5. Expired or already-consumed invitation → **410**
6. Authenticated + room is visible to caller + request is well-formed + state is valid, but role is insufficient OR caller is room-banned → **403**

Concrete consequences:

- **Banned user calls `/join` on a private room they were never a member of** → 404 (privacy beats ban feedback).
- **Banned user calls `/join` on a public room** → 403 (visibility already public, so ban feedback is fine to expose).
- **Non-member calls `/invitations` on a private room** → 404 (privacy).
- **Non-member calls `/invitations` on a public room** → 400 (wrong-state: public rooms don't take invitations).

### Key per-endpoint notes

- **`PATCH /rooms/:id`**: `isPublic` can flip either direction. Public→private does NOT kick non-invited members; existing members retain access. Private→public makes the room catalog-discoverable. Ban list is preserved across flips.
- **`DELETE /rooms/:id/members/:userId`**: actor === target → 409 (use `/leave`). Target = owner → 403.
- **`POST /rooms/:id/invitations`**: non-member caller on a private room → 404 (privacy). Caller is member but room is public → 400 (wrong endpoint shape, not wrong state — the endpoint is a no-op for public rooms). 409 if target is already a member / is banned / has a pending unexpired invite / is the caller themselves. Target userId refers to a soft-deleted user → 404 (treat as not found).
- **`POST /invitations/:notificationId/accept`**: wrong-user notification → 404 (don't reveal existence). Expired or already acted on → 410 Gone.

---

## Authorization Module (`src/services/roomAuthorization.js`)

Pure module, no DB access, no HTTP context. One canonical source for §6.6.

```js
// Role resolution
function resolveRole(userId, room, memberRow, banRow)
  -> 'owner' | 'admin' | 'member' | 'banned' | 'none'

// Permission predicates
function canReadRoom(role, room)            // member OR (role==='none' && room.isPublic)
function canEditRoom(role)                  // role === 'owner'
function canDeleteRoom(role)                // role === 'owner'
function canInviteToRoom(role, room)        // private room && role in {member,admin,owner}
function canRemoveMember(actorRole, targetRole, actorUserId, targetUserId)
function canBan(actorRole, targetRole, actorUserId, targetUserId)  // alias
function canUnban(role)                     // role in {admin,owner}
function canViewBans(role)                  // role in {admin,owner}
function canGrantAdmin(role)                // role in {admin,owner}
function canRevokeAdmin(actorRole, targetRole)
```

### Invariants enforced here

1. **Owner is never demotable.** `canRevokeAdmin(_, 'owner')` is always false.
2. **Owner is never removable / bannable.** `canRemoveMember(_, 'owner', ...)` is always false.
3. **Self-moderation guardrails.** `canRemoveMember` returns false when actor === target (use `/leave`). Self-admin-revoke is allowed for non-owners (equivalent to stepping down).
4. **Admins are peers.** No admin hierarchy; any admin can grant/revoke admin on any other admin. Revoke-owner is the only exception.

---

## Socket.io Broadcasts

After each successful DB mutation, emit to `room:<roomId>` via `src/socket/rooms.js::emitRoomEvent(roomId, eventName, payload)`.

| Trigger | Event | Payload |
|---|---|---|
| Public join or invitation accept | `member_joined` | `{ roomId, member: { userId, username, isAdmin: false, joinedAt } }` |
| `/leave` | `member_left` | `{ roomId, userId }` |
| Admin removes member (auto-ban) | `member_banned` | `{ roomId, userId, bannedById }` |
| Admin unbans member | `member_unbanned` | `{ roomId, userId }` |
| Admin grants admin | `admin_granted` | `{ roomId, userId }` |
| Admin revokes admin | `admin_revoked` | `{ roomId, userId }` |
| Owner edits room | `room_updated` | `{ roomId, fields: { name?, description?, isPublic? } }` |
| Owner deletes room | `room_deleted` | `{ roomId }` — emitted AFTER the delete transaction commits |

**Emit ordering:** all broadcasts are emitted only after the underlying DB transaction commits. If a transaction rolls back, no event fires. This prevents clients from receiving phantom `room_deleted` / `member_banned` events for state that was subsequently rolled back.

Emission is fire-and-forget. If no subscriber is connected yet (messaging sub-project not done), the emit is a no-op.

**Cross-spec note — account deletion emits `room_deleted` too.** The auth sub-project's `DELETE /account` endpoint already deletes rooms owned by the caller via `prisma.room.deleteMany({ where: { ownerId: userId } })`. That path must call `emitRoomEvent(roomId, 'room_deleted', { roomId })` for each owned room after the transaction commits, so remaining members are notified. This sub-project exposes `emitRoomEvent` from `src/socket/rooms.js` for that purpose and an optional small follow-up task to the auth module adds the call. Flagged explicitly so it doesn't slip.

---

## Frontend

**Gate:** the first frontend step in the implementation plan is a `frontend-design` skill pass that produces mockups, a visual system (tokens, components), and component structure. Vue code only begins after that pass.

**Screens delivered by this sub-project:**

1. **Public room catalog** — search box + card grid (name, description, member count, Join button). Empty and no-results states.
2. **Create-room modal** — name, description, public/private toggle. Inline validation (name-taken error comes from 409).
3. **Room page shell** — header (name, description, visibility badge), right-side **Members panel** (owner first, admins grouped, members grouped, presence-indicator slot empty for now), **Manage room** button (admin+) opening the admin modal. Message-area placeholder is a slot reserved for the messaging sub-project.
4. **Admin modal** (tabs from §10.6): Members (make admin / remove / ban) · Admins (revoke) · Banned (unban) · Invitations (invite by username — private rooms only) · Settings (edit name/description/visibility, delete room).
5. **Invitation inbox item** — component that renders a single pending `ROOM_INVITE` notification with Accept/Decline buttons. Mounted inside a temporary notifications panel so the end-to-end flow is testable today. The real notifications tab is built in sub-project #7 and will reuse this component.

**Visual-system scope:** the `frontend-design` pass produces CSS custom properties (tokens) and component templates that are project-wide — not rooms-only. The auth pages get re-skinned in a dedicated auth-polish mini sub-project that runs after this one (flagged, not done here).

**Constraint:** Vue 3 via CDN, no build step (per `CLAUDE.md`). Design tokens are plain CSS custom properties; no Tailwind or bundler.

---

## Test Scenarios (business language — approval gate per CLAUDE.md)

Test code MUST NOT be written until these scenarios are approved. They were approved in the brainstorming session that produced this spec.

### A. Room creation
1. Authenticated user creates a room with valid name + optional description + visibility → room exists; creator is owner and also a RoomMember with admin flag true.
2. Create with `isPublic: true` → appears in catalog.
3. Create with `isPublic: false` → does NOT appear in catalog.
4. Create with a name already used by another room → 409.
5. Create with a name that differs only in case from existing → 409.
6. Create with leading/trailing whitespace in name → trimmed before uniqueness check and before storage.
7. Name length outside 3–50 chars → 400.
8. Description longer than 500 chars → 400.
9. Missing name → 400.
10. Unauthenticated → 401.

### B. Public catalog & search
11. `GET /rooms` with no query → paginated public rooms, 20 per page, newest first, `nextCursor` present.
12. `GET /rooms?q=hello` → matches public rooms whose name OR description contains "hello" (case-insensitive, partial).
13. Private rooms never appear in the catalog regardless of caller's membership.
14. A user banned from a public room still sees it in the catalog (ban affects joining, not discovery).
15. Member count reflects current RoomMember row count (including owner).
16. Pagination cursor works: fetching second page returns rooms strictly older than cursor.
17. Empty result returns `{ rooms: [], nextCursor: null }`, not 404.

### C. Room details
18. Member of private room → 200 with full info.
19. Non-member of private room → 404 (existence hidden).
20. Any authenticated user on a public room → 200 even if not a member.
21. Unknown room id → 404.
22. Unauthenticated → 401.

### D. Joining public rooms
23. Authenticated user joins public room → RoomMember created (admin flag false); `member_joined` emitted on `room:<id>`.
24. Join a room the caller is already in → 409.
25. Call `/join` on private room without invite → 404.
26. User banned from a public room attempts to join → 403.
26a. User banned from a private room attempts to join → 404 (privacy beats ban feedback).
27. Unauthenticated → 401.

### E. Leaving
28. Member leaves → RoomMember deleted; `member_left` emitted; no RoomBan created; user can freely re-join public, but needs a new invite for private.
29. Non-owner admin leaves → same as member; admin flag is irrelevant after row is gone.
30. Owner tries to leave → 409 with message "owner cannot leave; delete the room instead".
31. Non-member tries to leave → 404.

### F. Private-room invitations
32. Member invites non-member → Notification row created, type `ROOM_INVITE`, 7-day TTL, payload contains roomId, roomName, invitedByUserId, invitedByUsername.
33. Invitee accepts → RoomMember created; notification deleted; `member_joined` emitted.
34. Invitee declines → notification deleted; no membership change.
35. User accepts a notification id not belonging to them → 404.
36. User accepts an expired invitation → 410.
37. User accepts an already-acted invitation → 410.
38. Non-member of a private room tries to invite someone → 404 (privacy beats role feedback).
39. Member of a public room tries to invite someone → 400 (public rooms don't take invitations).
40. Invite target already a member → 409.
41. Invite target already banned → 409.
42. Invite target has pending unexpired invite to same room → 409.
42a. Invite target had an expired invite (not yet cleaned up) — new invite succeeds, a fresh Notification row is created.
43. Caller tries to invite self → 409.
43a. Invite target refers to a soft-deleted user → 404.

### G. Remove member (= auto-ban, §6.7)
44. Admin removes member → RoomMember deleted AND RoomBan inserted in one transaction; `member_banned` emitted.
45. Admin removes another admin → same behavior.
46. Admin tries to remove owner → 403.
47. Admin tries to remove self → 409 (use `/leave`).
48. Non-admin member tries to remove anyone → 403.

### H. Ban list & unban
49. Admin lists bans → rows with userId, username, bannedBy, bannedAt.
50. Admin unbans → RoomBan deleted; `member_unbanned` emitted; user does NOT auto-rejoin.
51. Non-admin requests ban list or unban → 403.
52. Unban a user who isn't banned → 404.

### I. Admin grant & revoke
53. Admin grants admin to member → isAdmin=true; `admin_granted` emitted.
54. Admin revokes admin from another admin → isAdmin=false; `admin_revoked` emitted.
55. Anyone revoking owner's admin → 403 (owner never demotable).
56. Grant admin to a non-member → 404 (must be member first).
57. Grant admin to an already-admin → 409.
58. Revoke admin from plain member → 404.
58a. Non-owner admin revokes their own admin ("step down") → 200, isAdmin=false, `admin_revoked` emitted. They remain a plain member.
58b. Plain member attempts to grant admin → 403.
58c. Plain member attempts to revoke someone's admin → 403.

### J. Edit room settings
59. Owner edits name/description/visibility → `room_updated` emitted with changed fields; `nameNormalized` recomputed if name changed.
60. Non-owner admin attempts edit → 403.
61. Name change that collides with another room's name → 409 (case-insensitive).
62. Flip public→private: existing members keep access; catalog stops showing it.
63. Flip private→public: room appears in catalog; existing ban list preserved.

### K. Delete room
64. Owner deletes → Room + RoomMember + RoomBan + Messages + Attachment **rows** all removed in one transaction (disk-file cleanup is Attachments sub-project's concern); `room_deleted` emitted AFTER commit; subsequent requests to the id return 404.
65. Non-owner admin deletes → 403.
66. Transactional integrity: partial failure leaves no DB state behind and emits no socket events.

### L. Authorization module (pure unit tests — no HTTP, no DB)
67. `resolveRole` returns owner / admin / member / banned / none for each input combination.
68. `canRemoveMember`: admin→member true, admin→admin true, admin→owner false, admin→self false.
69. `canRevokeAdmin`: admin→admin true, anyone→owner false, non-owner admin revoking themselves true.
70. `canEditRoom` / `canDeleteRoom`: true only when role is owner.
71. `canInviteToRoom`: any member role for private rooms; false for public rooms.
71a. `canReadRoom`: true for member/admin/owner on any room; true for `none` on public rooms; false for `none` on private rooms; false for `banned`.
71b. `canUnban` / `canViewBans` / `canGrantAdmin`: true only for admin or owner.

### M. Cross-cutting
72. Every authenticated route rejects missing/invalid session with 401.
73. Private-room existence never leaks — outsiders always see 404, never 403 (on GET, join, and invite endpoints).
74. Room mutations are transactional — no half-state on partial failure.
75. Socket broadcasts fire only AFTER the underlying DB transaction commits. A rolled-back transaction emits no events.
76. `GET /rooms/:id/members` excludes soft-deleted users (`User.deletedAt IS NOT NULL`).

---

## Out of Scope (explicit)

- **Messaging inside rooms** — sub-project #3. Includes `join_room` / `leave_room` client→server socket events for message-stream subscription, and all message-CRUD socket events. Rooms only emits server→client broadcasts on membership changes.
- **Attachments** — sub-project #5. Room deletion cascades attachment rows via Prisma, but no file-disk cleanup happens in this sub-project. Orphaned files on disk are a known gap Attachments will fix.
- **Notifications delivery plumbing** — sub-project #7 owns real-time Socket.io push of Notification rows, TTL cleanup, unread badges, and the notifications-tab UI. Rooms only writes rows to the `Notification` table for invitations.
- **Presence** — sub-project #4. Member-panel rows leave a grey slot for presence indicators until Presence wires them.
- **Friends / personal messaging** — sub-project #6. Personal dialogs are modeled as 2-person rooms later; no special-casing here.
- **Rate limiting, audit logs, role-change history, invitation search** — not in requirements, YAGNI.
- **Re-skin of existing auth UI** — flagged, owned by a separate auth-polish mini sub-project that runs after the `frontend-design` pass in this one establishes the visual system.

---

## Critical Files to be Modified

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add `Room.nameNormalized @unique`; add `Room.updatedAt` |
| `prisma/migrations/<ts>_rooms/migration.sql` | Generated by `prisma migrate dev` |
| `src/routes/rooms.js` | **NEW** — thin adapters for rooms + members + admins + bans |
| `src/routes/invitations.js` | **NEW** — accept / decline endpoints |
| `src/services/rooms.js` | **NEW** — create / read / update / delete / search |
| `src/services/roomMembership.js` | **NEW** — join / leave / invite / accept / decline / kick / ban / unban / admin grant / admin revoke |
| `src/services/roomAuthorization.js` | **NEW** — pure role-check helpers |
| `src/middleware/roomAccess.js` | **NEW** — `requireRoomMember`, `requireRoomAdmin`, `requireRoomOwner` |
| `src/socket/rooms.js` | **NEW** — `emitRoomEvent(roomId, event, payload)` broadcast helper |
| `src/index.js` | Wire new routes; attach `requireSocketAuth` (from auth sub-project) as Socket.io middleware; mount `emitRoomEvent` helper |
| `src/services/auth.js` | Tiny follow-up: `deleteAccount` emits `room_deleted` for each owned room after the cascade commits (cross-spec note) |
| `src/utils/validate.js` | Extend: `validateRoomName`, `validateRoomDescription` |
| `src/__tests__/roomAuthorization.test.js` | **NEW** — pure unit tests (Scenario group L) |
| `src/__tests__/rooms.services.test.js` | **NEW** — service unit tests |
| `src/__tests__/rooms.routes.test.js` | **NEW** — supertest integration |
| `src/__tests__/invitations.routes.test.js` | **NEW** — supertest integration |
| `public/` (multiple files) | Vue pages + components, post `frontend-design` pass |

---

## Verification (end-to-end)

1. `npm run test:run` — all ~80 scenarios green (numbered A–M with letter-suffixed extensions).
2. `npm run lint` — clean.
3. `npm run typecheck` — clean.
4. `docker compose up --build` — all services start.
5. **Create-and-browse flow:** user A creates a public room → user B opens catalog → sees it with correct member count → joins → both users appear in members panel.
6. **Private-room invite flow:** user A creates a private room → confirms it is NOT visible to user B in catalog → user A invites user B → user B sees invite in notifications panel → accepts → appears in members panel; `member_joined` fires in both browsers.
7. **Moderation flow:** admin grants admin to user B → user B bans user C → user C removed from member list, appears in ban-list tab → admin unbans user C → user C does NOT auto-rejoin → user C re-joins via catalog → succeeds.
8. **Owner-cannot-leave:** owner clicks Leave → error shown → owner clicks Delete room → confirm modal → all members disconnected, room gone from catalog, direct URL returns 404.
9. **Settings flip:** owner flips public→private → catalog stops listing it for non-members; existing members still see it.
10. **Case-insensitive name:** attempt to create "General" after "general" exists → error "name already taken".
