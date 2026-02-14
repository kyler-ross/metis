/**
 * repo-utils.cjs - Shared repository detection utility.
 * Used by granola-auth.cjs and setup-user.cjs to auto-detect the GitHub repo.
 */
'use strict';
const { execSync } = require('child_process');

/**
 * Detect the current GitHub repository (owner/name) using `gh`.
 * Falls back to 'your-org/your-repo' if detection fails.
 * @returns {string} Repository in "owner/name" format
 */
function detectRepo() {
  try {
    const out = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (out && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(out)) return out;
  } catch {}
  // Fallback to the work monorepo (previously your-org/your-repo, consolidated)
  return 'your-org/your-repo';
}

module.exports = { detectRepo };
