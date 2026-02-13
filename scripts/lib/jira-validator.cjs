// PM AI Starter Kit - jira-validator.cjs
// See scripts/README.md for setup
/**
 * Jira Ticket Validator
 *
 * Enforces ticket quality and structure before creation.
 * Validates summaries, descriptions, labels, components, and issue types.
 */

// Valid issue types
const VALID_ISSUE_TYPES = ['Task', 'Bug', 'Story', 'Epic', 'Sub-task'];

// Valid components - customize for your Jira project
const VALID_COMPONENTS = [
  'Dashboard', 'Extension', 'Mobile', 'Platform', 'Backend', 'Frontend'
];

// Valid labels - customize for your Jira project
const VALID_LABELS = [
  // Platform labels
  'Android', 'iOS', 'Mobile', 'Dashboard', 'Extension', 'Platform', 'Infrastructure',
  // Process labels
  'cx_concern', 'jira_escalated', 'sentry'
];

// Anti-patterns: implementation details that should NOT be in tickets
const IMPLEMENTATION_ANTI_PATTERNS = [
  /\.(js|ts|tsx|jsx|swift|kt|py|rb|go|java|cpp|c|h|m|mm)(\s|$|:)/i,
  /line\s*\d+/i,
  /function\s+\w+/i,
  /class\s+\w+/i,
  /import\s+.*from/i,
  /const\s+\w+\s*=/i,
  /use\s+(Redux|React|Vue|Angular)/i,
  /implement\s+(with|using|in)/i,
  /create\s+(a\s+)?(hook|component|function|class|service)/i,
  /in\s+\w+\.(js|ts|swift|kt)/i,
];

// Placeholder patterns that indicate incomplete information
const PLACEHOLDER_PATTERNS = [
  /\bTBD\b/i,
  /\bTBC\b/i,
  /\bTODO\b/i,
  /\[.*describe.*\]/i,
  /\[.*fill.*\]/i,
  /\[.*add.*\]/i,
  /\[.*insert.*\]/i,
  /\[.*your.*here.*\]/i,
  /\[.*specify.*\]/i,
  /\<.*\>/,
  /___+/,
  /\.\.\.$/m,
];

// Required sections by issue type
const REQUIRED_SECTIONS = {
  Bug: {
    required: ['what happened', 'what should have happened'],
    recommended: ['repro', 'evidence', 'priority'],
    titlePattern: /^(iOS|Android|Web|Dashboard|Extension|API|Mobile):\s*.+/i
  },
  Task: {
    required: ['objective'],
    recommended: ['success metrics', 'deliverables'],
    titlePattern: /^[A-Z][a-z]+\s+.+/
  },
  Story: {
    required: ['user story', 'acceptance criteria'],
    recommended: ['designs'],
    titlePattern: /^[A-Z][a-z]+\s+.+/
  },
  Epic: {
    required: ['objective'],
    recommended: ['success metrics'],
    titlePattern: /.+/
  }
};

/**
 * Validation result structure
 */
class ValidationResult {
  constructor() {
    this.valid = true;
    this.errors = [];
    this.warnings = [];
    this.formatted = null;
  }

  addError(message) {
    this.valid = false;
    this.errors.push(message);
  }

  addWarning(message) {
    this.warnings.push(message);
  }
}

/**
 * Validate a ticket before creation
 */
function validateTicket(ticket) {
  const result = new ValidationResult();
  const { summary, description, issueType = 'Task', labels = [], components = [] } = ticket;

  // 1. Basic field validation
  if (!summary || summary.trim().length === 0) {
    result.addError('Summary/title is required');
  } else if (summary.length < 10) {
    result.addError('Summary too short - be more descriptive');
  } else if (summary.length > 200) {
    result.addWarning('Summary is very long - consider shortening');
  }

  if (!description || description.trim().length === 0) {
    result.addError('Description is required');
  }

  // 2. Issue type validation
  if (!VALID_ISSUE_TYPES.includes(issueType)) {
    result.addError(`Invalid issue type: ${issueType}. Valid types: ${VALID_ISSUE_TYPES.join(', ')}`);
  }

  // 3. Title format validation
  const typeRules = REQUIRED_SECTIONS[issueType];
  if (typeRules && typeRules.titlePattern && summary) {
    if (!typeRules.titlePattern.test(summary)) {
      if (issueType === 'Bug') {
        result.addWarning('Bug titles should follow format: [platform]: [what\'s broken]');
      } else if (issueType === 'Task' || issueType === 'Story') {
        result.addWarning('Task/Story titles should start with a verb (Add, Fix, Update, etc.)');
      }
    }
  }

  // 4. Required sections validation
  if (typeRules && description) {
    const descLower = description.toLowerCase();

    for (const section of typeRules.required) {
      const hasSection = descLower.includes(section) ||
                        descLower.includes(section.replace(' ', '_')) ||
                        descLower.includes(section.replace(' ', '-'));
      if (!hasSection) {
        result.addError(`Missing required section for ${issueType}: "${section}"`);
      }
    }

    for (const section of typeRules.recommended || []) {
      const hasSection = descLower.includes(section) ||
                        descLower.includes(section.replace(' ', '_')) ||
                        descLower.includes(section.replace(' ', '-'));
      if (!hasSection) {
        result.addWarning(`Consider adding "${section}" section`);
      }
    }
  }

  // 5. Implementation detail detection
  if (description) {
    for (const pattern of IMPLEMENTATION_ANTI_PATTERNS) {
      if (pattern.test(description)) {
        result.addError(`Description contains implementation details. Remove: "${description.match(pattern)?.[0]}". Tickets describe WHAT and WHY, not HOW.`);
        break;
      }
    }
  }

  // 5b. Placeholder detection
  if (description) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(description)) {
        result.addError(`Description contains placeholder text: "${description.match(pattern)?.[0]}". Get actual details instead of using placeholders.`);
        break;
      }
    }
  }
  if (summary) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(summary)) {
        result.addError(`Title contains placeholder text: "${summary.match(pattern)?.[0]}". Get actual details.`);
        break;
      }
    }
  }

  // 5c. Minimum detail check
  if (description && description.trim().length < 50) {
    result.addError('Description too short. Tickets need sufficient detail.');
  }

  // 6. Label validation
  for (const label of labels) {
    if (!VALID_LABELS.includes(label)) {
      result.addWarning(`Unknown label: "${label}". Valid labels: ${VALID_LABELS.slice(0, 5).join(', ')}...`);
    }
  }

  // 7. Component validation
  for (const component of components) {
    if (!VALID_COMPONENTS.includes(component)) {
      result.addWarning(`Unknown component: "${component}". Valid: ${VALID_COMPONENTS.join(', ')}`);
    }
  }

  // 8. Bug-specific validation
  if (issueType === 'Bug') {
    if (!labels.some(l => ['iOS', 'Android', 'Mobile', 'Dashboard', 'Extension', 'Platform'].includes(l))) {
      result.addWarning('Bug tickets should have a platform label (iOS, Android, Dashboard, etc.)');
    }
    if (components.length === 0) {
      result.addWarning('Bug tickets should have at least one component');
    }
  }

  // 9. Generate formatted preview
  result.formatted = formatTicketPreview(ticket, result);

  return result;
}

/**
 * Format ticket for user confirmation
 */
function formatTicketPreview(ticket, validationResult) {
  const { summary, description, issueType = 'Task', labels = [], components = [], priority } = ticket;

  let preview = `
Type: ${issueType || 'Task'}
Title: ${(summary || '').substring(0, 80)}
`;

  if (components.length > 0) preview += `Components: ${components.join(', ')}\n`;
  if (labels.length > 0) preview += `Labels: ${labels.join(', ')}\n`;
  if (priority) preview += `Priority: ${priority}\n`;

  preview += `\nDescription:\n`;
  const descLines = (description || '').split('\n').slice(0, 10);
  for (const line of descLines) {
    preview += `  ${line.substring(0, 80)}\n`;
  }
  if ((description || '').split('\n').length > 10) {
    preview += `  ... (truncated)\n`;
  }

  if (validationResult.errors.length > 0) {
    preview += `\nVALIDATION FAILED:\n`;
    for (const error of validationResult.errors) {
      preview += `   - ${error}\n`;
    }
  }

  if (validationResult.warnings.length > 0) {
    preview += `\nWARNINGS:\n`;
    for (const warning of validationResult.warnings) {
      preview += `   - ${warning}\n`;
    }
  }

  if (validationResult.valid) {
    preview += `\nVALIDATION PASSED - Ready to create`;
  }

  return preview;
}

/**
 * Parse plain text description into structured sections
 */
function parseDescription(text, issueType) {
  const sections = {};
  const lines = text.split('\n');
  let currentSection = 'intro';
  let currentContent = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#+\s*(.+)|^([A-Z][A-Za-z\s]+):\s*$/);
    if (headerMatch) {
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = (headerMatch[1] || headerMatch[2]).toLowerCase().trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

module.exports = {
  validateTicket,
  formatTicketPreview,
  parseDescription,
  VALID_ISSUE_TYPES,
  VALID_COMPONENTS,
  VALID_LABELS,
  ValidationResult
};
