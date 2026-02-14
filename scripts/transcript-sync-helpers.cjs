/**
 * Transcript Deep Extraction Helpers
 *
 * Helper functions for extracting deep context from meeting transcripts
 * for the experiment sync pipeline.
 */

/**
 * Parse speaker statements from transcript content
 */
function parseSpeakerStatements(content) {
  const lines = content.split('\n');
  const speakerPattern = /^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*\*\*([^*]+)\*\*:\s*(.+)$/;
  const statements = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(speakerPattern);
    if (match) {
      statements.push({
        speaker: match[1].trim(),
        text: match[2].trim(),
        lineNumber: i,
        timestamp: lines[i].match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] || null
      });
    }
  }

  return statements;
}

/**
 * Extract experiment mentions with context
 */
function extractExperimentMentions(content, filename, statements) {
  const experimentKeywords = /\b(experiment|a\/b test|variant|feature flag|posthog|rollout|checkout.*test|conversion.*test|split.*test)\b/gi;
  const mentions = [];

  // Search through speaker statements
  for (const stmt of statements) {
    const matches = [...stmt.text.matchAll(experimentKeywords)];
    if (matches.length > 0) {
      mentions.push({
        speaker: stmt.speaker,
        text: stmt.text,
        timestamp: stmt.timestamp,
        keywords: matches.map(m => m[0].toLowerCase()),
        lineNumber: stmt.lineNumber
      });
    }
  }

  return mentions;
}

/**
 * Extract context window around mentions
 */
function extractContext(statements, mention, windowSize = 3) {
  const idx = statements.findIndex(s => s.lineNumber === mention.lineNumber);
  if (idx === -1) return mention.text;

  const start = Math.max(0, idx - windowSize);
  const end = Math.min(statements.length, idx + windowSize + 1);
  const contextStatements = statements.slice(start, end);

  return contextStatements.map(s => `${s.speaker}: ${s.text}`).join('\n');
}

/**
 * Detect discussion type
 */
function detectDiscussionType(mention, context) {
  const text = (mention.text + ' ' + context).toLowerCase();

  if (/\b(decided|agreed|going with|ship|launch|approved)\b/i.test(text)) {
    return 'decision';
  }
  if (/\b(planning|propose|should we|what if|considering)\b/i.test(text)) {
    return 'planning';
  }
  if (/\b(results|performance|metrics|conversion|lost|won)\b/i.test(text)) {
    return 'review';
  }
  if (/\b(status|progress|currently|ongoing)\b/i.test(text)) {
    return 'update';
  }

  return 'discussion';
}

/**
 * Extract decisions from context
 */
function extractDecisions(context) {
  const decisions = [];
  const decisionPattern = /\b(decided|agreed|going to|will|approved to)\s+([^.!?]+)/gi;
  const MAX_ITERATIONS = 100; // Prevent ReDoS with iteration limit

  let match;
  let iterations = 0;
  while ((match = decisionPattern.exec(context)) !== null && iterations < MAX_ITERATIONS) {
    decisions.push(match[0].trim());
    iterations++;
  }

  return decisions;
}

/**
 * Extract action items
 */
function extractActionItems(context) {
  const actionItems = [];
  const ownerPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|needs? to|is going to)\s+([^.!?]+)/gi;
  const MAX_ITERATIONS = 100; // Prevent ReDoS with iteration limit

  let match;
  let iterations = 0;
  while ((match = ownerPattern.exec(context)) !== null && iterations < MAX_ITERATIONS) {
    actionItems.push({
      owner: match[1].trim(),
      action: match[2].trim()
    });
    iterations++;
  }

  return actionItems;
}

/**
 * Detect sentiment
 */
function detectSentiment(text) {
  const negative = /\b(fail|poor|bad|worse|problem|issue|concern|negative|underperform|lost|rolled? back)\b/gi;
  const positive = /\b(success|good|better|improve|positive|win|won|ship|launch|great)\b/gi;

  const negCount = (text.match(negative) || []).length;
  const posCount = (text.match(positive) || []).length;

  if (negCount > posCount + 1) return 'negative';
  if (posCount > negCount + 1) return 'positive';
  return 'neutral';
}

/**
 * Extract meeting date from filename or frontmatter
 */
function extractMeetingDate(filename, content) {
  // Try frontmatter first
  const dateMatch = content.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
  if (dateMatch) return dateMatch[1];

  // Try filename pattern: YYYY-MM-DD-*
  const filenameMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (filenameMatch) return filenameMatch[1];

  return null;
}

/**
 * Try to identify which experiment is being discussed
 */
function identifyExperiment(mention, context) {
  const text = (mention.text + ' ' + context).toLowerCase();

  // Common experiment names/patterns
  const experimentPatterns = [
    { pattern: /checkout.*light.*mode/i, key: 'checkout-light-mode' },
    { pattern: /checkout.*v2/i, key: 'checkout-v2' },
    { pattern: /checkout.*split/i, key: 'checkout-split' },
    { pattern: /data.*scan/i, key: 'data-scan-*' },
    { pattern: /onboarding/i, key: 'onboarding-*' },
    { pattern: /call.*guard/i, key: 'call-guard-*' },
    { pattern: /family.*picker/i, key: 'family-picker-checkout' },
    { pattern: /trust.*badge/i, key: 'checkout-trust-badges' },
    { pattern: /vpn.*bundl/i, key: 'vpn-feature-bundling' },
  ];

  for (const { pattern, key } of experimentPatterns) {
    if (pattern.test(text)) {
      return key;
    }
  }

  return 'unknown';
}

module.exports = {
  parseSpeakerStatements,
  extractExperimentMentions,
  extractContext,
  detectDiscussionType,
  extractDecisions,
  extractActionItems,
  detectSentiment,
  extractMeetingDate,
  identifyExperiment
};
