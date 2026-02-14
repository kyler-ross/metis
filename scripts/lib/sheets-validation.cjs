/**
 * Google Sheets Validation & Helper Functions
 *
 * Shared utilities for parsing colors, converting coordinates,
 * and validating inputs for Google Sheets operations.
 */

// ============ Color Parsing ============

/**
 * Parse a color string (hex or named) to Google Sheets color format
 * @param {string|object} colorStr - Hex color (#RGB or #RRGGBB), named color, or color object
 * @returns {object|undefined} Google Sheets color { red, green, blue } with 0-1 values
 */
function parseColor(colorStr) {
  if (!colorStr) return undefined;

  // Handle if already a color object (LLMs sometimes pass objects directly)
  if (typeof colorStr === 'object' && colorStr !== null) {
    if ('red' in colorStr || 'green' in colorStr || 'blue' in colorStr) {
      return colorStr;
    }
    return undefined;
  }

  // Ensure we have a string
  if (typeof colorStr !== 'string') {
    return undefined;
  }

  // Handle hex colors
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { red: r, green: g, blue: b };
  }

  // Handle named colors
  const namedColors = {
    red: { red: 1, green: 0, blue: 0 },
    green: { red: 0, green: 1, blue: 0 },
    blue: { red: 0, green: 0, blue: 1 },
    yellow: { red: 1, green: 1, blue: 0 },
    white: { red: 1, green: 1, blue: 1 },
    black: { red: 0, green: 0, blue: 0 },
    gray: { red: 0.5, green: 0.5, blue: 0.5 },
    grey: { red: 0.5, green: 0.5, blue: 0.5 },
    lightgray: { red: 0.9, green: 0.9, blue: 0.9 },
    lightgrey: { red: 0.9, green: 0.9, blue: 0.9 },
    darkgray: { red: 0.3, green: 0.3, blue: 0.3 },
    darkgrey: { red: 0.3, green: 0.3, blue: 0.3 },
    orange: { red: 1, green: 0.65, blue: 0 },
    purple: { red: 0.5, green: 0, blue: 0.5 },
    pink: { red: 1, green: 0.75, blue: 0.8 },
    cyan: { red: 0, green: 1, blue: 1 },
    magenta: { red: 1, green: 0, blue: 1 },
  };

  return namedColors[colorStr.toLowerCase()] || undefined;
}

/**
 * Convert Google Sheets color object to hex string
 * @param {object} color - Google Sheets color { red, green, blue }
 * @returns {string|undefined} Hex color string (#RRGGBB)
 */
function colorToHex(color) {
  if (!color) return undefined;
  const r = Math.round((color.red || 0) * 255).toString(16).padStart(2, '0');
  const g = Math.round((color.green || 0) * 255).toString(16).padStart(2, '0');
  const b = Math.round((color.blue || 0) * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ============ Coordinate Conversion ============

/**
 * Convert 0-indexed column number to letter (0=A, 25=Z, 26=AA, etc.)
 * LLMs prefer numeric addressing over A1 notation
 * @param {number} col - 0-indexed column number
 * @returns {string} Column letter(s)
 */
function columnToLetter(col) {
  let letter = '';
  let temp = col;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Convert column letter to 0-indexed number (A=0, Z=25, AA=26, etc.)
 * @param {string} letter - Column letter(s)
 * @returns {number} 0-indexed column number
 */
function letterToColumn(letter) {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col - 1;
}

/**
 * Parse A1 notation range to coordinates
 * @param {string} range - A1 notation (e.g., "A1:B10", "Sheet1!A1:B10")
 * @returns {object} { tabName, startRow, startCol, endRow, endCol }
 */
function parseA1Notation(range) {
  // Extract tab name if present
  let tabName = null;
  let cellRange = range;

  if (range.includes('!')) {
    const parts = range.split('!');
    tabName = parts[0].replace(/^'|'$/g, ''); // Remove quotes if present
    cellRange = parts[1];
  }

  // Parse cell range (e.g., "A1:B10" or "A1")
  const match = cellRange.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!match) {
    throw new Error(`Invalid A1 notation: ${range}`);
  }

  const startCol = letterToColumn(match[1].toUpperCase());
  const startRow = parseInt(match[2], 10) - 1; // Convert to 0-indexed

  let endCol = startCol;
  let endRow = startRow;

  if (match[3] && match[4]) {
    endCol = letterToColumn(match[3].toUpperCase());
    endRow = parseInt(match[4], 10) - 1;
  }

  return { tabName, startRow, startCol, endRow, endCol };
}

/**
 * Convert coordinates to A1 notation
 * @param {number} startRow - 0-indexed start row
 * @param {number} startCol - 0-indexed start column
 * @param {number} [endRow] - 0-indexed end row (optional)
 * @param {number} [endCol] - 0-indexed end column (optional)
 * @param {string} [tabName] - Tab name (optional)
 * @returns {string} A1 notation range
 */
function toA1Notation(startRow, startCol, endRow, endCol, tabName) {
  const startCell = `${columnToLetter(startCol)}${startRow + 1}`;

  let range = startCell;
  if (endRow !== undefined && endCol !== undefined) {
    const endCell = `${columnToLetter(endCol)}${endRow + 1}`;
    if (endCell !== startCell) {
      range = `${startCell}:${endCell}`;
    }
  }

  if (tabName) {
    // Quote tab name if it contains spaces or special characters
    const needsQuotes = /[^a-zA-Z0-9_]/.test(tabName);
    range = needsQuotes ? `'${tabName}'!${range}` : `${tabName}!${range}`;
  }

  return range;
}

// ============ Border Parsing ============

/**
 * Parse border style string to Google Sheets border style
 * @param {string} style - Border style name
 * @returns {string} Google Sheets border style enum
 */
function parseBorderStyle(style) {
  const styles = {
    'solid': 'SOLID',
    'dashed': 'DASHED',
    'dotted': 'DOTTED',
    'double': 'DOUBLE',
    'none': 'NONE',
    'solid_medium': 'SOLID_MEDIUM',
    'solid_thick': 'SOLID_THICK',
    'medium': 'SOLID_MEDIUM',
    'thick': 'SOLID_THICK',
  };
  return styles[style?.toLowerCase()] || 'SOLID';
}

// ============ Input Validation ============

/**
 * Validate spreadsheet ID format
 * @param {string} spreadsheetId - The spreadsheet ID
 * @returns {boolean} True if valid
 */
function isValidSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return false;
  }
  // Google Sheets IDs are 44 characters, alphanumeric with underscores and hyphens
  return /^[a-zA-Z0-9_-]{20,50}$/.test(spreadsheetId);
}

/**
 * Validate that value is a non-negative integer
 * @param {any} value - Value to check
 * @param {string} name - Parameter name for error message
 * @throws {Error} If validation fails
 */
function validateNonNegativeInt(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${value}`);
  }
}

/**
 * Validate that value is a non-empty string
 * @param {any} value - Value to check
 * @param {string} name - Parameter name for error message
 * @throws {Error} If validation fails
 */
function validateNonEmptyString(value, name) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is required and must be a non-empty string`);
  }
}

/**
 * Parse JSON safely with better error messages
 * @param {string|any} value - Value to parse (may already be parsed)
 * @param {string} name - Parameter name for error message
 * @returns {any} Parsed value
 */
function safeJsonParse(value, name) {
  if (typeof value !== 'string') {
    return value; // Already parsed
  }
  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`Invalid JSON for ${name}: ${e.message}`);
  }
}

// ============ Sheet ID Resolution ============

/**
 * Get sheet ID by name from spreadsheet
 * @param {object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} tabName - Tab name to find
 * @returns {Promise<number>} Sheet ID
 */
async function getSheetIdByName(sheets, spreadsheetId, tabName) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties'
  });

  const sheet = response.data.sheets.find(s =>
    s.properties.title.toLowerCase() === tabName.toLowerCase()
  );

  if (!sheet) {
    const available = response.data.sheets.map(s => s.properties.title).join(', ');
    throw new Error(`Tab "${tabName}" not found. Available tabs: ${available}`);
  }

  return sheet.properties.sheetId;
}

// ============ Exports ============

module.exports = {
  // Color
  parseColor,
  colorToHex,

  // Coordinates
  columnToLetter,
  letterToColumn,
  parseA1Notation,
  toA1Notation,

  // Border
  parseBorderStyle,

  // Validation
  isValidSpreadsheetId,
  validateNonNegativeInt,
  validateNonEmptyString,
  safeJsonParse,

  // Sheet ID
  getSheetIdByName,
};
