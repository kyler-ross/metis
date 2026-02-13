// PM AI Starter Kit - google-gmail-api.cjs
#!/usr/bin/env node
/**
 * Google Gmail API CLI
 *
 * Command-line interface for Gmail operations.
 *
 * Usage:
 *   node google-gmail-api.cjs list [query]              - List/search emails
 *   node google-gmail-api.cjs read <messageId>          - Read full email
 *   node google-gmail-api.cjs thread <threadId>         - Get conversation
 *   node google-gmail-api.cjs send <to> <subject> <body> - Send email
 *   node google-gmail-api.cjs reply <threadId> <body>   - Reply to thread
 *   node google-gmail-api.cjs draft <to> <subject> <body> - Create draft
 *   node google-gmail-api.cjs labels                    - List labels
 *
 * Convenience commands:
 *   node google-gmail-api.cjs today                     - Today's emails
 *   node google-gmail-api.cjs yesterday                 - Yesterday's emails
 *   node google-gmail-api.cjs week                      - This week's emails
 *   node google-gmail-api.cjs inbox                     - Inbox only
 *   node google-gmail-api.cjs unread                    - Unread emails
 *
 * Flags:
 *   --limit N, -n N       - Max results (default: 50)
 *   --json                - Output as JSON for programmatic use
 *   --raw-html            - Don't strip HTML from email bodies
 *
 * Examples:
 *   node google-gmail-api.cjs list "from:john subject:meeting"
 *   node google-gmail-api.cjs list "is:unread newer_than:7d" --limit 100
 *   node google-gmail-api.cjs today --json
 *   node google-gmail-api.cjs read 18abc123def
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

const gmailClient = require('./lib/gmail-client.cjs');
const googleAuth = require('./lib/google-auth.cjs');

// Parse arguments
const rawArgs = process.argv.slice(2);

// Extract flags
let limit = 50;
let jsonOutput = false;
let rawHtml = false;
let account = null;

const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--limit' || arg === '-n') {
    limit = parseInt(rawArgs[++i], 10) || 50;
  } else if (arg === '--json') {
    jsonOutput = true;
  } else if (arg === '--raw-html') {
    rawHtml = true;
  } else if (arg === '--account' || arg === '-a') {
    account = rawArgs[++i];
  } else if (arg.startsWith('--account=')) {
    account = arg.split('=')[1];
  } else if (!arg.startsWith('--')) {
    args.push(arg);
  }
}

// Set account context if specified
if (account) {
  googleAuth.setCurrentAccount(account);
}

const [command, ...cmdArgs] = args;

// Help text
function showHelp() {
  console.log(`
Google Gmail API CLI (Multi-Account)

Usage:
  node google-gmail-api.cjs <command> [arguments] [flags]

Account Management:
  accounts                            List all configured accounts
  add-account                         Add a new Google account (opens browser)
  remove-account <email>              Remove an account
  set-default <email>                 Set default account

Commands:
  list [query]                        List/search emails (default: recent 50)
  read <messageId>                    Read full email content
  thread <threadId|messageId>         Get full conversation thread
  send <to> <subject> <body>          Send a new email
  reply <threadId> <body>             Reply to a thread
  draft <to> <subject> <body>         Create a draft
  drafts                              List all drafts
  send-draft <draftId>                Send an existing draft
  labels                              List all labels
  archive <messageId>                 Archive a message
  trash <messageId>                   Move to trash
  mark-read <messageId>               Mark as read
  mark-unread <messageId>             Mark as unread

Convenience Commands:
  today                               Today's emails
  yesterday                           Yesterday's emails
  week                                This week's emails
  inbox                               Inbox only
  unread                              Unread emails only

Flags:
  --account EMAIL, -a EMAIL           Use specific account (overrides default)
  --limit N, -n N                     Max results (default: 50)
  --json                              Output as JSON for AI/programmatic use
  --raw-html                          Don't strip HTML tags from email bodies

Search Query Examples:
  from:john                           Emails from john
  to:jane                             Emails to jane
  subject:meeting                     Subject contains "meeting"
  is:unread                           Unread emails
  is:starred                          Starred emails
  has:attachment                      Has attachments
  newer_than:7d                       From last 7 days
  older_than:1m                       Older than 1 month
  after:2025/01/01                    After specific date
  label:INBOX                         In inbox

Examples:
  node google-gmail-api.cjs list
  node google-gmail-api.cjs today --json
  node google-gmail-api.cjs list "from:teammate subject:planning" --limit 100
  node google-gmail-api.cjs list "is:unread newer_than:7d"
  node google-gmail-api.cjs read 18abc123def
  node google-gmail-api.cjs thread 18abc123def
  node google-gmail-api.cjs send "team@your-company.com" "Update" "Here's the update..."
`);
}

// Format date for display - always show full date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today ${time}`;
  }
  return `${month} ${day}, ${time}`;
}

// Truncate string
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

// Extract name from "Name <email>" format
function extractName(str) {
  if (!str) return '';
  const match = str.match(/^([^<]+)</);
  if (match) return match[1].trim();
  // If no name, try to extract just email username
  const emailMatch = str.match(/([^@<]+)@/);
  return emailMatch ? emailMatch[1] : str;
}

// Get date query for convenience commands
function getDateQuery(type) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (type) {
    case 'today':
      return 'newer_than:1d';
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}/${String(yesterday.getMonth() + 1).padStart(2, '0')}/${String(yesterday.getDate()).padStart(2, '0')}`;
      const tStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
      return `after:${yStr} before:${tStr}`;
    }
    case 'week':
      return 'newer_than:7d';
    default:
      return '';
  }
}

// List messages with enhanced output
async function handleList(query, options) {
  const result = await gmailClient.listMessages(query, { maxResults: options.limit });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { messages, nextPageToken, stats } = result;

  if (messages.length === 0) {
    console.log('\nNo messages found.');
    return;
  }

  // Summary line
  let summary = `${messages.length} messages`;
  if (stats.unread > 0) {
    summary += ` (${stats.unread} unread`;
    if (stats.withAttachments > 0) {
      summary += `, ${stats.withAttachments} with attachments`;
    }
    summary += ')';
  } else if (stats.withAttachments > 0) {
    summary += ` (${stats.withAttachments} with attachments)`;
  }
  if (query) {
    summary += ` matching "${query}"`;
  }
  if (nextPageToken) {
    summary += ' - more available';
  }
  console.log(`\n${summary}\n`);

  // Message list
  for (const msg of messages) {
    const unread = msg.labelIds.includes('UNREAD') ? '*' : ' ';
    const attachment = msg.hasAttachments ? '[att]' : '    ';
    const from = truncate(extractName(msg.from), 20).padEnd(20);
    const subject = truncate(msg.subject || '(no subject)', 45);
    const date = formatDate(msg.date);

    console.log(`${unread} ${from}  ${subject}`);
    console.log(`  ${attachment} ${date.padEnd(18)}  thread:${msg.threadId}`);

    // Show snippet preview
    if (msg.snippet) {
      console.log(`  ${truncate(msg.snippet, 75)}`);
    }
    console.log(`  ${msg.url}`);
    console.log('');
  }
}

// Read a single message
async function handleRead(messageId, options) {
  const message = await gmailClient.getMessage(messageId, { rawHtml: options.rawHtml });

  if (options.json) {
    console.log(JSON.stringify(message, null, 2));
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`From:    ${message.from}`);
  console.log(`To:      ${message.to}`);
  if (message.cc) {
    console.log(`Cc:      ${message.cc}`);
  }
  console.log(`Date:    ${message.date}`);
  console.log(`Subject: ${message.subject}`);
  console.log(`Thread:  ${message.threadId}`);
  console.log(`URL:     ${message.url}`);
  console.log(`${'='.repeat(70)}\n`);
  console.log(message.body);

  if (message.attachments.length > 0) {
    console.log(`\nAttachments (${message.attachments.length}):`);
    message.attachments.forEach(att => {
      console.log(`   - ${att.filename} (${att.mimeType})`);
    });
  }
}

// Handle thread command - accepts both threadId and messageId
async function handleThread(id, options) {
  let threadId = id;

  // Try to get thread directly first, if it fails, try as messageId
  try {
    const thread = await gmailClient.getThread(threadId, { rawHtml: options.rawHtml });
    outputThread(thread, options);
  } catch (error) {
    if (error.code === 404 || error.message?.includes('not found')) {
      // Try looking up threadId from messageId
      try {
        console.error(`Note: "${id}" appears to be a message ID, looking up thread...`);
        threadId = await gmailClient.getThreadIdFromMessage(id);
        const thread = await gmailClient.getThread(threadId, { rawHtml: options.rawHtml });
        outputThread(thread, options);
      } catch (innerError) {
        throw new Error(`Could not find thread or message with ID "${id}". ` +
          `If you have a message ID from the list output, the thread ID is shown as "thread:XXXXX".`);
      }
    } else {
      throw error;
    }
  }
}

function outputThread(thread, options) {
  if (options.json) {
    console.log(JSON.stringify(thread, null, 2));
    return;
  }

  console.log(`\nThread: ${thread.messageCount} messages`);
  console.log(`   URL: ${thread.url}\n`);

  for (const msg of thread.messages) {
    console.log(`${'='.repeat(70)}`);
    console.log(`From: ${msg.from}`);
    console.log(`Date: ${msg.date}`);
    console.log(`URL:  ${msg.url}`);
    console.log(`${'='.repeat(70)}`);
    console.log(msg.body);
    console.log('');
  }
}

// Main execution
async function main() {
  const options = { limit, json: jsonOutput, rawHtml };

  try {
    switch (command) {
      // Account management commands
      case 'accounts': {
        const { accounts, default: defaultAccount } = googleAuth.listAccounts();
        if (options.json) {
          console.log(JSON.stringify({ accounts, default: defaultAccount }, null, 2));
        } else if (accounts.length === 0) {
          console.log('\nNo accounts configured. Run "add-account" to add one.\n');
        } else {
          console.log('\nConfigured accounts:\n');
          accounts.forEach(email => {
            const isDefault = email === defaultAccount ? ' (default)' : '';
            console.log(`   ${email}${isDefault}`);
          });
          console.log('');
        }
        break;
      }

      case 'add-account': {
        console.log('\nAdding new Google account...');
        const { email } = await googleAuth.addAccount();
        console.log(`\nAccount added: ${email}\n`);
        break;
      }

      case 'remove-account': {
        if (!cmdArgs[0]) {
          console.error('ERROR: email is required');
          console.error('Usage: remove-account <email>');
          process.exit(1);
        }
        googleAuth.removeAccount(cmdArgs[0]);
        console.log(`\nAccount removed: ${cmdArgs[0]}\n`);
        break;
      }

      case 'set-default': {
        if (!cmdArgs[0]) {
          console.error('ERROR: email is required');
          console.error('Usage: set-default <email>');
          process.exit(1);
        }
        googleAuth.setDefaultAccount(cmdArgs[0]);
        console.log(`\nDefault account set to: ${cmdArgs[0]}\n`);
        break;
      }

      // Convenience commands
      case 'today': {
        const query = getDateQuery('today');
        await handleList(query, options);
        break;
      }

      case 'yesterday': {
        const query = getDateQuery('yesterday');
        await handleList(query, options);
        break;
      }

      case 'week': {
        const query = getDateQuery('week');
        await handleList(query, options);
        break;
      }

      case 'inbox': {
        await handleList('label:INBOX', options);
        break;
      }

      case 'unread': {
        await handleList('is:unread', options);
        break;
      }

      case 'list': {
        const query = cmdArgs[0] || null;
        await handleList(query, options);
        break;
      }

      case 'read': {
        if (!cmdArgs[0]) {
          console.error('ERROR: messageId is required');
          console.error('Usage: read <messageId>');
          console.error('Tip: Get message IDs from the "list" command output');
          process.exit(1);
        }
        await handleRead(cmdArgs[0], options);
        break;
      }

      case 'thread': {
        if (!cmdArgs[0]) {
          console.error('ERROR: threadId is required');
          console.error('Usage: thread <threadId|messageId>');
          console.error('Tip: Thread IDs are shown as "thread:XXXXX" in list output');
          process.exit(1);
        }
        await handleThread(cmdArgs[0], options);
        break;
      }

      case 'send': {
        if (!cmdArgs[0] || !cmdArgs[1] || !cmdArgs[2]) {
          console.error('ERROR: to, subject, and body are required');
          console.error('Usage: send <to> <subject> <body>');
          process.exit(1);
        }

        const [to, subject, body] = cmdArgs;
        const result = await gmailClient.sendEmail(to, subject, body);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nEmail sent!`);
          console.log(`   To: ${to}`);
          console.log(`   Subject: ${subject}`);
          console.log(`   Message ID: ${result.id}`);
        }
        break;
      }

      case 'reply': {
        if (!cmdArgs[0] || !cmdArgs[1]) {
          console.error('ERROR: threadId and body are required');
          console.error('Usage: reply <threadId> <body>');
          process.exit(1);
        }

        const [threadId, body] = cmdArgs;
        const result = await gmailClient.replyToThread(threadId, body);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nReply sent!`);
          console.log(`   Thread ID: ${result.threadId}`);
          console.log(`   Message ID: ${result.id}`);
        }
        break;
      }

      case 'draft': {
        if (!cmdArgs[0] || !cmdArgs[1] || !cmdArgs[2]) {
          console.error('ERROR: to, subject, and body are required');
          console.error('Usage: draft <to> <subject> <body>');
          process.exit(1);
        }

        const [to, subject, body] = cmdArgs;
        const result = await gmailClient.createDraft(to, subject, body);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nDraft created!`);
          console.log(`   To: ${to}`);
          console.log(`   Subject: ${subject}`);
          console.log(`   Draft ID: ${result.id}`);
        }
        break;
      }

      case 'drafts': {
        const drafts = await gmailClient.listDrafts();

        if (options.json) {
          console.log(JSON.stringify(drafts, null, 2));
        } else if (drafts.length === 0) {
          console.log('\nNo drafts found.');
        } else {
          console.log(`\n${drafts.length} drafts:\n`);
          for (const draft of drafts) {
            console.log(`   ${draft.id}`);
          }
        }
        break;
      }

      case 'send-draft': {
        if (!cmdArgs[0]) {
          console.error('ERROR: draftId is required');
          process.exit(1);
        }

        const result = await gmailClient.sendDraft(cmdArgs[0]);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nDraft sent!`);
          console.log(`   Message ID: ${result.id}`);
        }
        break;
      }

      case 'labels': {
        const labels = await gmailClient.listLabels();

        if (options.json) {
          console.log(JSON.stringify(labels, null, 2));
        } else {
          console.log(`\n${labels.length} labels:\n`);

          const system = labels.filter(l => l.type === 'system');
          const user = labels.filter(l => l.type === 'user');

          console.log('System labels:');
          system.forEach(l => console.log(`   ${l.name.padEnd(20)} [${l.id}]`));

          if (user.length > 0) {
            console.log('\nUser labels:');
            user.forEach(l => console.log(`   ${l.name.padEnd(20)} [${l.id}]`));
          }
        }
        break;
      }

      case 'archive': {
        if (!cmdArgs[0]) {
          console.error('ERROR: messageId is required');
          process.exit(1);
        }

        await gmailClient.archive(cmdArgs[0]);

        if (options.json) {
          console.log(JSON.stringify({ success: true, messageId: cmdArgs[0], action: 'archived' }, null, 2));
        } else {
          console.log(`\nMessage archived: ${cmdArgs[0]}`);
        }
        break;
      }

      case 'trash': {
        if (!cmdArgs[0]) {
          console.error('ERROR: messageId is required');
          process.exit(1);
        }

        await gmailClient.trash(cmdArgs[0]);

        if (options.json) {
          console.log(JSON.stringify({ success: true, messageId: cmdArgs[0], action: 'trashed' }, null, 2));
        } else {
          console.log(`\nMessage moved to trash: ${cmdArgs[0]}`);
        }
        break;
      }

      case 'mark-read': {
        if (!cmdArgs[0]) {
          console.error('ERROR: messageId is required');
          process.exit(1);
        }

        await gmailClient.markAsRead(cmdArgs[0]);

        if (options.json) {
          console.log(JSON.stringify({ success: true, messageId: cmdArgs[0], action: 'marked_read' }, null, 2));
        } else {
          console.log(`\nMarked as read: ${cmdArgs[0]}`);
        }
        break;
      }

      case 'mark-unread': {
        if (!cmdArgs[0]) {
          console.error('ERROR: messageId is required');
          process.exit(1);
        }

        await gmailClient.markAsUnread(cmdArgs[0]);

        if (options.json) {
          console.log(JSON.stringify({ success: true, messageId: cmdArgs[0], action: 'marked_unread' }, null, 2));
        } else {
          console.log(`\nMarked as unread: ${cmdArgs[0]}`);
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
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ error: error.message }, null, 2));
    } else {
      console.error(`\nError: ${error.message}`);
      if (error.errors) {
        console.error('Details:', JSON.stringify(error.errors, null, 2));
      }
      if (error.response?.data?.error) {
        console.error('API Error:', JSON.stringify(error.response.data.error, null, 2));
      }
    }
    process.exit(1);
  }
}

main();
