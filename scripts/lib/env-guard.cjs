/**
 * env-guard.cjs - Safe .env file operations
 *
 * Single module for all .env reads and writes. Every read normalizes CRLF,
 * every write creates a timestamped backup first, and writes are refused
 * if they would reduce the number of real credentials (unless forced).
 *
 * Usage:
 *   const { parseEnvFile, safeWriteEnvFile, countRealCredentials,
 *           findBestBackup, quickHealthCheck, findEnvFile } = require('./env-guard.cjs');
 */

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(SCRIPT_DIR, '.env-backups');
const MAX_BACKUPS = 10;

// Env file locations in preference order
const ENV_FILE_LOCATIONS = [
  path.join(SCRIPT_DIR, '.env'),
  path.join(path.resolve(SCRIPT_DIR, '../..'), '.env'),
];

/**
 * Resolve a write target, following symlinks so that an atomic rename
 * lands on the real file rather than destroying the symlink.
 *
 * @param {string} targetPath - The path we intend to write to
 * @returns {{ realPath: string, isSymlink: boolean }}
 */
function resolveWriteTarget(targetPath) {
  try {
    const lstats = fs.lstatSync(targetPath);
    if (lstats.isSymbolicLink()) {
      const realPath = fs.realpathSync(targetPath);
      // Boundary check: ensure symlink doesn't escape the target's directory
      const targetDir = path.dirname(path.resolve(targetPath));
      const resolvedDir = path.dirname(realPath);
      if (resolvedDir !== targetDir && !resolvedDir.startsWith(targetDir + path.sep)) {
        throw new Error(`[env-guard] Refusing write: symlink at ${targetPath} resolves outside its directory to ${realPath}`);
      }
      return { realPath, isSymlink: true };
    }
  } catch (err) {
    // Re-throw intentional boundary-check errors; swallow only filesystem errors
    if (err && err.message && err.message.startsWith('[env-guard] Refusing write')) throw err;
    // Target doesn't exist yet - that's fine, use the original path
  }
  return { realPath: targetPath, isSymlink: false };
}

/**
 * Normalize line endings to LF (Unix-style).
 * @param {string} content
 * @returns {string}
 */
function normalizeLF(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Atomic write: write to a temp file then rename, cleaning up on failure.
 *
 * @param {string} targetPath - The resolved (real) path to write to
 * @param {string} content - The content to write
 */
function atomicWriteFile(targetPath, content) {
  const tmpPath = targetPath + `.tmp.${process.pid}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmpPath, content, { mode: 0o600 });
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (cleanupErr) {
      console.warn(`Warning: failed to clean up temp file: ${cleanupErr.message}`);
    }
    throw err;
  }
}

// Placeholder patterns that don't count as real credentials
const PLACEHOLDER_PATTERNS = [
  /^your[-_]/i,                   // your_api_key, your-token, etc.
  /^[a-z]{2,5}[-_]x{4,}/i,       // ghp_xxxxxxxxxxxx, phc_xxxx, xoxb-xxxx
  /^xxx+$/i,
  /^placeholder$/i,
  /^changeme$/i,
  /^TODO$/i,
  /^REPLACE_ME$/i,
  /^test$/i,
  /^example$/i,
  /^dummy$/i,
  /^sample$/i,
  /^none$/i,
  /^n\/a$/i,
  /^tbd$/i,
  /^$/,
];

// Key name patterns that identify credential variables
const CREDENTIAL_KEY_PATTERNS = [
  /KEY$/i,
  /TOKEN$/i,
  /SECRET$/i,
  /PASSWORD$/i,
  /^ATLASSIAN_EMAIL$/i,    // Specific match only - generic EMAIL suffix would match non-credentials. Add new email-type credentials here explicitly.
  /^SLACK_BOT_/i,
  /^SLACK_SIGNING_/i,
];

// Required credential keys (used for health checks)
const REQUIRED_KEYS = [
  'JIRA_API_KEY',
  'ATLASSIAN_EMAIL',
  'GEMINI_API_KEY',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
];

/**
 * Find the first existing .env file or return the preferred location
 */
function findEnvFile() {
  for (const loc of ENV_FILE_LOCATIONS) {
    if (fs.existsSync(loc)) return loc;
  }
  return ENV_FILE_LOCATIONS[0];
}

/**
 * Cached env file path, resolved once at module load time.
 * @deprecated For long-running processes where the .env may be created or moved
 * after import, call findEnvFile() directly instead of using this constant.
 * Kept exported for backwards compatibility only.
 */
const ENV_FILE = findEnvFile();

/**
 * Parse env content from a string, normalizing CRLF to LF automatically.
 *
 * @param {string} content - Raw env file content
 * @returns {Object} - Parsed key-value pairs
 */
function parseEnvString(content) {
  const vars = {};
  for (const line of normalizeLF(content).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (!key) continue; // skip lines like "=value" with empty key
      let val = match[2].trim();

      // Warn on duplicate keys
      if (key in vars) {
        console.warn(`[env-guard] Warning: duplicate key "${key}" in .env - using last occurrence`);
      }

      // Only strip matching quote pairs - mismatched quotes like "value' are left as-is
      if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
        val = val.slice(1, -1);
      } else {
        // Detect mismatched quotes (old parsers stripped these independently)
        if ((val.startsWith('"') || val.startsWith("'")) && val.length > 1) {
            const lastChar = val[val.length - 1];
            if ((val[0] === '"' && lastChar === "'") || (val[0] === "'" && lastChar === '"')) {
                console.warn(`[env-guard] Warning: mismatched quotes in ${key} (starts with ${val[0]}, ends with ${lastChar}) - quotes preserved`);
            }
        }

        // Detect likely multiline value (opening quote with no closing quote on same line)
        if ((val.startsWith('"') && !val.endsWith('"')) || (val.startsWith("'") && !val.endsWith("'"))) {
          if (val.length > 1) {
            console.warn(`[env-guard] Warning: "${key}" appears to have a multiline value (unmatched opening quote) - only first line captured. Multiline .env values are not supported.`);
          }
        }
      }
      vars[key] = val;
    }
  }
  return vars;
}

/**
 * Parse a .env file, normalizing CRLF to LF automatically
 *
 * @param {string} filePath - Path to .env file
 * @returns {{ vars: Object, raw: string, hasCrlf: boolean, error?: string }}
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { vars: {}, raw: '', hasCrlf: false };
  }

  let rawContent;
  try {
    rawContent = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { vars: {}, raw: '', hasCrlf: false, error: err.message };
  }

  const hasCrlf = rawContent.includes('\r');
  const content = normalizeLF(rawContent);

  const vars = parseEnvString(content);

  return { vars, raw: content, hasCrlf };
}

/**
 * Check if a value is a real credential (not empty, not a placeholder)
 *
 * @param {string} value - The credential value to check
 * @returns {boolean} - true if the value is a real credential
 */
function isRealCredential(value) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) return false;
  return !PLACEHOLDER_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Check if a key name matches known credential key patterns.
 *
 * @param {string} key - The env var key name
 * @returns {boolean} - true if the key looks like a credential
 */
function isCredentialKey(key) {
  return CREDENTIAL_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Count non-empty, non-placeholder credential values in an env object.
 * Only counts vars whose key names match known credential patterns.
 *
 * @param {Object} vars - Parsed env vars
 * @returns {number}
 */
function countRealCredentials(vars) {
  let count = 0;
  for (const [key, value] of Object.entries(vars)) {
    if (isCredentialKey(key) && isRealCredential(value)) {
      count++;
    }
  }
  return count;
}

/**
 * Ensure the backup directory exists with correct permissions.
 *
 * @private Exported for test access only.
 * @returns {void}
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  }
  try { fs.chmodSync(BACKUP_DIR, 0o700); } catch { /* best effort */ }
}

/**
 * Create a timestamped backup of a file
 *
 * @param {string} filePath - File to back up
 * @returns {string|null} - Path to backup file, or null if source doesn't exist
 */
function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;

  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `.env.backup.${timestamp}.${process.pid}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  try {
    // mode: 0o600 is Unix-only; on Windows this option is ignored
    fs.writeFileSync(backupPath, fs.readFileSync(filePath), { mode: 0o600 });
  } catch (err) {
    // Clean up partial backup on failure (e.g., disk full)
    try { fs.unlinkSync(backupPath); } catch (cleanupErr) {
      console.warn(`Warning: failed to clean up partial backup ${path.basename(backupPath)}: ${cleanupErr.message}`);
    }
    return null;
  }

  pruneOldBackups();

  return backupPath;
}

/**
 * Keep only the most recent MAX_BACKUPS backups
 */
function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('.env.backup.'))
    .map(f => {
      const fullPath = path.join(BACKUP_DIR, f);
      try {
        return {
          name: f,
          path: fullPath,
          mtime: fs.statSync(fullPath).mtimeMs,
        };
      } catch {
        // File may have been deleted by concurrent process
        return null;
      }
    })
    .filter(Boolean)
    // Sort by mtime (not filename timestamp) - if files are touched/modified after creation, mtime takes precedence
    .sort((a, b) => b.mtime - a.mtime);

  // Remove backups beyond the limit
  for (const backup of backups.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(backup.path);
    } catch (err) {
      console.warn(`Warning: could not prune backup ${backup.name}: ${err.message}`);
    }
  }
}

/**
 * List all available backups with metadata
 *
 * @returns {Array<{ name: string, path: string, date: Date, credentialCount: number }>}
 */
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('.env.backup.'))
    .map(f => {
      const fullPath = path.join(BACKUP_DIR, f);
      try {
        const { vars } = parseEnvFile(fullPath);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          date: stat.mtime,
          credentialCount: countRealCredentials(vars),
        };
      } catch {
        // File may have been deleted by concurrent process
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);
}

/**
 * Find the most recent backup with more credentials than current file
 *
 * @returns {{ path: string, credentialCount: number, date: Date }|null}
 */
function findBestBackup() {
  const envFile = findEnvFile();
  const currentCount = fs.existsSync(envFile)
    ? countRealCredentials(parseEnvFile(envFile).vars)
    : 0;

  const backups = listBackups();
  const better = backups.find(b => b.credentialCount > currentCount);
  return better || null;
}

/**
 * Safely write an .env file with backup and credential count protection
 *
 * @param {string} filePath - Target file path
 * @param {string} content - New file content
 * @param {Object} options
 * @param {boolean} options.force - Skip credential count check
 * @returns {{ ok: boolean, message: string, backupPath?: string }}
 */
function safeWriteEnvFile(filePath, content, options = {}) {
  const { force = false } = options;

  // Normalize content to LF
  const normalizedContent = normalizeLF(content);

  // If file exists, check credential counts
  if (fs.existsSync(filePath) && !force) {
    const existing = parseEnvFile(filePath);
    const existingCount = countRealCredentials(existing.vars);

    // Parse new content to count credentials
    const newVars = parseEnvString(normalizedContent);
    const newCount = countRealCredentials(newVars);

    if (newCount < existingCount) {
      return {
        ok: false,
        message: `Refused: new content has ${newCount} credentials vs existing ${existingCount}. Use force:true to override.`,
      };
    }
  }

  if (force && fs.existsSync(filePath)) {
    console.error('[env-guard] Force write to', path.basename(filePath), '- credential check bypassed');
  }

  // Note: TOCTOU race between reading existing credentials and writing new content.
  // Acceptable for single-user dev tool; use file locking if concurrency is needed.

  // Create backup before writing
  const backupPath = createBackup(filePath);
  if (!backupPath && fs.existsSync(filePath)) {
    if (!force) {
      return {
        ok: false,
        message: 'Refused: could not create backup before write. Fix disk space or backup directory permissions, then retry.',
        backupPath: null,
      };
    }
    console.warn('[env-guard] Warning: backup failed before force write to', path.basename(filePath));
  }

  // Resolve symlinks so atomic rename doesn't destroy the link
  const { realPath: writePath } = resolveWriteTarget(filePath);
  atomicWriteFile(writePath, normalizedContent);

  return {
    ok: true,
    message: backupPath
      ? `Written with backup at ${path.basename(backupPath)}`
      : 'Written (no previous file to back up)',
    backupPath,
  };
}

/**
 * Fix CRLF line endings in a file (in-place)
 *
 * @param {string} filePath
 * @returns {boolean} - true if CRLF was found and fixed
 */
function fixCrlf(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('\r')) return false;

  const backupResult = createBackup(filePath);
  if (!backupResult && content.length > 0) {
    console.warn('[env-guard] Warning: backup failed before CRLF fix of', path.basename(filePath));
  }
  const fixed = normalizeLF(content);

  // Resolve symlinks so atomic rename doesn't destroy the link
  const { realPath: writePath } = resolveWriteTarget(filePath);
  atomicWriteFile(writePath, fixed);
  return true;
}

/**
 * Quick health check for session-start (no network calls, pure filesystem)
 *
 * @returns {{ healthy: boolean, issues: string[] }}
 */
function quickHealthCheck() {
  const issues = [];
  const envFile = findEnvFile();

  // Check .env existence
  if (!fs.existsSync(envFile)) {
    const bestBackup = findBestBackup();
    if (bestBackup) {
      issues.push(`.env file missing - restorable backup found with ${bestBackup.credentialCount} credentials. Run: node .ai/scripts/env-restore.cjs --latest`);
    } else {
      issues.push('.env file missing - run /pm-setup to create it');
    }
    return { healthy: false, issues };
  }

  const { vars, hasCrlf } = parseEnvFile(envFile);

  // Check CRLF
  if (hasCrlf) {
    issues.push('.env has CRLF line endings (corrupts tokens). Run: node .ai/scripts/setup-doctor.cjs --fix');
  }

  // Check required credentials
  const missingRequired = REQUIRED_KEYS.filter(k => !isRealCredential(vars[k]));
  if (missingRequired.length > 0) {
    const bestBackup = findBestBackup();
    let msg = `Missing credentials: ${missingRequired.join(', ')}`;
    if (bestBackup) {
      msg += `. Backup available with ${bestBackup.credentialCount} credentials - run: node .ai/scripts/env-restore.cjs --latest`;
    }
    issues.push(msg);
  }

  // Check for placeholder values in required keys (exclude keys already reported as missing)
  const placeholderKeys = REQUIRED_KEYS.filter(k => {
    const val = vars[k];
    return val && !isRealCredential(val) && !missingRequired.includes(k);
  });
  if (placeholderKeys.length > 0) {
    issues.push(`Placeholder values detected: ${placeholderKeys.join(', ')} - update with real credentials`);
  }

  return { healthy: issues.length === 0, issues };
}

module.exports = {
  ENV_FILE, // deprecated - use findEnvFile() instead
  ENV_FILE_LOCATIONS,
  BACKUP_DIR,
  REQUIRED_KEYS,
  findEnvFile,
  normalizeLF,
  parseEnvFile,
  parseEnvString,
  isRealCredential,
  isCredentialKey,
  countRealCredentials,
  createBackup,
  listBackups,
  findBestBackup,
  safeWriteEnvFile,
  fixCrlf,
  quickHealthCheck,
  ensureBackupDir,
  atomicWriteFile,
};
