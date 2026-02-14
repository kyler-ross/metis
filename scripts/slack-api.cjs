#!/usr/bin/env node
/**
 * Slack API CLI
 *
 * Command-line interface for Slack operations.
 *
 * Usage:
 *   node slack-api.js <command> [args...]
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
const { run } = require('./lib/script-runner.cjs');

const HELP = `
Slack API CLI

Usage:
  node slack-api.js <command> [args...]

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
  node slack-api.js channels
  node slack-api.js post C0123456 "Hello team!"
  node slack-api.js history C0123456 50
  node slack-api.js user-by-email kyler@cloaked.id
`;

run({
  name: 'slack-api',
  mode: 'operational',
  services: ['slack'],
}, async (ctx) => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

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
        throw new Error('channel_id required. Usage: node slack-api.js channel-info <channel_id>');
      }
      result = await slack.getChannelInfo(channelId);
      break;
    }

    case 'channel-members': {
      const channelId = args[1];
      if (!channelId) {
        throw new Error('channel_id required. Usage: node slack-api.js channel-members <channel_id>');
      }
      result = await slack.listChannelMembers(channelId);
      break;
    }

    // Message commands
    case 'post': {
      const channel = args[1];
      const text = args.slice(2).join(' ');
      if (!channel || !text) {
        throw new Error('channel and text required. Usage: node slack-api.js post <channel> <text>');
      }
      result = await slack.postMessage(channel, text);
      break;
    }

    case 'update': {
      const channel = args[1];
      const ts = args[2];
      const text = args.slice(3).join(' ');
      if (!channel || !ts || !text) {
        throw new Error('channel, ts, and text required. Usage: node slack-api.js update <channel> <ts> <text>');
      }
      result = await slack.updateMessage(channel, ts, text);
      break;
    }

    case 'reply': {
      const channel = args[1];
      const threadTs = args[2];
      const text = args.slice(3).join(' ');
      if (!channel || !threadTs || !text) {
        throw new Error('channel, thread_ts, and text required. Usage: node slack-api.js reply <channel> <thread_ts> <text>');
      }
      result = await slack.postThreadReply(channel, threadTs, text);
      break;
    }

    case 'history': {
      const channel = args[1];
      const limit = parseInt(args[2]) || 20;
      if (!channel) {
        throw new Error('channel required. Usage: node slack-api.js history <channel> [limit]');
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
        throw new Error('query required. Usage: node slack-api.js search <query>');
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
        throw new Error('user_id required. Usage: node slack-api.js user <user_id>');
      }
      result = await slack.getUserInfo(userId);
      break;
    }

    case 'user-by-email': {
      const email = args[1];
      if (!email) {
        throw new Error('email required. Usage: node slack-api.js user-by-email <email>');
      }
      result = await slack.getUserByEmail(email);
      break;
    }

    // DM commands
    case 'send-dm': {
      const email = args[1];
      const text = args.slice(2).join(' ');
      if (!email || !text) {
        throw new Error('email and text required. Usage: node slack-api.js send-dm <email> <text>');
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
      console.log(HELP);
      throw new Error(`Unknown command: ${command}`);
  }

  console.log(JSON.stringify(result, null, 2));
});
