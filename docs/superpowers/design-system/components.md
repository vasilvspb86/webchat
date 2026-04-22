# Ember & Pitch — Component Contracts

HTML skeletons and intended Vue-props shapes for every recurring UI element
in the Rooms sub-project. These are the pieces the Phase 8 screens compose.

> **Scope:** naming, structure, props, states. No business logic. Tokens come
> from `tokens.css`. Component class names use the `ep-` prefix so they can
> coexist with the legacy chat styles until re-skin.

---

## Typography primitives

```html
<h1 class="ep-display">The public catalog</h1>
<h2 class="ep-headline">Rooms you own</h2>
<p  class="ep-body">Regular prose. Plus Jakarta Sans.</p>
<p  class="ep-body ep-body--lead">Slightly larger lede text.</p>
<p  class="ep-muted">Metadata, hints, secondary copy.</p>
<span class="ep-eyebrow">ROOM · PUBLIC</span>   <!-- uppercase, tracking-caps -->
<code class="ep-mono">3/50</code>               <!-- JetBrains Mono -->
```

- `.ep-display` — Fraunces, opsz 144, weight 500–700, tracking-tight.
- `.ep-headline` — Fraunces, opsz 36, weight 500.
- `.ep-body` — Plus Jakarta Sans, weight 400, leading 1.5.
- `.ep-eyebrow` — Plus Jakarta Sans medium, uppercase, `--tracking-caps`.
- `.ep-mono` — JetBrains Mono, for counts, timestamps, IDs.

---

## Button

```html
<!-- Primary -->
<button class="ep-btn ep-btn--primary" type="button">Create room</button>
<!-- Secondary (ghost) -->
<button class="ep-btn ep-btn--ghost">Cancel</button>
<!-- Danger -->
<button class="ep-btn ep-btn--danger">Delete room</button>
<!-- Icon-only -->
<button class="ep-btn ep-btn--icon" aria-label="Settings"><svg>…</svg></button>
<!-- Sizes -->
<button class="ep-btn ep-btn--primary ep-btn--sm">Join</button>
<button class="ep-btn ep-btn--primary ep-btn--lg">Accept invitation</button>
<!-- Loading / disabled -->
<button class="ep-btn ep-btn--primary" disabled aria-busy="true">Creating…</button>
```

**Vue contract (`<Button>`):**
```ts
props: {
  variant:  'primary' | 'ghost' | 'danger' | 'icon',   // default 'ghost'
  size:     'sm' | 'md' | 'lg',                         // default 'md'
  loading:  boolean,                                    // default false
  disabled: boolean,
  iconLeft: string?,  // slot
  iconRight: string?, // slot
}
emits: ['click']
```

States rendered: hover raises brightness 1 step; active drops 1 step;
focus-visible shows `--focus-ring`; disabled reduces opacity and blocks events;
loading swaps label for a 3-dot Fraunces ellipsis animation.

---

## FormField

```html
<label class="ep-field">
  <span class="ep-field__label">Room name</span>
  <span class="ep-field__hint">3–50 characters, letters and dashes</span>
  <input class="ep-field__input" type="text" maxlength="50" />
  <span class="ep-field__counter ep-mono">4 / 50</span>
  <span class="ep-field__error" role="alert">That name is already taken.</span>
</label>
```

Visibility:
- `.ep-field__hint` is always rendered under label.
- `.ep-field__error` only renders when `error` prop is set and swaps position
  of the hint (error replaces hint).
- `.ep-field__counter` renders if `maxlength` is set.

**Vue contract:**
```ts
props: {
  modelValue: string,
  label:      string,
  hint:       string?,
  error:      string?,
  type:       'text' | 'textarea' | 'toggle',
  maxlength:  number?,
  required:   boolean,
  autofocus:  boolean,
}
```

Visibility toggle is its own variant:
```html
<label class="ep-field ep-field--toggle">
  <span class="ep-field__label">Visibility</span>
  <span class="ep-field__hint">Public rooms appear in the catalog.</span>
  <div class="ep-toggle" role="radiogroup">
    <button class="ep-toggle__option ep-is-active" role="radio" aria-checked="true">Public</button>
    <button class="ep-toggle__option" role="radio" aria-checked="false">Private</button>
  </div>
</label>
```

---

## RoomCard

```html
<article class="ep-card ep-room-card" data-visibility="public">
  <header class="ep-room-card__head">
    <h3 class="ep-headline">Coffee corner</h3>
    <span class="ep-chip ep-chip--private" hidden>Private</span>
  </header>
  <p class="ep-body ep-body--clamp-3">A place to talk about roasts, brews, and the
    slow hours before the day gets loud.</p>
  <footer class="ep-room-card__foot">
    <span class="ep-meta">
      <span class="ep-mono">24</span><span class="ep-muted">members</span>
    </span>
    <button class="ep-btn ep-btn--ghost ep-btn--sm">Open →</button>
  </footer>
</article>
```

**Vue contract:**
```ts
props: {
  room: {
    id:          string,
    name:        string,
    description: string?,
    isPublic:    boolean,
    memberCount: number,
  },
  onOpen: (id: string) => void,
}
```

The card has an asymmetric ember glow on hover (top-left corner only) that
signals interactivity without losing the "still life" feeling of the grid.

---

## Chip / Badge

```html
<span class="ep-chip ep-chip--owner">Owner</span>
<span class="ep-chip ep-chip--admin">Admin</span>
<span class="ep-chip ep-chip--member">Member</span>
<span class="ep-chip ep-chip--private">Private</span>
<span class="ep-chip ep-chip--banned">Banned</span>
```

Uses the `--chip-*-fg / --chip-*-bg / --chip-*-bd` token triplets.

---

## MemberRow

```html
<li class="ep-member-row" data-presence="online">
  <span class="ep-avatar ep-avatar--md" aria-hidden="true">V</span>
  <span class="ep-member-row__name">Victoria</span>
  <span class="ep-chip ep-chip--owner">Owner</span>
  <span class="ep-presence-dot" aria-label="Online"></span>
  <button class="ep-btn ep-btn--icon ep-btn--sm" aria-label="Member actions">⋯</button>
</li>
```

**Vue contract:**
```ts
props: {
  member: {
    userId:   string,
    username: string,
    isOwner:  boolean,
    isAdmin:  boolean,
    presence: 'online' | 'away' | 'offline',
  },
  showActions: boolean,    // when caller is admin+
}
emits: ['act', 'open-profile']
```

---

## Modal

```html
<div class="ep-modal-root" role="dialog" aria-modal="true" aria-labelledby="mt">
  <div class="ep-modal-scrim" tabindex="-1"></div>
  <div class="ep-modal ep-modal--md">
    <header class="ep-modal__head">
      <h2 class="ep-headline" id="mt">Create a room</h2>
      <button class="ep-btn ep-btn--icon" aria-label="Close">×</button>
    </header>
    <div class="ep-modal__body"> …content… </div>
    <footer class="ep-modal__foot">
      <button class="ep-btn ep-btn--ghost">Cancel</button>
      <button class="ep-btn ep-btn--primary">Create</button>
    </footer>
  </div>
</div>
```

Sizes: `ep-modal--sm` (440), `ep-modal--md` (620), `ep-modal--lg` (820).
The scrim uses `var(--bg-overlay)` and blurs (`backdrop-filter: blur(6px)`)
so the catalog behind feels atmospheric, not frozen.

---

## TabBar

```html
<nav class="ep-tabs" role="tablist">
  <button class="ep-tabs__tab ep-is-active" role="tab" aria-selected="true">
    Members <span class="ep-mono ep-tabs__count">12</span>
  </button>
  <button class="ep-tabs__tab" role="tab">Admins <span class="ep-mono ep-tabs__count">2</span></button>
  <button class="ep-tabs__tab" role="tab">Banned <span class="ep-mono ep-tabs__count">0</span></button>
  <button class="ep-tabs__tab" role="tab">Invitations <span class="ep-mono ep-tabs__count">3</span></button>
  <button class="ep-tabs__tab" role="tab">Settings</button>
</nav>
```

Active tab shows an ember underline (`::after`, 2px, `--accent-primary`).
The tab count chip uses `--ink-ash` background to avoid competing with the
ember signal.

---

## InvitationCard

```html
<article class="ep-inv-card" data-state="active">
  <header class="ep-inv-card__head">
    <span class="ep-eyebrow ep-eyebrow--info">Invitation</span>
    <time class="ep-mono ep-muted" datetime="2026-04-28T12:00Z">expires in 6 days</time>
  </header>
  <h3 class="ep-headline">Sunday Long Run Planning</h3>
  <p class="ep-muted">Invited by <strong class="ep-text-body">@marco</strong></p>
  <footer class="ep-inv-card__foot">
    <button class="ep-btn ep-btn--ghost">Decline</button>
    <button class="ep-btn ep-btn--primary">Accept</button>
  </footer>
</article>
```

States:
- `data-state="active"` — normal (ember tint in top-left corner).
- `data-state="expiring"` — `<time>` turns `--accent-gold-hi`.
- `data-state="expired"` — card reduces to muted, buttons disabled,
  a `.ep-inv-card__overlay` element covers the action area with
  "Expired" text.

---

## EmptyState

```html
<section class="ep-empty">
  <div class="ep-empty__art" aria-hidden="true">
    <!-- A small Fraunces-style ornament: ampersand or brass rule -->
    &
  </div>
  <h2 class="ep-headline">No rooms yet.</h2>
  <p class="ep-body ep-muted">Be the first to open the door.</p>
  <button class="ep-btn ep-btn--primary">Create the first room</button>
</section>
```

---

## Presence dot

```html
<span class="ep-presence-dot" data-presence="online"></span>
<span class="ep-presence-dot" data-presence="away"></span>
<span class="ep-presence-dot" data-presence="offline"></span>
```

Implementation hint: `width: 8px; height: 8px; border-radius: 50%;
background: var(--status-online);` and for `online`, add a soft radial glow:
`box-shadow: 0 0 0 2px color-mix(in oklab, var(--status-online-glow) 40%, transparent);`.

---

## Avatar

```html
<span class="ep-avatar ep-avatar--md" style="--avatar-seed: 42;">V</span>
```

Sizes: `sm` 24, `md` 32, `lg` 48, `xl` 72.
Background is a muted tinted surface derived from a seeded hue, kept within
the palette (rotates between ember-deep, gold-deep, tide-deep, moss-deep,
rust-deep, ink-soot). Initial is the first grapheme of username in Fraunces.

---

## Layout primitives

```html
<div class="ep-app">
  <header class="ep-app__top">…nav…</header>
  <main class="ep-app__main ep-layout-room">
    <section class="ep-pane ep-pane--primary">…room body…</section>
    <aside   class="ep-pane ep-pane--members">…members panel…</aside>
  </main>
</div>
```

The `.ep-layout-room` uses CSS grid `grid-template-columns: 1fr var(--panel-w)`
on desktop; collapses to single column with a toggle under 900px.

---

## Motion catalogue

- **Card hover:** `transform: translateY(-2px)` over `var(--dur-quick)` with
  `var(--ease-standard)`. Ember glow fades in over the same interval.
- **Modal open:** scrim fades in over `var(--dur-smooth)`; modal scales from
  0.96→1 and translates 8px→0 with `var(--ease-emphatic)`.
- **Tab swap:** active underline slides horizontally via a pseudo-element
  using `translateX` — never re-renders, over `var(--dur-smooth)`.
- **Presence dot (online):** subtle 2.4s pulse on the glow ring, not the dot
  itself. `@media (prefers-reduced-motion)` kills it.
- **Empty state art:** the ornament does a one-time fade+rise on mount over
  `var(--dur-emphatic)` with `var(--ease-emphatic)`; never repeats.

---

## Messaging layer

These contracts extend the base system for the rooms conversation view. Styles
live in `mockups/_messaging.css` — same token vocabulary as the rest of the
system. Mockups: `room-populated.html`, `room-empty.html`, `room-scrolling.html`,
`my-rooms.html`, `admin-pending-invitations.html`.

**Design direction — "paper letters around a fire":** bubbles are subtly
asymmetric; the corner nearest the speaker is tightened to `--radius-sm` so the
shape leans toward its author. Self bubbles carry a warm ember tint; other
bubbles are paper on raised ink. Reply quotes use a gold left-rule. The composer
placeholder is Fraunces italic — a small flourish of voice before the user
starts typing.

---

### MessageBubble

```html
<!-- other -->
<article class="ep-msg" data-variant="other" role="article" aria-label="Message from Marco">
  <span class="ep-avatar ep-avatar--sm ep-msg__avatar" data-tint="gold" aria-hidden="true">M</span>
  <header class="ep-msg__head">
    <cite class="ep-msg__author">@marco</cite>
    <time class="ep-msg__time" datetime="2026-04-22T09:14">9:14</time>
  </header>
  <p class="ep-msg__body">Fresh roaster opened on Rustaveli — bring cash.</p>
  <div class="ep-msg__actions" role="group" aria-label="Message actions">
    <button class="ep-btn ep-btn--icon ep-btn--xs" aria-label="Reply">…</button>
  </div>
</article>

<!-- self (ember-tinted, right-aligned) -->
<article class="ep-msg" data-variant="self" role="article" aria-label="Your message">
  <span class="ep-avatar ep-avatar--sm ep-msg__avatar" data-tint="ember" aria-hidden="true">V</span>
  <header class="ep-msg__head">
    <cite class="ep-msg__author">@victoria</cite>
    <time class="ep-msg__time" datetime="2026-04-22T09:15">9:15</time>
    <span class="ep-msg__edited">(edited)</span>
  </header>
  <p class="ep-msg__body">Count me in — 11am works.</p>
  <div class="ep-msg__actions">
    <button class="ep-btn ep-btn--icon ep-btn--xs" aria-label="Edit">…</button>
    <button class="ep-btn ep-btn--icon ep-btn--xs" aria-label="Delete">…</button>
  </div>
</article>

<!-- system placeholder (deleted message) -->
<article class="ep-msg" data-variant="system" role="article" aria-label="Deleted message">
  <p class="ep-msg__body ep-msg__body--deleted">Deleted message.</p>
</article>

<!-- editing state — inline textarea replaces body -->
<article class="ep-msg ep-is-editing" data-variant="self" role="article">
  <header class="ep-msg__head">…</header>
  <textarea class="ep-msg__editor">Count me in — 11am works.</textarea>
  <div class="ep-msg__editor-actions">
    <button class="ep-btn ep-btn--ghost ep-btn--sm">Cancel</button>
    <button class="ep-btn ep-btn--primary ep-btn--sm">Save</button>
  </div>
</article>
```

**Vue contract (`<MessageBubble>`):**
```ts
props: {
  message: {
    id: string,
    content: string,
    deleted: boolean,
    edited: boolean,
    createdAt: string,       // ISO timestamp
    author: { id, username, avatarTint },
    replyTo?: { id, authorUsername, content, deleted },
  },
  canEdit:   boolean,   // hides/shows edit action
  canDelete: boolean,   // hides/shows delete action
  isSelf:    boolean,   // drives data-variant and alignment
}
emits: ['edit', 'delete', 'reply']
```

- `data-variant="self"` flips alignment, tints bubble with ember gradient, moves action pill to the left.
- `data-variant="other"` paper-on-ink background, action pill on the right.
- `data-variant="system"` dashed border, muted italic body, no actions, no avatar, no head.
- `.ep-msg__edited` renders a quiet "(edited)" suffix inside the head — faint text.
- `.ep-msg__actions` is revealed on `:hover, :focus-within` with a 120ms opacity + translate transition. Keyboard-accessible.
- `.ep-is-editing` swaps body for a textarea and shows Cancel / Save buttons; bubble border becomes `--accent-primary` with a 4px veil glow.
- Reduced-motion: action pill fades in without the translate; no other bubble animations.

---

### ReplyQuote

```html
<blockquote class="ep-msg__reply" aria-label="Replying to @ana">
  <span class="ep-msg__reply-author">@ana</span>
  <span class="ep-msg__reply-body">Agree — can we make the counter quieter below 2 KB?</span>
</blockquote>

<!-- original deleted -->
<blockquote class="ep-msg__reply ep-msg__reply--deleted" aria-label="Replying to a deleted message">
  <span class="ep-msg__reply-body">deleted message</span>
</blockquote>
```

**Vue contract (`<ReplyQuote>`):**
```ts
props: {
  replyTo: {
    authorUsername: string,
    content: string,
    deleted: boolean,
  }
}
```

- Sits inside a `<MessageBubble>` above `.ep-msg__body`.
- `border-left: 2px solid var(--accent-gold)`, gold 7% veil background.
- Author line uses `all-small-caps` with gold tint.
- Body clamped to a single line with `white-space: nowrap; text-overflow: ellipsis`.
- `--deleted` variant drops the author, italicises the body, and reads as
  "deleted message" in muted faint text.

---

### Composer

```html
<form class="ep-composer" aria-label="Message the room" onsubmit="return false;">

  <!-- Optional reply chip -->
  <div class="ep-composer__reply-chip" role="status" aria-live="polite">
    <span class="ep-composer__reply-chip-body">
      <span class="ep-composer__reply-chip-author">@ana</span>
      <span class="ep-composer__reply-chip-preview">Agree — can we make the counter quieter…</span>
    </span>
    <button type="button" class="ep-btn ep-btn--icon ep-btn--xs" aria-label="Dismiss reply">×</button>
  </div>

  <div class="ep-composer__shell ep-is-focused">
    <label class="ep-visually-hidden" for="composer-ta">Message</label>
    <textarea id="composer-ta"
      class="ep-composer__textarea"
      rows="2"
      placeholder="Light the first ember…"
      autofocus
      aria-describedby="composer-hint composer-counter"></textarea>

    <div class="ep-composer__footer">
      <span class="ep-composer__hint" id="composer-hint">
        <kbd>Shift</kbd>+<kbd>Enter</kbd> newline · <kbd>Enter</kbd> send
      </span>
      <span class="ep-composer__counter" id="composer-counter" data-state="ok" aria-live="polite">
        21&nbsp;/&nbsp;3&#x202F;072&nbsp;B
      </span>
      <button class="ep-btn ep-btn--primary ep-btn--sm ep-composer__send" type="submit">
        Send
      </button>
    </div>
  </div>
</form>
```

**Vue contract (`<Composer>`):**
```ts
props: {
  replyTo?: {
    messageId: string,
    authorUsername: string,
    preview: string,
  },
  maxBytes: number,        // default 3072 (3 KB)
  warnBytes: number,       // default 2816 (2.75 KB)
  placeholder?: string,
}
emits: ['send', 'dismissReply', 'typingStart', 'typingStop']
```

- `maxlength` is NOT used; validation is bytewise (`TextEncoder` in parent).
- `.ep-composer__counter[data-state="ok|warn|over"]` drives the colour
  escalation: default muted → gold at `>= warnBytes` → danger at `> maxBytes`.
- Send button becomes `aria-disabled="true"` when content is empty or over byte
  limit. It does NOT fire `submit`.
- `Enter` emits `send`; `Shift+Enter` inserts a newline.
- Reply chip is rendered only when `replyTo` is non-null. Dismissing emits
  `dismissReply`, which the parent clears.
- Placeholder in the focused empty state uses Fraunces italic via
  `font-variation-settings: 'opsz' 72, 'SOFT' 100, 'WONK' 1`.
- Reduced-motion: no focus-lift transition on the shell.

---

### TypingIndicator

```html
<div class="ep-typing" role="status" aria-live="polite" aria-atomic="true">
  <span class="ep-typing__names">Marco and Ana</span>
  <span class="ep-typing__verb">are typing</span>
  <span class="ep-typing__dots" aria-hidden="true">
    <span></span><span></span><span></span>
  </span>
</div>
```

**Vue contract (`<TypingIndicator>`):**
```ts
props: {
  typers: Array<{ userId: string, username: string }>,  // max 3 rendered
}
// Auto-clears on `typing_stop` or after 5s without a heartbeat.
// Grammar: 0 → hidden, 1 → "@marco is typing", 2 → "@marco and @ana are typing",
//          3+ → "@marco, @ana and 1 other are typing".
```

- Pill floats above the composer, flush with the message list bottom gutter.
- `.ep-typing__dots span` animates sequentially (`ep-typing-bounce` 1.2s).
- `prefers-reduced-motion: reduce` replaces the dots animation with a static
  three-dot glyph. No size or opacity pulse.
- Appears/disappears via a subtle fade — no layout thrash; the pill is
  absolutely positioned against the composer.

---

### DaySeparator

```html
<div class="ep-day-sep" role="separator" aria-label="Today">
  <span class="ep-day-sep__plate">Today</span>
</div>
```

**Vue contract (`<DaySeparator>`):**
```ts
props: {
  label: string,   // "Today", "Yesterday", or localised long date e.g. "Apr 18"
}
```

- Horizontal rule made of two gradient hairlines flanking a plate rendered on
  `--surface-raised`.
- Plate uses Fraunces italic at `--text-xs` with `tracking-caps`.
- Purely decorative; does not interrupt scroll anchoring.

---

### UnreadDivider

```html
<div class="ep-unread-div" role="separator" aria-label="New messages">
  <span class="ep-unread-div__label">New</span>
</div>
```

**Vue contract (`<UnreadDivider>`):**
```ts
// No props. The parent (MessageList) decides placement: inserted once, before
// the first unread message on initial render. Removed after the user
// acknowledges (scrolls past or marks read).
```

- Ember-tinted hairlines with a soft glow; label uses an
  `ember-glow → accent-primary` gradient text clip.
- Sticks to the top of the scroll container (`position: sticky; top: 0`) so it
  remains visible while the user scrolls through unread messages; releases when
  scrolled past.
- Reduced-motion: no glow pulse — the label sits static.

---

### PresenceDot

```html
<!-- online -->
<span class="ep-presence-dot" data-presence="online" aria-label="Online"></span>
<!-- offline -->
<span class="ep-presence-dot" data-presence="offline" aria-label="Offline"></span>
```

**Vue contract (`<PresenceDot>`):**
```ts
props: {
  status: 'online' | 'offline',   // only two states in this sub-project
}
```

- **State subset only:** `online` and `offline`. `away`/`afk`/`dnd` are out of
  scope and MUST NOT be added here — presence is a lean signal in this build.
- Paired with an accessible label (`aria-label` or adjacent text) — presence is
  never conveyed by colour alone.
- Dot colour: moss for online, faint ink for offline. The online pulse (see
  `_shared.css`) is gated by `prefers-reduced-motion`.

---

## Accessibility baselines

- All interactive elements reach a ≥3:1 contrast at their lowest state and
  ≥4.5:1 at default against their surface.
- Focus-visible always renders `--focus-ring`, never only color.
- Modal traps focus and restores to the trigger on close.
- Presence uses icon + aria-label, not color alone.
- Chips have `role="status"` when they indicate dynamic state (banned),
  plain text otherwise.
- `prefers-reduced-motion` disables all decorative animations (see motion
  tokens).

---

## Naming cheat-sheet

| Prefix  | Meaning                               |
| ------- | ------------------------------------- |
| `ep-`   | Ember & Pitch component               |
| `ep-is-*` | State (active, open, loading)       |
| `ep-has-*` | Structural variant (icon, counter) |
| `--ep-*` | Component-local CSS custom prop     |

Tokens prefixed differently (`--ink-*`, `--paper-*`, `--ember-*`, `--gold-*`,
`--chip-*-*`, etc.) live in `tokens.css` and are considered global.
