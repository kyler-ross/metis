// PM AI Starter Kit - google-slides-api.js
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

// Parse arguments
const [,, command, ...args] = process.argv;

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

// Main execution
async function main() {
  try {
    switch (command) {
      case 'info': {
        if (!args[0]) {
          console.error('ERROR: presentationId is required');
          process.exit(1);
        }
        const presentation = await slidesClient.getPresentation(args[0]);
        console.log(`Title: ${presentation.title}`);
        console.log(`ID: ${presentation.presentationId}`);
        console.log(`Slides: ${presentation.slides ? presentation.slides.length : 0}`);
        console.log(`Width: ${presentation.pageSize.width.magnitude} ${presentation.pageSize.width.unit}`);
        console.log(`Height: ${presentation.pageSize.height.magnitude} ${presentation.pageSize.height.unit}`);
        console.log(`Link: https://docs.google.com/presentation/d/${presentation.presentationId}/edit`);
        break;
      }

      case 'list': {
        if (!args[0]) {
          console.error('ERROR: presentationId is required');
          process.exit(1);
        }
        const slides = await slidesClient.listSlides(args[0]);
        console.log(`${slides.length} slides:\n`);
        for (const slide of slides) {
          console.log(`  ${slide.index}: ${slide.title} (${slide.objectId}, ${slide.elementCount} elements)`);
        }
        break;
      }

      case 'text': {
        if (!args[0]) {
          console.error('ERROR: presentationId is required');
          process.exit(1);
        }
        if (args[1] !== undefined) {
          // Get text from specific slide
          const text = await slidesClient.getSlideText(args[0], parseInt(args[1]));
          console.log(text || '(no text on this slide)');
        } else {
          // Get all text from all slides
          const allText = await slidesClient.getAllText(args[0]);
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
        if (!args[0]) {
          console.error('ERROR: title is required');
          process.exit(1);
        }
        const presentation = await slidesClient.createPresentation(args[0]);
        console.log(`Created: ${presentation.title}`);
        console.log(`ID: ${presentation.presentationId}`);
        console.log(`Slides: ${presentation.slideCount}`);
        console.log(`Link: ${presentation.webViewLink}`);
        break;
      }

      case 'duplicate': {
        if (!args[0] || !args[1]) {
          console.error('ERROR: presentationId and newTitle are required');
          process.exit(1);
        }
        const copy = await slidesClient.duplicatePresentation(args[0], args[1]);
        console.log(`Created copy: ${copy.title}`);
        console.log(`ID: ${copy.presentationId}`);
        console.log(`Link: ${copy.webViewLink}`);
        break;
      }

      case 'add-slide': {
        if (!args[0]) {
          console.error('ERROR: presentationId is required');
          process.exit(1);
        }
        const layout = args[1] || 'BLANK';
        const result = await slidesClient.addSlide(args[0], layout);
        console.log(`Added slide: ${result.objectId}`);
        console.log(`Layout: ${layout}`);
        break;
      }

      case 'delete-slide': {
        if (!args[0] || !args[1]) {
          console.error('ERROR: presentationId and slideObjectId are required');
          process.exit(1);
        }
        await slidesClient.deleteSlide(args[0], args[1]);
        console.log(`Deleted slide: ${args[1]}`);
        break;
      }

      case 'add-text': {
        if (!args[0] || !args[1] || !args[2]) {
          console.error('ERROR: presentationId, slideObjectId, and text are required');
          process.exit(1);
        }
        const result = await slidesClient.addTextBox(args[0], args[1], args[2]);
        console.log(`Added text box: ${result.objectId}`);
        break;
      }

      case 'replace': {
        if (!args[0] || !args[1] || args[2] === undefined) {
          console.error('ERROR: presentationId, findText, and replaceText are required');
          process.exit(1);
        }
        const result = await slidesClient.replaceText(args[0], args[1], args[2]);
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
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    if (error.errors) {
      console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
}

main();
