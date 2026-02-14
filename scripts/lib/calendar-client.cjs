/**
 * Google Calendar Client Library
 *
 * Shared library for Google Calendar operations.
 * Uses unified google-auth.js for OAuth2 authentication.
 *
 * Supports:
 * - Listing calendars and events
 * - Creating/updating/deleting events
 * - Quick add (natural language)
 * - Free/busy queries
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

// ============ Retry Configuration ============

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  // HTTP status codes that should trigger retry
  retryableStatuses: [429, 500, 502, 503, 504]
};

// Maximum safe delay for setTimeout (2^31-1 milliseconds, ~24.8 days)
const MAX_SAFE_TIMEOUT = 2147483647;

/**
 * Check if an error is retryable (transient)
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is retryable
 */
function isRetryableError(error) {
  if (!error) return false;

  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Google API errors with retryable status codes (use optional chaining for safety)
  const status = error.response?.status || error.code;
  if (status && RETRY_CONFIG.retryableStatuses.includes(status)) {
    return true;
  }

  // Rate limit errors (check message exists and is a string)
  if (typeof error.message === 'string' && error.message.includes('Rate Limit Exceeded')) {
    return true;
  }

  return false;
}

/**
 * Execute a function with exponential backoff retry and jitter
 * @param {Function} fn - Async function to execute
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise<*>} Result of the function
 */
async function withRetry(fn, operationName = 'API call') {
  let lastError;
  let delayMs = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if not a retryable error or last attempt
      if (!isRetryableError(error) || attempt > RETRY_CONFIG.maxRetries) {
        throw error;
      }

      // Log retry attempt
      const errorMsg = error?.message || 'Unknown error';
      console.warn(`[WARN] ${operationName} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries + 1}): ${errorMsg}`);

      // Check for Retry-After header (for 429 rate limit errors)
      const retryAfterHeader = error.response?.headers?.['retry-after'];
      let actualDelay;

      if (retryAfterHeader) {
        // Retry-After can be seconds (integer) or HTTP date
        const retryAfterSeconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryAfterSeconds)) {
          actualDelay = retryAfterSeconds * 1000;
          console.warn(`   [WARN] Server requested retry after ${retryAfterSeconds}s`);
        } else {
          // Try to parse as HTTP date
          const retryDate = new Date(retryAfterHeader);
          if (!isNaN(retryDate.getTime())) {
            actualDelay = Math.max(0, retryDate.getTime() - Date.now());
            console.warn(`   [WARN] Server requested retry after ${retryAfterHeader}`);
          }
        }
      }

      if (!actualDelay) {
        // Fall back to exponential backoff with jitter (±25% randomization)
        const jitter = delayMs * 0.25 * (Math.random() * 2 - 1);
        actualDelay = Math.floor(delayMs + jitter);
      }

      // Ensure delay doesn't exceed setTimeout max (2^31-1) or go negative
      const safeDelay = Math.max(0, Math.min(actualDelay, MAX_SAFE_TIMEOUT));
      console.warn(`   Retrying in ${safeDelay}ms...`);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, safeDelay));

      // Exponential backoff with cap (only used if Retry-After not present)
      delayMs = Math.min(delayMs * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
    }
  }

  throw lastError;
}

// ============ Input Sanitization ============

/**
 * Sanitize text input for API calls
 * Removes control characters and validates length
 * @param {string} text - Input text
 * @param {number} maxLength - Maximum allowed length
 * @param {string} fieldName - Field name for error messages
 * @returns {string} Sanitized text
 */
function sanitizeText(text, maxLength, fieldName) {
  if (text === null || text === undefined) return text;
  if (typeof text !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (text.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters (got ${text.length})`);
  }
  // Remove control characters except newline (\n), carriage return (\r), and tab (\t)
  return text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

// ============ Core API Functions ============

/**
 * List all calendars
 * @returns {Promise<Object[]>} Array of calendar info
 */
async function listCalendars() {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await withRetry(
    () => calendar.calendarList.list(),
    'listCalendars'
  );

  return (response.data.items || []).map(cal => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    primary: cal.primary || false,
    accessRole: cal.accessRole,
    backgroundColor: cal.backgroundColor,
    timeZone: cal.timeZone
  }));
}

/**
 * Get primary calendar ID
 * @returns {Promise<string>} Primary calendar ID
 */
async function getPrimaryCalendarId() {
  const calendars = await listCalendars();
  const primary = calendars.find(c => c.primary);
  return primary ? primary.id : 'primary';
}

/**
 * List events in a time range
 * @param {Object} options - Options
 * @param {string} [options.calendarId='primary'] - Calendar ID
 * @param {Date|string} [options.timeMin] - Start time (default: now)
 * @param {Date|string} [options.timeMax] - End time (default: 7 days from now)
 * @param {number} [options.maxResults=50] - Max events to return
 * @param {string} [options.query] - Text search query
 * @returns {Promise<Object[]>} Array of events
 */
async function listEvents(options = {}) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const params = {
    calendarId: options.calendarId || 'primary',
    timeMin: options.timeMin ? new Date(options.timeMin).toISOString() : now.toISOString(),
    timeMax: options.timeMax ? new Date(options.timeMax).toISOString() : weekFromNow.toISOString(),
    maxResults: options.maxResults || 50,
    singleEvents: true,
    orderBy: 'startTime'
  };

  if (options.query) {
    params.q = options.query;
  }

  const response = await withRetry(
    () => calendar.events.list(params),
    'listEvents'
  );

  return (response.data.items || []).map(event => formatEvent(event));
}

/**
 * Get a single event
 * @param {string} eventId - Event ID
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object>} Event details
 */
async function getEvent(eventId, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await withRetry(
    () => calendar.events.get({ calendarId, eventId }),
    'getEvent'
  );

  return formatEvent(response.data);
}

/**
 * Create a new event
 * @param {Object} event - Event details
 * @param {string} event.summary - Event title
 * @param {string|Date} event.start - Start time
 * @param {string|Date} event.end - End time
 * @param {string} [event.description] - Description
 * @param {string} [event.location] - Location
 * @param {string[]} [event.attendees] - Attendee emails
 * @param {boolean} [event.sendNotifications=true] - Send invites
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object>} Created event
 */
async function createEvent(event, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // Detect timezone from input if present
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const eventTimezone = event.timeZone || systemTimezone;

  // Warn if event timezone differs from system timezone (potential for confusion)
  if (event.timeZone && event.timeZone !== systemTimezone) {
    console.warn(`[WARN] Event timezone (${event.timeZone}) differs from system timezone (${systemTimezone})`);
  }

  const eventBody = {
    summary: sanitizeText(event.summary, 1000, 'summary'),
    description: sanitizeText(event.description, 8192, 'description'),
    location: sanitizeText(event.location, 1000, 'location'),
    start: {
      dateTime: new Date(event.start).toISOString(),
      timeZone: eventTimezone
    },
    end: {
      dateTime: new Date(event.end).toISOString(),
      timeZone: eventTimezone
    }
  };

  if (event.attendees && event.attendees.length > 0) {
    eventBody.attendees = event.attendees.map(email => ({ email }));
  }

  // Add Google Meet if requested
  if (event.addMeet) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
  }

  const response = await withRetry(
    () => calendar.events.insert({
      calendarId,
      requestBody: eventBody,
      sendUpdates: event.sendNotifications !== false ? 'all' : 'none',
      conferenceDataVersion: event.addMeet ? 1 : 0
    }),
    'createEvent'
  );

  return formatEvent(response.data);
}

/**
 * Update an existing event
 * @param {string} eventId - Event ID
 * @param {Object} updates - Fields to update
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object>} Updated event
 */
async function updateEvent(eventId, updates, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // Get existing event (with retry)
  const existing = await withRetry(
    () => calendar.events.get({ calendarId, eventId }),
    'updateEvent:get'
  );
  const eventBody = { ...existing.data };

  // Apply updates (with sanitization to match createEvent)
  if (updates.summary !== undefined) eventBody.summary = sanitizeText(updates.summary, 1000, 'summary');
  if (updates.description !== undefined) eventBody.description = sanitizeText(updates.description, 8192, 'description');
  if (updates.location !== undefined) eventBody.location = sanitizeText(updates.location, 1000, 'location');

  if (updates.start !== undefined) {
    eventBody.start = {
      dateTime: new Date(updates.start).toISOString(),
      timeZone: updates.timeZone || eventBody.start.timeZone
    };
  }

  if (updates.end !== undefined) {
    eventBody.end = {
      dateTime: new Date(updates.end).toISOString(),
      timeZone: updates.timeZone || eventBody.end.timeZone
    };
  }

  if (updates.attendees !== undefined) {
    eventBody.attendees = updates.attendees.map(email => ({ email }));
  }

  const response = await withRetry(
    () => calendar.events.update({
      calendarId,
      eventId,
      requestBody: eventBody,
      sendUpdates: updates.sendNotifications !== false ? 'all' : 'none'
    }),
    'updateEvent:update'
  );

  return formatEvent(response.data);
}

/**
 * Delete an event
 * @param {string} eventId - Event ID
 * @param {string} [calendarId='primary'] - Calendar ID
 * @param {boolean} [sendNotifications=true] - Send cancellation notices
 * @returns {Promise<void>}
 */
async function deleteEvent(eventId, calendarId = 'primary', sendNotifications = true) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  await withRetry(
    () => calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: sendNotifications ? 'all' : 'none'
    }),
    'deleteEvent'
  );
}

/**
 * Quick add event using natural language
 * @param {string} text - Natural language description (e.g., "Meeting with John tomorrow at 3pm")
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object>} Created event
 */
async function quickAdd(text, calendarId = 'primary') {
  // Sanitize the natural language input
  const sanitizedText = sanitizeText(text, 2000, 'text');

  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await withRetry(
    () => calendar.events.quickAdd({ calendarId, text: sanitizedText }),
    'quickAdd'
  );

  return formatEvent(response.data);
}

/**
 * Get free/busy information for calendars
 * @param {string[]} emails - Email addresses to check
 * @param {Date|string} timeMin - Start of range
 * @param {Date|string} timeMax - End of range
 * @returns {Promise<Object>} Free/busy info per calendar
 */
async function getFreeBusy(emails, timeMin, timeMax) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await withRetry(
    () => calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        items: emails.map(email => ({ id: email }))
      }
    }),
    'getFreeBusy'
  );

  const result = {};
  for (const [calendarId, data] of Object.entries(response.data.calendars || {})) {
    result[calendarId] = {
      busy: (data.busy || []).map(slot => ({
        start: slot.start,
        end: slot.end
      })),
      errors: data.errors
    };
  }

  return result;
}

/**
 * Get today's events
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object[]>} Today's events
 */
async function getTodayEvents(calendarId = 'primary') {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return listEvents({
    calendarId,
    timeMin: startOfDay,
    timeMax: endOfDay
  });
}

/**
 * Get upcoming events for N days
 * @param {number} [days=7] - Number of days
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object[]>} Events
 */
async function getUpcomingEvents(days = 7, calendarId = 'primary') {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return listEvents({
    calendarId,
    timeMin: now,
    timeMax: future
  });
}

/**
 * Find a meeting that was happening at a specific time
 * Useful for matching transcripts to calendar events to get accurate attendee lists
 *
 * @param {Date|string} timestamp - The time to search around
 * @param {Object} [options] - Options
 * @param {number} [options.toleranceMinutes=15] - How many minutes before/after to search
 * @param {string} [options.titleHint] - Optional meeting title to help match
 * @param {string} [options.calendarId='primary'] - Calendar ID
 * @returns {Promise<Object|null>} Matching event with attendees, or null if not found
 */
async function findMeetingAtTime(timestamp, options = {}) {
  const {
    toleranceMinutes = 15,
    titleHint = null,
    calendarId = 'primary'
  } = options;

  const targetTime = new Date(timestamp);
  const searchStart = new Date(targetTime.getTime() - toleranceMinutes * 60 * 1000);
  const searchEnd = new Date(targetTime.getTime() + toleranceMinutes * 60 * 1000);

  try {
    const events = await listEvents({
      calendarId,
      timeMin: searchStart,
      timeMax: searchEnd,
      maxResults: 10
    });

    if (events.length === 0) {
      return null;
    }

    // If only one event, return it
    if (events.length === 1) {
      return events[0];
    }

    // If we have a title hint, try to match
    if (titleHint) {
      const titleLower = titleHint.toLowerCase();
      const matched = events.find(e => {
        const eventTitle = (e.summary || '').toLowerCase();
        // Check for significant word overlap
        const titleWords = titleLower.split(/\s+/).filter(w => w.length > 3);
        const eventWords = eventTitle.split(/\s+/).filter(w => w.length > 3);
        const overlap = titleWords.filter(w => eventWords.some(ew => ew.includes(w) || w.includes(ew)));
        return overlap.length >= Math.min(2, titleWords.length);
      });
      if (matched) {
        return matched;
      }
    }

    // Find the event whose start time is closest to the target
    let bestMatch = events[0];
    let bestDiff = Math.abs(new Date(events[0].start).getTime() - targetTime.getTime());

    for (const event of events.slice(1)) {
      const diff = Math.abs(new Date(event.start).getTime() - targetTime.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = event;
      }
    }

    return bestMatch;
  } catch (error) {
    console.error('Error finding meeting at time:', error.message);
    return null;
  }
}

/**
 * Extract attendee names from a calendar event
 * Filters out the user (self) and returns clean display names
 *
 * @param {Object} event - Calendar event from findMeetingAtTime or listEvents
 * @returns {string[]} Array of attendee names
 */
function extractAttendeeNames(event) {
  if (!event || !event.attendees) {
    return [];
  }

  return event.attendees
    .filter(a => !a.self) // Exclude yourself
    .map(a => {
      // Prefer displayName, fall back to email prefix
      if (a.displayName) {
        return a.displayName;
      }
      // Extract name from email (first.last@domain.com -> First Last)
      const emailPrefix = a.email.split('@')[0];
      return emailPrefix
        .split(/[._-]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    })
    .filter(name => name && name.length > 0);
}

// ============ Slot Finding Functions ============

/**
 * Find available meeting slots for a group of people
 * @param {string[]} emails - Email addresses to check
 * @param {Date|string} timeMin - Start of search range
 * @param {Date|string} timeMax - End of search range
 * @param {Object} [options] - Options
 * @param {number} [options.durationMinutes=30] - Required meeting duration
 * @param {number} [options.maxSlots=5] - Maximum slots to return
 * @returns {Promise<Object[]>} Array of available slots with start/end times
 */
async function findAvailableSlots(emails, timeMin, timeMax, options = {}) {
  const durationMinutes = options.durationMinutes || 30;
  const maxSlots = options.maxSlots || 5;

  // Validate duration bounds
  if (durationMinutes < 1) {
    throw new Error('durationMinutes must be at least 1 minute');
  }
  if (durationMinutes > 1440) { // 24 hours
    throw new Error('durationMinutes cannot exceed 1440 (24 hours)');
  }

  // Validate maxSlots bounds (capped at 20 to prevent excessive memory/API usage)
  if (maxSlots < 1 || maxSlots > 20) {
    throw new Error('maxSlots must be between 1 and 20');
  }

  const startTime = new Date(timeMin);
  const endTime = new Date(timeMax);

  // Get freebusy for all attendees
  const freeBusyResult = await getFreeBusy(emails, startTime, endTime);

  // Merge all busy times into a single sorted list
  const allBusySlots = [];
  for (const [email, data] of Object.entries(freeBusyResult)) {
    if (data.busy) {
      for (const slot of data.busy) {
        allBusySlots.push({
          start: new Date(slot.start).getTime(),
          end: new Date(slot.end).getTime()
        });
      }
    }
  }

  // Sort by start time
  allBusySlots.sort((a, b) => a.start - b.start);

  // Merge overlapping busy slots
  const mergedBusy = [];
  for (const slot of allBusySlots) {
    if (mergedBusy.length === 0) {
      mergedBusy.push(slot);
    } else {
      const last = mergedBusy[mergedBusy.length - 1];
      if (slot.start <= last.end) {
        // Overlapping, extend the end
        last.end = Math.max(last.end, slot.end);
      } else {
        mergedBusy.push(slot);
      }
    }
  }

  // Find gaps (free slots)
  const availableSlots = [];
  const durationMs = durationMinutes * 60 * 1000;
  let currentStart = startTime.getTime();

  for (const busy of mergedBusy) {
    // Check if there's a gap before this busy slot
    if (busy.start > currentStart) {
      const gapDuration = busy.start - currentStart;
      if (gapDuration >= durationMs) {
        availableSlots.push({
          start: new Date(currentStart).toISOString(),
          end: new Date(busy.start).toISOString(),
          durationMinutes: Math.floor(gapDuration / 60000)
        });

        if (availableSlots.length >= maxSlots) break;
      }
    }
    currentStart = Math.max(currentStart, busy.end);
  }

  // Check for gap after the last busy slot
  if (availableSlots.length < maxSlots && currentStart < endTime.getTime()) {
    const gapDuration = endTime.getTime() - currentStart;
    if (gapDuration >= durationMs) {
      availableSlots.push({
        start: new Date(currentStart).toISOString(),
        end: new Date(endTime.getTime()).toISOString(),
        durationMinutes: Math.floor(gapDuration / 60000)
      });
    }
  }

  return availableSlots;
}

/**
 * Find the next available slot for a group meeting
 * @param {string[]} emails - Email addresses to check
 * @param {number} durationMinutes - Required meeting duration
 * @param {Object} [options] - Options
 * @param {Date|string} [options.startFrom] - Start searching from (default: now)
 * @param {number} [options.searchDays=7] - How many days to search
 * @param {number} [options.workdayStart=9] - Workday start hour (0-23)
 * @param {number} [options.workdayEnd=17] - Workday end hour (0-23)
 * @returns {Promise<Object|null>} First available slot or null
 */
async function findNextAvailableSlot(emails, durationMinutes, options = {}) {
  // Validate duration
  if (!durationMinutes || durationMinutes < 1) {
    throw new Error('durationMinutes must be at least 1 minute');
  }
  if (durationMinutes > 480) {
    console.warn('[WARN] Searching for slots longer than 8 hours may yield no results');
  }

  const startFrom = options.startFrom ? new Date(options.startFrom) : new Date();
  const searchDays = options.searchDays || 7;
  const workdayStart = options.workdayStart ?? 9;
  const workdayEnd = options.workdayEnd ?? 17;

  for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
    const searchDate = new Date(startFrom);
    searchDate.setDate(searchDate.getDate() + dayOffset);

    // Skip weekends
    const dayOfWeek = searchDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    // Set search window to workday hours
    const dayStart = new Date(searchDate);
    dayStart.setHours(workdayStart, 0, 0, 0);

    const dayEnd = new Date(searchDate);
    dayEnd.setHours(workdayEnd, 0, 0, 0);

    // If searching today and it's past the start time, adjust
    if (dayOffset === 0 && startFrom > dayStart) {
      dayStart.setTime(startFrom.getTime());
    }

    // Skip if we're already past the end of today's workday
    if (dayStart >= dayEnd) continue;

    const slots = await findAvailableSlots(emails, dayStart, dayEnd, {
      durationMinutes,
      maxSlots: 1
    });

    if (slots.length > 0) {
      return {
        ...slots[0],
        date: searchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      };
    }
  }

  return null;
}

// ============ Recurring Event Functions ============

/**
 * Create a recurring event with an RRULE
 * @param {Object} event - Event details (same as createEvent)
 * @param {string} event.recurrence - RRULE string (e.g., "RRULE:FREQ=WEEKLY;BYDAY=MO")
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object>} Created recurring event
 */
async function createRecurringEvent(event, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const eventBody = {
    summary: sanitizeText(event.summary, 1000, 'summary'),
    description: sanitizeText(event.description, 8192, 'description'),
    location: sanitizeText(event.location, 1000, 'location'),
    start: {
      dateTime: new Date(event.start).toISOString(),
      timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: new Date(event.end).toISOString(),
      timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    recurrence: [event.recurrence]
  };

  if (event.attendees && event.attendees.length > 0) {
    eventBody.attendees = event.attendees.map(email => ({ email }));
  }

  // Add Google Meet if requested
  if (event.addMeet) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
  }

  const response = await withRetry(
    () => calendar.events.insert({
      calendarId,
      requestBody: eventBody,
      sendUpdates: event.sendNotifications !== false ? 'all' : 'none',
      conferenceDataVersion: event.addMeet ? 1 : 0
    }),
    'createRecurringEvent'
  );

  return formatEvent(response.data);
}

/**
 * List instances of a recurring event
 * @param {string} eventId - The recurring event ID
 * @param {Object} [options] - Options
 * @param {Date|string} [options.timeMin] - Start of range (default: now)
 * @param {Date|string} [options.timeMax] - End of range (default: 30 days from now)
 * @param {number} [options.maxResults=50] - Max instances to return
 * @param {string} [options.calendarId='primary'] - Calendar ID
 * @returns {Promise<Object[]>} Array of event instances
 */
async function listRecurringInstances(eventId, options = {}) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const params = {
    calendarId: options.calendarId || 'primary',
    eventId,
    timeMin: options.timeMin ? new Date(options.timeMin).toISOString() : now.toISOString(),
    timeMax: options.timeMax ? new Date(options.timeMax).toISOString() : monthFromNow.toISOString(),
    maxResults: options.maxResults || 50
  };

  const response = await withRetry(
    () => calendar.events.instances(params),
    'listRecurringInstances'
  );

  return (response.data.items || []).map(event => formatEvent(event));
}

/**
 * Update all instances of a recurring event series
 * @param {string} eventId - The recurring event ID (not an instance ID)
 * @param {Object} updates - Fields to update
 * @param {string} [calendarId='primary'] - Calendar ID
 * @returns {Promise<Object>} Updated recurring event
 */
async function updateRecurringSeries(eventId, updates, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // Get existing recurring event (with retry)
  const existing = await withRetry(
    () => calendar.events.get({ calendarId, eventId }),
    'updateRecurringSeries:get'
  );
  const eventBody = { ...existing.data };

  // Apply updates (with sanitization to match createRecurringEvent)
  if (updates.summary !== undefined) eventBody.summary = sanitizeText(updates.summary, 1000, 'summary');
  if (updates.description !== undefined) eventBody.description = sanitizeText(updates.description, 8192, 'description');
  if (updates.location !== undefined) eventBody.location = sanitizeText(updates.location, 1000, 'location');

  if (updates.start !== undefined) {
    eventBody.start = {
      dateTime: new Date(updates.start).toISOString(),
      timeZone: updates.timeZone || eventBody.start.timeZone
    };
  }

  if (updates.end !== undefined) {
    eventBody.end = {
      dateTime: new Date(updates.end).toISOString(),
      timeZone: updates.timeZone || eventBody.end.timeZone
    };
  }

  if (updates.attendees !== undefined) {
    eventBody.attendees = updates.attendees.map(email => ({ email }));
  }

  if (updates.recurrence !== undefined) {
    eventBody.recurrence = [updates.recurrence];
  }

  const response = await withRetry(
    () => calendar.events.update({
      calendarId,
      eventId,
      requestBody: eventBody,
      sendUpdates: updates.sendNotifications !== false ? 'all' : 'none'
    }),
    'updateRecurringSeries:update'
  );

  return formatEvent(response.data);
}

/**
 * Delete an entire recurring event series
 * @param {string} eventId - The recurring event ID (not an instance ID)
 * @param {string} [calendarId='primary'] - Calendar ID
 * @param {boolean} [sendNotifications=true] - Send cancellation notices
 * @returns {Promise<void>}
 */
async function deleteRecurringSeries(eventId, calendarId = 'primary', sendNotifications = true) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  await withRetry(
    () => calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: sendNotifications ? 'all' : 'none'
    }),
    'deleteRecurringSeries'
  );
}

// ============ Invite Response Functions ============

/**
 * Respond to a calendar invite (accept, decline, tentative)
 * @param {string} eventId - Event ID
 * @param {string} response - Response status: 'accepted', 'declined', 'tentative'
 * @param {Object} [options] - Options
 * @param {string} [options.calendarId='primary'] - Calendar ID
 * @param {boolean} [options.sendNotifications=true] - Send response notification to organizer
 * @param {string} [options.comment] - Optional comment to include with response
 * @returns {Promise<Object>} Updated event
 */
async function respondToInvite(eventId, response, options = {}) {
  const validResponses = ['accepted', 'declined', 'tentative'];
  if (!validResponses.includes(response)) {
    throw new Error(`Invalid response: ${response}. Must be one of: ${validResponses.join(', ')}`);
  }

  const calendarId = options.calendarId || 'primary';
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // Get the event
  const existing = await withRetry(
    () => calendar.events.get({ calendarId, eventId }),
    'respondToInvite:get'
  );

  const attendees = existing.data.attendees || [];

  // Find the self attendee and update their response
  let foundSelf = false;
  for (const attendee of attendees) {
    if (attendee.self) {
      attendee.responseStatus = response;
      if (options.comment) {
        attendee.comment = sanitizeText(options.comment, 500, 'comment');
      }
      foundSelf = true;
      break;
    }
  }

  if (!foundSelf) {
    throw new Error('You are not an attendee of this event');
  }

  // Patch the event with updated attendees
  const result = await withRetry(
    () => calendar.events.patch({
      calendarId,
      eventId,
      requestBody: { attendees },
      sendUpdates: options.sendNotifications !== false ? 'all' : 'none'
    }),
    'respondToInvite:patch'
  );

  return formatEvent(result.data);
}

/**
 * Propose a new time for an event (sends counter-proposal to organizer)
 * @param {string} eventId - Event ID
 * @param {string|Date} newStart - Proposed new start time
 * @param {string|Date} newEnd - Proposed new end time
 * @param {Object} [options] - Options
 * @param {string} [options.calendarId='primary'] - Calendar ID
 * @param {string} [options.comment] - Optional comment explaining the proposal
 * @returns {Promise<Object>} The counter-proposal event
 */
async function proposeNewTime(eventId, newStart, newEnd, options = {}) {
  const calendarId = options.calendarId || 'primary';
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // Get the original event
  const existing = await withRetry(
    () => calendar.events.get({ calendarId, eventId }),
    'proposeNewTime:get'
  );

  const event = existing.data;
  const timezone = event.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Create counter-proposal using the API's built-in mechanism
  // The counterProposal field signals this is a time proposal
  const proposalBody = {
    start: {
      dateTime: new Date(newStart).toISOString(),
      timeZone: timezone
    },
    end: {
      dateTime: new Date(newEnd).toISOString(),
      timeZone: timezone
    }
  };

  // Update our attendance status to 'tentative' with the proposal
  const attendees = event.attendees || [];
  for (const attendee of attendees) {
    if (attendee.self) {
      attendee.responseStatus = 'tentative';
      if (options.comment) {
        attendee.comment = sanitizeText(options.comment, 500, 'comment');
      }
      break;
    }
  }
  proposalBody.attendees = attendees;

  // Note: Google Calendar doesn't have a direct "propose new time" API endpoint.
  // The typical flow is:
  // 1. Decline or mark tentative with a comment explaining the proposal
  // 2. Optionally create a new event as a counter-proposal
  // For now, we update the response to tentative and add a comment with the proposed time

  const proposalComment = options.comment
    ? `${options.comment}\n\nProposed time: ${new Date(newStart).toLocaleString()} - ${new Date(newEnd).toLocaleString()}`
    : `Proposed alternative time: ${new Date(newStart).toLocaleString()} - ${new Date(newEnd).toLocaleString()}`;

  for (const attendee of attendees) {
    if (attendee.self) {
      attendee.responseStatus = 'tentative';
      attendee.comment = sanitizeText(proposalComment, 500, 'comment');
      break;
    }
  }

  const result = await withRetry(
    () => calendar.events.patch({
      calendarId,
      eventId,
      requestBody: { attendees },
      sendUpdates: 'all' // Always notify organizer for proposals
    }),
    'proposeNewTime:patch'
  );

  return {
    ...formatEvent(result.data),
    proposedStart: new Date(newStart).toISOString(),
    proposedEnd: new Date(newEnd).toISOString()
  };
}

// ============ Helper Functions ============

/**
 * Format event from API response
 */
function formatEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const isAllDay = !event.start?.dateTime;

  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start,
    end,
    isAllDay,
    status: event.status,
    htmlLink: event.htmlLink,
    hangoutLink: event.hangoutLink,
    meetLink: event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
    creator: event.creator?.email,
    organizer: event.organizer?.email,
    attendees: (event.attendees || []).map(a => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
      organizer: a.organizer,
      self: a.self
    })),
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId
  };
}

module.exports = {
  // Calendar operations
  listCalendars,
  getPrimaryCalendarId,

  // Event operations
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  quickAdd,

  // Recurring event operations
  createRecurringEvent,
  listRecurringInstances,
  updateRecurringSeries,
  deleteRecurringSeries,

  // Invite response operations
  respondToInvite,
  proposeNewTime,

  // Convenience functions
  getTodayEvents,
  getUpcomingEvents,
  getFreeBusy,
  findAvailableSlots,
  findNextAvailableSlot,

  // Attendee resolution (for transcript enrichment)
  findMeetingAtTime,
  extractAttendeeNames
};

