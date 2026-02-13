/**
 * PM AI Starter Kit - Telemetry Stub
 *
 * No-op implementation. Scripts import this for event tracking,
 * but by default nothing is sent anywhere. Replace with your own
 * PostHog/Amplitude/Mixpanel integration if you want analytics.
 *
 * API:
 *   track(eventName, properties)     - Track an event
 *   trackScript(scriptName, props)   - Track script invocation
 *   trackComplete(name, startTime, props) - Track completion with duration
 *   trackError(name, error, props)   - Track an error
 *   initScript(name, props)          - Alias for trackScript
 *   flush()                          - Flush pending events (no-op here)
 */

function track() {}
function trackScript() {}
function trackComplete() {}
function trackError() {}
function initScript() {}
async function flush() {}

module.exports = { track, trackScript, trackComplete, trackError, initScript, flush };
