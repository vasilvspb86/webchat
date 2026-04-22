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

## Account layer

These contracts extend the base system for the authentication and profile
screens. Styles live in `public/components/auth.css` and
`public/components/profile.css`. Mockups: `auth-login.html`,
`auth-register.html`, `auth-forgot.html`, `auth-reset.html`, `profile.html`.

**Design direction — "a conversation by firelight":** the auth shell is a
single calm card on a warm atmospheric field. Each card carries a dual-accent
glow (ember top-left, gold bottom-right) and sits above a radial pool of
light. Copy leans poetic — "Come in, it's warm", "Make a place", "Lost the
way in?", "Set a new key" — but fields and validation are plain-spoken. The
profile reuses the app chrome (top nav from `my-rooms.html`) and treats the
danger zone as a distinct rust-tinted panel at the bottom, separated by a
hairline from the rest.

---

### AuthShell

```html
<div class="ep-auth-shell">
  <header class="ep-auth-shell__top">
    <a class="ep-auth-shell__brand" href="#">
      <span class="ep-auth-shell__spark" aria-hidden="true"><svg>…flame…</svg></span>
      <span class="ep-auth-shell__wordmark">Ember<em>&amp;</em>Pitch</span>
    </a>
  </header>

  <!-- Optional flash (gold pill, role=status) -->
  <div class="ep-auth-flash" role="status" aria-live="polite">
    <span class="ep-auth-flash__dot" aria-hidden="true"></span>
    <span>If that email exists, a reset link has been sent.</span>
  </div>

  <main class="ep-auth-shell__main">
    <article class="ep-auth-card">
      <header class="ep-auth-card__head">
        <span class="ep-eyebrow">Welcome back</span>
        <h1 class="ep-auth-card__title">Come in, it's <em>warm</em></h1>
        <p class="ep-body ep-muted ep-auth-card__blurb">…lede…</p>
      </header>
      <div class="ep-auth-card__body">…slot: form…</div>
      <footer class="ep-auth-card__foot">
        <span class="ep-muted">New here?</span>
        <a href="#">Make an account</a>
      </footer>
    </article>
  </main>

  <footer class="ep-auth-shell__mark" aria-hidden="true">
    <span>&mdash;</span>
    <span class="ep-auth-shell__mark-text">a conversation by firelight</span>
    <span>&mdash;</span>
  </footer>
</div>
```

**Vue contract (`<AuthShell>`):**
```ts
props: {
  flash?: string,              // shows gold pill above the card when truthy
  accent?: 'ember' | 'gold',   // drives card glow tint (default 'ember')
}
slots: ['eyebrow', 'title', 'blurb', 'default' /* form body */, 'footer']
emits: ['brand']               // click on the wordmark
```

- The shell is `position: fixed; inset: 0; overflow-y: auto` to escape the
  legacy `body { overflow: hidden }` in `styles.css`.
- `::after` on `.ep-auth-shell` paints a 760×320 radial pool of light anchored
  bottom-center; the colour is `--accent-gold-veil` or `--accent-primary-veil`
  depending on which view owns the page.
- `.ep-auth-card::before` and `::after` paint the dual-accent glow — ember
  top-left, gold bottom-right. Flip the tints per `accent` prop (forgot/reset
  lead with gold).
- The signature line at the bottom is purely decorative (`aria-hidden`).

---

### LoginPage

```html
<auth-shell :flash="flash" @brand="$emit('navigate','rooms')">
  <template #eyebrow><span class="ep-eyebrow">Welcome back</span></template>
  <template #title>Come in, it's <em>warm</em></template>
  <template #blurb>Your rooms remember where you left off…</template>

  <form class="ep-auth-form" @submit.prevent="submit" autocomplete="on">
    <label class="ep-field" for="li-email">
      <span class="ep-field__label">Email</span>
      <input id="li-email" class="ep-field__input" type="email" v-model="form.email">
    </label>
    <label class="ep-field" for="li-pw">
      <span class="ep-field__label ep-field__label--row">
        <span>Password</span>
        <a class="ep-auth-form__aside" href="#" @click.prevent="$emit('navigate','forgot')">Forgot password?</a>
      </span>
      <input id="li-pw" class="ep-field__input" type="password" v-model="form.password">
    </label>
    <label class="ep-checkbox">
      <input type="checkbox" class="ep-checkbox__input" v-model="form.persistent">
      <span class="ep-checkbox__box" aria-hidden="true"><svg>…check…</svg></span>
      <span>Keep me signed in on this device</span>
    </label>
    <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit">Sign in</button>
  </form>

  <template #footer>
    <span class="ep-muted">New here?</span>
    <a href="#" @click.prevent="$emit('navigate','register')">Make an account</a>
  </template>
</auth-shell>
```

**Vue contract (`<LoginPage>`):**
```ts
props: { flash?: string }
emits: [
  'submit',        // payload: { email, password, persistent }
  'navigate',      // 'rooms' | 'register' | 'forgot'
]
```

- Uses the shared `AuthShell` with `accent="ember"`.
- Password label is two-row (`.ep-field__label--row`): label left, "Forgot
  password?" aside right, rendered as an uppercase caps-tracked micro-link in
  `--accent-primary-hi`.
- `.ep-checkbox` hides the native input off-screen and paints `.ep-checkbox__box`;
  the `:checked + .ep-checkbox__box` rule paints an ember gradient with the
  tick SVG shown in `--text-on-accent`.
- Parent owns authentication via `api('/login')`. Component only emits the
  payload and clears password on failure (parent signals via `flash` prop or
  a reset ref — see `ResetPasswordPage` note).

---

### RegisterPage

```html
<auth-shell :flash="flash">
  <template #eyebrow><span class="ep-eyebrow">New account</span></template>
  <template #title>Make a <em>place</em></template>
  …
  <form class="ep-auth-form" @submit.prevent="submit" autocomplete="on">
    <label class="ep-field" for="reg-email">…email…</label>
    <label class="ep-field" for="reg-username">
      <span class="ep-field__label">Username</span>
      <span class="ep-field__hint">The name you'll go by. Shown with an @ in front.</span>
      <input id="reg-username" class="ep-field__input" type="text" v-model="form.username">
    </label>
    <label class="ep-field" for="reg-pw">
      <span class="ep-field__label">Password</span>
      <span class="ep-field__hint">At least 8 characters.</span>
      <input id="reg-pw" class="ep-field__input" type="password" v-model="form.password">
    </label>
    <label class="ep-field" :class="{ 'ep-has-error': mismatch }" for="reg-confirm">
      <span class="ep-field__label">Confirm password</span>
      <input id="reg-confirm" class="ep-field__input" type="password"
             v-model="form.confirmPassword" :aria-invalid="mismatch || null">
      <span v-if="mismatch" class="ep-field__error" role="alert">Passwords don't match yet.</span>
    </label>
    <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit"
            :aria-disabled="mismatch || null" :disabled="mismatch">Create account</button>
  </form>
</auth-shell>
```

**Vue contract (`<RegisterPage>`):**
```ts
props: { flash?: string }
emits: [
  'submit',        // payload: { email, username, password, confirmPassword }
  'navigate',      // 'rooms' | 'login'
]
computed: { mismatch: boolean }  // true only once confirm field has content
```

- Mismatch is client-side only and toggles `.ep-has-error` on the confirm
  field; the `role="alert"` string lives beneath the input and replaces the
  hint slot.
- Submit button is blocked while `mismatch` is true — `:disabled` + the
  `aria-disabled` attribute so screen readers announce the state.
- All further validation (email shape, username rules, server-side conflict)
  is parent-owned via `flash`.

---

### ForgotPasswordPage

```html
<auth-shell :flash="flash" accent="gold">
  <template #eyebrow><span class="ep-eyebrow ep-eyebrow--gold">Reset</span></template>
  <template #title>Lost the <em>way in?</em></template>
  <template #blurb>Tell us your email. If an account exists, we'll send a link…</template>

  <form class="ep-auth-form" @submit.prevent="submit" autocomplete="on">
    <label class="ep-field" for="fg-email">
      <span class="ep-field__label">Email</span>
      <input id="fg-email" class="ep-field__input" type="email" v-model="form.email">
    </label>
    <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit">
      Send reset link
    </button>
  </form>

  <template #footer>
    <span class="ep-muted">Back to</span>
    <a href="#" @click.prevent="$emit('navigate','login')">Sign in</a>
  </template>
</auth-shell>
```

**Vue contract (`<ForgotPasswordPage>`):**
```ts
props: { flash?: string }
emits: [
  'submit',     // payload: { email }
  'navigate',   // 'login'
]
```

- Uses `accent="gold"` so the card's radial glow leads with `--accent-gold-veil`
  on the top-left corner and the eyebrow picks up `.ep-eyebrow--gold`.
- Parent always responds with the same neutral flash copy ("If that email
  exists, a reset link has been sent.") regardless of account existence — do
  not branch the message based on the response.

---

### ResetPasswordPage

```html
<auth-shell :flash="flash" accent="gold">
  <template #eyebrow><span class="ep-eyebrow ep-eyebrow--gold">Reset</span></template>
  <template #title>Set a <em>new key</em></template>
  <template #blurb>Pick something you'll remember tomorrow. Every existing session will be signed out…</template>

  <form class="ep-auth-form" @submit.prevent="submit" autocomplete="off">
    <label class="ep-field" for="rs-new">
      <span class="ep-field__label">New password</span>
      <span class="ep-field__hint">At least 8 characters.</span>
      <input id="rs-new" class="ep-field__input" type="password" v-model="form.newPassword">
    </label>
    <label class="ep-field" :class="{ 'ep-has-error': mismatch }" for="rs-confirm">
      <span class="ep-field__label">Confirm new password</span>
      <input id="rs-confirm" class="ep-field__input" type="password"
             v-model="form.confirm" :aria-invalid="mismatch || null">
      <span v-if="mismatch" class="ep-field__error" role="alert">Passwords don't match yet.</span>
    </label>
    <button type="submit" class="ep-btn ep-btn--primary ep-btn--lg ep-auth-form__submit"
            :aria-disabled="mismatch || null" :disabled="mismatch">Save new password</button>
  </form>
</auth-shell>
```

**Vue contract (`<ResetPasswordPage>`):**
```ts
props: { flash?: string, token?: string }
emits: [
  'submit',     // payload: { newPassword, confirm, token }
  'navigate',   // 'login'
]
computed: { mismatch: boolean }
```

- Token is read from the URL (query param or hash) by the parent and passed
  through; the component itself does not touch `location`.
- On success, parent signs the user out of every session including the current
  device and routes to `login` with a flash — the blurb sets this expectation
  up front.

---

### ProfilePage

```html
<section class="ep-profile">
  <header class="ep-profile-card ep-profile-identity">
    <span class="ep-avatar ep-avatar--xl" aria-hidden="true">V</span>
    <div class="ep-profile-identity__body">
      <h1 class="ep-display ep-profile-identity__name">@victoria</h1>
      <p class="ep-muted">victoria@ember-and-pitch.app</p>
    </div>
    <button class="ep-btn ep-btn--ghost" @click="$emit('sign-out')">Sign out</button>
  </header>

  <article class="ep-profile-card ep-profile-card--password">
    <header class="ep-profile-card__head">
      <span class="ep-eyebrow">Keys</span>
      <h2 class="ep-headline">Change password</h2>
    </header>
    <form class="ep-auth-form" @submit.prevent="submitPassword">
      <label class="ep-field" for="pf-current">…</label>
      <label class="ep-field" for="pf-new">…</label>
      <label class="ep-field" :class="{ 'ep-has-error': mismatch }" for="pf-confirm">…</label>
      <button class="ep-btn ep-btn--primary" :disabled="mismatch">Update password</button>
    </form>
  </article>

  <article class="ep-profile-card">
    <header class="ep-profile-card__head">
      <span class="ep-eyebrow">Presence</span>
      <h2 class="ep-headline">Active sessions</h2>
    </header>
    <ul class="ep-session-list" v-if="sessionsSorted.length">
      <li v-for="s in sessionsSorted" :key="s.id"
          class="ep-session-row" :data-current="s.current || null">
        <span class="ep-session-row__device">
          <span class="ep-avatar ep-avatar--sm" aria-hidden="true">{{ s.initial }}</span>
          <span>
            <strong>{{ s.device }}</strong>
            <span class="ep-muted">{{ s.location }}</span>
          </span>
        </span>
        <time class="ep-mono ep-muted" :datetime="s.iso">{{ fmtWhen(s.iso) }}</time>
        <button v-if="!s.current" class="ep-btn ep-btn--ghost ep-btn--sm"
                @click="$emit('revoke', s.id)">Sign out</button>
        <span v-else class="ep-chip ep-chip--owner">This device</span>
      </li>
    </ul>
    <div v-else class="ep-session-list__empty" aria-live="polite">
      <span aria-hidden="true">·</span>
      <p class="ep-muted">No other sessions are open.</p>
    </div>
  </article>

  <article class="ep-profile-card ep-danger-zone">
    <header class="ep-profile-card__head">
      <span class="ep-eyebrow ep-eyebrow--danger">Danger zone</span>
      <h2 class="ep-headline">Delete account</h2>
      <p class="ep-muted">This cannot be undone…</p>
    </header>
    <button class="ep-btn ep-btn--danger" @click="confirming = true">Delete my account</button>
  </article>
</section>

<!-- Teleported confirm dialog -->
<teleport to="body">
  <div v-if="confirming" class="ep-modal-root" role="dialog" aria-modal="true"
       aria-labelledby="dl-t" @keydown.esc="confirming = false">
    <div class="ep-modal-scrim" @click="confirming = false"></div>
    <div class="ep-modal ep-confirm ep-confirm--danger">
      <header class="ep-modal__head"><h2 id="dl-t" class="ep-headline">Delete your account?</h2></header>
      <div class="ep-modal__body"><p>All your rooms, messages, and sessions will be removed.</p></div>
      <footer class="ep-modal__foot">
        <button ref="cancelBtn" class="ep-btn ep-btn--ghost" @click="confirming = false">Keep account</button>
        <button class="ep-btn ep-btn--danger" @click="$emit('delete-account'); confirming = false">Delete forever</button>
      </footer>
    </div>
  </div>
</teleport>
```

**Vue contract (`<ProfilePage>`):**
```ts
props: {
  me: { userId, username, email },
  sessions: Array<{
    id: string,
    device: string,       // parsed from UA
    location: string?,    // e.g. "Tbilisi"
    iso: string,          // ISO timestamp of last activity
    current: boolean,
    initial: string,      // single grapheme for avatar
  }>,
}
emits: [
  'change-password',   // payload: { currentPassword, newPassword, confirm }
  'revoke',            // payload: sessionId
  'sign-out',          // no payload
  'delete-account',    // no payload (component already confirmed)
  'navigate',          // target view
]
computed: {
  sessionsSorted: Session[],   // current device first, then by iso desc
  mismatch: boolean,
}
```

- The component owns the delete-confirm dialog (teleported to `<body>`,
  Escape-to-close, focus parked on Cancel by default). The parent MUST NOT
  run a native `confirm()` — it already did in the legacy path and now
  double-prompts if kept.
- Revoking the current device's own session is handled by the parent's
  handler: it signs out locally and routes to `login`. The component itself
  never emits `revoke` for the current session (button replaced with the
  "This device" chip).
- Password change flash is surfaced via the shared top-level flash slot on
  the app shell (same mechanism as auth); `role="status"` on the flash pill.
- Responsive: at `< 640px` the identity header stacks (avatar above name),
  session rows wrap device block above the time+action, sign-out action
  button moves to its own row full-width.

---

### SessionRow (standalone contract)

```html
<li class="ep-session-row" data-current="true">
  <span class="ep-session-row__device">
    <span class="ep-avatar ep-avatar--sm" aria-hidden="true">M</span>
    <span>
      <strong>Macbook · Firefox</strong>
      <span class="ep-muted">Tbilisi</span>
    </span>
  </span>
  <time class="ep-mono ep-muted" datetime="2026-04-22T09:14">just now</time>
  <span class="ep-chip ep-chip--owner">This device</span>
</li>
```

**Vue contract (`<SessionRow>`):**
```ts
props: {
  session: { id, device, location, iso, current, initial },
}
emits: ['revoke']   // current session never emits; button is suppressed
```

- `data-current="true"` adds an ember-tinted background and a soft
  box-shadow — the current device is always visually primary.
- `<time>` always carries a machine-readable `datetime` ISO attribute; the
  human text is relative ("just now", "2 hours ago", "Apr 18").
- Responsive stack described under `<ProfilePage>`.
- Empty-state placeholder is a peer of the list (`.ep-session-list__empty`),
  not a child — a dashed-border panel with a Fraunces ornament.

---

### DangerZone

```html
<article class="ep-profile-card ep-danger-zone">
  <header class="ep-profile-card__head">
    <span class="ep-eyebrow ep-eyebrow--danger">Danger zone</span>
    <h2 class="ep-headline">Delete account</h2>
    <p class="ep-muted">This cannot be undone. All your rooms, messages, and
      sessions will be removed.</p>
  </header>
  <button class="ep-btn ep-btn--danger" @click="confirm">Delete my account</button>
</article>
```

**Vue contract (`<DangerZone>`):**
```ts
props: {
  title: string,          // e.g. "Delete account"
  description: string,
  ctaLabel: string,       // e.g. "Delete my account"
}
emits: ['confirm']        // fired after the user commits via the paired dialog
```

- Reuses the admin Settings tab's destructive treatment: rust-tinted panel
  (`color-mix(in oklab, var(--rust) 6%, var(--surface-raised))`) separated
  from the rest of the card flow by the usual hairline.
- The eyebrow uses the `.ep-eyebrow--danger` variant (rust tint).
- `DangerZone` does NOT own the confirmation UI; it is a visual shell only.
  `ProfilePage` owns the dialog (see above) so keyboard focus and Escape can
  be managed at the page level.
- When used elsewhere (e.g. room deletion on Settings), pair with the
  same teleported `.ep-modal.ep-confirm--danger` pattern.

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
