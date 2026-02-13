// PM AI Starter Kit - slack-api.cjs
// See scripts/README.md for setup
#!/usr/bin/env node
/**
 * Slack API CLI
 *
 * Command-line interface for Slack operations.
 *
 * Usage:
 *   node slack-api.cjs <command> [args...]
 *
 * Commands:
 *   channels                    List channels
 *   channel-info <id>           Get channel details
 *   channel-members <id>        List members in channel
 *   post <channel> <text>       Post message
 *   update <channel> <ts> <text> Update a message
 *   reply <channel> <ts> <text> Reply in thread
 *   history <channel>           Get recent messages
 *   search <query>              Search messages
 *   users                       List users
 *   user <id>                   Get user info
 *   user-by-email <email>       Find user by email
 *   send-dm <email> <text>      Send DM to user by email
 *   auth-test                   Test authentication
 */

const slack = require('./lib/slack-client.cjs');

const HELP = `
Slack API CLI

Usage:
  node slack-api.cjs <command> [args...]

Channel Commands:
  channels                       List all channels
  channel-info <channel_id>      Get channel details
  channel-members <channel_id>   List members in channel

Message Commands:
  post <channel> <text>          Post message to channel
  update <channel> <ts> <text>   Update an existing message
  reply <channel> <ts> <text>    Reply in thread
  history <channel> [limit]      Get recent messages (default: 20)
  search <query>                 Search messages

User Commands:
  users                          List all users
  user <user_id>                 Get user info
  user-by-email <email>          Find user by email

DM Commands:
  send-dm <email> <text>         Send DM to user by email

Utility:
  auth-test                      Test authentication

Examples:
  node slack-api.cjs channels
  node slack-api.cjs post C0123456 "Hello team!"
  node slack-api.cjs history C0123456 50
  node slack-api.cjs user-by-email user@example.com
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  try {
    let result;

    switch (command) {
      // Channel commands
      case 'channels': {
        const channels = await slack.listChannels();
        result = channels.map(ch => ({
          id: ch.id,
          name: ch.name,
          is_private: ch.is_private,
          num_members: ch.num_members
        }));
        break;
      }

      case 'channel-info': {
        const channelId = args[1];
        if (!channelId) {
          console.error('Error: channel_id required');
          console.error('Usage: node slack-api.cjs channel-info <channel_id>');
          process.exit(1);
        }
        result = await slack.getChannelInfo(channelId);
        break;
      }

      case 'channel-members': {
        const channelId = args[1];
        if (!channelId) {
          console.error('Error: channel_id required');
          console.error('Usage: node slack-api.cjs channel-members <channel_id>');
          process.exit(1);
        }
        result = await slack.listChannelMembers(channelId);
        break;
      }

      // Message commands
      case 'post': {
        const channel = args[1];
        const text = args.slice(2).join(' ');
        if (!channel || !text) {
          console.error('Error: channel and text required');
          console.error('Usage: node slack-api.cjs post <channel> <text>');
          process.exit(1);
        }
        result = await slack.postMessage(channel, text);
        break;
      }

      case 'update': {
        const channel = args[1];
        const ts = args[2];
        const text = args.slice(3).join(' ');
        if (!channel || !ts || !text) {
          console.error('Error: channel, ts, and text required');
          console.error('Usage: node slack-api.cjs update <channel> <ts> <text>');
          process.exit(1);
        }
        result = await slack.updateMessage(channel, ts, text);
        break;
      }

      case 'reply': {
        const channel = args[1];
        const threadTs = args[2];
        const text = args.slice(3).join(' ');
        if (!channel || !threadTs || !text) {
          console.error('Error: channel, thread_ts, and text required');
          console.error('Usage: node slack-api.cjs reply <channel> <thread_ts> <text>');
          process.exit(1);
        }
        result = await slack.postThreadReply(channel, threadTs, text);
        break;
      }

      case 'history': {
        const channel = args[1];
        const limit = parseInt(args[2]) || 20;
        if (!channel) {
          console.error('Error: channel required');
          console.error('Usage: node slack-api.cjs history <channel> [limit]');
          process.exit(1);
        }
        const messages = await slack.getMessages(channel, { limit });
        result = messages.map(msg => ({
          ts: msg.ts,
          user: msg.user,
          text: msg.text?.substring(0, 100) + (msg.text?.length > 100 ? '...' : ''),
          thread_ts: msg.thread_ts
        }));
        break;
      }

      case 'search': {
        const query = args.slice(1).join(' ');
        if (!query) {
          console.error('Error: query required');
          console.error('Usage: node slack-api.cjs search <query>');
          process.exit(1);
        }
        result = await slack.searchMessages(query);
        break;
      }

      // User commands
      case 'users': {
        const users = await slack.listUsers();
        result = users
          .filter(u => !u.deleted && !u.is_bot)
          .map(u => ({
            id: u.id,
            name: u.name,
            real_name: u.real_name,
            email: u.profile?.email
          }));
        break;
      }

      case 'user': {
        const userId = args[1];
        if (!userId) {
          console.error('Error: user_id required');
          console.error('Usage: node slack-api.cjs user <user_id>');
          process.exit(1);
        }
        result = await slack.getUserInfo(userId);
        break;
      }

      case 'user-by-email': {
        const email = args[1];
        if (!email) {
          console.error('Error: email required');
          console.error('Usage: node slack-api.cjs user-by-email <email>');
          process.exit(1);
        }
        result = await slack.getUserByEmail(email);
        break;
      }

      // DM commands
      case 'send-dm': {
        const email = args[1];
        const text = args.slice(2).join(' ');
        if (!email || !text) {
          console.error('Error: email and text required');
          console.error('Usage: node slack-api.cjs send-dm <email> <text>');
          process.exit(1);
        }
        result = await slack.sendDMByEmail(email, text);
        break;
      }

      // Utility
      case 'auth-test': {
        result = await slack.testAuth();
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.data) {
      console.error('Details:', JSON.stringify(error.data, null, 2));
    }
    process.exit(1);
  }
}

main();
