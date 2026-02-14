/**
 * Google Slides Client Library
 *
 * Shared library for Google Slides operations.
 * Uses unified google-auth.js for OAuth2 authentication.
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

// ============ Public API ============

/**
 * Get presentation metadata and structure
 * @param {string} presentationId - The presentation ID
 * @returns {Promise<Object>} Presentation info
 */
async function getPresentation(presentationId) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  const response = await slides.presentations.get({
    presentationId
  });

  return response.data;
}

/**
 * Get summary of all slides
 * @param {string} presentationId - The presentation ID
 * @returns {Promise<Array<Object>>} Array of slide summaries
 */
async function listSlides(presentationId) {
  const presentation = await getPresentation(presentationId);

  return presentation.slides.map((slide, index) => {
    // Try to extract title from slide
    let title = '';
    if (slide.pageElements) {
      for (const element of slide.pageElements) {
        if (element.shape && element.shape.placeholder &&
            element.shape.placeholder.type === 'TITLE') {
          if (element.shape.text && element.shape.text.textElements) {
            title = element.shape.text.textElements
              .filter(te => te.textRun)
              .map(te => te.textRun.content)
              .join('')
              .trim();
          }
          break;
        }
      }
    }

    return {
      index,
      objectId: slide.objectId,
      title: title || `Slide ${index + 1}`,
      elementCount: slide.pageElements ? slide.pageElements.length : 0
    };
  });
}

/**
 * Extract all text from a slide
 * @param {string} presentationId - The presentation ID
 * @param {number} slideIndex - Index of the slide (0-based)
 * @returns {Promise<string>} Concatenated text from slide
 */
async function getSlideText(presentationId, slideIndex) {
  const presentation = await getPresentation(presentationId);

  if (slideIndex < 0 || slideIndex >= presentation.slides.length) {
    throw new Error(`Slide index ${slideIndex} out of range (0-${presentation.slides.length - 1})`);
  }

  const slide = presentation.slides[slideIndex];
  const texts = [];

  if (slide.pageElements) {
    for (const element of slide.pageElements) {
      if (element.shape && element.shape.text && element.shape.text.textElements) {
        const text = element.shape.text.textElements
          .filter(te => te.textRun)
          .map(te => te.textRun.content)
          .join('');
        if (text.trim()) {
          texts.push(text.trim());
        }
      }
    }
  }

  return texts.join('\n\n');
}

/**
 * Create a new blank presentation
 * @param {string} title - Title for the presentation
 * @returns {Promise<Object>} Created presentation info
 */
async function createPresentation(title) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  const response = await slides.presentations.create({
    requestBody: {
      title
    }
  });

  return {
    presentationId: response.data.presentationId,
    title: response.data.title,
    slideCount: response.data.slides ? response.data.slides.length : 0,
    webViewLink: `https://docs.google.com/presentation/d/${response.data.presentationId}/edit`
  };
}

/**
 * Duplicate an existing presentation
 * @param {string} presentationId - Source presentation ID
 * @param {string} newTitle - Title for the copy
 * @returns {Promise<Object>} Created presentation info
 */
async function duplicatePresentation(presentationId, newTitle) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.copy({
    fileId: presentationId,
    requestBody: {
      name: newTitle
    },
    fields: 'id, name'
  });

  return {
    presentationId: response.data.id,
    title: response.data.name,
    webViewLink: `https://docs.google.com/presentation/d/${response.data.id}/edit`
  };
}

/**
 * Add a new slide to a presentation
 * @param {string} presentationId - The presentation ID
 * @param {string} layoutType - Slide layout (default: BLANK)
 * @param {number} insertionIndex - Where to insert (default: end)
 * @returns {Promise<Object>} The created slide info
 */
async function addSlide(presentationId, layoutType = 'BLANK', insertionIndex = null) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  // Generate a unique ID for the new slide
  const objectId = `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const request = {
    createSlide: {
      objectId,
      slideLayoutReference: {
        predefinedLayout: layoutType
      }
    }
  };

  if (insertionIndex !== null) {
    request.createSlide.insertionIndex = insertionIndex;
  }

  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [request]
    }
  });

  return {
    objectId,
    replies: response.data.replies
  };
}

/**
 * Delete a slide from a presentation
 * @param {string} presentationId - The presentation ID
 * @param {string} slideObjectId - Object ID of slide to delete
 * @returns {Promise<Object>} Response info
 */
async function deleteSlide(presentationId, slideObjectId) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [{
        deleteObject: {
          objectId: slideObjectId
        }
      }]
    }
  });

  return response.data;
}

/**
 * Add a text box to a slide
 * @param {string} presentationId - The presentation ID
 * @param {string} slideObjectId - Object ID of the slide
 * @param {string} text - Text content
 * @param {Object} bounds - Position and size {x, y, width, height} in EMUs
 * @returns {Promise<Object>} Created element info
 */
async function addTextBox(presentationId, slideObjectId, text, bounds = {}) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  // Generate unique IDs
  const shapeId = `textbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Default bounds (centered on slide)
  const defaultBounds = {
    x: 1000000,     // EMUs from left
    y: 1000000,     // EMUs from top
    width: 5000000, // EMUs wide
    height: 1000000 // EMUs tall
  };
  const finalBounds = { ...defaultBounds, ...bounds };

  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        // Create the text box shape
        {
          createShape: {
            objectId: shapeId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideObjectId,
              size: {
                width: { magnitude: finalBounds.width, unit: 'EMU' },
                height: { magnitude: finalBounds.height, unit: 'EMU' }
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: finalBounds.x,
                translateY: finalBounds.y,
                unit: 'EMU'
              }
            }
          }
        },
        // Insert text into the shape
        {
          insertText: {
            objectId: shapeId,
            text
          }
        }
      ]
    }
  });

  return {
    objectId: shapeId,
    replies: response.data.replies
  };
}

/**
 * Add an image to a slide
 * @param {string} presentationId - The presentation ID
 * @param {string} slideObjectId - Object ID of the slide
 * @param {string} imageUrl - URL of the image (must be publicly accessible)
 * @param {Object} bounds - Position and size {x, y, width, height} in EMUs
 * @returns {Promise<Object>} Created element info
 */
async function addImage(presentationId, slideObjectId, imageUrl, bounds = {}) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  // Generate unique ID
  const imageId = `image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Default bounds
  const defaultBounds = {
    x: 1000000,
    y: 1000000,
    width: 3000000,
    height: 3000000
  };
  const finalBounds = { ...defaultBounds, ...bounds };

  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [{
        createImage: {
          objectId: imageId,
          url: imageUrl,
          elementProperties: {
            pageObjectId: slideObjectId,
            size: {
              width: { magnitude: finalBounds.width, unit: 'EMU' },
              height: { magnitude: finalBounds.height, unit: 'EMU' }
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: finalBounds.x,
              translateY: finalBounds.y,
              unit: 'EMU'
            }
          }
        }
      }]
    }
  });

  return {
    objectId: imageId,
    replies: response.data.replies
  };
}

/**
 * Replace all instances of text in a presentation
 * @param {string} presentationId - The presentation ID
 * @param {string} findText - Text to find
 * @param {string} replaceText - Text to replace with
 * @param {boolean} matchCase - Match case (default: false)
 * @returns {Promise<Object>} Response with occurrence count
 */
async function replaceText(presentationId, findText, replaceText, matchCase = false) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });

  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [{
        replaceAllText: {
          containsText: {
            text: findText,
            matchCase
          },
          replaceText
        }
      }]
    }
  });

  return {
    occurrencesChanged: response.data.replies[0].replaceAllText.occurrencesChanged || 0
  };
}

/**
 * Get all text from entire presentation
 * @param {string} presentationId - The presentation ID
 * @returns {Promise<Array<Object>>} Text organized by slide
 */
async function getAllText(presentationId) {
  const presentation = await getPresentation(presentationId);
  const result = [];

  for (let i = 0; i < presentation.slides.length; i++) {
    const slide = presentation.slides[i];
    const slideTexts = [];

    if (slide.pageElements) {
      for (const element of slide.pageElements) {
        if (element.shape && element.shape.text && element.shape.text.textElements) {
          const text = element.shape.text.textElements
            .filter(te => te.textRun)
            .map(te => te.textRun.content)
            .join('');
          if (text.trim()) {
            slideTexts.push(text.trim());
          }
        }
      }
    }

    result.push({
      slideIndex: i,
      objectId: slide.objectId,
      texts: slideTexts
    });
  }

  return result;
}

module.exports = {
  getPresentation,
  listSlides,
  getSlideText,
  createPresentation,
  duplicatePresentation,
  addSlide,
  deleteSlide,
  addTextBox,
  addImage,
  replaceText,
  getAllText
};
