/**
 * Google Forms Client Library
 *
 * Shared library for Google Forms operations.
 * Uses unified google-auth.js for OAuth2 authentication.
 *
 * Supports:
 * - Creating forms
 * - Adding/updating/deleting questions
 * - Reading responses
 * - Creating forms from JSON specs
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');

// ============ Question Type Mappings ============

/**
 * Map friendly type names to Google Forms API types
 */
const QUESTION_TYPES = {
  TEXT: 'TEXT',
  PARAGRAPH_TEXT: 'PARAGRAPH_TEXT',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  CHECKBOX: 'CHECKBOX',
  DROP_DOWN: 'DROP_DOWN',
  SCALE: 'SCALE',
  DATE: 'DATE',
  TIME: 'TIME',
  // Aliases
  SHORT_ANSWER: 'TEXT',
  LONG_ANSWER: 'PARAGRAPH_TEXT',
  RADIO: 'MULTIPLE_CHOICE',
  CHECKBOXES: 'CHECKBOX',
  DROPDOWN: 'DROP_DOWN',
  LINEAR_SCALE: 'SCALE'
};

// ============ Core API Functions ============

/**
 * Create a new Google Form
 * @param {string} title - Form title
 * @param {string} [documentTitle] - Document title (defaults to form title)
 * @returns {Promise<Object>} Created form info
 */
async function createForm(title, documentTitle = null) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  const response = await forms.forms.create({
    requestBody: {
      info: {
        title: title
      }
    }
  });

  return {
    formId: response.data.formId,
    title: response.data.info.title,
    documentTitle: response.data.info.documentTitle,
    responderUri: response.data.responderUri,
    editUri: `https://docs.google.com/forms/d/${response.data.formId}/edit`
  };
}

/**
 * Get form metadata and questions
 * @param {string} formId - The form ID
 * @returns {Promise<Object>} Form info including questions
 */
async function getForm(formId) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  const response = await forms.forms.get({ formId });

  const items = response.data.items || [];
  const questions = items
    .filter(item => item.questionItem)
    .map(item => ({
      itemId: item.itemId,
      title: item.title,
      description: item.description,
      questionId: item.questionItem.question.questionId,
      type: getQuestionType(item.questionItem.question),
      required: item.questionItem.question.required || false,
      options: getQuestionOptions(item.questionItem.question)
    }));

  return {
    formId: response.data.formId,
    title: response.data.info.title,
    description: response.data.info.description,
    documentTitle: response.data.info.documentTitle,
    responderUri: response.data.responderUri,
    editUri: `https://docs.google.com/forms/d/${response.data.formId}/edit`,
    questionCount: questions.length,
    questions
  };
}

/**
 * Add a single question to a form
 * @param {string} formId - The form ID
 * @param {Object} question - Question definition
 * @param {string} question.title - Question text
 * @param {string} question.type - Question type (TEXT, MULTIPLE_CHOICE, etc.)
 * @param {boolean} [question.required] - Is question required
 * @param {string} [question.description] - Help text
 * @param {string[]} [question.options] - Options for choice questions
 * @param {Object} [question.scale] - Scale config {low, high, lowLabel, highLabel}
 * @param {number} [index] - Position to insert (appends if not specified)
 * @returns {Promise<Object>} Created question info
 */
async function addQuestion(formId, question, index = null) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  const questionType = QUESTION_TYPES[question.type.toUpperCase()] || question.type;
  const item = buildQuestionItem(question, questionType);

  const request = {
    createItem: {
      item,
      location: index !== null ? { index } : undefined
    }
  };

  const response = await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [request]
    }
  });

  const reply = response.data.replies[0].createItem;
  return {
    itemId: reply.itemId,
    questionId: reply.questionId?.[0]
  };
}

/**
 * Add multiple questions to a form in a batch
 * @param {string} formId - The form ID
 * @param {Object[]} questions - Array of question definitions
 * @returns {Promise<Object[]>} Array of created question info
 */
async function addQuestions(formId, questions) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  const requests = questions.map((question, idx) => {
    const questionType = QUESTION_TYPES[question.type.toUpperCase()] || question.type;
    const item = buildQuestionItem(question, questionType);

    return {
      createItem: {
        item,
        location: { index: idx }
      }
    };
  });

  const response = await forms.forms.batchUpdate({
    formId,
    requestBody: { requests }
  });

  return response.data.replies.map(reply => ({
    itemId: reply.createItem.itemId,
    questionId: reply.createItem.questionId?.[0]
  }));
}

/**
 * Update form info (title, description)
 * @param {string} formId - The form ID
 * @param {Object} updates - Updates to apply
 * @param {string} [updates.title] - New title
 * @param {string} [updates.description] - New description
 * @returns {Promise<Object>} Updated form info
 */
async function updateFormInfo(formId, updates) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  const requests = [];
  const updateMask = [];
  const infoUpdate = {};

  if (updates.title !== undefined) {
    updateMask.push('title');
    infoUpdate.title = updates.title;
  }
  if (updates.description !== undefined) {
    updateMask.push('description');
    infoUpdate.description = updates.description;
  }

  if (updateMask.length === 0) {
    return getForm(formId);
  }

  requests.push({
    updateFormInfo: {
      info: infoUpdate,
      updateMask: updateMask.join(',')
    }
  });

  await forms.forms.batchUpdate({
    formId,
    requestBody: { requests }
  });

  return getForm(formId);
}

/**
 * Delete a question from a form
 * @param {string} formId - The form ID
 * @param {string} itemId - The item ID to delete
 * @returns {Promise<void>}
 */
async function deleteQuestion(formId, itemId) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  await forms.forms.batchUpdate({
    formId,
    requestBody: {
      requests: [{
        deleteItem: {
          location: { index: 0 } // We need to find the index
        }
      }]
    }
  });
}

/**
 * Get all form responses
 * @param {string} formId - The form ID
 * @returns {Promise<Object>} Responses data
 */
async function getResponses(formId) {
  const auth = await getAuthClient();
  const forms = google.forms({ version: 'v1', auth });

  const response = await forms.forms.responses.list({ formId });

  const responses = (response.data.responses || []).map(r => ({
    responseId: r.responseId,
    createTime: r.createTime,
    lastSubmittedTime: r.lastSubmittedTime,
    respondentEmail: r.respondentEmail,
    answers: formatAnswers(r.answers)
  }));

  return {
    formId,
    responseCount: responses.length,
    responses
  };
}

/**
 * Get response summary/statistics
 * @param {string} formId - The form ID
 * @returns {Promise<Object>} Response summary
 */
async function getResponsesSummary(formId) {
  const [form, responsesData] = await Promise.all([
    getForm(formId),
    getResponses(formId)
  ]);

  const summary = {
    formId,
    title: form.title,
    responseCount: responsesData.responseCount,
    questions: {}
  };

  // Initialize question summaries
  for (const q of form.questions) {
    summary.questions[q.questionId] = {
      title: q.title,
      type: q.type,
      answerCount: 0,
      answers: []
    };
  }

  // Aggregate answers
  for (const response of responsesData.responses) {
    for (const [questionId, answer] of Object.entries(response.answers)) {
      if (summary.questions[questionId]) {
        summary.questions[questionId].answerCount++;
        summary.questions[questionId].answers.push(answer);
      }
    }
  }

  return summary;
}

/**
 * Create a complete form from a JSON specification
 * @param {Object} spec - Form specification
 * @param {string} spec.title - Form title
 * @param {string} [spec.description] - Form description
 * @param {Object[]} spec.questions - Array of question definitions
 * @returns {Promise<Object>} Created form info
 */
async function createFormFromSpec(spec) {
  // Create the form
  const form = await createForm(spec.title);

  // Add description if provided
  if (spec.description) {
    await updateFormInfo(form.formId, { description: spec.description });
  }

  // Add questions if provided
  if (spec.questions && spec.questions.length > 0) {
    await addQuestions(form.formId, spec.questions);
  }

  // Return full form info
  return getForm(form.formId);
}

/**
 * Duplicate a form (creates copy via Drive API)
 * @param {string} formId - The form ID to copy
 * @param {string} newTitle - Title for the copy
 * @returns {Promise<Object>} New form info
 */
async function duplicateForm(formId, newTitle) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.copy({
    fileId: formId,
    requestBody: {
      name: newTitle
    }
  });

  return getForm(response.data.id);
}

// ============ Helper Functions ============

/**
 * Build a question item for the Forms API
 */
function buildQuestionItem(question, questionType) {
  const item = {
    title: question.title,
    description: question.description,
    questionItem: {
      question: {
        required: question.required || false
      }
    }
  };

  switch (questionType) {
    case 'TEXT':
      item.questionItem.question.textQuestion = {
        paragraph: false
      };
      break;

    case 'PARAGRAPH_TEXT':
      item.questionItem.question.textQuestion = {
        paragraph: true
      };
      break;

    case 'MULTIPLE_CHOICE':
      item.questionItem.question.choiceQuestion = {
        type: 'RADIO',
        options: (question.options || []).map(opt => ({
          value: typeof opt === 'string' ? opt : opt.value
        }))
      };
      break;

    case 'CHECKBOX':
      item.questionItem.question.choiceQuestion = {
        type: 'CHECKBOX',
        options: (question.options || []).map(opt => ({
          value: typeof opt === 'string' ? opt : opt.value
        }))
      };
      break;

    case 'DROP_DOWN':
      item.questionItem.question.choiceQuestion = {
        type: 'DROP_DOWN',
        options: (question.options || []).map(opt => ({
          value: typeof opt === 'string' ? opt : opt.value
        }))
      };
      break;

    case 'SCALE':
      const scale = question.scale || { low: 1, high: 5 };
      item.questionItem.question.scaleQuestion = {
        low: scale.low || 1,
        high: scale.high || 5,
        lowLabel: scale.lowLabel,
        highLabel: scale.highLabel
      };
      break;

    case 'DATE':
      item.questionItem.question.dateQuestion = {
        includeTime: question.includeTime || false,
        includeYear: question.includeYear !== false
      };
      break;

    case 'TIME':
      item.questionItem.question.timeQuestion = {
        duration: question.duration || false
      };
      break;

    default:
      throw new Error(`Unknown question type: ${questionType}`);
  }

  return item;
}

/**
 * Extract question type from API response
 */
function getQuestionType(question) {
  if (question.textQuestion) {
    return question.textQuestion.paragraph ? 'PARAGRAPH_TEXT' : 'TEXT';
  }
  if (question.choiceQuestion) {
    return question.choiceQuestion.type; // RADIO, CHECKBOX, DROP_DOWN
  }
  if (question.scaleQuestion) {
    return 'SCALE';
  }
  if (question.dateQuestion) {
    return 'DATE';
  }
  if (question.timeQuestion) {
    return 'TIME';
  }
  return 'UNKNOWN';
}

/**
 * Extract options from a question
 */
function getQuestionOptions(question) {
  if (question.choiceQuestion?.options) {
    return question.choiceQuestion.options.map(opt => opt.value);
  }
  if (question.scaleQuestion) {
    return {
      low: question.scaleQuestion.low,
      high: question.scaleQuestion.high,
      lowLabel: question.scaleQuestion.lowLabel,
      highLabel: question.scaleQuestion.highLabel
    };
  }
  return null;
}

/**
 * Format answers from API response
 */
function formatAnswers(answers) {
  if (!answers) return {};

  const formatted = {};
  for (const [questionId, answer] of Object.entries(answers)) {
    if (answer.textAnswers) {
      formatted[questionId] = answer.textAnswers.answers.map(a => a.value);
    } else if (answer.fileUploadAnswers) {
      formatted[questionId] = answer.fileUploadAnswers.answers.map(a => a.fileId);
    } else {
      formatted[questionId] = answer;
    }
  }
  return formatted;
}

module.exports = {
  // Core functions
  createForm,
  getForm,
  addQuestion,
  addQuestions,
  updateFormInfo,
  deleteQuestion,
  getResponses,
  getResponsesSummary,

  // Helper functions
  createFormFromSpec,
  duplicateForm,

  // Constants
  QUESTION_TYPES
};

