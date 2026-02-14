#!/usr/bin/env node
/**
 * Update PM Confluence Homepage
 *
 * Updates the PM space root page (ID: 131403) with the new hub design.
 *
 * Usage:
 *   node .ai/scripts/update-pm-homepage.js [--dry-run]
 *
 * Options:
 *   --dry-run  Preview the generated content without updating Confluence
 */

const { confluence } = require('./lib/confluence-client.js');
const { createRootHomepage } = require('./lib/confluence-templates.js');

const PM_HOMEPAGE_ID = '131403';
const PRD_DIRECTORY_ID = '801440083';
const EXPERIMENT_DIRECTORY_ID = '801767852';

// Product area hub page IDs (if they exist)
// These will fall back to label search if not provided
const PRODUCT_AREA_HUBS = {
  // 'data-removal': 'PAGE_ID_HERE',
  // 'call-guard': 'PAGE_ID_HERE',
  // 'identity': 'PAGE_ID_HERE',
  // 'cloaked-pay': 'PAGE_ID_HERE',
  // 'growth': 'PAGE_ID_HERE',
  // 'ai-voice': 'PAGE_ID_HERE'
};

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('PM Confluence Homepage Update');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Step 1: Get current page to get version number
    console.log('\n1. Fetching current homepage...');
    const currentPage = await confluence.getPage(PM_HOMEPAGE_ID, ['version']);
    console.log(`   Current version: ${currentPage.version.number}`);
    console.log(`   Title: ${currentPage.title}`);

    // Step 2: Generate new content
    console.log('\n2. Generating new homepage content...');
    const newContent = createRootHomepage({
      prdDirectoryId: PRD_DIRECTORY_ID,
      experimentDirectoryId: EXPERIMENT_DIRECTORY_ID,
      productAreaHubs: PRODUCT_AREA_HUBS
    });
    console.log(`   Generated ${newContent.length} characters of content`);

    if (isDryRun) {
      console.log('\n3. [DRY RUN] Preview of generated content:\n');
      console.log('-'.repeat(60));
      // Show first 2000 chars
      console.log(newContent.slice(0, 2000));
      if (newContent.length > 2000) {
        console.log(`\n... (${newContent.length - 2000} more characters)`);
      }
      console.log('-'.repeat(60));
      console.log('\n✅ Dry run complete. Run without --dry-run to apply changes.');
      return;
    }

    // Step 3: Update the page
    console.log('\n3. Updating homepage...');
    const updatedPage = await confluence.updatePage(
      PM_HOMEPAGE_ID,
      currentPage.title, // Keep the same title
      newContent,
      currentPage.version.number
    );

    console.log(`   ✅ Updated to version: ${updatedPage.version.number}`);
    console.log(`   View at: https://yourcompany.atlassian.net/wiki/spaces/PM/pages/${PM_HOMEPAGE_ID}`);

    console.log('\n' + '='.repeat(60));
    console.log('Homepage update complete!');
    console.log('='.repeat(60));

  } catch (error) {
    throw new Error(`Homepage update failed: ${error.message}${error.body ? ` Response: ${error.body.slice(0, 500)}` : ''}`);
  }
}

const { run } = require('./lib/script-runner.cjs');
run({
  name: 'update-pm-homepage',
  mode: 'operational',
  services: ['confluence'],
}, async (ctx) => {
  await main();
});
