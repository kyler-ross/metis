#!/usr/bin/env node
/**
 * Service Definitions - Single source of truth for PM AI service metadata
 *
 * Consolidates service definitions previously duplicated across:
 * - auth-check.cjs (SERVICES object)
 * - telemetry.cjs (SCRIPT_SERVICES mapping)
 *
 * Usage:
 *   const { SERVICES, SCRIPT_SERVICES, getServiceForScript } = require('./service-definitions.cjs');
 */

/**
 * Service definitions with required env vars, setup URLs, and requirement level
 *
 * Each service includes:
 * - name: Human-readable service name
 * - required: Whether this service is required for core PM AI functionality
 * - vars: Primary environment variables to check
 * - altVars: Alternative variable names (for backwards compatibility)
 * - setupUrl: URL to get credentials (null if no self-service option)
 */
const SERVICES = {
  gemini: {
    name: 'Gemini AI',
    required: true,
    vars: ['GEMINI_API_KEY'],
    setupUrl: 'https://aistudio.google.com/apikey',
  },
  github: {
    name: 'GitHub',
    required: true,
    vars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    setupUrl: 'https://github.com/settings/tokens',
  },
  jira: {
    name: 'Jira/Confluence',
    required: true,
    vars: ['ATLASSIAN_EMAIL', 'JIRA_API_KEY'],
    altVars: ['ATLASSIAN_API_TOKEN'],
    setupUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  },
  google: {
    name: 'Google OAuth',
    required: true,
    vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  slack: {
    name: 'Slack',
    required: false,
    vars: ['SLACK_BOT_TOKEN'],
    setupUrl: 'https://api.slack.com/apps',
  },
  posthog: {
    name: 'PostHog',
    required: false,
    vars: ['POSTHOG_API_KEY'],
    setupUrl: 'https://us.posthog.com/settings/project#project-api-keys',
  },
  figma: {
    name: 'Figma',
    required: false,
    vars: ['FIGMA_PERSONAL_ACCESS_TOKEN'],
    setupUrl: 'https://www.figma.com/developers/api#access-tokens',
  },
  datadog: {
    name: 'Datadog',
    required: false,
    vars: ['DD_API_KEY', 'DD_APP_KEY'],
    setupUrl: 'https://app.datadoghq.com/organization-settings/api-keys',
  },
  dovetail: {
    name: 'Dovetail',
    required: false,
    vars: ['DOVETAIL_API_TOKEN'],
    setupUrl: null,
  },
  anthropic: {
    name: 'Anthropic',
    required: false,
    vars: ['ANTHROPIC_API_KEY'],
    setupUrl: 'https://console.anthropic.com/settings/keys',
  },
};

/**
 * Script-to-service mapping for auth checking
 *
 * Maps script filenames to the services they require.
 * Used by telemetry to track auth failures and by auth-check for validation.
 */
const SCRIPT_SERVICES = {
  'atlassian-api.cjs': ['jira'],
  'confluence-sync.cjs': ['jira'],
  'google-sheets-api.cjs': ['google'],
  'google-drive-api.js': ['google'],
  'google-docs-creator.cjs': ['google'],
  'google-gmail-api.cjs': ['google'],
  'google-calendar-api.js': ['google'],
  'google-auth-setup.cjs': ['google'],
  'google-auth-refresh.cjs': ['google'],
  'slack-api.cjs': ['slack'],
  'context-enrichment.cjs': ['gemini'],
  'enrichment-daemon.js': ['gemini'],
  'generate-dossiers.cjs': ['gemini'],
  'experiment-sync.cjs': ['posthog'],
  'dovetail-api.js': ['dovetail'],
};

/**
 * Get the required services for a script
 * @param {string} scriptName - Script filename (e.g., 'google-sheets-api.cjs')
 * @returns {string[]} Array of service keys required by the script
 */
function getServicesForScript(scriptName) {
  return SCRIPT_SERVICES[scriptName] || [];
}

/**
 * Get service metadata by key
 * @param {string} serviceKey - Service key (e.g., 'google', 'jira')
 * @returns {object|null} Service definition or null if not found
 */
function getService(serviceKey) {
  return SERVICES[serviceKey] || null;
}

/**
 * Get all required services
 * @returns {string[]} Array of service keys that are marked as required
 */
function getRequiredServices() {
  return Object.entries(SERVICES)
    .filter(([_, service]) => service.required)
    .map(([key]) => key);
}

/**
 * Get all optional services
 * @returns {string[]} Array of service keys that are optional
 */
function getOptionalServices() {
  return Object.entries(SERVICES)
    .filter(([_, service]) => !service.required)
    .map(([key]) => key);
}

module.exports = {
  SERVICES,
  SCRIPT_SERVICES,
  getServicesForScript,
  getService,
  getRequiredServices,
  getOptionalServices,
};
