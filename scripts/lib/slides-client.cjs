// PM AI Starter Kit - Google Slides Client Library
// See scripts/README.md for setup instructions
//
// Shared library for Google Slides operations.
// Uses unified google-auth.cjs for OAuth2 authentication.

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

async function getPresentation(presentationId) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const response = await slides.presentations.get({ presentationId });
  return response.data;
}

async function listSlides(presentationId) {
  const presentation = await getPresentation(presentationId);
  return presentation.slides.map((slide, index) => {
    let title = '';
    if (slide.pageElements) {
      for (const element of slide.pageElements) {
        if (element.shape && element.shape.placeholder && element.shape.placeholder.type === 'TITLE') {
          if (element.shape.text && element.shape.text.textElements) {
            title = element.shape.text.textElements.filter(te => te.textRun).map(te => te.textRun.content).join('').trim();
          }
          break;
        }
      }
    }
    return { index, objectId: slide.objectId, title: title || `Slide ${index + 1}`, elementCount: slide.pageElements ? slide.pageElements.length : 0 };
  });
}

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
        const text = element.shape.text.textElements.filter(te => te.textRun).map(te => te.textRun.content).join('');
        if (text.trim()) texts.push(text.trim());
      }
    }
  }
  return texts.join('\n\n');
}

async function createPresentation(title) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const response = await slides.presentations.create({ requestBody: { title } });
  return {
    presentationId: response.data.presentationId, title: response.data.title,
    slideCount: response.data.slides ? response.data.slides.length : 0,
    webViewLink: `https://docs.google.com/presentation/d/${response.data.presentationId}/edit`
  };
}

async function duplicatePresentation(presentationId, newTitle) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.copy({ fileId: presentationId, requestBody: { name: newTitle }, fields: 'id, name' });
  return { presentationId: response.data.id, title: response.data.name, webViewLink: `https://docs.google.com/presentation/d/${response.data.id}/edit` };
}

async function addSlide(presentationId, layoutType = 'BLANK', insertionIndex = null) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const objectId = `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const request = { createSlide: { objectId, slideLayoutReference: { predefinedLayout: layoutType } } };
  if (insertionIndex !== null) request.createSlide.insertionIndex = insertionIndex;
  const response = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests: [request] } });
  return { objectId, replies: response.data.replies };
}

async function deleteSlide(presentationId, slideObjectId) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const response = await slides.presentations.batchUpdate({ presentationId, requestBody: { requests: [{ deleteObject: { objectId: slideObjectId } }] } });
  return response.data;
}

async function addTextBox(presentationId, slideObjectId, text, bounds = {}) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const shapeId = `textbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultBounds = { x: 1000000, y: 1000000, width: 5000000, height: 1000000 };
  const finalBounds = { ...defaultBounds, ...bounds };
  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        {
          createShape: {
            objectId: shapeId, shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideObjectId,
              size: { width: { magnitude: finalBounds.width, unit: 'EMU' }, height: { magnitude: finalBounds.height, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: finalBounds.x, translateY: finalBounds.y, unit: 'EMU' }
            }
          }
        },
        { insertText: { objectId: shapeId, text } }
      ]
    }
  });
  return { objectId: shapeId, replies: response.data.replies };
}

async function addImage(presentationId, slideObjectId, imageUrl, bounds = {}) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const imageId = `image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultBounds = { x: 1000000, y: 1000000, width: 3000000, height: 3000000 };
  const finalBounds = { ...defaultBounds, ...bounds };
  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [{
        createImage: {
          objectId: imageId, url: imageUrl,
          elementProperties: {
            pageObjectId: slideObjectId,
            size: { width: { magnitude: finalBounds.width, unit: 'EMU' }, height: { magnitude: finalBounds.height, unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: finalBounds.x, translateY: finalBounds.y, unit: 'EMU' }
          }
        }
      }]
    }
  });
  return { objectId: imageId, replies: response.data.replies };
}

async function replaceText(presentationId, findText, replaceTextStr, matchCase = false) {
  const auth = await getAuthClient();
  const slides = google.slides({ version: 'v1', auth });
  const response = await slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: [{ replaceAllText: { containsText: { text: findText, matchCase }, replaceText: replaceTextStr } }] }
  });
  return { occurrencesChanged: response.data.replies[0].replaceAllText.occurrencesChanged || 0 };
}

async function getAllText(presentationId) {
  const presentation = await getPresentation(presentationId);
  const result = [];
  for (let i = 0; i < presentation.slides.length; i++) {
    const slide = presentation.slides[i];
    const slideTexts = [];
    if (slide.pageElements) {
      for (const element of slide.pageElements) {
        if (element.shape && element.shape.text && element.shape.text.textElements) {
          const text = element.shape.text.textElements.filter(te => te.textRun).map(te => te.textRun.content).join('');
          if (text.trim()) slideTexts.push(text.trim());
        }
      }
    }
    result.push({ slideIndex: i, objectId: slide.objectId, texts: slideTexts });
  }
  return result;
}

module.exports = {
  getPresentation, listSlides, getSlideText, createPresentation, duplicatePresentation,
  addSlide, deleteSlide, addTextBox, addImage, replaceText, getAllText
};
