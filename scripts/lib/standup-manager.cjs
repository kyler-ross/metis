// PM AI Starter Kit - standup-manager.cjs
// See scripts/README.md for setup
/**
 * Standup Manager Library
 *
 * Manages team standups using Google Calendar recurring events.
 * Works with a standup-config.json file for standup definitions and attendee groups.
 *
 * Requires: a calendar-client.cjs in the same directory (not included in starter kit).
 * You can implement the calendar client using the googleapis npm package.
 */

const fs = require('fs');
const path = require('path');

// Configuration paths - customize for your project
const CONFIG_PATH = path.join(__dirname, '../../config/standup-config.json');
const LOCK_PATH = CONFIG_PATH + '.lock';

// Rate limiting: delay between bulk API calls (ms)
const RATE_LIMIT_DELAY_MS = 1000;

// Lock timeout in milliseconds
const LOCK_TIMEOUT_MS = 30000;

const CURRENT_PID = process.pid;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleepSync(ms) {
  try {
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.wait(view, 0, 0, ms);
  } catch (e) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* busy wait fallback */ }
  }
}

function parseLockContent(content) {
  try {
    const data = JSON.parse(content);
    if (typeof data.pid === 'number' && typeof data.timestamp === 'number') {
      return data;
    }
  } catch (e) {
    const timestamp = parseInt(content, 10);
    if (!isNaN(timestamp)) {
      return { pid: 0, timestamp };
    }
  }
  return null;
}

function acquireLock(maxAttempts = 5) {
  const lockData = JSON.stringify({ pid: CURRENT_PID, timestamp: Date.now() });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fs.writeFileSync(LOCK_PATH, lockData, { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        try {
          const lockContent = fs.readFileSync(LOCK_PATH, 'utf8');
          const parsed = parseLockContent(lockContent);

          if (!parsed) {
            try { fs.unlinkSync(LOCK_PATH); } catch (e) { if (e.code !== 'ENOENT') throw e; }
            continue;
          }

          const age = Date.now() - parsed.timestamp;
          let shouldRemoveLock = false;

          if (age > LOCK_TIMEOUT_MS) {
            shouldRemoveLock = true;
          } else if (parsed.pid > 0 && parsed.pid !== CURRENT_PID) {
            try {
              process.kill(parsed.pid, 0);
            } catch (killErr) {
              if (killErr.code === 'ESRCH') {
                shouldRemoveLock = true;
              }
            }
          }

          if (shouldRemoveLock) {
            try { fs.unlinkSync(LOCK_PATH); } catch (e) { if (e.code !== 'ENOENT') throw e; }
            const baseDelay = 50 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * baseDelay);
            sleepSync(baseDelay + jitter);
            continue;
          }

          if (attempt < maxAttempts - 1) {
            const baseDelay = 50 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * baseDelay);
            sleepSync(baseDelay + jitter);
            continue;
          }

          return false;
        } catch (readErr) {
          if (readErr.code === 'ENOENT') continue;
          throw readErr;
        }
      }
      throw error;
    }
  }
  return false;
}

function releaseLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return;

    const lockContent = fs.readFileSync(LOCK_PATH, 'utf8');
    const parsed = parseLockContent(lockContent);

    if (parsed && parsed.pid !== 0 && parsed.pid !== CURRENT_PID) {
      console.warn(`Warning: Not releasing lock owned by process ${parsed.pid} (we are ${CURRENT_PID})`);
      return;
    }

    fs.unlinkSync(LOCK_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Warning: Could not release lock file:', error.message);
    }
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Standup config not found at ${CONFIG_PATH}`);
  }

  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  let config;
  try {
    config = JSON.parse(content);
  } catch (parseErr) {
    throw new Error(`Invalid JSON in standup config: ${parseErr.message}`);
  }

  if (!config || typeof config !== 'object') throw new Error('Standup config must be a valid object');
  if (!config.metadata || typeof config.metadata !== 'object') throw new Error('Missing: metadata');
  if (!config.standups || typeof config.standups !== 'object') throw new Error('Missing: standups');
  if (!config.attendee_groups || typeof config.attendee_groups !== 'object') throw new Error('Missing: attendee_groups');
  if (!config.metadata.timezone) throw new Error('Missing: metadata.timezone');

  for (const [key, standup] of Object.entries(config.standups)) {
    if (!standup.summary || typeof standup.summary !== 'string') throw new Error(`Standup "${key}" missing: summary`);
    if (!standup.time || !/^\d{2}:\d{2}$/.test(standup.time)) throw new Error(`Standup "${key}" invalid time: ${standup.time}`);
    if (!standup.duration_minutes || typeof standup.duration_minutes !== 'number') throw new Error(`Standup "${key}" invalid duration`);
    if (!standup.recurrence || !standup.recurrence.startsWith('RRULE:')) throw new Error(`Standup "${key}" invalid recurrence`);
    if (!Array.isArray(standup.attendee_groups) || standup.attendee_groups.length === 0) throw new Error(`Standup "${key}" needs attendee_groups`);
  }

  return config;
}

function saveConfig(config) {
  if (!acquireLock()) {
    throw new Error('Cannot save config: another process is modifying it.');
  }

  const tmpPath = CONFIG_PATH + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
    fs.renameSync(tmpPath, CONFIG_PATH);
  } catch (error) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
    throw error;
  } finally {
    releaseLock();
  }
}

function modifyConfig(modifier) {
  if (!acquireLock()) {
    throw new Error('Cannot modify config: another process is modifying it.');
  }

  const tmpPath = CONFIG_PATH + '.tmp';
  try {
    const config = loadConfig();
    modifier(config);
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
    fs.renameSync(tmpPath, CONFIG_PATH);
    return config;
  } catch (error) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
    throw error;
  } finally {
    releaseLock();
  }
}

function resolveAttendeeGroup(groupName) {
  const config = loadConfig();
  const group = config.attendee_groups[groupName];
  if (!group) throw new Error(`Unknown attendee group: ${groupName}`);
  return group.members || [];
}

function resolveAttendeeGroups(groupNames) {
  const allEmails = new Set();
  for (const groupName of groupNames) {
    const emails = resolveAttendeeGroup(groupName);
    emails.forEach(email => allEmails.add(email));
  }
  return Array.from(allEmails);
}

function getNextOccurrence(day, time) {
  const dayMap = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6
  };

  const targetDay = dayMap[day.toLowerCase()];
  if (targetDay === undefined) throw new Error(`Invalid day: ${day}`);

  const [hours, minutes] = time.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) throw new Error(`Invalid time: ${time}`);

  const now = new Date();
  const result = new Date(now);
  result.setHours(hours, minutes, 0, 0);

  const currentDay = now.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil < 0 || (daysUntil === 0 && result <= now)) daysUntil += 7;
  result.setDate(result.getDate() + daysUntil);
  return result;
}

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
      eventId: standup.event_id || null
    });
  }

  return standups;
}

function getStandup(standupKey) {
  const config = loadConfig();
  const standup = config.standups[standupKey];
  if (!standup) throw new Error(`Unknown standup: ${standupKey}`);
  return { key: standupKey, ...standup, attendees: resolveAttendeeGroups(standup.attendee_groups) };
}

function previewStandup(standupKey) {
  const config = loadConfig();
  const standup = config.standups[standupKey];
  if (!standup) throw new Error(`Unknown standup: ${standupKey}`);

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

function updateAttendeeGroup(groupName, emails) {
  const config = loadConfig();
  if (!config.attendee_groups[groupName]) throw new Error(`Unknown group: ${groupName}`);
  config.attendee_groups[groupName].members = emails;
  saveConfig(config);
}

function addToAttendeeGroup(groupName, email) {
  const config = loadConfig();
  if (!config.attendee_groups[groupName]) throw new Error(`Unknown group: ${groupName}`);
  const members = config.attendee_groups[groupName].members || [];
  if (!members.includes(email)) {
    members.push(email);
    config.attendee_groups[groupName].members = members;
    saveConfig(config);
  }
}

function removeFromAttendeeGroup(groupName, email) {
  const config = loadConfig();
  if (!config.attendee_groups[groupName]) throw new Error(`Unknown group: ${groupName}`);
  const members = config.attendee_groups[groupName].members || [];
  const index = members.indexOf(email);
  if (index > -1) {
    members.splice(index, 1);
    config.attendee_groups[groupName].members = members;
    saveConfig(config);
  }
}

function getConfigPath() {
  return CONFIG_PATH;
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfigPath,
  resolveAttendeeGroup,
  resolveAttendeeGroups,
  updateAttendeeGroup,
  addToAttendeeGroup,
  removeFromAttendeeGroup,
  listStandups,
  getStandup,
  previewStandup,
  getNextOccurrence,
};
