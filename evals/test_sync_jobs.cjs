#!/usr/bin/env node
'use strict';
const assert = require('assert');
const path = require('path');
const { buildJobEntry, buildJobConfig, serializeDependencies, appendUserFlag } = require(path.resolve(__dirname, '..', 'scheduler', 'sync-jobs.cjs'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS: ${name}`); }
  catch (err) { failed++; console.error(`  FAIL: ${name}: ${err.stack}`); }
}

console.log('Testing sync-jobs.cjs helpers\n');

// appendUserFlag tests
test('appendUserFlag appends --user=<id>', () => {
  assert.strictEqual(appendUserFlag('node script.cjs', 'lucas'), 'node script.cjs --user=lucas');
});
test('appendUserFlag returns null for null command', () => {
  assert.strictEqual(appendUserFlag(null, 'lucas'), null);
});
test('appendUserFlag returns undefined for undefined command', () => {
  assert.strictEqual(appendUserFlag(undefined, 'lucas'), undefined);
});

// serializeDependencies tests
test('serializeDependencies rewrites multi-user deps', () => {
  const result = serializeDependencies(['push-granola-tokens', 'some-shared-job'], 'kyler', new Set(['push-granola-tokens']));
  const parsed = JSON.parse(result);
  assert.deepStrictEqual(parsed, ['push-granola-tokens--kyler', 'some-shared-job']);
  assert(parsed[0].includes('--kyler'), 'Multi-user dep should be suffixed with user ID');
  assert(!parsed[1].includes('--'), 'Non-multi-user dep should be unchanged');
});
test('serializeDependencies returns null for null deps', () => {
  assert.strictEqual(serializeDependencies(null, 'kyler', new Set()), null);
});
test('serializeDependencies leaves non-multi-user deps unchanged', () => {
  const result = serializeDependencies(['shared-job'], 'kyler', new Set(['other-job']));
  assert.deepStrictEqual(JSON.parse(result), ['shared-job']);
});
test('serializeDependencies returns empty array JSON for empty deps', () => {
  const result = serializeDependencies([], 'kyler', new Set());
  assert.deepStrictEqual(JSON.parse(result), []);
});

// buildJobEntry tests - single instance (no userId)
test('buildJobEntry creates single-instance job', () => {
  const job = { name: 'test-job', type: 'script', environment: 'cloud', schedule: '0 8 * * 1-5', script: { command: 'node test.js' } };
  const entry = buildJobEntry(job);
  assert.strictEqual(entry.id, 'test-job');
  assert.strictEqual(entry.name, 'test-job');
  assert.strictEqual(entry.type, 'script');
  assert.strictEqual(entry.schedule, '0 8 * * 1-5');
  const config = JSON.parse(entry.config);
  assert.strictEqual(config.script.command, 'node test.js');
  assert(!config.user_id, 'Should not have user_id for single-instance');
});

// buildJobEntry tests - multi-user instance
test('buildJobEntry creates per-user job with --user flag', () => {
  const job = { name: 'daily-report', type: 'script', schedule: '15 8 * * 1-5', timezone: 'America/New_York', script: { command: 'node report.cjs' } };
  const user = { schedule_overrides: { 'daily-report': '30 9 * * 1-5' }, timezone: 'America/Los_Angeles' };
  const entry = buildJobEntry(job, { userId: 'lucas', user, multiUserJobNames: new Set() });
  assert.strictEqual(entry.id, 'daily-report--lucas');
  assert.strictEqual(entry.schedule, '30 9 * * 1-5'); // user override
  assert.strictEqual(entry.timezone, 'America/Los_Angeles'); // user timezone
  const config = JSON.parse(entry.config);
  assert.strictEqual(config.user_id, 'lucas');
  assert.strictEqual(config.script.command, 'node report.cjs --user=lucas');
});

// buildJobEntry - user without schedule override uses job default
test('buildJobEntry uses job default schedule when no user override', () => {
  const job = { name: 'daily-report', type: 'script', schedule: '15 8 * * 1-5', script: { command: 'node report.cjs' } };
  const user = { schedule_overrides: {}, timezone: 'America/New_York' };
  const entry = buildJobEntry(job, { userId: 'kyler', user, multiUserJobNames: new Set() });
  assert.strictEqual(entry.schedule, '15 8 * * 1-5'); // job default
});

// buildJobEntry - multi-user with dependency expansion
test('buildJobEntry expands multi-user dependencies', () => {
  const job = { name: 'daily-report', type: 'script', after: ['push-granola-tokens'], script: { command: 'node report.cjs' } };
  const user = { timezone: 'America/New_York' };
  const multiUserJobNames = new Set(['push-granola-tokens']);
  const entry = buildJobEntry(job, { userId: 'kyler', user, multiUserJobNames });
  assert.strictEqual(entry.depends_on, JSON.stringify(['push-granola-tokens--kyler']));
});

// buildJobEntry - defaults environment to 'cloud'
test('buildJobEntry defaults environment to cloud', () => {
  const job = { name: 'test', type: 'agent-run' };
  const entry = buildJobEntry(job);
  assert.strictEqual(entry.environment, 'cloud');
});

// buildJobEntry - status defaults to active
test('buildJobEntry defaults status to active', () => {
  const job = { name: 'test', type: 'script' };
  const entry = buildJobEntry(job);
  assert.strictEqual(entry.status, 'active');
});

// buildJobConfig tests
test('buildJobConfig creates config without user_id for single-instance', () => {
  const job = { name: 'test', type: 'script', script: { command: 'node test.js', timeout_seconds: 30 } };
  const config = buildJobConfig(job);
  assert.strictEqual(config.script.command, 'node test.js');
  assert.strictEqual(config.script.timeout_seconds, 30);
  assert(!config.user_id, 'Should not have user_id');
});

test('buildJobConfig adds user_id and --user flag for multi-user', () => {
  const job = { name: 'test', type: 'script', script: { command: 'node test.js' } };
  const config = buildJobConfig(job, 'lucas');
  assert.strictEqual(config.user_id, 'lucas');
  assert.strictEqual(config.script.command, 'node test.js --user=lucas');
});

test('buildJobConfig handles job without script', () => {
  const job = { name: 'test', type: 'agent-run', agent: { prompt: 'do stuff' } };
  const config = buildJobConfig(job);
  assert.strictEqual(config.script, null);
  assert.deepStrictEqual(config.agent, { prompt: 'do stuff' });
});

// buildJobEntry - missing schedule
test('buildJobEntry handles missing schedule gracefully', () => {
  const job = { name: 'no-schedule', type: 'script', script: { command: 'node test.js' } };
  const entry = buildJobEntry(job);
  assert.strictEqual(entry.schedule, null);
});

test('buildJobEntry with user but no schedule override uses job default', () => {
  const job = { name: 'test-job', type: 'script', schedule: '0 9 * * 1-5', script: { command: 'node test.js' } };
  const user = { timezone: 'America/New_York' };
  const entry = buildJobEntry(job, { userId: 'lucas', user, multiUserJobNames: new Set() });
  assert.strictEqual(entry.schedule, '0 9 * * 1-5');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
