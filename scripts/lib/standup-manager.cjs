/**
 * Standup Manager Library
 *
 * Manages team standups using Google Calendar recurring events.
 * Works with standup-config.json for standup definitions and attendee groups.
 */

const fs = require('fs');
const path = require('path');
const calendarClient = require('./calendar-client.cjs');

// Configuration paths
const CONFIG_PATH = path.join(__dirname, '../../config/standup-config.json');
const LOCK_PATH = CONFIG_PATH + '.lock';

// Rate limiting: delay between bulk API calls (ms)
// Google Calendar API allows ~100 calls/100 seconds
const RATE_LIMIT_DELAY_MS = 1000;

// Lock timeout in milliseconds (stale locks older than this are ignored)
const LOCK_TIMEOUT_MS = 30000;

// Current process ID for lock ownership tracking
const CURRENT_PID = process.pid;

/**
 * Delay helper for rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Synchronous sleep helper using Atomics.wait (no CPU spinning)
 * Falls back to busy-wait if SharedArrayBuffer is unavailable
 * @param {number} ms - Milliseconds to sleep (max 1000ms recommended)
 */
function sleepSync(ms) {
  // Use Atomics.wait for true blocking without CPU spinning
  // This is supported in Node.js 8.10+ and doesn't spin the CPU
  try {
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    // Wait on a value that will never change - provides true sleep
    Atomics.wait(view, 0, 0, ms);
  } catch (e) {
    // Fallback to busy-wait if SharedArrayBuffer is unavailable
    // (e.g., in some security-restricted environments)
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Busy wait fallback
    }
  }
}

/**
 * Parse lock file content
 * @param {string} content - Lock file content
 * @returns {{pid: number, timestamp: number}|null} Parsed lock data or null if invalid
 */
function parseLockContent(content) {
  try {
    const data = JSON.parse(content);
    if (typeof data.pid === 'number' && typeof data.timestamp === 'number') {
      return data;
    }
  } catch (e) {
    // Try legacy format (just timestamp)
    const timestamp = parseInt(content, 10);
    if (!isNaN(timestamp)) {
      return { pid: 0, timestamp }; // pid 0 means unknown (legacy)
    }
  }
  return null;
}

/**
 * Acquire a lock for config file operations
 * Uses a lock file with PID and timestamp to detect stale locks and verify ownership
 *
 * Strategy to prevent TOCTOU race conditions:
 * 1. Always try atomic create first (wx flag)
 * 2. Only on EEXIST, check if lock is stale
 * 3. Use jittered backoff to reduce contention
 *
 * @param {number} [maxAttempts=5] - Maximum retry attempts
 * @returns {boolean} True if lock acquired, false if another process holds it
 */
function acquireLock(maxAttempts = 5) {
  const lockData = JSON.stringify({ pid: CURRENT_PID, timestamp: Date.now() });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try atomic create first - this is the only race-safe way
      fs.writeFileSync(LOCK_PATH, lockData, { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // Lock exists - check if it's stale or owned by a dead process
        try {
          const lockContent = fs.readFileSync(LOCK_PATH, 'utf8');
          const parsed = parseLockContent(lockContent);

          if (!parsed) {
            // Corrupt lock file - try to remove and retry
            try {
              fs.unlinkSync(LOCK_PATH);
            } catch (unlinkErr) {
              // Ignore ENOENT - another process already removed it
              if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
            }
            continue;
          }

          const age = Date.now() - parsed.timestamp;
          let shouldRemoveLock = false;

          // Check if lock is stale (too old)
          if (age > LOCK_TIMEOUT_MS) {
            shouldRemoveLock = true;
          }
          // Check if lock holder process is dead (PID > 0 means we have valid PID)
          else if (parsed.pid > 0 && parsed.pid !== CURRENT_PID) {
            try {
              // process.kill with signal 0 checks if process exists without killing it
              process.kill(parsed.pid, 0);
              // Process exists - lock is valid
            } catch (killErr) {
              if (killErr.code === 'ESRCH') {
                // Process doesn't exist - lock is orphaned
                shouldRemoveLock = true;
                console.warn(`⚠️  Removing orphaned lock from dead process ${parsed.pid}`);
              }
              // EPERM means process exists but we can't signal it - lock is valid
            }
          }

          if (shouldRemoveLock) {
            try {
              fs.unlinkSync(LOCK_PATH);
            } catch (unlinkErr) {
              // Ignore ENOENT - another process already removed it
              if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
            }
            // Use exponential backoff to avoid thundering herd when multiple
            // processes simultaneously detect and remove a stale lock
            const baseDelay = 50 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * baseDelay);
            sleepSync(baseDelay + jitter);
            continue;
          }

          // Lock is fresh and held by another live process
          if (attempt < maxAttempts - 1) {
            // Exponential backoff with jitter (50-150ms, 100-300ms, 200-600ms...)
            const baseDelay = 50 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * baseDelay);
            sleepSync(baseDelay + jitter);
            continue;
          }

          // Max attempts reached, lock is still held
          return false;
        } catch (readErr) {
          // Lock was deleted between our create attempt and read - retry
          if (readErr.code === 'ENOENT') {
            continue;
          }
          throw readErr;
        }
      }
      // Unexpected error
      throw error;
    }
  }
  return false;
}

/**
 * Release the config file lock
 * Only releases if the current process owns the lock
 */
function releaseLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) {
      return; // No lock to release
    }

    // Verify we own the lock before releasing
    const lockContent = fs.readFileSync(LOCK_PATH, 'utf8');
    const parsed = parseLockContent(lockContent);

    if (parsed && parsed.pid !== 0 && parsed.pid !== CURRENT_PID) {
      // Lock is owned by another process - don't release it!
      console.warn(`⚠️  Warning: Not releasing lock owned by process ${parsed.pid} (we are ${CURRENT_PID})`);
      return;
    }

    // We own the lock (or it's a legacy lock with unknown owner) - safe to release
    fs.unlinkSync(LOCK_PATH);
  } catch (error) {
    // Ignore ENOENT - lock was already released
    if (error.code !== 'ENOENT') {
      console.warn('Warning: Could not release lock file:', error.message);
    }
  }
}

/**
 * Load standup configuration with validation
 * @returns {Object} Standup config
 * @throws {Error} If config file is missing, invalid JSON, or missing required fields
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Standup config not found at ${CONFIG_PATH}`);
  }

  const content = fs.readFileSync(CONFIG_PATH, 'utf8');

  // Parse JSON with error handling
  let config;
  try {
    config = JSON.parse(content);
  } catch (parseErr) {
    throw new Error(`Invalid JSON in standup config: ${parseErr.message}`);
  }

  // Validate required top-level fields
  if (!config || typeof config !== 'object') {
    throw new Error('Standup config must be a valid object');
  }

  if (!config.metadata || typeof config.metadata !== 'object') {
    throw new Error('Standup config missing required field: metadata');
  }

  if (!config.standups || typeof config.standups !== 'object') {
    throw new Error('Standup config missing required field: standups');
  }

  if (!config.attendee_groups || typeof config.attendee_groups !== 'object') {
    throw new Error('Standup config missing required field: attendee_groups');
  }

  // Validate metadata has timezone
  if (!config.metadata.timezone) {
    throw new Error('Standup config metadata missing required field: timezone');
  }

  // Validate individual standup entries
  for (const [key, standup] of Object.entries(config.standups)) {
    if (!standup.summary || typeof standup.summary !== 'string') {
      throw new Error(`Standup "${key}" missing or invalid required field: summary`);
    }
    if (!standup.time || !/^\d{2}:\d{2}$/.test(standup.time)) {
      throw new Error(`Standup "${key}" has invalid time format (expected HH:MM): ${standup.time}`);
    }
    if (!standup.duration_minutes || typeof standup.duration_minutes !== 'number' || standup.duration_minutes < 1) {
      throw new Error(`Standup "${key}" has invalid duration_minutes: ${standup.duration_minutes}`);
    }
    if (!standup.recurrence || !standup.recurrence.startsWith('RRULE:')) {
      throw new Error(`Standup "${key}" has invalid recurrence (must start with RRULE:): ${standup.recurrence}`);
    }
    if (!Array.isArray(standup.attendee_groups) || standup.attendee_groups.length === 0) {
      throw new Error(`Standup "${key}" must have at least one attendee_groups entry`);
    }
  }

  return config;
}

/**
 * Save standup configuration (atomic write with locking)
 *
 * Uses write-to-temp + rename pattern to prevent corruption
 * if the write fails mid-operation. Also uses file locking to
 * prevent concurrent modifications.
 *
 * @param {Object} config - Config to save
 * @throws {Error} If lock cannot be acquired (concurrent modification)
 */
function saveConfig(config) {
  // Acquire lock before writing
  if (!acquireLock()) {
    throw new Error('Cannot save config: another process is modifying it. Try again in a few seconds.');
  }

  const tmpPath = CONFIG_PATH + '.tmp';

  try {
    const content = JSON.stringify(config, null, 2);

    // Write to temp file first
    fs.writeFileSync(tmpPath, content);

    // Atomic rename (on POSIX systems, rename is atomic)
    fs.renameSync(tmpPath, CONFIG_PATH);
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (cleanupErr) {
      console.warn(`Warning: Could not clean up temp file: ${cleanupErr.message}`);
    }
    throw error;
  } finally {
    // Always release lock
    releaseLock();
  }
}

/**
 * Safely modify config with automatic locking
 * @param {Function} modifier - Function that receives config and modifies it
 * @returns {Object} The modified config
 */
function modifyConfig(modifier) {
  if (!acquireLock()) {
    throw new Error('Cannot modify config: another process is modifying it. Try again in a few seconds.');
  }

  const tmpPath = CONFIG_PATH + '.tmp';

  try {
    const config = loadConfig();
    modifier(config);

    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, CONFIG_PATH);

    return config;
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (cleanupErr) {
      console.warn(`Warning: Could not clean up temp file: ${cleanupErr.message}`);
    }
    throw error;
  } finally {
    releaseLock();
  }
}

/**
 * Resolve attendee group to list of emails
 * @param {string} groupName - Name of the attendee group
 * @returns {string[]} Array of email addresses
 */
function resolveAttendeeGroup(groupName) {
  const config = loadConfig();
  const group = config.attendee_groups[groupName];

  if (!group) {
    throw new Error(`Unknown attendee group: ${groupName}`);
  }

  const members = group.members || [];
  if (members.length === 0) {
    console.warn(`⚠️  Warning: Attendee group "${groupName}" has no members`);
  }

  return members;
}

/**
 * Resolve multiple attendee groups to combined list of emails
 * @param {string[]} groupNames - Array of group names
 * @returns {string[]} Deduplicated array of email addresses
 */
function resolveAttendeeGroups(groupNames) {
  const allEmails = new Set();

  for (const groupName of groupNames) {
    const emails = resolveAttendeeGroup(groupName);
    emails.forEach(email => allEmails.add(email));
  }

  const result = Array.from(allEmails);
  if (result.length === 0 && groupNames.length > 0) {
    console.warn(`⚠️  Warning: No attendees found after resolving ${groupNames.length} group(s)`);
  }

  return result;
}

/**
 * Get next occurrence of a day/time
 *
 * Note: This calculates dates in the system's local timezone. The actual
 * event timezone is set via the timeZone parameter when creating the event
 * in the Calendar API. For best results, run this on a system in the same
 * timezone as the intended meeting timezone.
 *
 * @param {string} day - Day of week (monday, tuesday, etc.)
 * @param {string} time - Time in HH:MM format
 * @returns {Date} Next occurrence in local timezone
 */
function getNextOccurrence(day, time) {
  const dayMap = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6
  };

  const targetDay = dayMap[day.toLowerCase()];
  if (targetDay === undefined) {
    throw new Error(`Invalid day: ${day}`);
  }

  const [hours, minutes] = time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: ${time}. Expected HH:MM (e.g., 09:30)`);
  }

  const now = new Date();
  const result = new Date(now);

  // Set the time
  result.setHours(hours, minutes, 0, 0);

  // Find the next occurrence of the target day
  const currentDay = now.getDay();
  let daysUntil = targetDay - currentDay;

  if (daysUntil < 0 || (daysUntil === 0 && result <= now)) {
    daysUntil += 7;
  }

  result.setDate(result.getDate() + daysUntil);
  return result;
}

/**
 * List all configured standups with their status
 * @returns {Promise<Object[]>} Array of standup info objects
 */
async function listStandups() {
  const config = loadConfig();
  const standups = [];

  for (const [key, standup] of Object.entries(config.standups)) {
    const attendees = resolveAttendeeGroups(standup.attendee_groups);

    standups.push({
      key,
      name: standup.name,
      summary: standup.summary,
      schedule: standup.day || standup.days?.join(', '),
      time: standup.time,
      duration: standup.duration_minutes,
      recurrence: standup.recurrence,
      attendeeGroups: standup.attendee_groups,
      attendeeCount: attendees.length,
      attendees,
      addMeet: standup.add_meet,
      eventId: standup.event_id || null // Will be set after creation
    });
  }

  return standups;
}

/**
 * Get a single standup configuration
 * @param {string} standupKey - Key of the standup
 * @returns {Object} Standup configuration
 */
function getStandup(standupKey) {
  const config = loadConfig();
  const standup = config.standups[standupKey];

  if (!standup) {
    throw new Error(`Unknown standup: ${standupKey}`);
  }

  return {
    key: standupKey,
    ...standup,
    attendees: resolveAttendeeGroups(standup.attendee_groups)
  };
}

/**
 * Preview what would be created for a standup (dry run)
 * @param {string} standupKey - Key of the standup
 * @returns {Object} Preview of the event that would be created
 */
function previewStandup(standupKey) {
  const config = loadConfig();
  const standup = config.standups[standupKey];

  if (!standup) {
    throw new Error(`Unknown standup: ${standupKey}`);
  }

  const attendees = resolveAttendeeGroups(standup.attendee_groups);
  const day = standup.day || (standup.days ? standup.days[0] : 'monday');
  const startDate = getNextOccurrence(day, standup.time);
  const endDate = new Date(startDate.getTime() + standup.duration_minutes * 60 * 1000);

  return {
    summary: standup.summary,
    description: standup.description,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    recurrence: standup.recurrence,
    attendees,
    addMeet: standup.add_meet,
    timezone: config.metadata.timezone
  };
}

/**
 * Create a standup recurring event from config
 * @param {string} standupKey - Key of the standup in config
 * @param {Object} [options] - Options
 * @param {boolean} [options.sendNotifications=true] - Send calendar invites
 * @returns {Promise<Object>} Created event
 */
async function createStandup(standupKey, options = {}) {
  const config = loadConfig();
  const standup = config.standups[standupKey];

  if (!standup) {
    throw new Error(`Unknown standup: ${standupKey}`);
  }

  const attendees = resolveAttendeeGroups(standup.attendee_groups);
  const day = standup.day || (standup.days ? standup.days[0] : 'monday');
  const startDate = getNextOccurrence(day, standup.time);
  const endDate = new Date(startDate.getTime() + standup.duration_minutes * 60 * 1000);

  const event = await calendarClient.createRecurringEvent({
    summary: standup.summary,
    description: standup.description,
    start: startDate,
    end: endDate,
    recurrence: standup.recurrence,
    attendees,
    addMeet: standup.add_meet,
    timeZone: config.metadata.timezone,
    sendNotifications: options.sendNotifications !== false
  });

  // Store the event ID in config for future reference
  config.standups[standupKey].event_id = event.id;
  saveConfig(config);

  return event;
}

/**
 * Update attendees for a standup series
 * @param {string} standupKey - Key of the standup
 * @param {string[]} emails - New attendee emails (replaces existing)
 * @returns {Promise<Object>} Updated event
 */
async function updateStandupAttendees(standupKey, emails) {
  const config = loadConfig();
  const standup = config.standups[standupKey];

  if (!standup) {
    throw new Error(`Unknown standup: ${standupKey}`);
  }

  if (!standup.event_id) {
    throw new Error(`Standup ${standupKey} has not been created yet. Use createStandup first.`);
  }

  return calendarClient.updateRecurringSeries(standup.event_id, {
    attendees: emails
  });
}

/**
 * Update attendee group membership
 * @param {string} groupName - Name of the group
 * @param {string[]} emails - New member emails
 */
function updateAttendeeGroup(groupName, emails) {
  const config = loadConfig();

  if (!config.attendee_groups[groupName]) {
    throw new Error(`Unknown attendee group: ${groupName}`);
  }

  config.attendee_groups[groupName].members = emails;
  saveConfig(config);
}

/**
 * Add a member to an attendee group
 * @param {string} groupName - Name of the group
 * @param {string} email - Email to add
 */
function addToAttendeeGroup(groupName, email) {
  const config = loadConfig();

  if (!config.attendee_groups[groupName]) {
    throw new Error(`Unknown attendee group: ${groupName}`);
  }

  const members = config.attendee_groups[groupName].members || [];
  if (!members.includes(email)) {
    members.push(email);
    config.attendee_groups[groupName].members = members;
    saveConfig(config);
  }
}

/**
 * Remove a member from an attendee group
 * @param {string} groupName - Name of the group
 * @param {string} email - Email to remove
 */
function removeFromAttendeeGroup(groupName, email) {
  const config = loadConfig();

  if (!config.attendee_groups[groupName]) {
    throw new Error(`Unknown attendee group: ${groupName}`);
  }

  const members = config.attendee_groups[groupName].members || [];
  const index = members.indexOf(email);
  if (index > -1) {
    members.splice(index, 1);
    config.attendee_groups[groupName].members = members;
    saveConfig(config);
  }
}

/**
 * Sync all standup attendees based on current attendee groups
 *
 * Note: This function makes sequential API calls to Google Calendar.
 * Google Calendar API has rate limits (typically 100 calls/100 seconds).
 * For large numbers of standups, consider adding delays between calls.
 *
 * @returns {Promise<Object[]>} Results for each standup
 */
async function syncAllStandupAttendees() {
  const config = loadConfig();
  const results = [];

  for (const [key, standup] of Object.entries(config.standups)) {
    if (!standup.event_id) {
      results.push({
        key,
        status: 'skipped',
        reason: 'No event_id - standup not created yet'
      });
      continue;
    }

    try {
      const attendees = resolveAttendeeGroups(standup.attendee_groups);
      await calendarClient.updateRecurringSeries(standup.event_id, { attendees });

      results.push({
        key,
        status: 'synced',
        attendeeCount: attendees.length
      });

      // Rate limiting delay between API calls
      await delay(RATE_LIMIT_DELAY_MS);
    } catch (error) {
      results.push({
        key,
        status: 'error',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Create all standups that haven't been created yet
 *
 * Note: This function makes sequential API calls to Google Calendar.
 * Google Calendar API has rate limits (typically 100 calls/100 seconds).
 * For large numbers of standups, consider adding delays between calls.
 *
 * @param {Object} [options] - Options
 * @param {boolean} [options.sendNotifications=true] - Send calendar invites
 * @returns {Promise<Object[]>} Results for each standup
 */
async function createAllStandups(options = {}) {
  const config = loadConfig();
  const results = [];

  for (const [key, standup] of Object.entries(config.standups)) {
    if (standup.event_id) {
      results.push({
        key,
        status: 'skipped',
        reason: 'Already created',
        eventId: standup.event_id
      });
      continue;
    }

    try {
      const event = await createStandup(key, options);
      results.push({
        key,
        status: 'created',
        eventId: event.id,
        summary: event.summary
      });

      // Rate limiting delay between API calls
      await delay(RATE_LIMIT_DELAY_MS);
    } catch (error) {
      results.push({
        key,
        status: 'error',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Delete a standup series
 * @param {string} standupKey - Key of the standup
 * @param {boolean} [sendNotifications=true] - Send cancellation notices
 * @returns {Promise<void>}
 */
async function deleteStandup(standupKey, sendNotifications = true) {
  const config = loadConfig();
  const standup = config.standups[standupKey];

  if (!standup) {
    throw new Error(`Unknown standup: ${standupKey}`);
  }

  if (!standup.event_id) {
    throw new Error(`Standup ${standupKey} has not been created yet.`);
  }

  await calendarClient.deleteRecurringSeries(standup.event_id, 'primary', sendNotifications);

  // Clear the event ID from config
  delete config.standups[standupKey].event_id;
  saveConfig(config);
}

/**
 * Get the config file path
 * @returns {string} Path to config file
 */
function getConfigPath() {
  return CONFIG_PATH;
}

module.exports = {
  // Config management
  loadConfig,
  saveConfig,
  getConfigPath,

  // Attendee group operations
  resolveAttendeeGroup,
  resolveAttendeeGroups,
  updateAttendeeGroup,
  addToAttendeeGroup,
  removeFromAttendeeGroup,

  // Standup operations
  listStandups,
  getStandup,
  previewStandup,
  createStandup,
  createAllStandups,
  updateStandupAttendees,
  syncAllStandupAttendees,
  deleteStandup
};
