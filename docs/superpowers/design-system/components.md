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
