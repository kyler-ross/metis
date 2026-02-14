#!/bin/bash
set -e
echo "Running JS library tests..."
node --test \
  .ai/evals/js/test-script-runner.cjs \
  .ai/evals/js/test-structured-output.cjs \
  .ai/evals/js/test-with-retry.cjs \
  .ai/evals/js/test-run-integration.cjs \
  .ai/evals/js/test-error-categories.cjs \
  .ai/evals/js/test-smoke-migrated.cjs
echo "All JS tests passed!"
