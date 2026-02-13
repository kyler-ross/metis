---
name: electron-launcher
description: Helps users launch PM AI desktop app based on setup state
---

# Electron App Launcher

Helps users launch the PM AI desktop app based on their current setup state.

## Detection Steps

Run these checks in order (user already has pm repo since they're running Claude Code here):

1. **Check if node_modules exists**: `ls electron-app/node_modules 2>/dev/null`
2. **Check git status**: `git fetch origin main && git rev-list HEAD..origin/main --count` (0 = up to date)

## User States and Responses

### State A: Fresh user / Missing dependencies
No node_modules in electron-app (brand new clone or never installed).

**Response:**
```
Setting up PM AI desktop app for first time:

cd electron-app
pnpm install
pnpm dev

First launch auto-creates the database and syncs your Claude/Cursor sessions.
```

### State B: Outdated code
Has node_modules but behind origin/main.

**Response:**
```
Updating and launching:

git pull origin main
cd electron-app
pnpm install
pnpm dev
```

### State C: Ready to launch
Up to date with node_modules present.

**Response:**
```
cd electron-app && pnpm dev
```

Database auto-creates on first launch if needed.

## Notes

- Auto-bootstrap creates `~/.pm-ai/` directory and `chats.db` automatically
- Background sync pulls Claude Code and Cursor sessions without blocking
- No manual database setup required
