// PM AI Starter Kit - Google Calendar Client Library
// See scripts/README.md for setup instructions
//
// Shared library for Google Calendar operations.
// Uses unified google-auth.cjs for OAuth2 authentication.
//
// Supports:
// - Listing calendars and events
// - Creating/updating/deleting events
// - Quick add (natural language)
// - Free/busy queries
// - Recurring events
// - Invite responses
// - Slot finding

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

// ============ Retry Configuration ============

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504]
};

const MAX_SAFE_TIMEOUT = 2147483647;

function isRetryableError(error) {
  if (!error) return false;
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  const status = error.response?.status || error.code;
  if (status && RETRY_CONFIG.retryableStatuses.includes(status)) {
    return true;
  }
  if (typeof error.message === 'string' && error.message.includes('Rate Limit Exceeded')) {
    return true;
  }
  return false;
}

async function withRetry(fn, operationName = 'API call') {
  let lastError;
  let delayMs = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt > RETRY_CONFIG.maxRetries) {
        throw error;
      }
      const errorMsg = error?.message || 'Unknown error';
      console.warn(`[WARN] ${operationName} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries + 1}): ${errorMsg}`);

      const retryAfterHeader = error.response?.headers?.['retry-after'];
      let actualDelay;

      if (retryAfterHeader) {
        const retryAfterSeconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryAfterSeconds)) {
          actualDelay = retryAfterSeconds * 1000;
          console.warn(`   [WARN] Server requested retry after ${retryAfterSeconds}s`);
        } else {
          const retryDate = new Date(retryAfterHeader);
          if (!isNaN(retryDate.getTime())) {
            actualDelay = Math.max(0, retryDate.getTime() - Date.now());
            console.warn(`   [WARN] Server requested retry after ${retryAfterHeader}`);
          }
        }
      }

      if (!actualDelay) {
        const jitter = delayMs * 0.25 * (Math.random() * 2 - 1);
        actualDelay = Math.floor(delayMs + jitter);
      }

      const safeDelay = Math.max(0, Math.min(actualDelay, MAX_SAFE_TIMEOUT));
      console.warn(`   Retrying in ${safeDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, safeDelay));
      delayMs = Math.min(delayMs * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
    }
  }

  throw lastError;
}

// ============ Input Sanitization ============

function sanitizeText(text, maxLength, fieldName) {
  if (text === null || text === undefined) return text;
  if (typeof text !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (text.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters (got ${text.length})`);
  }
  return text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

// ============ Core API Functions ============

async function listCalendars() {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await withRetry(() => calendar.calendarList.list(), 'listCalendars');
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

async function getPrimaryCalendarId() {
  const calendars = await listCalendars();
  const primary = calendars.find(c => c.primary);
  return primary ? primary.id : 'primary';
}

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
  const response = await withRetry(() => calendar.events.list(params), 'listEvents');
  return (response.data.items || []).map(event => formatEvent(event));
}

async function getEvent(eventId, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await withRetry(() => calendar.events.get({ calendarId, eventId }), 'getEvent');
  return formatEvent(response.data);
}

async function createEvent(event, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const eventTimezone = event.timeZone || systemTimezone;
  if (event.timeZone && event.timeZone !== systemTimezone) {
    console.warn(`[WARN] Event timezone (${event.timeZone}) differs from system timezone (${systemTimezone})`);
  }
  const eventBody = {
    summary: sanitizeText(event.summary, 1000, 'summary'),
    description: sanitizeText(event.description, 8192, 'description'),
    location: sanitizeText(event.location, 1000, 'location'),
    start: { dateTime: new Date(event.start).toISOString(), timeZone: eventTimezone },
    end: { dateTime: new Date(event.end).toISOString(), timeZone: eventTimezone }
  };
  if (event.attendees && event.attendees.length > 0) {
    eventBody.attendees = event.attendees.map(email => ({ email }));
  }
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

async function updateEvent(eventId, updates, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const existing = await withRetry(() => calendar.events.get({ calendarId, eventId }), 'updateEvent:get');
  const eventBody = { ...existing.data };
  if (updates.summary !== undefined) eventBody.summary = sanitizeText(updates.summary, 1000, 'summary');
  if (updates.description !== undefined) eventBody.description = sanitizeText(updates.description, 8192, 'description');
  if (updates.location !== undefined) eventBody.location = sanitizeText(updates.location, 1000, 'location');
  if (updates.start !== undefined) {
    eventBody.start = { dateTime: new Date(updates.start).toISOString(), timeZone: updates.timeZone || eventBody.start.timeZone };
  }
  if (updates.end !== undefined) {
    eventBody.end = { dateTime: new Date(updates.end).toISOString(), timeZone: updates.timeZone || eventBody.end.timeZone };
  }
  if (updates.attendees !== undefined) {
    eventBody.attendees = updates.attendees.map(email => ({ email }));
  }
  const response = await withRetry(
    () => calendar.events.update({
      calendarId, eventId, requestBody: eventBody,
      sendUpdates: updates.sendNotifications !== false ? 'all' : 'none'
    }),
    'updateEvent:update'
  );
  return formatEvent(response.data);
}

async function deleteEvent(eventId, calendarId = 'primary', sendNotifications = true) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  await withRetry(
    () => calendar.events.delete({ calendarId, eventId, sendUpdates: sendNotifications ? 'all' : 'none' }),
    'deleteEvent'
  );
}

async function quickAdd(text, calendarId = 'primary') {
  const sanitizedText = sanitizeText(text, 2000, 'text');
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await withRetry(() => calendar.events.quickAdd({ calendarId, text: sanitizedText }), 'quickAdd');
  return formatEvent(response.data);
}

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
      busy: (data.busy || []).map(slot => ({ start: slot.start, end: slot.end })),
      errors: data.errors
    };
  }
  return result;
}

async function getTodayEvents(calendarId = 'primary') {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return listEvents({ calendarId, timeMin: startOfDay, timeMax: endOfDay });
}

async function getUpcomingEvents(days = 7, calendarId = 'primary') {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return listEvents({ calendarId, timeMin: now, timeMax: future });
}

async function findMeetingAtTime(timestamp, options = {}) {
  const { toleranceMinutes = 15, titleHint = null, calendarId = 'primary' } = options;
  const targetTime = new Date(timestamp);
  const searchStart = new Date(targetTime.getTime() - toleranceMinutes * 60 * 1000);
  const searchEnd = new Date(targetTime.getTime() + toleranceMinutes * 60 * 1000);
  try {
    const events = await listEvents({ calendarId, timeMin: searchStart, timeMax: searchEnd, maxResults: 10 });
    if (events.length === 0) return null;
    if (events.length === 1) return events[0];
    if (titleHint) {
      const titleLower = titleHint.toLowerCase();
      const matched = events.find(e => {
        const eventTitle = (e.summary || '').toLowerCase();
        const titleWords = titleLower.split(/\s+/).filter(w => w.length > 3);
        const eventWords = eventTitle.split(/\s+/).filter(w => w.length > 3);
        const overlap = titleWords.filter(w => eventWords.some(ew => ew.includes(w) || w.includes(ew)));
        return overlap.length >= Math.min(2, titleWords.length);
      });
      if (matched) return matched;
    }
    let bestMatch = events[0];
    let bestDiff = Math.abs(new Date(events[0].start).getTime() - targetTime.getTime());
    for (const event of events.slice(1)) {
      const diff = Math.abs(new Date(event.start).getTime() - targetTime.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestMatch = event; }
    }
    return bestMatch;
  } catch (error) {
    console.error('Error finding meeting at time:', error.message);
    return null;
  }
}

function extractAttendeeNames(event) {
  if (!event || !event.attendees) return [];
  return event.attendees
    .filter(a => !a.self)
    .map(a => {
      if (a.displayName) return a.displayName;
      const emailPrefix = a.email.split('@')[0];
      return emailPrefix.split(/[._-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
    })
    .filter(name => name && name.length > 0);
}

// ============ Slot Finding Functions ============

async function findAvailableSlots(emails, timeMin, timeMax, options = {}) {
  const durationMinutes = options.durationMinutes || 30;
  const maxSlots = options.maxSlots || 5;
  if (durationMinutes < 1) throw new Error('durationMinutes must be at least 1 minute');
  if (durationMinutes > 1440) throw new Error('durationMinutes cannot exceed 1440 (24 hours)');
  if (maxSlots < 1 || maxSlots > 20) throw new Error('maxSlots must be between 1 and 20');

  const startTime = new Date(timeMin);
  const endTime = new Date(timeMax);
  const freeBusyResult = await getFreeBusy(emails, startTime, endTime);

  const allBusySlots = [];
  for (const [email, data] of Object.entries(freeBusyResult)) {
    if (data.busy) {
      for (const slot of data.busy) {
        allBusySlots.push({ start: new Date(slot.start).getTime(), end: new Date(slot.end).getTime() });
      }
    }
  }
  allBusySlots.sort((a, b) => a.start - b.start);

  const mergedBusy = [];
  for (const slot of allBusySlots) {
    if (mergedBusy.length === 0) {
      mergedBusy.push(slot);
    } else {
      const last = mergedBusy[mergedBusy.length - 1];
      if (slot.start <= last.end) {
        last.end = Math.max(last.end, slot.end);
      } else {
        mergedBusy.push(slot);
      }
    }
  }

  const availableSlots = [];
  const durationMs = durationMinutes * 60 * 1000;
  let currentStart = startTime.getTime();

  for (const busy of mergedBusy) {
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

async function findNextAvailableSlot(emails, durationMinutes, options = {}) {
  if (!durationMinutes || durationMinutes < 1) throw new Error('durationMinutes must be at least 1 minute');
  if (durationMinutes > 480) console.warn('[WARN] Searching for slots longer than 8 hours may yield no results');

  const startFrom = options.startFrom ? new Date(options.startFrom) : new Date();
  const searchDays = options.searchDays || 7;
  const workdayStart = options.workdayStart ?? 9;
  const workdayEnd = options.workdayEnd ?? 17;

  for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
    const searchDate = new Date(startFrom);
    searchDate.setDate(searchDate.getDate() + dayOffset);
    const dayOfWeek = searchDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dayStart = new Date(searchDate);
    dayStart.setHours(workdayStart, 0, 0, 0);
    const dayEnd = new Date(searchDate);
    dayEnd.setHours(workdayEnd, 0, 0, 0);

    if (dayOffset === 0 && startFrom > dayStart) dayStart.setTime(startFrom.getTime());
    if (dayStart >= dayEnd) continue;

    const slots = await findAvailableSlots(emails, dayStart, dayEnd, { durationMinutes, maxSlots: 1 });
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

async function createRecurringEvent(event, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const eventBody = {
    summary: sanitizeText(event.summary, 1000, 'summary'),
    description: sanitizeText(event.description, 8192, 'description'),
    location: sanitizeText(event.location, 1000, 'location'),
    start: { dateTime: new Date(event.start).toISOString(), timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: new Date(event.end).toISOString(), timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
    recurrence: [event.recurrence]
  };
  if (event.attendees && event.attendees.length > 0) {
    eventBody.attendees = event.attendees.map(email => ({ email }));
  }
  if (event.addMeet) {
    eventBody.conferenceData = {
      createRequest: { requestId: `meet-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
    };
  }
  const response = await withRetry(
    () => calendar.events.insert({
      calendarId, requestBody: eventBody,
      sendUpdates: event.sendNotifications !== false ? 'all' : 'none',
      conferenceDataVersion: event.addMeet ? 1 : 0
    }),
    'createRecurringEvent'
  );
  return formatEvent(response.data);
}

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
  const response = await withRetry(() => calendar.events.instances(params), 'listRecurringInstances');
  return (response.data.items || []).map(event => formatEvent(event));
}

async function updateRecurringSeries(eventId, updates, calendarId = 'primary') {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const existing = await withRetry(() => calendar.events.get({ calendarId, eventId }), 'updateRecurringSeries:get');
  const eventBody = { ...existing.data };
  if (updates.summary !== undefined) eventBody.summary = sanitizeText(updates.summary, 1000, 'summary');
  if (updates.description !== undefined) eventBody.description = sanitizeText(updates.description, 8192, 'description');
  if (updates.location !== undefined) eventBody.location = sanitizeText(updates.location, 1000, 'location');
  if (updates.start !== undefined) {
    eventBody.start = { dateTime: new Date(updates.start).toISOString(), timeZone: updates.timeZone || eventBody.start.timeZone };
  }
  if (updates.end !== undefined) {
    eventBody.end = { dateTime: new Date(updates.end).toISOString(), timeZone: updates.timeZone || eventBody.end.timeZone };
  }
  if (updates.attendees !== undefined) eventBody.attendees = updates.attendees.map(email => ({ email }));
  if (updates.recurrence !== undefined) eventBody.recurrence = [updates.recurrence];
  const response = await withRetry(
    () => calendar.events.update({
      calendarId, eventId, requestBody: eventBody,
      sendUpdates: updates.sendNotifications !== false ? 'all' : 'none'
    }),
    'updateRecurringSeries:update'
  );
  return formatEvent(response.data);
}

async function deleteRecurringSeries(eventId, calendarId = 'primary', sendNotifications = true) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  await withRetry(
    () => calendar.events.delete({ calendarId, eventId, sendUpdates: sendNotifications ? 'all' : 'none' }),
    'deleteRecurringSeries'
  );
}

// ============ Invite Response Functions ============

async function respondToInvite(eventId, response, options = {}) {
  const validResponses = ['accepted', 'declined', 'tentative'];
  if (!validResponses.includes(response)) {
    throw new Error(`Invalid response: ${response}. Must be one of: ${validResponses.join(', ')}`);
  }
  const calendarId = options.calendarId || 'primary';
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const existing = await withRetry(() => calendar.events.get({ calendarId, eventId }), 'respondToInvite:get');
  const attendees = existing.data.attendees || [];
  let foundSelf = false;
  for (const attendee of attendees) {
    if (attendee.self) {
      attendee.responseStatus = response;
      if (options.comment) attendee.comment = sanitizeText(options.comment, 500, 'comment');
      foundSelf = true;
      break;
    }
  }
  if (!foundSelf) throw new Error('You are not an attendee of this event');
  const result = await withRetry(
    () => calendar.events.patch({
      calendarId, eventId, requestBody: { attendees },
      sendUpdates: options.sendNotifications !== false ? 'all' : 'none'
    }),
    'respondToInvite:patch'
  );
  return formatEvent(result.data);
}

async function proposeNewTime(eventId, newStart, newEnd, options = {}) {
  const calendarId = options.calendarId || 'primary';
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const existing = await withRetry(() => calendar.events.get({ calendarId, eventId }), 'proposeNewTime:get');
  const event = existing.data;
  const attendees = event.attendees || [];
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
      calendarId, eventId, requestBody: { attendees },
      sendUpdates: 'all'
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

function formatEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const isAllDay = !event.start?.dateTime;
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start, end, isAllDay,
    status: event.status,
    htmlLink: event.htmlLink,
    hangoutLink: event.hangoutLink,
    meetLink: event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
    creator: event.creator?.email,
    organizer: event.organizer?.email,
    attendees: (event.attendees || []).map(a => ({
      email: a.email, displayName: a.displayName, responseStatus: a.responseStatus,
      organizer: a.organizer, self: a.self
    })),
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId
  };
}

module.exports = {
  listCalendars, getPrimaryCalendarId,
  listEvents, getEvent, createEvent, updateEvent, deleteEvent, quickAdd,
  createRecurringEvent, listRecurringInstances, updateRecurringSeries, deleteRecurringSeries,
  respondToInvite, proposeNewTime,
  getTodayEvents, getUpcomingEvents, getFreeBusy, findAvailableSlots, findNextAvailableSlot,
  findMeetingAtTime, extractAttendeeNames
};
