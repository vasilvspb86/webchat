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

## Known Bottlenecks (Team-Level)

- **QA:** Testing chat flows and AI-assisted features at scale is a pain point — prioritize testable, observable code
- **DevOps:** Keep infrastructure simple; avoid complex multi-service setups unless clearly necessary

## Hackathon acceptance criteria 

- Create public github repository with your project
- Project MUST be buildable and runnable by `docker compose up` in the root repository folder