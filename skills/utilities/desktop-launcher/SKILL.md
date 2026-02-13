---
name: desktop-launcher
description: Helps users launch PMDesktop native macOS app based on setup state
---

# PMDesktop App Launcher

Helps users launch the PM AI native macOS desktop app based on their current setup state.

## Detection Steps

Run these checks in order (user already has pm repo since they're running Claude Code here):

1. **Check if Package.swift exists**: `ls PMDesktop/Package.swift 2>/dev/null`
2. **Check Swift toolchain**: `swift --version 2>/dev/null`
3. **Check git status**: `git fetch origin main && git rev-list HEAD..origin/main --count` (0 = up to date)

## User States and Responses

### State A: Missing Swift toolchain
Swift not available or below required version.

**Response:**
```
PMDesktop requires macOS 26+ (Tahoe) with the Swift toolchain.

Verify your environment:
  swift --version
  xcode-select -p

Then launch:
  cd PMDesktop
  make run
```

### State B: Outdated code
Package.swift exists but behind origin/main.

**Response:**
```
Updating and launching:

git pull origin main
cd PMDesktop
make run
```

### State C: Ready to launch
Up to date with Package.swift present and Swift toolchain available.

**Response:**
```
cd PMDesktop && make run
```

You can also build without running: `cd PMDesktop && swift build`

## Notes

- Requires macOS 26+ (Tahoe) and Swift toolchain
- Build system uses Swift Package Manager (Package.swift)
- `make run` handles building and launching in one step
- Alternative: `swift build` then `swift run` for separate build/run steps
