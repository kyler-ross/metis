#!/usr/bin/env node
/**
 * Google Forms API CLI
 *
 * Command-line interface for Google Forms operations.
 *
 * Usage:
 *   node google-forms-api.js create <title>                    - Create new form
 *   node google-forms-api.js info <formId>                     - Get form info
 *   node google-forms-api.js questions <formId>                - List questions
 *   node google-forms-api.js add <formId> <type> <title>       - Add question
 *   node google-forms-api.js add-json <formId> <json>          - Add questions from JSON
 *   node google-forms-api.js create-from-json <jsonFile>       - Create form from spec
 *   node google-forms-api.js responses <formId>                - Get responses
 *   node google-forms-api.js summary <formId>                  - Get response summary
 *   node google-forms-api.js duplicate <formId> <newTitle>     - Copy form
 *
 * Examples:
 *   node google-forms-api.js create "Feedback Form"
 *   node google-forms-api.js add FORM_ID MULTIPLE_CHOICE "How satisfied?" --options "Very,Somewhat,Not at all"
 *   node google-forms-api.js create-from-json ./survey.json
 */

const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

const formsClient = require('./lib/forms-client.js');
const { track } = require('./lib/telemetry.cjs');
const { run } = require('./lib/script-runner.cjs');

// Parse arguments
const [,, command, ...args] = process.argv;

// Parse --options flag
function parseOptions(args) {
  const optionsIdx = args.findIndex(a => a === '--options');
  if (optionsIdx === -1) return { args, options: null };

  const optionsValue = args[optionsIdx + 1];
  const options = optionsValue ? optionsValue.split(',').map(o => o.trim()) : [];
  const remainingArgs = args.filter((_, i) => i !== optionsIdx && i !== optionsIdx + 1);

  return { args: remainingArgs, options };
}

// Parse --required flag
function parseRequired(args) {
  const requiredIdx = args.findIndex(a => a === '--required');
  if (requiredIdx === -1) return { args, required: false };

  const remainingArgs = args.filter((_, i) => i !== requiredIdx);
  return { args: remainingArgs, required: true };
}

// Help text
function showHelp() {
  console.log(`
Google Forms API CLI

Usage:
  node google-forms-api.js <command> [arguments]

Commands:
  create <title>                         Create a new blank form
  info <formId>                          Get form metadata and question count
  questions <formId>                     List all questions in the form
  add <formId> <type> <title> [flags]    Add a question to the form
  add-json <formId> <json>               Add questions from JSON string
  create-from-json <jsonFile>            Create complete form from JSON file
  responses <formId>                     Get all form responses
  summary <formId>                       Get response summary/statistics
  duplicate <formId> <newTitle>          Copy an existing form

Question Types:
  TEXT              Short answer
  PARAGRAPH_TEXT    Long answer (paragraph)
  MULTIPLE_CHOICE   Single select (radio buttons)
  CHECKBOX          Multi select (checkboxes)
  DROP_DOWN         Dropdown select
  SCALE             Linear scale (1-5, 1-10, etc.)
  DATE              Date picker
  TIME              Time picker

Flags for 'add' command:
  --options "opt1,opt2,opt3"    Options for choice questions
  --required                     Make question required

Examples:
  node google-forms-api.js create "Customer Feedback"
  node google-forms-api.js info 1FAIpQ...
  node google-forms-api.js questions 1FAIpQ...
  node google-forms-api.js add 1FAIpQ... TEXT "What's your name?" --required
  node google-forms-api.js add 1FAIpQ... MULTIPLE_CHOICE "Rating?" --options "Great,Good,OK,Poor"
  node google-forms-api.js add 1FAIpQ... CHECKBOX "Features?" --options "Speed,Design,Price"
  node google-forms-api.js create-from-json ./survey.json
  node google-forms-api.js responses 1FAIpQ...
  node google-forms-api.js duplicate 1FAIpQ... "Copy of Form"

JSON Spec Format (for create-from-json):
  {
    "title": "Survey Title",
    "description": "Optional description",
    "questions": [
      { "title": "Question 1", "type": "TEXT", "required": true },
      { "title": "Question 2", "type": "MULTIPLE_CHOICE", "options": ["A", "B", "C"] }
    ]
  }
`);
}

// Main execution
run({
  name: 'google-forms-api',
  mode: 'operational',
  services: ['google'],
}, async (ctx) => {
  track('pm_ai_google_forms_api_start', { command });

  try {
    switch (command) {
      case 'create': {
        if (!args[0]) {
          throw new Error('title is required');
        }
        const form = await formsClient.createForm(args[0]);
        console.log(`\n✅ Created form: ${form.title}`);
        console.log(`   Form ID: ${form.formId}`);
        console.log(`   Edit: ${form.editUri}`);
        console.log(`   Share: ${form.responderUri}`);
        break;
      }

      case 'info': {
        if (!args[0]) {
          throw new Error('formId is required');
        }
        const form = await formsClient.getForm(args[0]);
        console.log(`\n📋 ${form.title}`);
        if (form.description) {
          console.log(`   ${form.description}`);
        }
        console.log(`\n   Form ID: ${form.formId}`);
        console.log(`   Questions: ${form.questionCount}`);
        console.log(`   Edit: ${form.editUri}`);
        console.log(`   Share: ${form.responderUri}`);
        break;
      }

      case 'questions': {
        if (!args[0]) {
          throw new Error('formId is required');
        }
        const form = await formsClient.getForm(args[0]);
        console.log(`\n📋 ${form.title}\n`);

        if (form.questions.length === 0) {
          console.log('   (no questions)');
        } else {
          form.questions.forEach((q, i) => {
            const required = q.required ? ' *' : '';
            console.log(`   ${i + 1}. [${q.type}] ${q.title}${required}`);
            if (q.options && Array.isArray(q.options)) {
              q.options.forEach(opt => console.log(`      - ${opt}`));
            }
          });
        }
        break;
      }

      case 'add': {
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('formId, type, and title are required. Usage: add <formId> <type> <title> [--options "a,b,c"] [--required]');
        }

        const formId = args[0];
        const type = args[1].toUpperCase();
        const title = args[2];

        // Parse remaining args for flags
        const remainingArgs = args.slice(3);
        const { args: args1, options } = parseOptions(remainingArgs);
        const { required } = parseRequired(args1);

        const question = {
          title,
          type,
          required,
          options
        };

        const result = await formsClient.addQuestion(formId, question);
        console.log(`\n✅ Added question: "${title}"`);
        console.log(`   Type: ${type}`);
        console.log(`   Item ID: ${result.itemId}`);
        break;
      }

      case 'add-json': {
        if (!args[0] || !args[1]) {
          throw new Error('formId and JSON are required');
        }

        const formId = args[0];
        const questions = JSON.parse(args[1]);

        const results = await formsClient.addQuestions(formId, questions);
        console.log(`\n✅ Added ${results.length} questions`);
        break;
      }

      case 'create-from-json': {
        if (!args[0]) {
          throw new Error('JSON file path is required');
        }

        const filePath = path.resolve(args[0]);
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const spec = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        console.log(`\n📝 Creating form from: ${filePath}`);
        console.log(`   Title: ${spec.title}`);
        console.log(`   Questions: ${spec.questions?.length || 0}`);

        const form = await formsClient.createFormFromSpec(spec);

        console.log(`\n✅ Created form: ${form.title}`);
        console.log(`   Form ID: ${form.formId}`);
        console.log(`   Questions: ${form.questionCount}`);
        console.log(`   Edit: ${form.editUri}`);
        console.log(`   Share: ${form.responderUri}`);
        break;
      }

      case 'responses': {
        if (!args[0]) {
          throw new Error('formId is required');
        }

        const data = await formsClient.getResponses(args[0]);
        console.log(`\n📊 Responses: ${data.responseCount}\n`);

        if (data.responseCount === 0) {
          console.log('   (no responses yet)');
        } else {
          data.responses.forEach((r, i) => {
            console.log(`--- Response ${i + 1} (${new Date(r.lastSubmittedTime).toLocaleString()}) ---`);
            for (const [qId, answers] of Object.entries(r.answers)) {
              const answerText = Array.isArray(answers) ? answers.join(', ') : JSON.stringify(answers);
              console.log(`   ${qId}: ${answerText}`);
            }
            console.log('');
          });
        }
        break;
      }

      case 'summary': {
        if (!args[0]) {
          throw new Error('formId is required');
        }

        const summary = await formsClient.getResponsesSummary(args[0]);
        console.log(`\n📊 ${summary.title}`);
        console.log(`   Total responses: ${summary.responseCount}\n`);

        for (const [qId, data] of Object.entries(summary.questions)) {
          console.log(`   ${data.title}`);
          console.log(`      Type: ${data.type}`);
          console.log(`      Answers: ${data.answerCount}`);

          // For choice questions, show counts
          if (['RADIO', 'CHECKBOX', 'DROP_DOWN', 'MULTIPLE_CHOICE'].includes(data.type)) {
            const counts = {};
            data.answers.flat().forEach(a => {
              counts[a] = (counts[a] || 0) + 1;
            });
            for (const [opt, count] of Object.entries(counts)) {
              console.log(`         ${opt}: ${count}`);
            }
          }
          console.log('');
        }
        break;
      }

      case 'duplicate': {
        if (!args[0] || !args[1]) {
          throw new Error('formId and newTitle are required');
        }

        const form = await formsClient.duplicateForm(args[0], args[1]);
        console.log(`\n✅ Duplicated form: ${form.title}`);
        console.log(`   Form ID: ${form.formId}`);
        console.log(`   Questions: ${form.questionCount}`);
        console.log(`   Edit: ${form.editUri}`);
        console.log(`   Share: ${form.responderUri}`);
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

