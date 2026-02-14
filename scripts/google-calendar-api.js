#!/usr/bin/env node
/**
 * Google Calendar API CLI
 *
 * Command-line interface for Google Calendar operations.
 * Supports basic events, recurring events, and standup management.
 *
 * Run with --help for full command reference.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
const calendarClient = require('./lib/calendar-client.cjs');
const standupManager = require('./lib/standup-manager.cjs');
const readline = require('readline');
const { run } = require('./lib/script-runner.cjs');
const { track } = require('./lib/telemetry.cjs');

// Email validation regex (RFC 5322 compliant - stricter than simplified version)
// Rejects: consecutive dots, dots at start/end of local part, missing domain parts
const EMAIL_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

/**
 * Validate email and exit with error if invalid
 * @param {string} email - Email to validate
 * @param {string} context - Context for error message
 */
function validateEmail(email, context = 'Email') {
  if (!isValidEmail(email)) {
    throw new Error(`Invalid email format: ${email}. ${context} must be a valid email address. Example: user@example.com`);
  }
}

/**
 * Prompt user for confirmation before destructive operations
 * @param {string} message - Confirmation message
 * @returns {Promise<boolean>} True if user confirms
 */
async function confirmAction(message) {
  // Skip confirmation if --yes or -y flag is present
  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Valid RRULE frequency values
const VALID_RRULE_FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/**
 * Validate RRULE format
 * @param {string} rrule - RRULE string to validate
 * @returns {boolean} True if valid
 */
function isValidRRule(rrule) {
  if (!rrule || typeof rrule !== 'string') return false;

  // Must start with RRULE:
  if (!rrule.startsWith('RRULE:')) return false;

  // Must have FREQ= with valid frequency
  const freqMatch = rrule.match(/FREQ=(\w+)/);
  if (!freqMatch) return false;

  const freq = freqMatch[1];
  if (!VALID_RRULE_FREQS.includes(freq)) return false;

  return true;
}

/**
 * Validate RRULE and exit with error if invalid
 * @param {string} rrule - RRULE string to validate
 */
function validateRRule(rrule) {
  if (!isValidRRule(rrule)) {
    throw new Error(`Invalid RRULE format: ${rrule}. RRULE must start with "RRULE:" and include a valid FREQ=. Valid frequencies: DAILY, WEEKLY, MONTHLY, YEARLY. Example: RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR`);
  }
}

// Date/time validation regex patterns
// ISO 8601 datetime: 2025-12-05T14:00 or 2025-12-05T14:00:00 or 2025-12-05T14:00:00Z or 2025-12-05T14:00:00+00:00
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/;
// ISO 8601 date only: 2025-12-05
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check if a date/time string is valid
 * @param {string} dateStr - Date/time string to validate
 * @returns {boolean} True if valid
 */
function isValidDateTime(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;

  // Check format matches expected patterns
  if (!DATETIME_REGEX.test(dateStr) && !DATE_ONLY_REGEX.test(dateStr)) {
    return false;
  }

  // Also verify it parses to a valid date (catches invalid dates like 2025-02-30)
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return false;
  }

  return true;
}

/**
 * Validate date/time string and exit with error if invalid
 * @param {string} dateStr - Date/time string to validate
 * @param {string} context - Context for error message (e.g., "Start time")
 */
function validateDateTime(dateStr, context = 'Date/time') {
  if (!isValidDateTime(dateStr)) {
    throw new Error(`Invalid date/time format for ${context}: ${dateStr}. Must be ISO 8601 format: YYYY-MM-DDTHH:MM or YYYY-MM-DD. Examples: 2025-12-05T14:00, 2025-12-05T14:00:00Z, 2025-12-05`);
  }
}

// Parse arguments
const [,, command, ...args] = process.argv;

// Help text
function showHelp() {
  console.log(`
Google Calendar API CLI

Usage:
  node google-calendar-api.js <command> [arguments]

Basic Commands:
  calendars                              List all calendars
  events [days]                          Upcoming events (default: 7 days)
  search <query> [days]                  Search events by title (default: 30 days)
  today                                  Today's events
  event <eventId>                        Get event details
  create <title> <start> <end> [opts]    Create event
  quick <text>                           Natural language create
  freebusy <emails> <start> <end>        Check availability
  find-slot <emails> [duration] [days]   Find available slot for group
  update <eventId> <field> <value>       Update event field
  move <eventId> <shift>                 Move event (+1h, -30m, etc.)
  add-attendee <eventId> <email>         Add attendee to event
  delete <eventId>                       Delete event

Invite Responses:
  accept <eventId>                       Accept calendar invite
  decline <eventId>                      Decline calendar invite
  maybe <eventId>                        Mark as tentative/maybe
  propose-time <eventId> <start> <end>   Propose alternative time

Recurring Events:
  create-recurring <title> <start> <end> <rrule> [opts]
                                         Create recurring event
  instances <eventId> [days]             List instances of recurring event
  update-series <eventId> <field> <value>
                                         Update recurring series

Standup Management:
  standup list                           List configured standups
  standup preview <key>                  Preview standup before creating
  standup create <key>                   Create standup series
  standup create-all                     Create all standups
  standup sync [key]                     Sync attendees from config
  standup delete <key>                   Delete standup series

Group Management:
  group list                             List attendee groups
  group show <name>                      Show group members
  group add <name> <email>               Add member to group
  group remove <name> <email>            Remove member from group

Date/Time Formats:
  2025-12-05                             All-day event date
  2025-12-05T14:00                       Date with time (local timezone)
  2025-12-05T14:00:00Z                   UTC time

RRULE Examples:
  RRULE:FREQ=WEEKLY;BYDAY=MO             Every Monday
  RRULE:FREQ=WEEKLY;BYDAY=TU,TH          Every Tuesday and Thursday
  RRULE:FREQ=DAILY;COUNT=5               Daily for 5 days

Create Options:
  --attendees "a@x.com,b@y.com"          Add attendees
  --location "Conference Room A"         Set location
  --description "Meeting notes"          Add description
  --meet                                 Add Google Meet link

Examples:
  # Basic events
  node google-calendar-api.js today
  node google-calendar-api.js create "Team Sync" "2026-01-21T14:00" "2026-01-21T15:00"
  node google-calendar-api.js create "1:1" "2026-01-21T10:00" "2026-01-21T10:30" --attendees "john@company.com" --meet

  # Recurring events
  node google-calendar-api.js create-recurring "Daily Standup" "2026-01-21T09:00" "2026-01-21T09:15" "RRULE:FREQ=DAILY;COUNT=5"
  node google-calendar-api.js instances abc123 30

  # Standups
  node google-calendar-api.js standup list
  node google-calendar-api.js standup preview global_weekly
  node google-calendar-api.js standup create global_weekly
`);
}

// Parse CLI options
function parseOptions(args) {
  const options = {};
  let i = 0;

  while (i < args.length) {
    if (args[i] === '--attendees' && args[i + 1]) {
      const emails = args[i + 1].split(',').map(e => e.trim());
      // Validate each email
      for (const email of emails) {
        if (!isValidEmail(email)) {
          throw new Error(`Invalid email in --attendees: ${email}. Each attendee must be a valid email address`);
        }
      }
      options.attendees = emails;
      i += 2;
    } else if (args[i] === '--location' && args[i + 1]) {
      options.location = args[i + 1];
      i += 2;
    } else if (args[i] === '--description' && args[i + 1]) {
      options.description = args[i + 1];
      i += 2;
    } else if (args[i] === '--meet') {
      options.addMeet = true;
      i += 1;
    } else if (args[i] === '--calendar' && args[i + 1]) {
      options.calendarId = args[i + 1];
      i += 2;
    } else if (args[i] === '--notify') {
      options.notify = true;
      i += 1;
    } else {
      i += 1;
    }
  }

  return options;
}

// Format time for display
function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Format datetime for display
function formatDateTime(dateStr, isAllDay = false) {
  if (!dateStr) return '';
  if (isAllDay) return formatDate(dateStr);
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

// Main execution
run({
  name: 'google-calendar-api',
  mode: 'operational',
  services: ['google'],
}, async (ctx) => {
  try {
    switch (command) {
      case 'calendars': {
        const calendars = await calendarClient.listCalendars();

        console.log(`\n📅 ${calendars.length} calendars:\n`);

        for (const cal of calendars) {
          const primary = cal.primary ? ' (primary)' : '';
          console.log(`   ${cal.summary}${primary}`);
          console.log(`      ID: ${cal.id}`);
          console.log(`      Access: ${cal.accessRole}`);
          console.log('');
        }
        break;
      }

      case 'events': {
        const days = parseInt(args[0]) || 7;
        const events = await calendarClient.getUpcomingEvents(days);

        console.log(`\n📅 Next ${days} days (${events.length} events):\n`);

        if (events.length === 0) {
          console.log('   No events scheduled.');
        } else {
          let currentDate = '';
          for (const event of events) {
            const eventDate = formatDate(event.start);
            if (eventDate !== currentDate) {
              currentDate = eventDate;
              console.log(`\n   ${currentDate}`);
              console.log('   ' + '─'.repeat(40));
            }

            const time = event.isAllDay ? 'All day' : `${formatTime(event.start)} - ${formatTime(event.end)}`;
            console.log(`   ${time.padEnd(20)} ${event.summary}`);

            if (event.location) {
              console.log(`   ${''.padEnd(20)} 📍 ${event.location}`);
            }
            if (event.meetLink) {
              console.log(`   ${''.padEnd(20)} 🎥 Meet`);
            }
          }
        }
        break;
      }

      case 'search': {
        if (!args[0]) {
          throw new Error('search query is required. Usage: search <query> [days]');
        }

        const query = args[0];
        const days = parseInt(args[1]) || 30;

        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const events = await calendarClient.listEvents({
          query,
          timeMin: now,
          timeMax: future,
          maxResults: 20
        });

        console.log(`\n🔍 Search: "${query}" (next ${days} days)\n`);

        if (events.length === 0) {
          console.log('   No matching events found.');
        } else {
          console.log(`   Found ${events.length} event(s):\n`);
          for (const event of events) {
            const time = event.isAllDay ? 'All day' : `${formatTime(event.start)} - ${formatTime(event.end)}`;
            console.log(`   ${formatDate(event.start)} ${time}`);
            console.log(`      ${event.summary}`);
            console.log(`      ID: ${event.id}`);
            if (event.recurringEventId) {
              console.log(`      Series ID: ${event.recurringEventId}`);
            }
            console.log('');
          }
        }
        break;
      }

      case 'today': {
        const events = await calendarClient.getTodayEvents();
        const today = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });

        console.log(`\n📅 ${today} (${events.length} events):\n`);

        if (events.length === 0) {
          console.log('   No events scheduled for today.');
        } else {
          for (const event of events) {
            const time = event.isAllDay ? 'All day' : `${formatTime(event.start)} - ${formatTime(event.end)}`;
            console.log(`   ${time.padEnd(20)} ${event.summary}`);

            if (event.location) {
              console.log(`   ${''.padEnd(20)} 📍 ${event.location}`);
            }
            if (event.meetLink) {
              console.log(`   ${''.padEnd(20)} 🎥 ${event.meetLink}`);
            }
            if (event.attendees && event.attendees.length > 0) {
              const others = event.attendees.filter(a => !a.self);
              if (others.length > 0) {
                const names = others.slice(0, 3).map(a => a.displayName || a.email.split('@')[0]);
                const more = others.length > 3 ? ` +${others.length - 3} more` : '';
                console.log(`   ${''.padEnd(20)} 👥 ${names.join(', ')}${more}`);
              }
            }
          }
        }
        break;
      }

      case 'get':
      case 'event': {
        if (!args[0]) {
          throw new Error('eventId is required');
        }

        const eventOpts = parseOptions(args.slice(1));
        const event = await calendarClient.getEvent(args[0], eventOpts.calendarId);

        console.log(`\n📅 ${event.summary}\n`);
        console.log(`   When:      ${formatDateTime(event.start, event.isAllDay)} - ${formatDateTime(event.end, event.isAllDay)}`);

        if (event.location) {
          console.log(`   Where:     ${event.location}`);
        }
        if (event.meetLink) {
          console.log(`   Meet:      ${event.meetLink}`);
        }
        if (event.description) {
          console.log(`   Notes:     ${event.description}`);
        }
        if (event.organizer) {
          console.log(`   Organizer: ${event.organizer}`);
        }
        if (event.attendees && event.attendees.length > 0) {
          console.log(`   Attendees:`);
          for (const a of event.attendees) {
            const status = a.responseStatus === 'accepted' ? '✓' :
                          a.responseStatus === 'declined' ? '✗' :
                          a.responseStatus === 'tentative' ? '?' : '○';
            console.log(`      ${status} ${a.displayName || a.email}`);
          }
        }
        console.log(`\n   Event ID: ${event.id}`);
        console.log(`   Link: ${event.htmlLink}`);
        break;
      }

      case 'update-attendees': {
        if (!args[0]) {
          throw new Error('eventId is required. Usage: update-attendees <eventId> --attendees "a@x.com,b@x.com" [--calendar <id>] [--notify]');
        }
        const uaOpts = parseOptions(args.slice(1));
        if (!uaOpts.attendees || uaOpts.attendees.length === 0) {
          throw new Error('--attendees is required');
        }
        const uaCurrent = await calendarClient.getEvent(args[0], uaOpts.calendarId);
        const uaOldEmails = (uaCurrent.attendees || []).map(a => a.email);
        const uaNewEmails = uaOpts.attendees;
        const uaAdded = uaNewEmails.filter(e => !uaOldEmails.includes(e));
        const uaRemoved = uaOldEmails.filter(e => !uaNewEmails.includes(e));

        await calendarClient.updateEvent(args[0], {
          attendees: uaNewEmails,
          sendNotifications: uaOpts.notify || false,
        }, uaOpts.calendarId);

        console.log(`Attendees updated for ${uaCurrent.summary || args[0]}`);
        if (uaAdded.length > 0) console.log(`  Added: ${uaAdded.join(', ')}`);
        if (uaRemoved.length > 0) console.log(`  Removed: ${uaRemoved.join(', ')}`);
        console.log(`  Total: ${uaNewEmails.length} attendees`);
        break;
      }

      case 'remove-attendee': {
        if (!args[0] || !args[1]) {
          throw new Error('eventId and email are required. Usage: remove-attendee <eventId> <email> [--calendar <id>] [--notify]');
        }
        const raEmail = args[1];
        if (!isValidEmail(raEmail)) {
          throw new Error(`Invalid email: ${raEmail}`);
        }
        const raOpts = parseOptions(args.slice(2));
        const raCurrent = await calendarClient.getEvent(args[0], raOpts.calendarId);
        const raEmails = (raCurrent.attendees || []).map(a => a.email);
        if (!raEmails.includes(raEmail)) {
          console.log(`${raEmail} is not an attendee of this event - no changes made`);
          break;
        }
        const raRemaining = raEmails.filter(e => e !== raEmail);
        await calendarClient.updateEvent(args[0], {
          attendees: raRemaining,
          sendNotifications: raOpts.notify || false,
        }, raOpts.calendarId);
        console.log(`Removed ${raEmail} from ${raCurrent.summary || args[0]}`);
        console.log(`  Remaining: ${raRemaining.length} attendees`);
        break;
      }

      case 'create': {
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('title, start, and end are required. Usage: create <title> <start> <end> [--attendees "a@x.com"] [--meet]');
        }

        const [title, start, end] = args;

        // Validate date/time formats
        validateDateTime(start, 'Start time');
        validateDateTime(end, 'End time');

        const options = parseOptions(args.slice(3));

        const event = await calendarClient.createEvent({
          summary: title,
          start,
          end,
          ...options
        });

        track('calendar_create', {
          has_attendees: !!(options.attendees && options.attendees.length > 0),
          has_meet: !!event.meetLink,
          attendee_count: event.attendees?.length || 0
        });

        console.log(`\n✅ Event created: ${event.summary}`);
        console.log(`   When: ${formatDateTime(event.start)} - ${formatDateTime(event.end)}`);
        if (event.location) {
          console.log(`   Where: ${event.location}`);
        }
        if (event.meetLink) {
          console.log(`   Meet: ${event.meetLink}`);
        }
        if (event.attendees && event.attendees.length > 0) {
          console.log(`   Attendees: ${event.attendees.map(a => a.email).join(', ')}`);
        }
        console.log(`   Event ID: ${event.id}`);
        console.log(`   Link: ${event.htmlLink}`);
        break;
      }

      case 'quick': {
        if (!args[0]) {
          throw new Error('text description is required. Usage: quick "Meeting with John tomorrow at 3pm"');
        }

        const text = args.join(' ');
        const event = await calendarClient.quickAdd(text);

        track('calendar_quick_add', { text_length: text.length });

        console.log(`\n✅ Event created: ${event.summary}`);
        console.log(`   When: ${formatDateTime(event.start, event.isAllDay)} - ${formatDateTime(event.end, event.isAllDay)}`);
        console.log(`   Event ID: ${event.id}`);
        console.log(`   Link: ${event.htmlLink}`);
        break;
      }

      case 'freebusy': {
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('emails, start, and end are required. Usage: freebusy "a@x.com,b@y.com" "2025-12-05T09:00" "2025-12-05T17:00"');
        }

        const emails = args[0].split(',').map(e => e.trim());
        const [, start, end] = args;

        // Validate email formats
        for (const email of emails) {
          validateEmail(email, 'Email in freebusy query');
        }

        // Validate date/time formats
        validateDateTime(start, 'Start time');
        validateDateTime(end, 'End time');

        const result = await calendarClient.getFreeBusy(emails, start, end);

        console.log(`\n📅 Free/Busy: ${formatDateTime(start)} - ${formatDateTime(end)}\n`);

        for (const [email, data] of Object.entries(result)) {
          console.log(`   ${email}:`);
          if (data.errors) {
            console.log(`      ⚠️  Error: ${JSON.stringify(data.errors)}`);
          } else if (data.busy.length === 0) {
            console.log(`      ✅ Free during this time`);
          } else {
            console.log(`      ❌ Busy times:`);
            for (const slot of data.busy) {
              console.log(`         ${formatTime(slot.start)} - ${formatTime(slot.end)}`);
            }
          }
          console.log('');
        }
        break;
      }

      case 'find-slot': {
        if (!args[0]) {
          throw new Error('emails are required. Usage: find-slot <emails> [duration] [days] [--json]. Example: find-slot "a@x.com,b@y.com" 30 7');
        }

        const emails = args[0].split(',').map(e => e.trim());

        // Validate email formats
        for (const email of emails) {
          validateEmail(email, 'Email in find-slot query');
        }

        const duration = parseInt(args[1]) || 30;
        const searchDays = parseInt(args[2]) || 7;
        const jsonOutput = args.includes('--json');

        if (!jsonOutput) {
          console.log(`\n🔍 Finding ${duration}-minute slot for ${emails.length} people (next ${searchDays} days)...\n`);
        }

        // Collect multiple slots across days
        const slots = [];
        const startFrom = new Date();

        for (let dayOffset = 0; dayOffset < searchDays && slots.length < 5; dayOffset++) {
          const searchDate = new Date(startFrom);
          searchDate.setDate(searchDate.getDate() + dayOffset);

          // Skip weekends
          if (searchDate.getDay() === 0 || searchDate.getDay() === 6) continue;

          const dayStart = new Date(searchDate);
          dayStart.setHours(9, 0, 0, 0);

          const dayEnd = new Date(searchDate);
          dayEnd.setHours(17, 0, 0, 0);

          // Skip if past end of workday
          if (dayOffset === 0 && new Date() > dayStart) {
            dayStart.setTime(Math.max(dayStart.getTime(), Date.now()));
          }
          if (dayStart >= dayEnd) continue;

          try {
            const daySlots = await calendarClient.findAvailableSlots(
              emails,
              dayStart,
              dayEnd,
              { durationMinutes: duration, maxSlots: 3 }
            );

            for (const slot of daySlots) {
              slots.push({
                ...slot,
                date: searchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
              });
            }
          } catch (err) {
            // Continue to next day on error
            if (!jsonOutput) {
              console.error(`   Warning: Error checking ${searchDate.toDateString()}: ${err.message}`);
            }
          }
        }

        if (jsonOutput) {
          // Output JSON for programmatic use
          console.log(JSON.stringify(slots));
        } else if (slots.length > 0) {
          const slot = slots[0];
          console.log(`✅ Found available slot:`);
          console.log(`   Date: ${slot.date}`);
          console.log(`   Time: ${formatTime(slot.start)} - ${formatTime(slot.end)}`);
          console.log(`   Duration: ${slot.durationMinutes} minutes available`);
          console.log(`\n   Start: ${slot.start}`);
          console.log(`   End (for ${duration} min): ${new Date(new Date(slot.start).getTime() + duration * 60000).toISOString()}`);
          if (slots.length > 1) {
            console.log(`\n   (${slots.length - 1} more slots available)`);
          }
        } else {
          console.log(`❌ No ${duration}-minute slot found in the next ${searchDays} days`);
        }
        break;
      }

      case 'add-attendee': {
        if (!args[0] || !args[1]) {
          throw new Error('eventId and email are required. Usage: add-attendee <eventId> <email>');
        }

        const eventId = args[0];
        const newEmail = args[1];

        // Validate email format
        validateEmail(newEmail, 'Attendee email');

        // Get current event to preserve existing attendees
        const currentEvent = await calendarClient.getEvent(eventId);
        const existingEmails = (currentEvent.attendees || []).map(a => a.email);

        if (existingEmails.includes(newEmail)) {
          console.log(`\n⚠️  ${newEmail} is already an attendee of ${currentEvent.summary}`);
          break;
        }

        const updatedAttendees = [...existingEmails, newEmail];
        const updatedEvent = await calendarClient.updateEvent(eventId, {
          attendees: updatedAttendees
        });

        console.log(`\n✅ Added attendee to: ${updatedEvent.summary}`);
        console.log(`   Added: ${newEmail}`);
        console.log(`   Total attendees: ${updatedEvent.attendees.length}`);
        break;
      }

      case 'move': {
        if (!args[0] || !args[1]) {
          throw new Error('eventId and time shift are required. Usage: move <eventId> <shift>. Shift format: +1h, -30m, +2h30m, -1h. Example: move abc123 -1h  (move back 1 hour)');
        }

        const eventId = args[0];
        const shiftStr = args[1];

        // Parse shift string like +1h, -30m, +2h30m
        // Regex requires at least hours or minutes (not empty string)
        const shiftMatch = shiftStr.match(/^([+-]?)((\d+)h)?((\d+)m)?$/);
        if (!shiftMatch || (!shiftMatch[2] && !shiftMatch[4])) {
          throw new Error('Invalid shift format. Use +1h, -30m, +2h30m, etc..        Must specify at least hours or minutes.');
        }

        const sign = shiftMatch[1] === '-' ? -1 : 1;
        const hours = shiftMatch[3] ? parseInt(shiftMatch[3]) : 0;
        const minutes = shiftMatch[5] ? parseInt(shiftMatch[5]) : 0;

        // Bounds checking to prevent integer overflow (max: 30 days = 720 hours)
        const MAX_SHIFT_HOURS = 720;
        const MAX_SHIFT_MINUTES = MAX_SHIFT_HOURS * 60;
        const totalMinutes = hours * 60 + minutes;

        if (totalMinutes > MAX_SHIFT_MINUTES) {
          throw new Error(`Shift amount too large (max: ${MAX_SHIFT_HOURS} hours or 30 days).        Requested: ${hours}h ${minutes}m (${totalMinutes} minutes total)`);
        }

        if (totalMinutes === 0) {
          throw new Error('Shift amount cannot be zero');
        }

        // Safe integer check before multiplication (Number.MAX_SAFE_INTEGER / 60000 ≈ 150 billion minutes)
        // Our MAX_SHIFT_MINUTES (43200) is well under this, but explicit check prevents future issues
        if (totalMinutes > Number.MAX_SAFE_INTEGER / 60000) {
          throw new Error('Shift amount would cause numerical overflow');
        }

        const shiftMs = sign * (totalMinutes * 60 * 1000);

        // Get current event
        const currentEvt = await calendarClient.getEvent(eventId);

        // Check for all-day events (have date but no dateTime)
        if (currentEvt.start && !currentEvt.start.includes('T')) {
          throw new Error('Cannot shift all-day events with move command..        Use update command to change the date instead.');
        }
        const newStart = new Date(new Date(currentEvt.start).getTime() + shiftMs);
        const newEnd = new Date(new Date(currentEvt.end).getTime() + shiftMs);

        const movedEvent = await calendarClient.updateEvent(eventId, {
          start: newStart.toISOString(),
          end: newEnd.toISOString()
        });

        const shiftDesc = `${sign > 0 ? '+' : ''}${hours ? hours + 'h' : ''}${minutes ? minutes + 'm' : ''}`;
        console.log(`\n✅ Event moved (${shiftDesc}): ${movedEvent.summary}`);
        console.log(`   Was: ${formatDateTime(currentEvt.start)} - ${formatDateTime(currentEvt.end)}`);
        console.log(`   Now: ${formatDateTime(movedEvent.start)} - ${formatDateTime(movedEvent.end)}`);
        break;
      }

      case 'update': {
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('eventId, field, and value are required. Usage: update <eventId> <field> <value>. Fields: summary, location, description, start, end');
        }

        const [eventId, field, value] = args;

        // Validate date/time format if updating start or end
        if (field === 'start' || field === 'end') {
          validateDateTime(value, `${field.charAt(0).toUpperCase() + field.slice(1)} time`);
        }

        const updates = { [field]: value };

        const event = await calendarClient.updateEvent(eventId, updates);
        console.log(`\n✅ Event updated: ${event.summary}`);
        console.log(`   ${field}: ${value}`);
        break;
      }

      case 'delete': {
        if (!args[0]) {
          throw new Error('eventId is required');
        }

        // Get event details for confirmation
        const eventToDelete = await calendarClient.getEvent(args[0]);
        console.log(`\n⚠️  About to delete: ${eventToDelete.summary || args[0]}`);

        const confirmed = await confirmAction('Are you sure you want to delete this event?');
        if (!confirmed) {
          console.log('Cancelled.');
          break;
        }

        await calendarClient.deleteEvent(args[0]);
        track('calendar_delete', {});
        console.log(`\n✅ Event deleted: ${eventToDelete.summary || args[0]}`);
        break;
      }

      // ============ Invite Response Commands ============

      case 'accept': {
        if (!args[0]) {
          throw new Error('eventId is required. Usage: accept <eventId>');
        }

        const event = await calendarClient.respondToInvite(args[0], 'accepted');
        console.log(`\n✅ Accepted invite: ${event.summary}`);
        console.log(`   When: ${formatDateTime(event.start, event.isAllDay)} - ${formatDateTime(event.end, event.isAllDay)}`);
        if (event.organizer) {
          console.log(`   Organizer: ${event.organizer}`);
        }
        break;
      }

      case 'decline': {
        if (!args[0]) {
          throw new Error('eventId is required. Usage: decline <eventId>');
        }

        const event = await calendarClient.respondToInvite(args[0], 'declined');
        console.log(`\n❌ Declined invite: ${event.summary}`);
        console.log(`   When: ${formatDateTime(event.start, event.isAllDay)} - ${formatDateTime(event.end, event.isAllDay)}`);
        if (event.organizer) {
          console.log(`   Organizer notified: ${event.organizer}`);
        }
        break;
      }

      case 'maybe':
      case 'tentative': {
        if (!args[0]) {
          throw new Error('eventId is required. Usage: maybe <eventId>');
        }

        const event = await calendarClient.respondToInvite(args[0], 'tentative');
        console.log(`\n❓ Marked as maybe: ${event.summary}`);
        console.log(`   When: ${formatDateTime(event.start, event.isAllDay)} - ${formatDateTime(event.end, event.isAllDay)}`);
        if (event.organizer) {
          console.log(`   Organizer: ${event.organizer}`);
        }
        break;
      }

      case 'propose-time': {
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('eventId, start, and end are required. Usage: propose-time <eventId> <newStart> <newEnd>. Example: propose-time abc123 "2026-01-23T15:00" "2026-01-23T16:00"');
        }

        const [eventId, newStart, newEnd] = args;

        // Validate date/time formats
        validateDateTime(newStart, 'Proposed start time');
        validateDateTime(newEnd, 'Proposed end time');

        const result = await calendarClient.proposeNewTime(eventId, newStart, newEnd);
        console.log(`\n📬 Proposed new time for: ${result.summary}`);
        console.log(`   Original: ${formatDateTime(result.start, result.isAllDay)} - ${formatDateTime(result.end, result.isAllDay)}`);
        console.log(`   Proposed: ${formatDateTime(result.proposedStart)} - ${formatDateTime(result.proposedEnd)}`);
        if (result.organizer) {
          console.log(`   Organizer notified: ${result.organizer}`);
        }
        console.log(`\n   Note: Your status is now "tentative" with the proposed time in comments.`);
        break;
      }

      // ============ Recurring Event Commands ============

      case 'create-recurring': {
        if (!args[0] || !args[1] || !args[2] || !args[3]) {
          throw new Error('title, start, end, and rrule are required. Usage: create-recurring <title> <start> <end> <rrule> [--attendees "a@x.com"] [--meet]. Example: create-recurring "Daily Standup" "2026-01-21T09:00" "2026-01-21T09:15" "RRULE:FREQ=DAILY;COUNT=5"');
        }

        const [title, start, end, rrule] = args;

        // Validate date/time formats
        validateDateTime(start, 'Start time');
        validateDateTime(end, 'End time');

        // Validate RRULE format before API call
        validateRRule(rrule);

        const options = parseOptions(args.slice(4));

        const event = await calendarClient.createRecurringEvent({
          summary: title,
          start,
          end,
          recurrence: rrule,
          ...options
        });

        console.log(`\n✅ Recurring event created: ${event.summary}`);
        console.log(`   First occurrence: ${formatDateTime(event.start)} - ${formatDateTime(event.end)}`);
        console.log(`   Recurrence: ${rrule}`);
        if (event.meetLink) {
          console.log(`   Meet: ${event.meetLink}`);
        }
        if (event.attendees && event.attendees.length > 0) {
          console.log(`   Attendees: ${event.attendees.map(a => a.email).join(', ')}`);
        }
        console.log(`   Event ID: ${event.id}`);
        console.log(`   Link: ${event.htmlLink}`);
        break;
      }

      case 'instances': {
        if (!args[0]) {
          throw new Error('eventId is required. Usage: instances <eventId> [days]');
        }

        const eventId = args[0];
        const days = parseInt(args[1]) || 30;

        const now = new Date();
        const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const instances = await calendarClient.listRecurringInstances(eventId, {
          timeMin: now,
          timeMax: future
        });

        console.log(`\n📅 Recurring event instances (next ${days} days):\n`);

        if (instances.length === 0) {
          console.log('   No instances found in this time range.');
        } else {
          console.log(`   Found ${instances.length} instances:\n`);
          for (const instance of instances) {
            console.log(`   ${formatDateTime(instance.start)} - ${instance.summary}`);
          }
        }
        break;
      }

      case 'update-series': {
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('eventId, field, and value are required. Usage: update-series <eventId> <field> <value>. Fields: summary, location, description, attendees');
        }

        const [eventId, field, value] = args;
        let updates;

        if (field === 'attendees') {
          updates = { attendees: value.split(',').map(e => e.trim()) };
        } else {
          updates = { [field]: value };
        }

        // Warn about updating entire series
        console.log(`\n⚠️  This will update ALL instances of the recurring series.`);
        console.log(`   Field: ${field}`);
        console.log(`   New value: ${value}`);

        const confirmed = await confirmAction('Are you sure you want to update the entire series?');
        if (!confirmed) {
          console.log('Cancelled.');
          break;
        }

        const event = await calendarClient.updateRecurringSeries(eventId, updates);
        console.log(`\n✅ Recurring series updated: ${event.summary}`);
        console.log(`   ${field}: ${value}`);
        break;
      }

      // ============ Standup Commands ============

      case 'standup': {
        const subCommand = args[0];

        switch (subCommand) {
          case 'list': {
            const standups = await standupManager.listStandups();

            console.log(`\n📅 Configured Standups:\n`);

            for (const standup of standups) {
              const status = standup.eventId ? '✅ Created' : '⏳ Not created';
              console.log(`   ${standup.key}:`);
              console.log(`      Name: ${standup.name}`);
              console.log(`      Schedule: ${standup.schedule} @ ${standup.time}`);
              console.log(`      Duration: ${standup.duration} minutes`);
              console.log(`      Attendees: ${standup.attendeeCount} (groups: ${standup.attendeeGroups.join(', ')})`);
              console.log(`      Status: ${status}`);
              if (standup.eventId) {
                console.log(`      Event ID: ${standup.eventId}`);
              }
              console.log('');
            }
            break;
          }

          case 'preview': {
            if (!args[1]) {
              throw new Error('standup key is required. Usage: standup preview <key>');
            }

            const preview = standupManager.previewStandup(args[1]);

            console.log(`\n📅 Standup Preview: ${args[1]}\n`);
            console.log(`   Summary: ${preview.summary}`);
            console.log(`   Description: ${preview.description?.substring(0, 100)}...`);
            console.log(`   First occurrence: ${formatDateTime(preview.start)}`);
            console.log(`   Duration: ${formatDateTime(preview.start)} - ${formatDateTime(preview.end)}`);
            console.log(`   Recurrence: ${preview.recurrence}`);
            console.log(`   Attendees (${preview.attendees.length}):`);
            for (const email of preview.attendees) {
              console.log(`      - ${email}`);
            }
            console.log(`   Google Meet: ${preview.addMeet ? 'Yes' : 'No'}`);
            break;
          }

          case 'create': {
            if (!args[1]) {
              throw new Error('standup key is required. Usage: standup create <key>');
            }

            console.log(`\nCreating standup: ${args[1]}...`);
            const event = await standupManager.createStandup(args[1]);

            console.log(`\n✅ Standup created: ${event.summary}`);
            console.log(`   First occurrence: ${formatDateTime(event.start)}`);
            if (event.meetLink) {
              console.log(`   Meet: ${event.meetLink}`);
            }
            console.log(`   Event ID: ${event.id}`);
            console.log(`   Link: ${event.htmlLink}`);
            break;
          }

          case 'create-all': {
            console.log(`\nCreating all standups...`);
            const results = await standupManager.createAllStandups();

            console.log(`\n📅 Results:\n`);
            for (const result of results) {
              if (result.status === 'created') {
                console.log(`   ✅ ${result.key}: Created (${result.eventId})`);
              } else if (result.status === 'skipped') {
                console.log(`   ⏭️  ${result.key}: ${result.reason}`);
              } else {
                console.log(`   ❌ ${result.key}: Error - ${result.error}`);
              }
            }
            break;
          }

          case 'sync': {
            if (args[1]) {
              // Sync specific standup
              const standup = standupManager.getStandup(args[1]);
              console.log(`\nSyncing attendees for: ${args[1]}...`);

              const event = await standupManager.updateStandupAttendees(args[1], standup.attendees);
              console.log(`\n✅ Synced ${standup.attendees.length} attendees to ${event.summary}`);
            } else {
              // Sync all standups
              console.log(`\nSyncing all standup attendees...`);
              const results = await standupManager.syncAllStandupAttendees();

              console.log(`\n📅 Sync Results:\n`);
              for (const result of results) {
                if (result.status === 'synced') {
                  console.log(`   ✅ ${result.key}: Synced ${result.attendeeCount} attendees`);
                } else if (result.status === 'skipped') {
                  console.log(`   ⏭️  ${result.key}: ${result.reason}`);
                } else {
                  console.log(`   ❌ ${result.key}: Error - ${result.error}`);
                }
              }
            }
            break;
          }

          case 'delete': {
            if (!args[1]) {
              throw new Error('standup key is required. Usage: standup delete <key>');
            }

            const standupToDelete = standupManager.getStandup(args[1]);
            console.log(`\n⚠️  About to delete standup: ${standupToDelete.name || args[1]}`);
            console.log(`   This will cancel all future occurrences and send notifications.`);

            const confirmed = await confirmAction('Are you sure you want to delete this standup series?');
            if (!confirmed) {
              console.log('Cancelled.');
              break;
            }

            console.log(`\nDeleting standup: ${args[1]}...`);
            await standupManager.deleteStandup(args[1]);
            console.log(`\n✅ Standup deleted: ${args[1]}`);
            break;
          }

          default:
            throw new Error(`Unknown standup command: ${subCommand}. Usage: standup [list|preview|create|create-all|sync|delete]`);
        }
        break;
      }

      // ============ Group Commands ============

      case 'group': {
        const subCommand = args[0];

        switch (subCommand) {
          case 'list': {
            const config = standupManager.loadConfig();

            console.log(`\n👥 Attendee Groups:\n`);

            for (const [name, group] of Object.entries(config.attendee_groups)) {
              console.log(`   ${name}:`);
              console.log(`      Description: ${group.description}`);
              console.log(`      Members (${(group.members || []).length}):`);
              for (const email of (group.members || [])) {
                console.log(`         - ${email}`);
              }
              console.log('');
            }
            break;
          }

          case 'show': {
            if (!args[1]) {
              throw new Error('group name is required. Usage: group show <name>');
            }

            const members = standupManager.resolveAttendeeGroup(args[1]);

            console.log(`\n👥 Group: ${args[1]}\n`);
            if (members.length === 0) {
              console.log('   No members');
            } else {
              console.log(`   ${members.length} members:`);
              for (const email of members) {
                console.log(`      - ${email}`);
              }
            }
            break;
          }

          case 'add': {
            if (!args[1] || !args[2]) {
              throw new Error('group name and email are required. Usage: group add <name> <email>');
            }

            // Validate email format
            validateEmail(args[2], 'Member email');

            standupManager.addToAttendeeGroup(args[1], args[2]);
            console.log(`\n✅ Added ${args[2]} to ${args[1]}`);
            break;
          }

          case 'remove': {
            if (!args[1] || !args[2]) {
              throw new Error('group name and email are required. Usage: group remove <name> <email>');
            }

            standupManager.removeFromAttendeeGroup(args[1], args[2]);
            console.log(`\n✅ Removed ${args[2]} from ${args[1]}`);
            break;
          }

          default:
            throw new Error(`Unknown group command: ${subCommand}. Usage: group [list|show|add|remove]`);
        }
        break;
      }

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        if (command) {
          console.error(`Unknown command: ${command}`);
        }
        showHelp();
        if (command) throw new Error(`Unknown command: ${command}`);
        return;
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.errors) {
      console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
    if (error.response?.data?.error) {
      console.error('API Error:', JSON.stringify(error.response.data.error, null, 2));
    }
    throw error;
  }
});

