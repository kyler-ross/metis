# Script Runner Migration Guide

## Quick Migration

1. Add import:
   ```js
   const { run } = require('./lib/script-runner.cjs');
   ```

2. Replace `process.exit(1)` with `throw new Error('descriptive message')`
3. Replace `process.exit(0)` with `return`

4. Wrap main logic:
   ```js
   run({
     name: 'script-name',
     mode: 'operational',  // or 'diagnostic' for health checks
     services: [],          // services needing auth: 'jira', 'google', 'slack', etc.
   }, async (ctx) => {
     // your script logic here
   });
   ```

## Mode Reference

| Mode | Exit 0 | Exit 1 | Use Case |
|------|--------|--------|----------|
| `diagnostic` | Always (errors logged but exit 0) | Never | Health checks, validators |
| `operational` | On success | On any error | Normal scripts |
| `ci` | On success | On any error | CI/CD pipelines |

### Argument Validation

```js
run({
  name: 'my-script',
  mode: 'operational',
  services: ['jira'],
  description: 'Manage Jira tickets',  // shown in --help output
  args: {
    required: ['command'],              // auto-validates, prints usage if missing
    optional: ['--limit', '--filter'],  // shown in --help
    booleanFlags: ['dry-run', 'force'], // parsed as true/false, don't consume next arg
  },
}, async (ctx) => {
  const command = ctx.args.positional[0];  // 'command' from required
  const limit = ctx.args.flags.limit;      // from --limit=10 or --limit 10
  const dryRun = ctx.args.flags['dry-run']; // true if --dry-run passed
});
```

### Retry Options

```js
const result = await ctx.withRetry(fn, {
  service: 'jira',        // for error guidance (default: first service in config)
  maxRetries: 3,          // max retry attempts (default: 3)
  baseDelayMs: 1000,      // base delay for exponential backoff (default: 1000)
  maxDelayMs: 15000,      // maximum delay cap (default: 15000)
  onRetry: (attempt, error, delayMs) => {
    console.log(`Retry ${attempt}: ${error.message}, waiting ${delayMs}ms`);
  },
});
// Automatically respects Retry-After headers from 429 responses
```

## Context Object

| Property | Type | Description |
|----------|------|-------------|
| `ctx.args` | `{positional, flags, raw}` | Parsed argv |
| `ctx.log` | `{info, warn, error}` | Structured logger (writes to stderr) |
| `ctx.report()` | Function | Diagnostic report output |
| `ctx.withRetry()` | Function | Retry with exponential backoff |
| `ctx.name` | string | Script name |
| `ctx.mode` | string | Current mode |
| `ctx.services` | string[] | Declared services |

## Retry Status

`ctx.withRetry()` is available in all scripts via the runner. Currently, retry logic lives in individual client libraries (e.g., `slack-client.cjs`). Wiring `ctx.withRetry()` into API call sites is planned for phase 2. For now, use it when adding new API calls:

```js
const data = await ctx.withRetry(() => fetchFromApi(), {
  service: 'jira',
  maxRetries: 3,
});
```

## Python

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from script_runner import run

def main(ctx):
    ctx.log.info('Starting...')
    # your logic

run('script-name', main, mode='operational', services=['google'])
```

### Python vs JS Differences

| Feature | JS (`script-runner.cjs`) | Python (`script_runner.py`) |
|---------|--------------------------|----------------------------|
| `ctx.args` | `{positional, flags, raw}` object | Plain `list` (sys.argv[1:]) |
| `ctx.withRetry()` | Available | Not available |
| `ctx.services` | Available | Not available |
| `ctx.report()` | Available | Available |
| `ctx.log` | `.info()`, `.warn()`, `.error()` | `.info()`, `.warn()`, `.error()` |
| Arg validation | Via `args: {required, optional, booleanFlags}` | Not available (use argparse) |
| `--help` generation | Automatic from config | Not available |
| Telemetry | Integrated (PostHog) | Basic (stderr only) |
| Function signature | `run(config, fn)` | `run(name, main, mode, services)` |
