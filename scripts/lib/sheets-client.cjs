/**
 * Google Sheets Client Library
 *
 * Comprehensive library for Google Sheets operations.
 * Uses unified google-auth.cjs for OAuth2 authentication.
 *
 * Categories:
 *   - Read: getValues, readRangeMeta
 *   - Write: writeValue, updateRange, updateWithFormatting, appendRows
 *   - Batch: batchUpdate, writeCells, writeRow, writeCol
 *   - Tab: createTab, deleteTab, copyTab, renameTab, getSheetInfo, createSpreadsheet
 *   - Cell: mergeCells, unmergeCells, batchMerge
 *   - Row/Col: deleteRows, deleteColumns, insertRows
 *   - Clear: clearRange, clearRangeAll
 *   - Validation: setValidation, clearValidation
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth.cjs');
const {
  parseColor,
  colorToHex,
  columnToLetter,
  getSheetIdByName,
  safeJsonParse,
  validateNonEmptyString,
  validateNonNegativeInt,
} = require('./sheets-validation.cjs');

// ============ Read Operations ============

/**
 * Read values from a spreadsheet range
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - A1 notation range (e.g., "Sheet1!A1:B10")
 * @returns {Promise<Array<Array<any>>>} 2D array of values
 */
async function getValues(spreadsheetId, range) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  return response.data.values || [];
}

/**
 * Read range with metadata (formatting, merged cells)
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - A1 notation range
 * @returns {Promise<object>} Object with rows, merges, and sheet info
 */
async function readRangeMeta(spreadsheetId, range) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [range],
    includeGridData: true,
    fields: 'sheets(properties,merges,data(rowData(values(formattedValue,userEnteredValue,effectiveFormat,userEnteredFormat))))'
  });

  const sheetData = response.data.sheets[0];
  const gridData = sheetData?.data?.[0];

  // Extract values with formatting
  const rows = [];
  if (gridData?.rowData) {
    for (const row of gridData.rowData) {
      const cells = [];
      if (row.values) {
        for (const cell of row.values) {
          const cellData = {
            value: cell.formattedValue || '',
            formula: cell.userEnteredValue?.formulaValue || null,
          };

          // Extract formatting
          const format = cell.effectiveFormat || cell.userEnteredFormat;
          if (format) {
            if (format.textFormat) {
              cellData.bold = format.textFormat.bold || false;
              cellData.italic = format.textFormat.italic || false;
              cellData.fontSize = format.textFormat.fontSize;
              cellData.textColor = colorToHex(format.textFormat.foregroundColor);
            }
            if (format.backgroundColor) {
              cellData.bgColor = colorToHex(format.backgroundColor);
            }
            if (format.horizontalAlignment) {
              cellData.align = format.horizontalAlignment;
            }
          }

          cells.push(cellData);
        }
      }
      rows.push(cells);
    }
  }

  // Extract merged cells
  const merges = (sheetData?.merges || []).map(m => ({
    startRow: m.startRowIndex,
    endRow: m.endRowIndex,
    startCol: m.startColumnIndex,
    endCol: m.endColumnIndex
  }));

  return {
    sheetId: sheetData?.properties?.sheetId,
    sheetTitle: sheetData?.properties?.title,
    rows,
    merges
  };
}

// ============ Write Operations ============

/**
 * Write a single value to a cell
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - A1 notation (e.g., "Sheet1!A1")
 * @param {any} value - Value to write
 * @param {object} options - { raw: boolean }
 * @returns {Promise<object>} Update response
 */
async function writeValue(spreadsheetId, range, value, options = {}) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
    requestBody: {
      values: [[value]]
    }
  });

  return response.data;
}

/**
 * Update values in a spreadsheet range
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - A1 notation range
 * @param {Array<Array<any>>|string} values - 2D array of values to write
 * @param {object} options - { raw: boolean }
 * @returns {Promise<Object>} Update response
 */
async function updateRange(spreadsheetId, range, values, options = {}) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const parsedValues = safeJsonParse(values, 'values');

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
    requestBody: {
      values: parsedValues
    }
  });

  return response.data;
}

/**
 * Update cells with formatting
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed row
 * @param {number} startCol - 0-indexed column
 * @param {Array|string} data - 2D array of cell objects: { value, formula, bold, italic, bgColor, textColor, align }
 * @returns {Promise<object>} Response data
 */
async function updateWithFormatting(spreadsheetId, tabName, startRow, startCol, data) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  const parsedData = safeJsonParse(data, 'data');

  // Build rows with formatting
  const rows = parsedData.map(row => {
    const cells = Array.isArray(row) ? row : [row];

    return {
      values: cells.map(cell => {
        // Handle simple string/number values
        if (typeof cell === 'string' || typeof cell === 'number') {
          return {
            userEnteredValue: typeof cell === 'number'
              ? { numberValue: cell }
              : { stringValue: String(cell) }
          };
        }

        // Build userEnteredValue
        let userEnteredValue;
        if (cell.formula) {
          userEnteredValue = { formulaValue: cell.formula };
        } else if (typeof cell.value === 'number') {
          userEnteredValue = { numberValue: cell.value };
        } else if (typeof cell.value === 'boolean') {
          userEnteredValue = { boolValue: cell.value };
        } else {
          userEnteredValue = { stringValue: String(cell.value || '') };
        }

        // Build userEnteredFormat
        const userEnteredFormat = {};
        let hasFormat = false;

        if (cell.bold !== undefined || cell.italic !== undefined || cell.fontSize || cell.textColor) {
          userEnteredFormat.textFormat = {};
          if (cell.bold !== undefined) userEnteredFormat.textFormat.bold = cell.bold;
          if (cell.italic !== undefined) userEnteredFormat.textFormat.italic = cell.italic;
          if (cell.fontSize) userEnteredFormat.textFormat.fontSize = cell.fontSize;
          if (cell.textColor) userEnteredFormat.textFormat.foregroundColor = parseColor(cell.textColor);
          hasFormat = true;
        }

        if (cell.bgColor) {
          userEnteredFormat.backgroundColor = parseColor(cell.bgColor);
          hasFormat = true;
        }

        if (cell.align) {
          userEnteredFormat.horizontalAlignment = cell.align.toUpperCase();
          hasFormat = true;
        }

        const result = { userEnteredValue };
        if (hasFormat) {
          result.userEnteredFormat = userEnteredFormat;
        }

        return result;
      })
    };
  });

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        updateCells: {
          rows,
          fields: 'userEnteredValue,userEnteredFormat',
          start: {
            sheetId,
            rowIndex: startRow,
            columnIndex: startCol
          }
        }
      }]
    }
  });

  return response.data;
}

/**
 * Append rows to a spreadsheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - A1 notation range (table to append to)
 * @param {Array<Array<any>>|string} values - 2D array of rows to append
 * @param {object} options - { raw: boolean }
 * @returns {Promise<Object>} Append response
 */
async function appendRows(spreadsheetId, range, values, options = {}) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const parsedValues = safeJsonParse(values, 'values');

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: parsedValues
    }
  });

  return response.data;
}

// ============ Batch Operations ============

/**
 * BATCH data updates - write multiple ranges in ONE API call
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {array|string} updates - Array of { range: "A1:B2", values: [[...]] }
 * @param {object} options - { raw: boolean }
 * @returns {Promise<object>} Result with counts
 */
async function batchUpdate(spreadsheetId, updates, options = {}) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const ops = safeJsonParse(updates, 'updates');

  const data = ops.map(op => ({
    range: op.range,
    values: op.values
  }));

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    resource: {
      valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
      data
    }
  });

  return {
    success: true,
    rangesUpdated: response.data.totalUpdatedSheets || ops.length,
    cellsUpdated: response.data.totalUpdatedCells,
    apiCalls: 1
  };
}

/**
 * Write multiple cells in ONE API call
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - The tab/sheet name
 * @param {array|string} cells - Array of { cell: "A1", value: "..." } or { row, col, value }
 * @param {object} options - { raw: boolean }
 * @returns {Promise<object>} Result with cell count
 */
async function writeCells(spreadsheetId, tabName, cells, options = {}) {
  validateNonEmptyString(spreadsheetId, 'spreadsheetId');
  validateNonEmptyString(tabName, 'tabName');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const cellsArray = safeJsonParse(cells, 'cells');

  if (!Array.isArray(cellsArray) || cellsArray.length === 0) {
    throw new Error('cells must be a non-empty array');
  }

  // Convert cells to batch update format
  const data = cellsArray.map(cell => {
    let range;
    if (cell.cell) {
      range = `${tabName}!${cell.cell}`;
    } else if (cell.row !== undefined && cell.col !== undefined) {
      const colLetter = columnToLetter(cell.col);
      const rowNum = cell.row + 1;
      range = `${tabName}!${colLetter}${rowNum}`;
    } else {
      throw new Error('Each cell must have either "cell" (A1 notation) or "row" and "col" properties');
    }

    return {
      range,
      values: [[cell.value]]
    };
  });

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    resource: {
      valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
      data
    }
  });

  return {
    success: true,
    cellsUpdated: response.data.totalUpdatedCells,
    apiCalls: 1
  };
}

/**
 * Write a single row of values in ONE API call
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - The tab/sheet name
 * @param {number} row - 0-indexed row number
 * @param {number} startCol - 0-indexed starting column
 * @param {array|string} values - Array of values to write horizontally
 * @param {object} options - { raw: boolean }
 * @returns {Promise<object>} Result with range info
 */
async function writeRow(spreadsheetId, tabName, row, startCol, values, options = {}) {
  validateNonEmptyString(spreadsheetId, 'spreadsheetId');
  validateNonEmptyString(tabName, 'tabName');
  validateNonNegativeInt(row, 'row');
  validateNonNegativeInt(startCol, 'startCol');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const valuesArray = safeJsonParse(values, 'values');

  if (!Array.isArray(valuesArray) || valuesArray.length === 0) {
    throw new Error('values must be a non-empty array');
  }

  const startColLetter = columnToLetter(startCol);
  const endColLetter = columnToLetter(startCol + valuesArray.length - 1);
  const rowNum = row + 1;
  const range = `${tabName}!${startColLetter}${rowNum}:${endColLetter}${rowNum}`;

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
    requestBody: {
      values: [valuesArray]
    }
  });

  return {
    success: true,
    cellsUpdated: response.data.updatedCells,
    range: response.data.updatedRange
  };
}

/**
 * Write a single column of values in ONE API call
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - The tab/sheet name
 * @param {number} startRow - 0-indexed starting row
 * @param {number} col - 0-indexed column number
 * @param {array|string} values - Array of values to write vertically
 * @param {object} options - { raw: boolean }
 * @returns {Promise<object>} Result with range info
 */
async function writeCol(spreadsheetId, tabName, startRow, col, values, options = {}) {
  validateNonEmptyString(spreadsheetId, 'spreadsheetId');
  validateNonEmptyString(tabName, 'tabName');
  validateNonNegativeInt(startRow, 'startRow');
  validateNonNegativeInt(col, 'col');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const valuesArray = safeJsonParse(values, 'values');

  if (!Array.isArray(valuesArray) || valuesArray.length === 0) {
    throw new Error('values must be a non-empty array');
  }

  const colLetter = columnToLetter(col);
  const startRowNum = startRow + 1;
  const endRowNum = startRow + valuesArray.length;
  const range = `${tabName}!${colLetter}${startRowNum}:${colLetter}${endRowNum}`;

  // Convert flat array to 2D array (one value per row)
  const values2D = valuesArray.map(v => [v]);

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: options.raw ? 'RAW' : 'USER_ENTERED',
    requestBody: {
      values: values2D
    }
  });

  return {
    success: true,
    cellsUpdated: response.data.updatedCells,
    range: response.data.updatedRange
  };
}

// ============ Tab/Sheet Operations ============

/**
 * Get spreadsheet metadata
 * @param {string} spreadsheetId - The spreadsheet ID
 * @returns {Promise<Object>} Spreadsheet info including title and sheet names
 */
async function getSheetInfo(spreadsheetId) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties'
  });

  return {
    title: response.data.properties.title,
    sheets: response.data.sheets.map(s => ({
      id: s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index
    }))
  };
}

/**
 * Create a new spreadsheet
 * @param {string} title - The spreadsheet title
 * @param {Object} options - Options
 * @param {string} options.tabName - Name of the first sheet (default: 'Sheet1')
 * @param {Array<Array<any>>} options.data - Initial data to populate
 * @param {boolean} options.formatHeader - Auto-format first row as header (default: true)
 * @returns {Promise<Object>} Created spreadsheet info { id, url, title, sheetId }
 */
async function createSpreadsheet(title, options = {}) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const tabName = options.tabName || 'Sheet1';

  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: tabName } }]
    }
  });

  const spreadsheetId = createResponse.data.spreadsheetId;
  const sheetId = createResponse.data.sheets[0].properties.sheetId;
  const url = createResponse.data.spreadsheetUrl;

  // Add initial data if provided
  if (options.data && options.data.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: options.data }
    });

    // Format header row if requested (default: true)
    if (options.formatHeader !== false) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            },
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: options.data[0]?.length || 10 }
              }
            }
          ]
        }
      });
    }
  }

  return { id: spreadsheetId, url, title, sheetId };
}

/**
 * Create a new tab in the spreadsheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Name for the new tab
 * @param {number} index - Position index (default: 0)
 * @returns {Promise<object>} New sheet info
 */
async function createTab(spreadsheetId, tabName, index = 0) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        addSheet: {
          properties: {
            title: tabName,
            index: parseInt(index, 10)
          }
        }
      }]
    }
  });

  const newSheet = response.data.replies[0].addSheet;
  return {
    sheetId: newSheet.properties.sheetId,
    title: newSheet.properties.title,
    index: newSheet.properties.index
  };
}

/**
 * Delete a tab from the spreadsheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {number} sheetId - The sheet ID to delete
 * @returns {Promise<object>} Deletion confirmation
 */
async function deleteTab(spreadsheetId, sheetId) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        deleteSheet: {
          sheetId: parseInt(sheetId, 10)
        }
      }]
    }
  });

  return { deleted: true, sheetId };
}

/**
 * Rename a tab in a spreadsheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} oldName - Current tab name
 * @param {string} newName - New tab name
 * @returns {Promise<object>} Result with old and new names
 */
async function renameTab(spreadsheetId, oldName, newName) {
  validateNonEmptyString(spreadsheetId, 'spreadsheetId');
  validateNonEmptyString(oldName, 'oldName');
  validateNonEmptyString(newName, 'newName');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const info = await getSheetInfo(spreadsheetId);
  const sheet = info.sheets.find(s => s.title === oldName);
  if (!sheet) {
    const availableTabs = info.sheets.map(s => s.title).join(', ');
    throw new Error(`Tab "${oldName}" not found. Available tabs: ${availableTabs}`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        updateSheetProperties: {
          properties: {
            sheetId: sheet.id,
            title: newName
          },
          fields: 'title'
        }
      }]
    }
  });

  return { oldName, newName, sheetId: sheet.id };
}

/**
 * Copy a tab within the same spreadsheet or to another spreadsheet
 * @param {string} spreadsheetId - Source spreadsheet ID
 * @param {number} sheetId - Sheet ID to copy
 * @param {string} destSpreadsheetId - Destination spreadsheet ID (default: same)
 * @returns {Promise<object>} New sheet info
 */
async function copyTab(spreadsheetId, sheetId, destSpreadsheetId = null) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.sheets.copyTo({
    spreadsheetId,
    sheetId: parseInt(sheetId, 10),
    resource: {
      destinationSpreadsheetId: destSpreadsheetId || spreadsheetId
    }
  });

  return {
    sheetId: response.data.sheetId,
    title: response.data.title,
    index: response.data.index
  };
}

// ============ Cell Merge Operations ============

/**
 * Merge cells in a range
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed start row
 * @param {number} startCol - 0-indexed start column
 * @param {number} endRow - 0-indexed end row (exclusive)
 * @param {number} endCol - 0-indexed end column (exclusive)
 * @returns {Promise<object>} Merge confirmation
 */
async function mergeCells(spreadsheetId, tabName, startRow, startCol, endRow, endCol) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol
          },
          mergeType: 'MERGE_ALL'
        }
      }]
    }
  });

  return { merged: true };
}

/**
 * Unmerge cells in a range
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed start row
 * @param {number} startCol - 0-indexed start column
 * @param {number} endRow - 0-indexed end row (exclusive)
 * @param {number} endCol - 0-indexed end column (exclusive)
 * @returns {Promise<object>} Unmerge confirmation
 */
async function unmergeCells(spreadsheetId, tabName, startRow, startCol, endRow, endCol) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        unmergeCells: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol
          }
        }
      }]
    }
  });

  return { unmerged: true };
}

/**
 * SAFE batch merge - merge multiple ranges with safety checks
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {array|string} merges - Array of { row, col, rows, cols }
 * @param {object|string} options - { force: boolean, baseRow: number, baseCol: number }
 * @returns {Promise<object>} Result or conflict info
 */
async function batchMerge(spreadsheetId, tabName, merges, options = {}) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  const ops = safeJsonParse(merges, 'merges');
  const opts = safeJsonParse(options, 'options');

  const baseRow = opts.baseRow || 0;
  const baseCol = opts.baseCol || 0;

  // If not forcing, check for existing merges first
  if (!opts.force) {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [tabName],
      fields: 'sheets(merges)'
    });

    const existingMerges = meta.data.sheets[0]?.merges || [];

    // Check for conflicts
    const conflicts = [];
    for (const merge of ops) {
      const r1 = baseRow + merge.row;
      const c1 = baseCol + merge.col;
      const r2 = r1 + (merge.rows || 1);
      const c2 = c1 + (merge.cols || 1);

      for (const existing of existingMerges) {
        if (!(r2 <= existing.startRowIndex || r1 >= existing.endRowIndex ||
              c2 <= existing.startColumnIndex || c1 >= existing.endColumnIndex)) {
          conflicts.push({ requested: merge, existing });
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        success: false,
        error: 'Merge conflicts detected',
        conflicts,
        hint: 'Use { force: true } to override, or unmerge first'
      };
    }
  }

  // Build merge requests
  const requests = ops.map(merge => ({
    mergeCells: {
      range: {
        sheetId,
        startRowIndex: baseRow + merge.row,
        endRowIndex: baseRow + merge.row + (merge.rows || 1),
        startColumnIndex: baseCol + merge.col,
        endColumnIndex: baseCol + merge.col + (merge.cols || 1)
      },
      mergeType: 'MERGE_ALL'
    }
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: { requests }
  });

  return { success: true, mergesApplied: ops.length, apiCalls: 1 };
}

// ============ Row/Column Operations ============

/**
 * Delete rows from a sheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed start row
 * @param {number} endRow - 0-indexed end row (exclusive)
 * @returns {Promise<object>} Deletion confirmation
 */
async function deleteRows(spreadsheetId, tabName, startRow, endRow) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: startRow,
            endIndex: endRow
          }
        }
      }]
    }
  });

  return { deleted: true, rowsDeleted: endRow - startRow };
}

/**
 * Delete columns from a sheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startCol - 0-indexed start column
 * @param {number} endCol - 0-indexed end column (exclusive)
 * @returns {Promise<object>} Deletion confirmation
 */
async function deleteColumns(spreadsheetId, tabName, startCol, endCol) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: startCol,
            endIndex: endCol
          }
        }
      }]
    }
  });

  return { deleted: true, colsDeleted: endCol - startCol };
}

/**
 * Insert rows into a sheet
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed row to insert before
 * @param {number} numRows - Number of rows to insert
 * @returns {Promise<object>} Insertion confirmation
 */
async function insertRows(spreadsheetId, tabName, startRow, numRows) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: startRow,
            endIndex: startRow + numRows
          },
          inheritFromBefore: startRow > 0
        }
      }]
    }
  });

  return { inserted: true, rowsInserted: numRows };
}

// ============ Clear Operations ============

/**
 * Clear a range of cells (values only, keeps formatting)
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} range - A1 notation range
 * @returns {Promise<object>} Clear confirmation
 */
async function clearRange(spreadsheetId, range) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range
  });

  return { cleared: true, range };
}

/**
 * Clear a range of cells including formatting
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed start row
 * @param {number} startCol - 0-indexed start column
 * @param {number} endRow - 0-indexed end row (exclusive)
 * @param {number} endCol - 0-indexed end column (exclusive)
 * @returns {Promise<object>} Clear confirmation
 */
async function clearRangeAll(spreadsheetId, tabName, startRow, startCol, endRow, endCol) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  const numRows = endRow - startRow;
  const numCols = endCol - startCol;
  const rows = [];
  for (let r = 0; r < numRows; r++) {
    const values = [];
    for (let c = 0; c < numCols; c++) {
      values.push({
        userEnteredValue: { stringValue: '' },
        userEnteredFormat: {}
      });
    }
    rows.push({ values });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        updateCells: {
          rows,
          fields: 'userEnteredValue,userEnteredFormat',
          start: {
            sheetId,
            rowIndex: startRow,
            columnIndex: startCol
          }
        }
      }]
    }
  });

  return { cleared: true };
}

// ============ Validation Operations ============

/**
 * Set data validation on a range
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed start row
 * @param {number} startCol - 0-indexed start column
 * @param {number} endRow - 0-indexed end row (exclusive)
 * @param {number} endCol - 0-indexed end column (exclusive)
 * @param {object|string} validationConfig - { type, values, strict, showDropdown, inputMessage, formula }
 * @returns {Promise<object>} Validation confirmation
 */
async function setValidation(spreadsheetId, tabName, startRow, startCol, endRow, endCol, validationConfig) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  const config = safeJsonParse(validationConfig, 'validationConfig');

  let condition;
  switch (config.type) {
    case 'list':
      condition = {
        type: 'ONE_OF_LIST',
        values: (config.values || []).map(v => ({ userEnteredValue: String(v) }))
      };
      break;
    case 'number':
      if (config.values && config.values.length === 2) {
        condition = {
          type: 'NUMBER_BETWEEN',
          values: [
            { userEnteredValue: String(config.values[0]) },
            { userEnteredValue: String(config.values[1]) }
          ]
        };
      } else {
        condition = { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '0' }] };
      }
      break;
    case 'date':
      condition = { type: 'DATE_IS_VALID' };
      break;
    case 'checkbox':
      condition = { type: 'BOOLEAN' };
      break;
    case 'custom':
      condition = {
        type: 'CUSTOM_FORMULA',
        values: [{ userEnteredValue: config.formula || '=TRUE' }]
      };
      break;
    default:
      throw new Error(`Unknown validation type: ${config.type}`);
  }

  const rule = {
    condition,
    strict: config.strict !== false,
    showCustomUi: config.showDropdown !== false
  };

  if (config.inputMessage) {
    rule.inputMessage = config.inputMessage;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol
          },
          rule
        }
      }]
    }
  });

  return { validationSet: true, type: config.type };
}

/**
 * Clear data validation from a range
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string} tabName - Tab name
 * @param {number} startRow - 0-indexed start row
 * @param {number} startCol - 0-indexed start column
 * @param {number} endRow - 0-indexed end row (exclusive)
 * @param {number} endCol - 0-indexed end column (exclusive)
 * @returns {Promise<object>} Clear confirmation
 */
async function clearValidation(spreadsheetId, tabName, startRow, startCol, endRow, endCol) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetId = await getSheetIdByName(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [{
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol
          },
          rule: null
        }
      }]
    }
  });

  return { validationCleared: true };
}

// ============ Exports ============

module.exports = {
  // Auth (re-export for convenience)
  getAuthClient,

  // Read
  getValues,
  readRangeMeta,

  // Write
  writeValue,
  updateRange,
  updateValues: updateRange, // alias for backwards compatibility
  updateWithFormatting,
  appendRows,

  // Batch
  batchUpdate,
  writeCells,
  writeRow,
  writeCol,

  // Tab/Sheet
  getSheetInfo,
  getSpreadsheetInfo: getSheetInfo, // alias
  createSpreadsheet,
  createTab,
  deleteTab,
  renameTab,
  copyTab,

  // Cell merge
  mergeCells,
  unmergeCells,
  batchMerge,

  // Row/Column
  deleteRows,
  deleteColumns,
  insertRows,

  // Clear
  clearRange,
  clearValues: clearRange, // alias
  clearRangeAll,

  // Validation
  setValidation,
  clearValidation,
};
