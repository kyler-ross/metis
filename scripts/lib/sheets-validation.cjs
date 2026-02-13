// PM AI Starter Kit - Google Sheets Validation & Helper Functions
// See scripts/README.md for setup instructions
//
// Shared utilities for parsing colors, converting coordinates,
// and validating inputs for Google Sheets operations.

// ============ Color Parsing ============

function parseColor(colorStr) {
  if (!colorStr) return undefined;
  if (typeof colorStr === 'object' && colorStr !== null) {
    if ('red' in colorStr || 'green' in colorStr || 'blue' in colorStr) return colorStr;
    return undefined;
  }
  if (typeof colorStr !== 'string') return undefined;
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { red: r, green: g, blue: b };
  }
  const namedColors = {
    red: { red: 1, green: 0, blue: 0 }, green: { red: 0, green: 1, blue: 0 },
    blue: { red: 0, green: 0, blue: 1 }, yellow: { red: 1, green: 1, blue: 0 },
    white: { red: 1, green: 1, blue: 1 }, black: { red: 0, green: 0, blue: 0 },
    gray: { red: 0.5, green: 0.5, blue: 0.5 }, grey: { red: 0.5, green: 0.5, blue: 0.5 },
    lightgray: { red: 0.9, green: 0.9, blue: 0.9 }, lightgrey: { red: 0.9, green: 0.9, blue: 0.9 },
    darkgray: { red: 0.3, green: 0.3, blue: 0.3 }, darkgrey: { red: 0.3, green: 0.3, blue: 0.3 },
    orange: { red: 1, green: 0.65, blue: 0 }, purple: { red: 0.5, green: 0, blue: 0.5 },
    pink: { red: 1, green: 0.75, blue: 0.8 }, cyan: { red: 0, green: 1, blue: 1 },
    magenta: { red: 1, green: 0, blue: 1 },
  };
  return namedColors[colorStr.toLowerCase()] || undefined;
}

function colorToHex(color) {
  if (!color) return undefined;
  const r = Math.round((color.red || 0) * 255).toString(16).padStart(2, '0');
  const g = Math.round((color.green || 0) * 255).toString(16).padStart(2, '0');
  const b = Math.round((color.blue || 0) * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ============ Coordinate Conversion ============

function columnToLetter(col) {
  let letter = '';
  let temp = col;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function letterToColumn(letter) {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col - 1;
}

function parseA1Notation(range) {
  let tabName = null;
  let cellRange = range;
  if (range.includes('!')) {
    const parts = range.split('!');
    tabName = parts[0].replace(/^'|'$/g, '');
    cellRange = parts[1];
  }
  const match = cellRange.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!match) throw new Error(`Invalid A1 notation: ${range}`);
  const startCol = letterToColumn(match[1].toUpperCase());
  const startRow = parseInt(match[2], 10) - 1;
  let endCol = startCol;
  let endRow = startRow;
  if (match[3] && match[4]) {
    endCol = letterToColumn(match[3].toUpperCase());
    endRow = parseInt(match[4], 10) - 1;
  }
  return { tabName, startRow, startCol, endRow, endCol };
}

function toA1Notation(startRow, startCol, endRow, endCol, tabName) {
  const startCell = `${columnToLetter(startCol)}${startRow + 1}`;
  let range = startCell;
  if (endRow !== undefined && endCol !== undefined) {
    const endCell = `${columnToLetter(endCol)}${endRow + 1}`;
    if (endCell !== startCell) range = `${startCell}:${endCell}`;
  }
  if (tabName) {
    const needsQuotes = /[^a-zA-Z0-9_]/.test(tabName);
    range = needsQuotes ? `'${tabName}'!${range}` : `${tabName}!${range}`;
  }
  return range;
}

// ============ Border Parsing ============

function parseBorderStyle(style) {
  const styles = {
    'solid': 'SOLID', 'dashed': 'DASHED', 'dotted': 'DOTTED', 'double': 'DOUBLE',
    'none': 'NONE', 'solid_medium': 'SOLID_MEDIUM', 'solid_thick': 'SOLID_THICK',
    'medium': 'SOLID_MEDIUM', 'thick': 'SOLID_THICK',
  };
  return styles[style?.toLowerCase()] || 'SOLID';
}

// ============ Input Validation ============

function isValidSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') return false;
  return /^[a-zA-Z0-9_-]{20,50}$/.test(spreadsheetId);
}

function validateNonNegativeInt(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${value}`);
  }
}

function validateNonEmptyString(value, name) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is required and must be a non-empty string`);
  }
}

function safeJsonParse(value, name) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { throw new Error(`Invalid JSON for ${name}: ${e.message}`); }
}

// ============ Sheet ID Resolution ============

async function getSheetIdByName(sheets, spreadsheetId, tabName) {
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheet = response.data.sheets.find(s => s.properties.title.toLowerCase() === tabName.toLowerCase());
  if (!sheet) {
    const available = response.data.sheets.map(s => s.properties.title).join(', ');
    throw new Error(`Tab "${tabName}" not found. Available tabs: ${available}`);
  }
  return sheet.properties.sheetId;
}

module.exports = {
  parseColor, colorToHex,
  columnToLetter, letterToColumn, parseA1Notation, toA1Notation,
  parseBorderStyle,
  isValidSpreadsheetId, validateNonNegativeInt, validateNonEmptyString, safeJsonParse,
  getSheetIdByName,
};
