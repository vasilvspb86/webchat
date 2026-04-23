# Development Approach — Chat Hackathon Project

## How We Build Features

Every feature follows a strict sequence — **no exceptions**:

1. **Scenarios first** — Before any code is written, business logic is described in plain English (Given/When/Then). User reads and approves these.
2. **Test first (RED)** — Each approved scenario becomes a failing Vitest test. The test must fail before implementation begins.
3. **Implement (GREEN)** — Minimal code is written to make the test pass.
4. **Commit** — Only passing, linted code gets committed.

## Superpowers Plugin

All development is done through the **Superpowers plugin for Claude Code**, which enforces the workflow above automatically. Key skills in use:

| Skill | What it does |
|---|---|
| `test-driven-development` | Enforces RED → GREEN → REFACTOR cycle; blocks implementation without a failing test |
| `writing-plans` | Structures implementation plans before any code is touched |
| `executing-plans` | Drives feature implementation step by step against the approved plan |
| `verification-before-completion` | Runs a checklist before marking any feature done |
| `systematic-debugging` | Guides root-cause analysis when tests break |

Two automated hooks run in the background on every file save:
- **PostToolUse hook** — triggers the full test suite after every edit
- **Pre-commit hook** (Husky) — blocks commits if tests fail or ESLint reports errors

## Building Sequence

The project is built in phases, one feature area at a time:

| Phase | Feature Area |
|---|---|
| 1 | User Registration & Authentication |
| 2 | Session Management |
| 3 | Presence & AFK |
| 4 | Contacts & Friends |
| 5 | Chat Rooms |
| 6 | Room Moderation |
| 7 | Messaging |
| 8 | Files & Attachments |

Each phase follows the same loop: Approve scenarios → RED (failing test) → GREEN (implementation) → Commit.
No phase begins until the previous one is fully tested and committed.
