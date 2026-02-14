#!/usr/bin/env node

/**
 * PM AI Setup Wizard - Prompt Utilities
 *
 * Provides interactive prompting functions with validation and retry logic.
 * Used throughout the setup wizard for user input collection.
 */

const readline = require('readline');

/**
 * Custom error for user cancellation - distinguishable from regular errors
 */
class UserCancelledError extends Error {
  constructor() {
    super('User cancelled operation');
    this.name = 'UserCancelledError';
    this.isUserCancellation = true;
  }
}

/**
 * Create readline interface
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt for input
 */
async function prompt(message) {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for confirmation (yes/no)
 */
async function confirm(message, defaultYes = true) {
  const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): ';
  const answer = await prompt(message + suffix);

  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Prompt with choices
 */
async function choose(message, choices) {
  console.log(message);
  choices.forEach((choice, i) => {
    console.log(`  ${i + 1}. ${choice}`);
  });

  while (true) {
    const answer = await prompt('Select (1-' + choices.length + '): ');
    const index = parseInt(answer) - 1;

    if (index >= 0 && index < choices.length) {
      return choices[index];
    }

    console.log('Invalid selection. Please try again.');
  }
}

/**
 * Prompt with validation and retry logic
 *
 * @param {string} promptText - Text to display to user
 * @param {function} validator - Async function that validates input and returns { valid, ...metadata } or { valid: false, error, suggestion }
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {object} options - Additional options like hideInput, defaultValue
 * @returns {Promise<{value, metadata}|{skipped: true}|{aborted: true}>}
 */
async function promptWithValidation(promptText, validator, maxRetries = 3, options = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Show attempt number if retrying
    if (attempt > 1) {
      console.log(`\nAttempt ${attempt}/${maxRetries}`);
    }

    // Get user input
    let input;
    if (options.hideInput) {
      input = await promptPassword(promptText);
    } else {
      input = await prompt(promptText);
    }

    // Allow default value
    if (!input && options.defaultValue) {
      input = options.defaultValue;
    }

    if (!input) {
      console.log('No input provided. Please try again.');
      continue;
    }

    // Validate input
    console.log('Validating...');
    const result = await validator(input);

    if (result.valid) {
      console.log('✓ Validation successful');
      return { value: input, metadata: result };
    }

    // Validation failed
    console.log(`✗ Validation failed: ${result.error}`);
    if (result.suggestion) {
      console.log(`  Suggestion: ${result.suggestion}`);
    }

    // Offer options after failed validation
    if (attempt < maxRetries) {
      const retry = await confirm('\nRetry with new value?', true);
      if (!retry) {
        break;
      }
    }
  }

  // Exhausted retries - offer final options
  console.log('\n' + '━'.repeat(60));
  const action = await choose('What would you like to do?', [
    'Retry again',
    'Skip this integration (optional)',
    'Abort setup (can resume later)'
  ]);

  if (action.startsWith('Retry')) {
    return promptWithValidation(promptText, validator, maxRetries, options);
  } else if (action.startsWith('Skip')) {
    return { skipped: true };
  } else {
    return { aborted: true };
  }
}

/**
 * Prompt for password (hidden input)
 * Note: This is a simple implementation. For production, consider using a library like 'read'
 */
async function promptPassword(message) {
  // For now, we'll just use regular prompt with a warning
  // In a real wizard run via Bash tool, stdin will be masked
  console.log('(Input will be visible - consider pasting from secure source)');
  return prompt(message);
}

/**
 * Display progress bar
 */
function progressBar(current, total, width = 40) {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}% (${current} of ${total})`;
}

/**
 * Sleep helper
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  prompt,
  confirm,
  choose,
  promptWithValidation,
  promptPassword,
  progressBar,
  sleep,
  UserCancelledError
};

// CLI testing
if (require.main === module) {
  (async () => {
    console.log('Testing prompt utilities...\n');

    // Test simple prompt
    const name = await prompt('Enter your name: ');
    console.log(`Hello, ${name}!\n`);

    // Test confirm
    const proceed = await confirm('Continue with test?');
    if (!proceed) {
      console.log('Test cancelled.');
      throw new UserCancelledError();
    }

    // Test choose
    const color = await choose('Pick a color:', ['Red', 'Green', 'Blue']);
    console.log(`You picked: ${color}\n`);

    // Test progress bar
    console.log('Progress examples:');
    console.log(progressBar(0, 10));
    console.log(progressBar(5, 10));
    console.log(progressBar(10, 10));

    console.log('\nTests complete!');
  })();
}
