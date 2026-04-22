# Sub-project Kickoff Prompts

Ready-to-paste starter prompts for each sub-project of the Webchat hackathon.

## How to use

1. `cd C:\Users\vzinovyeva\Documents\Chat`
2. Start Claude Code
3. Run `/model claude-opus-4-7`
4. Paste the prompt for the sub-project you want to work on
5. Claude will read the spec, enter brainstorming, produce a design doc, then a plan, then TDD implementation

The CLAUDE.md gate ensures Claude will present **test scenarios in plain English** for your review before any test code is written.

Build in order — later sub-projects depend on earlier ones.

---

## 1. Auth & sessions (foundation — start here)

**Depends on:** nothing
**Spec reference:** Section 3 of requirements.md

```
Read requirements.md and CLAUDE.md, then invoke /superpowers:brainstorming
to design the Auth & sessions sub-project (Section 3 of requirements.md:
registration, sign-in with "Keep me signed in", sign-out, email-based
password reset via Mailhog, password change, session management, account
deletion).

Scope: only Auth & sessions. Other subsystems (rooms, messaging, etc.)
are separate sub-projects and out of scope for this design.
```

---

## 2. Rooms (create/join/leave, public catalog)

**Depends on:** Auth & sessions
**Spec reference:** Sections 6.1–6.8 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Rooms sub-project (Section 6 of requirements.md: room creation,
public/private rooms, catalog with search, join/leave/ban rules, role
permissions for Member/Admin/Owner, room deletion).

Scope: only room lifecycle and membership. Messaging inside rooms,
attachments, and notifications are separate sub-projects and out of
scope. Assume auth is already implemented.
```

---

## 3. Messaging (send/fetch/history)

**Depends on:** Auth & sessions, Rooms
**Spec reference:** Section 7 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Messaging sub-project (Section 7 of requirements.md: text messages,
replies/quoting, editing, deletion, cursor-based history pagination,
offline delivery via persistence, Socket.io real-time delivery).

Scope: only text messaging in rooms (and implicitly personal dialogs as
2-person rooms). Attachments, typing indicators, and mentions are out of
scope. Assume auth and rooms are already implemented.
```

---

## 4. Presence & multi-tab

**Depends on:** Auth & sessions, Rooms
**Spec reference:** Section 4 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Presence & multi-tab sub-project (Section 4 of requirements.md:
online/AFK/offline states, AFK detection with BroadcastChannel API across
tabs, heartbeat + offline detection, presence propagation to rooms via
Socket.io with <2s latency).

Scope: only presence tracking and broadcasting. Typing indicators can be
mentioned if they naturally fit the same mechanism. Assume auth and
rooms are already implemented.
```

---

## 5. Attachments

**Depends on:** Auth & sessions, Rooms, Messaging
**Spec reference:** Section 8 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Attachments sub-project (Section 8 of requirements.md: image and
generic file upload via multer, size limits, UUID filename storage,
thumbnail generation with sharp, optional per-attachment comment,
authenticated download with per-room access control, copy-paste and
upload button UI).

Scope: only file/image handling tied to messages. Assume auth, rooms,
and messaging are already implemented.
```

---

## 6. Friends/contacts + personal messaging

**Depends on:** Auth & sessions, Rooms, Messaging
**Spec reference:** Section 5 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Friends & personal messaging sub-project (Section 5 of
requirements.md: friend requests by username or from room member list,
accept/decline/remove, user-to-user ban with frozen history, personal
messaging rule gated on friendship and no mutual ban).

Personal dialogs should be modeled as 2-participant rooms so the existing
messaging implementation is reused. Assume auth, rooms, and messaging
are already implemented.
```

---

## 7. Notifications

**Depends on:** Auth & sessions, Rooms, Friends
**Spec reference:** Section 9 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Notifications sub-project (Section 9 of requirements.md: per-room
unread tracking via last_read_message_id with 99+ cap, event
notifications for friend_request and room_invite with 7-day TTL, Postgres
queue with expires_at, real-time delivery via Socket.io, offline
fallback fetched on reconnect, periodic cleanup job).

Scope: only notifications and unread counts. Assume auth, rooms,
messaging, and friends are already implemented.
```

---

## 8. Admin/moderation polish

**Depends on:** all previous sub-projects
**Spec reference:** Sections 6.6–6.7 and 10.6 of requirements.md

```
Read requirements.md, CLAUDE.md, and any existing design docs in
docs/superpowers/specs/. Then invoke /superpowers:brainstorming to design
the Admin & moderation polish sub-project (Sections 6.6–6.7 and 10.6 of
requirements.md: modal dialogs for member management, admin grant/revoke
— admins can grant/revoke admin to others but cannot revoke owner —
member removal with automatic ban, ban list view and unban, room
settings edit, room deletion cascade).

Scope: only the admin UI and server-side authorization enforcement for
moderation actions. Assume all core features are already implemented.
```

---

## Notes

- Each sub-project produces its own design doc in `docs/superpowers/specs/`, its own implementation plan, and its own TDD cycle.
- Before running #2 onward, review the `docs/superpowers/specs/` folder — earlier designs will inform later ones.
- If mid-project you discover a cross-cutting concern, pause and raise it rather than silently expanding scope.
