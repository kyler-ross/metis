#!/bin/bash
set -e

# Use CLAUDE_PROJECT_DIR if set, otherwise use script directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$PROJECT_DIR/.claude/hooks"
cat | npx tsx agent-activation.ts
