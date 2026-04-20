# Webchat — Requirements & Architecture

> Hackathon project. Must be buildable and runnable via `docker compose up`. Target: 300 simultaneous users.

---

## 1. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js | Hackathon speed, large ecosystem |
| Framework | Express.js | Minimal, best Socket.io integration |
| Real-time | Socket.io | Built-in rooms, reconnection, multi-tab support |
| Database | PostgreSQL + Prisma ORM | Relational data, migrations built-in, great DX |
| Auth | express-session + connect-pg-simple | Cookie-based, sessions stored in Postgres, supports multi-session management |
| File upload | multer | Standard Express middleware |
| Image processing | sharp | Thumbnail generation on upload |
| Notifications | Postgres `notifications` table + `expires_at` TTL | No Redis needed, survives restarts |
| Frontend | Vue.js 3 (CDN, no build step) | Reactive UI without build pipeline or extra Docker complexity |
| File storage | Local filesystem + Docker volume | Per spec |
| Docker services | `app` (Node.js) + `postgres` | 2 services only |

---

## 2. Docker Compose

Two services:
- `app` — Node.js server, exposes port 3000
- `postgres` — PostgreSQL, internal only

Mount a named Docker volume at `/app/uploads` for file persistence across container restarts.

---

## 3. Authentication & Sessions

### 3.1 Registration
- Fields: email, username, password, confirm password
- Email must be unique (global)
- Username must be unique (global), immutable after registration
- Password stored as bcrypt hash
- Email verification: not required

### 3.2 Sign In
- Fields: email, password, "Keep me signed in" checkbox
- **Keep me signed in checked** → persistent cookie, 24h TTL, survives browser close/reopen
- **Keep me signed in unchecked** → session cookie, invalidated when browser closes
- Both cases: session expires after 24h of creation regardless

### 3.3 Sign Out
- Invalidates current browser session only
- Other active sessions (other devices/browsers) remain valid

### 3.4 Password Reset ("Forgot password")
- User provides email + current password
- If the pair matches a valid account → show "set new password" form
- No email sending required — identity verified via current credentials

### 3.5 Password Change (logged in)
- Available from profile settings
- Requires current password confirmation

### 3.6 Session Management
- User can view all active sessions: User-Agent string + IP address + created at
- User can log out any individual session from this screen
- Logging out a session invalidates it immediately

### 3.7 Account Deletion
- User confirms deletion
- Account removed
- Rooms owned by user are deleted (including all their messages and files)
- Membership in other rooms is removed
- Personal message history with other users: retained but frozen (read-only)

---

## 4. Presence & Multi-Tab

### 4.1 Presence States
- `online` — active in at least one browser tab
- `afk` — all tabs idle for > 1 minute
- `offline` — no open tabs / disconnected

### 4.2 AFK Detection
- Track last user interaction (mousemove, keypress, click, scroll) per tab
- Use BroadcastChannel API to coordinate across tabs on the same browser/device
- If any tab reports activity within 60s → status is `online`
- If all tabs are idle for > 60s → status is `afk`

### 4.3 Offline Detection
- Send heartbeat ping from client every 10s via Socket.io
- If server receives no heartbeat for 15s → mark user as `offline`
- `beforeunload` event sends an explicit disconnect signal as best-effort

### 4.4 Presence Propagation
- Status changes broadcast to all rooms the user is a member of
- Latency target: < 2 seconds

---

## 5. Contacts / Friends

### 5.1 Friend Requests
- Send by username (search field) or from room member list
- Request may include optional text message
- Recipient receives in-app notification
- Recipient can accept or decline

### 5.2 Friend List
- Shows all confirmed friends with presence status

### 5.3 Removing Friends
- Either party may remove the other; no confirmation from the other side required

### 5.4 User Ban
- A user may ban another user
- Effect:
  - Friend relationship terminated
  - New personal messages between them blocked in both directions
  - Existing personal message history remains visible but frozen (read-only)
  - Neither can send friend requests to the other

### 5.5 Personal Messaging Rule
- Personal messages only allowed if both users are friends AND neither has banned the other

---

## 6. Chat Rooms

### 6.1 Creation
- Any registered user may create a room
- Room name must be globally unique (across all rooms, public and private)

### 6.2 Room Properties
| Property | Notes |
|---|---|
| Name | Required, globally unique |
| Description | Optional |
| Visibility | Public or Private |
| Owner | Single user, always an admin |
| Admins | List of users with moderation rights |
| Members | All current participants |
| Banned users | Users blocked from the room |

### 6.3 Public Rooms
- Discoverable via catalog (name, description, member count)
- Catalog supports simple text search
- Any authenticated user may join unless room-banned
- No invitation needed

### 6.4 Private Rooms
- Not visible in catalog
- Join by invitation only (in-app notification, accept/decline)
- Invitations sent by any member (or admin only — implement as admin-only for simplicity)

### 6.5 Joining & Leaving
- Users may leave any room freely
- Owner cannot leave — owner can only delete the room
- No ownership transfer

### 6.6 Roles & Permissions

| Action | Member | Admin | Owner |
|---|---|---|---|
| Send messages | ✓ | ✓ | ✓ |
| Delete own messages | ✓ | ✓ | ✓ |
| Delete any message | — | ✓ | ✓ |
| Remove member | — | ✓ | ✓ |
| Ban member | — | ✓ | ✓ |
| Unban member | — | ✓ | ✓ |
| View ban list | — | ✓ | ✓ |
| Grant admin | — | — | ✓ |
| Revoke admin | — | — | ✓ |
| Delete room | — | — | ✓ |
| Edit room settings | — | — | ✓ |

### 6.7 Room Ban Rules
- Removing a member from a room = automatic ban
- Banned user loses access to room messages, files, and images via UI
- Ban persists until explicitly removed from ban list
- Banned user can be unbanned by any admin

### 6.8 Room Deletion
- All messages permanently deleted
- All files and images permanently deleted
- All members removed

---

## 7. Messaging

### 7.1 Message Model
- Personal dialogs are treated as rooms with exactly 2 fixed participants
- Same features as room chats; no admin roles in personal chats
- Personal dialog is created implicitly on first message between friends

### 7.2 Message Content
- Plain text and multiline text (UTF-8)
- Emoji
- File/image attachments
- Reply/quote to another message
- Max text size: 3 KB per message

### 7.3 Message Replies
- Reply links to the original message
- UI shows a quoted/outlined preview of the original
- If original is deleted: show "deleted message" placeholder in the quote

### 7.4 Message Editing
- Author may edit their own messages
- UI shows a grey "edited" indicator after editing

### 7.5 Message Deletion
- Author may delete their own messages
- Room admins may delete any message in their room
- Deleted messages show a placeholder (e.g. "This message was deleted")

### 7.6 History & Pagination
- Messages stored persistently, displayed chronologically
- Pagination: cursor-based, 50 messages per batch (`before_id` parameter)
- Index on `(room_id, created_at DESC)` for performance
- Infinite scroll loads older batches on scroll-up

### 7.7 Offline Delivery
- Messages sent to offline users are persisted in Postgres
- Delivered when recipient next opens the app (fetched on connect)

---

## 8. Attachments

### 8.1 Supported Types
- Images (JPEG, PNG, GIF, WebP) — max 3 MB
- Any file type — max 20 MB

### 8.2 Upload Methods
- Explicit attach button
- Copy-paste into message input

### 8.3 Storage
- Files stored on local filesystem with UUID filenames
- Original filename preserved in database only
- Docker volume mounted at `/app/uploads`

### 8.4 Thumbnails
- Generated by `sharp` on upload
- Stored alongside originals in `/app/uploads/thumbnails/`
- Inline preview shown in message; click to full-size

### 8.5 Access Control
- Files served via authenticated endpoint: `GET /api/files/:fileId`
- Server checks: valid session + user is current member of the room (or participant of personal chat)
- If user loses room access → file endpoint returns 403
- File remains physically stored unless room is deleted

### 8.6 Validation
- Client-side: check file size before upload, show friendly error
- Server-side: multer limits enforce max sizes, return 400 with clear message

---

## 9. Notifications

### 9.1 Unread Tracking
- Store `last_read_message_id` per user per room in `user_room_state` table
- Unread count = `COUNT(messages WHERE id > last_read_message_id AND room_id = X)`
- Unread indicator cleared when user opens the chat
- Display cap: 99+

### 9.2 Event Notifications (Postgres Queue)
Stored in `notifications` table with `expires_at` (TTL):

| Event type | TTL |
|---|---|
| Friend request received | 7 days |
| Room invitation received | 7 days |
| Mention in message | 3 days |

- On reconnect, server queries unexpired notifications and pushes via Socket.io
- Periodic cleanup job removes expired rows

### 9.3 Real-time Delivery
- All events pushed via Socket.io to connected clients immediately
- Notifications table is the fallback for reconnecting clients only

---

## 10. UI Requirements

### 10.1 Layout
```
+--[Top Nav]----------------------------------------------+
| Logo | Public Rooms | Private Rooms | Contacts |         |
| Sessions | Profile ▼ | Sign out                         |
+---------------------------------------------------------+
+--[Left/Right Sidebar]--+--[Main Chat]--+--[Members]----+
| Search                 | # room-name   | Room info     |
| ROOMS                  | messages...   | Owner         |
|  • room (3)            |               | Admins        |
| CONTACTS               |               | Members (●◐○) |
|  ● Alice               |               | [Invite]      |
| [Create room]          | [input area]  | [Manage room] |
+------------------------+---------------+---------------+
```

- Rooms + contacts on the right sidebar (collapsible)
- After entering a room: sidebar compacts accordion-style
- Room members shown on right panel with presence indicators

### 10.2 Presence Indicators
- `●` green — online
- `◐` amber — AFK
- `○` grey — offline

### 10.3 Chat Window
- Auto-scroll to new messages when user is at bottom
- No forced scroll if user has scrolled up
- Infinite scroll upward for history

### 10.4 Message Input
- Multiline text entry
- Emoji picker
- File/image attach button + paste support
- Reply indicator (shows quoted message, dismissible with ×)

### 10.5 Unread Indicators
- Badge count next to room name in sidebar
- Badge count next to contact name
- Cleared on opening chat

### 10.6 Admin Actions (Modal Dialogs)
Accessible from room management panel:
- Members tab: make admin, ban, remove
- Admins tab: view and revoke
- Banned users tab: view (banned by, date) and unban
- Invitations tab: invite by username
- Settings tab: edit name, description, visibility; delete room

---

## 11. Data Model (Prisma Schema Outline)

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  username      String    @unique
  passwordHash  String
  createdAt     DateTime  @default(now())
  sessions      Session[]
  roomMemberships RoomMember[]
  sentMessages  Message[]
  notifications Notification[]
  friendsSent   Friendship[] @relation("requester")
  friendsReceived Friendship[] @relation("addressee")
}

model Session {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  userAgent  String
  ipAddress  String
  persistent Boolean  @default(false)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}

model Room {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  isPublic    Boolean  @default(true)
  ownerId     String
  createdAt   DateTime @default(now())
  members     RoomMember[]
  messages    Message[]
  bannedUsers RoomBan[]
}

model RoomMember {
  userId    String
  roomId    String
  isAdmin   Boolean  @default(false)
  joinedAt  DateTime @default(now())
  lastReadMessageId String?
  user      User     @relation(fields: [userId], references: [id])
  room      Room     @relation(fields: [roomId], references: [id])
  @@id([userId, roomId])
}

model RoomBan {
  userId     String
  roomId     String
  bannedById String
  bannedAt   DateTime @default(now())
  room       Room     @relation(fields: [roomId], references: [id])
  @@id([userId, roomId])
}

model Message {
  id          String    @id @default(uuid())
  roomId      String
  authorId    String
  content     String?   // null if deleted
  deleted     Boolean   @default(false)
  edited      Boolean   @default(false)
  replyToId   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  room        Room      @relation(fields: [roomId], references: [id])
  author      User      @relation(fields: [authorId], references: [id])
  attachments Attachment[]
  @@index([roomId, createdAt(sort: Desc)])
}

model Attachment {
  id           String  @id @default(uuid())
  messageId    String
  originalName String
  storedName   String  // UUID filename on disk
  mimeType     String
  sizeBytes    Int
  hasThumb     Boolean @default(false)
  comment      String?
  message      Message @relation(fields: [messageId], references: [id])
}

model Friendship {
  id          String   @id @default(uuid())
  requesterId String
  addresseeId String
  status      FriendStatus @default(PENDING)
  createdAt   DateTime @default(now())
  requester   User     @relation("requester", fields: [requesterId], references: [id])
  addressee   User     @relation("addressee", fields: [addresseeId], references: [id])
  @@unique([requesterId, addresseeId])
}

model UserBan {
  bannerId  String
  bannedId  String
  createdAt DateTime @default(now())
  @@id([bannerId, bannedId])
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  type      String   // friend_request | room_invite | mention
  payload   Json
  read      Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  @@index([userId, read, expiresAt])
}

enum FriendStatus {
  PENDING
  ACCEPTED
  DECLINED
}
```

---

## 12. Socket.io Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join_room` | `{ roomId }` | Join a Socket.io room |
| `leave_room` | `{ roomId }` | Leave a Socket.io room |
| `send_message` | `{ roomId, content, replyToId?, attachmentIds? }` | Send message |
| `edit_message` | `{ messageId, content }` | Edit own message |
| `delete_message` | `{ messageId }` | Delete message |
| `typing_start` | `{ roomId }` | User started typing |
| `typing_stop` | `{ roomId }` | User stopped typing |
| `heartbeat` | — | Keepalive ping every 10s |
| `afk` | `{ status }` | Tab activity state change |
| `mark_read` | `{ roomId, messageId }` | Update last read position |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `new_message` | `Message` | New message in a room |
| `message_edited` | `{ messageId, content }` | Message was edited |
| `message_deleted` | `{ messageId }` | Message was deleted |
| `presence_update` | `{ userId, status }` | User presence changed |
| `member_joined` | `{ roomId, user }` | User joined room |
| `member_left` | `{ roomId, userId }` | User left room |
| `member_banned` | `{ roomId, userId }` | User was banned from room |
| `notification` | `Notification` | Friend request, invite, mention |
| `unread_count` | `{ roomId, count }` | Updated unread count |

---

## 13. Non-Functional Requirements

| Requirement | Value |
|---|---|
| Concurrent users | 300 |
| Max room participants | 1000 |
| Message delivery latency | < 3 seconds |
| Presence update latency | < 2 seconds |
| Max message text size | 3 KB |
| Max file size | 20 MB |
| Max image size | 3 MB |
| Message history | Supports 10,000+ messages per room via cursor pagination |
| Session TTL (persistent) | 24 hours |
| Session TTL (non-persistent) | Browser session |
| Notification TTL | 3–7 days (by type) |
| File storage | Local filesystem, Docker volume |

---

## 14. Project Structure (Recommended)

```
/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.js          # Express + Socket.io bootstrap
│   ├── routes/           # REST API routes
│   │   ├── auth.js
│   │   ├── rooms.js
│   │   ├── messages.js
│   │   ├── files.js
│   │   ├── users.js
│   │   └── notifications.js
│   ├── socket/           # Socket.io event handlers
│   │   ├── index.js
│   │   ├── presence.js
│   │   └── messages.js
│   ├── middleware/        # Auth, file access checks
│   └── jobs/             # Notification TTL cleanup
└── public/               # Vue.js frontend (served as static)
    ├── index.html
    ├── app.js
    └── styles.css
```
