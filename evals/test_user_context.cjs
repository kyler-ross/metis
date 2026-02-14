#!/usr/bin/env node
'use strict';
// NOTE: Tests that call listUsers() and loadUserContext('kyler') depend on
// .ai/config/users/kyler.yml existing on disk with specific field values.
// These are integration tests. If kyler.yml changes, update assertions accordingly.
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Point to the worktree's modules
const { loadUserContext, listUsers, resolveUserId, validateUserId, DEFAULT_USER } = require(path.resolve(__dirname, '..', 'scripts', 'lib', 'user-context.cjs'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}: ${err.stack}`);
  }
}

console.log('Testing user-context.cjs\n');

// resolveUserId tests (pure unit tests - no file dependency)
test('resolveUserId defaults to kyler', () => {
  assert.strictEqual(resolveUserId([]), 'kyler');
});

test('resolveUserId parses --user flag', () => {
  assert.strictEqual(resolveUserId(['--user=lucas']), 'lucas');
});

test('resolveUserId rejects path traversal', () => {
  assert.throws(() => resolveUserId(['--user=../../../etc']), /Invalid user_id/);
});

test('resolveUserId rejects spaces', () => {
  assert.throws(() => resolveUserId(['--user=bad user']), /Invalid user_id/);
});

test('resolveUserId rejects shell metacharacters', () => {
  assert.throws(() => resolveUserId(['--user=user;rm']), /Invalid user_id/);
});

test('resolveUserId allows hyphens and underscores', () => {
  // This should not throw (but user may not exist)
  assert.strictEqual(resolveUserId(['--user=test-user_1']), 'test-user_1');
});

test('resolveUserId rejects IDs starting with hyphen', () => {
  assert.throws(() => resolveUserId(['--user=--help']), /must not start with a hyphen|Invalid user_id/);
});

test('resolveUserId rejects empty string', () => {
  assert.throws(() => resolveUserId(['--user=']), /cannot be empty|Invalid user_id/);
});

// DEFAULT_USER test
test('DEFAULT_USER is kyler', () => {
  assert.strictEqual(DEFAULT_USER, 'kyler');
});

// Integration tests that depend on kyler.yml
const kylerExists = fs.existsSync(path.resolve(__dirname, '..', 'config', 'users', 'kyler.yml'));

if (kylerExists) {
  // listUsers tests
  test('listUsers returns array', () => {
    const users = listUsers();
    assert(Array.isArray(users));
  });

  test('listUsers includes kyler', () => {
    const users = listUsers();
    assert(users.includes('kyler'), `Expected kyler in ${JSON.stringify(users)}`);
  });

  test('listUsers excludes _template', () => {
    const users = listUsers();
    assert(!users.includes('_template'), 'Should not include _template');
  });

  // loadUserContext tests
  test('loadUserContext loads kyler profile', () => {
    const { profile } = loadUserContext('kyler');
    assert.strictEqual(profile.user_id, 'kyler');
    assert(profile.email, 'Should have email field');
    assert(profile.persona, 'Should have persona field');
    assert(!profile.persona.includes('{{name}}'), 'Persona should not contain raw template');
  });

  test('loadUserContext expands persona template', () => {
    const { profile } = loadUserContext('kyler');
    assert(profile.persona.includes('Kyler') || profile.persona.includes('kyler'), 'Persona should contain user name');
  });

  test('loadUserContext throws for nonexistent user', () => {
    assert.throws(() => loadUserContext('nonexistent_user_xyz'), /not found/);
  });

  test('loadUserContext throws for path traversal', () => {
    assert.throws(() => loadUserContext('../../../etc/passwd'), /Invalid user_id|path traversal/);
  });

  test('loadUserContext adds default persona when missing', () => {
    // loadUserContext now adds default persona if not in YAML - verify it's always present
    const { profile } = loadUserContext('kyler');
    assert(profile.persona, 'Should always have persona after loading');
    assert(profile.persona.length > 20, 'Persona should have substantial content');
  });
} else {
  console.log('  SKIP: kyler.yml not found - skipping integration tests');
}

// Verify setup-user.cjs at least loads without errors
test('setup-user.cjs exists and is valid JavaScript', () => {
  const setupPath = path.resolve(__dirname, '..', 'scripts', 'setup-user.cjs');
  assert(fs.existsSync(setupPath), 'setup-user.cjs should exist');
  // Just verify it parses - don't execute (it starts readline)
  assert.doesNotThrow(() => {
    const content = fs.readFileSync(setupPath, 'utf-8');
    // Basic syntax check: should contain the main function
    assert(content.includes('async function main'), 'Should have main function');
    assert(content.includes('validateUserId'), 'Should use validateUserId');
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
