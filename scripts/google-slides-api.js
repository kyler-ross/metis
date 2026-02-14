#!/usr/bin/env node
/**
 * Google Slides API CLI
 *
 * Command-line interface for Google Slides operations.
 *
 * Usage:
 *   node google-slides-api.js info <presentationId>           - Get presentation info
 *   node google-slides-api.js list <presentationId>           - List all slides
 *   node google-slides-api.js text <presentationId> [index]   - Get text from slide(s)
 *   node google-slides-api.js create <title>                  - Create new presentation
 *   node google-slides-api.js duplicate <id> <newTitle>       - Copy presentation
 *   node google-slides-api.js add-slide <id> [layout]         - Add new slide
 *   node google-slides-api.js delete-slide <id> <slideId>     - Delete slide
 *   node google-slides-api.js add-text <id> <slideId> <text>  - Add text box
 *   node google-slides-api.js replace <id> <find> <replace>   - Replace text
 *
 * Examples:
 *   node google-slides-api.js info 1abc123def456
 *   node google-slides-api.js list 1abc123def456
 *   node google-slides-api.js text 1abc123def456 0
 *   node google-slides-api.js create "Q4 Review"
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

const slidesClient = require('./lib/slides-client.js');
const { run } = require('./lib/script-runner.cjs');

// Help text
function showHelp() {
  console.log(`
Google Slides API CLI

Usage:
  node google-slides-api.js <command> [arguments]

Commands:
  info <presentationId>               Get presentation metadata
  list <presentationId>               List all slides with titles
  text <presentationId> [slideIndex]  Get text from slide (or all slides if no index)
  create <title>                      Create new blank presentation
  duplicate <id> <newTitle>           Copy existing presentation
  add-slide <id> [layout]             Add new slide (layout: BLANK, TITLE, etc.)
  delete-slide <id> <slideObjectId>   Delete a slide by its object ID
  add-text <id> <slideId> <text>      Add text box to slide
  replace <id> <find> <replace>       Replace text in entire presentation

Layout Options:
  BLANK, TITLE, TITLE_AND_BODY, TITLE_AND_TWO_COLUMNS,
  TITLE_ONLY, SECTION_HEADER, SECTION_TITLE_AND_DESCRIPTION,
  ONE_COLUMN_TEXT, MAIN_POINT, BIG_NUMBER

Examples:
  node google-slides-api.js info 1abc123def456ghi789
  node google-slides-api.js list 1abc123def456ghi789
  node google-slides-api.js text 1abc123def456ghi789 0
  node google-slides-api.js create "Q4 Review Deck"
  node google-slides-api.js duplicate 1abc... "Copy of Deck"
  node google-slides-api.js add-slide 1abc... TITLE
  node google-slides-api.js replace 1abc... "{{NAME}}" "John Smith"
`);
}

run({
  name: 'google-slides-api',
  mode: 'operational',
  services: ['google'],
}, async (ctx) => {
  const command = ctx.args.positional[0];
  const cmdArgs = ctx.args.positional.slice(1);

  switch (command) {
    case 'info': {
      if (!cmdArgs[0]) {
        throw new Error('presentationId is required');
      }
      const presentation = await slidesClient.getPresentation(cmdArgs[0]);
      console.log(`Title: ${presentation.title}`);
      console.log(`ID: ${presentation.presentationId}`);
      console.log(`Slides: ${presentation.slides ? presentation.slides.length : 0}`);
      console.log(`Width: ${presentation.pageSize.width.magnitude} ${presentation.pageSize.width.unit}`);
      console.log(`Height: ${presentation.pageSize.height.magnitude} ${presentation.pageSize.height.unit}`);
      console.log(`Link: https://docs.google.com/presentation/d/${presentation.presentationId}/edit`);
      break;
    }

    case 'list': {
      if (!cmdArgs[0]) {
        throw new Error('presentationId is required');
      }
      const slides = await slidesClient.listSlides(cmdArgs[0]);
      console.log(`${slides.length} slides:\n`);
      for (const slide of slides) {
        console.log(`  ${slide.index}: ${slide.title} (${slide.objectId}, ${slide.elementCount} elements)`);
      }
      break;
    }

    case 'text': {
      if (!cmdArgs[0]) {
        throw new Error('presentationId is required');
      }
      if (cmdArgs[1] !== undefined) {
        // Get text from specific slide
        const text = await slidesClient.getSlideText(cmdArgs[0], parseInt(cmdArgs[1]));
        console.log(text || '(no text on this slide)');
      } else {
        // Get all text from all slides
        const allText = await slidesClient.getAllText(cmdArgs[0]);
        for (const slide of allText) {
          console.log(`\n--- Slide ${slide.slideIndex} (${slide.objectId}) ---`);
          if (slide.texts.length > 0) {
            console.log(slide.texts.join('\n'));
          } else {
            console.log('(no text)');
          }
        }
      }
      break;
    }

    case 'create': {
      if (!cmdArgs[0]) {
        throw new Error('title is required');
      }
      const presentation = await slidesClient.createPresentation(cmdArgs[0]);
      console.log(`Created: ${presentation.title}`);
      console.log(`ID: ${presentation.presentationId}`);
      console.log(`Slides: ${presentation.slideCount}`);
      console.log(`Link: ${presentation.webViewLink}`);
      break;
    }

    case 'duplicate': {
      if (!cmdArgs[0] || !cmdArgs[1]) {
        throw new Error('presentationId and newTitle are required');
      }
      const copy = await slidesClient.duplicatePresentation(cmdArgs[0], cmdArgs[1]);
      console.log(`Created copy: ${copy.title}`);
      console.log(`ID: ${copy.presentationId}`);
      console.log(`Link: ${copy.webViewLink}`);
      break;
    }

    case 'add-slide': {
      if (!cmdArgs[0]) {
        throw new Error('presentationId is required');
      }
      const layout = cmdArgs[1] || 'BLANK';
      const result = await slidesClient.addSlide(cmdArgs[0], layout);
      console.log(`Added slide: ${result.objectId}`);
      console.log(`Layout: ${layout}`);
      break;
    }

    case 'delete-slide': {
      if (!cmdArgs[0] || !cmdArgs[1]) {
        throw new Error('presentationId and slideObjectId are required');
      }
      await slidesClient.deleteSlide(cmdArgs[0], cmdArgs[1]);
      console.log(`Deleted slide: ${cmdArgs[1]}`);
      break;
    }

    case 'add-text': {
      if (!cmdArgs[0] || !cmdArgs[1] || !cmdArgs[2]) {
        throw new Error('presentationId, slideObjectId, and text are required');
      }
      const result = await slidesClient.addTextBox(cmdArgs[0], cmdArgs[1], cmdArgs[2]);
      console.log(`Added text box: ${result.objectId}`);
      break;
    }

    case 'replace': {
      if (!cmdArgs[0] || !cmdArgs[1] || cmdArgs[2] === undefined) {
        throw new Error('presentationId, findText, and replaceText are required');
      }
      const result = await slidesClient.replaceText(cmdArgs[0], cmdArgs[1], cmdArgs[2]);
      console.log(`Replaced ${result.occurrencesChanged} occurrences`);
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
      if (command) {
        throw new Error(`Unknown command: ${command}`);
      }
      break;
  }
});
