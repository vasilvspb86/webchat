# Ember & Pitch — Rooms Design System

A warm, campfire-at-night visual system for the Webchat Rooms sub-project.
Deep charcoal surfaces, paper-cream text, ember-orange signal color, gold
for highlights, moss for presence. Serif display (Fraunces) pairs with a
humanist geometric sans (Plus Jakarta Sans) and JetBrains Mono for numbers.

**Why not the existing Discord-grey + blue-accent look?** The current auth
sub-project styles are a placeholder — they read as "generic chat app."
Rooms is about people gathering to talk, so the visual tone should be closer
to "lit parlour at night" than "corporate dashboard." This token palette is
broad (semantic layer + full color ramp + motion + spacing + radius) so the
auth pages can be re-skinned onto it later without re-visiting the system.

## Files

| Path                    | What it is                                          |
| ----------------------- | --------------------------------------------------- |
| `tokens.css`            | CSS custom properties only. Zero component rules.   |
| `components.md`         | HTML skeletons + Vue props contracts for each UI unit. |
| `mockups/catalog.html`  | Public rooms catalog grid.                          |
| `mockups/create-room.html` | Create-room modal over a dimmed catalog.         |
| `mockups/room-page.html` | Room shell + members panel.                        |
| `mockups/admin-modal.html` | Admin modal with five tabs.                      |
| `mockups/invitations.html` | Invitation inbox with pending, expiring, expired states. |

Each mockup is a self-contained `.html` file that `@import`s `../tokens.css`
and inlines component CSS. Open any of them directly in a browser to see the
full intended look; they're the reference Phase 8 Vue components should
converge on.

## Using the tokens

```html
<link rel="stylesheet" href="/design-system/tokens.css">
```

Then in any stylesheet:

```css
.my-thing {
  background: var(--surface-card);
  color:      var(--text-body);
  border:     var(--stroke-hair) solid var(--edge-quiet);
  border-radius: var(--radius-card);
  padding:    var(--space-6);
  box-shadow: var(--shadow-md);
  transition: transform var(--dur-quick) var(--ease-standard);
}
.my-thing:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.my-thing:focus-visible { outline: none; box-shadow: var(--focus-ring); }
```

## Theme

- Default is dark. Add `data-theme="light"` on `<html>` or a descendant to
  flip to the light skin. The semantic tokens (`--surface-*`, `--text-*`,
  `--accent-*`, shadows, chips) all swap together.
- System preference is **not** auto-followed yet — that belongs in the auth
  re-skin pass. For now: dark unless explicitly opted out.

## Out of scope for this pass

- Vue component implementations (Phase 8).
- Socket.io wiring (Phase 8).
- Auth-page re-skin (future mini sub-project using these same tokens).
- Message composition / timeline UI (owned by the messaging sub-project;
  `room-page.html` leaves that region as a deliberately sparse
  `.ep-stage--empty` placeholder with a "messaging pending" whisper).

## Review gate

Per the implementation plan (Phase 7, step 13.3), the user reviews this
folder before any Phase 8 Vue code is written. Changes to tokens, component
contracts, or mockups all happen here first, not inside `public/components/`.
