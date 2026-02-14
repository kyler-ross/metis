#!/usr/bin/env node
/**
 * Google Docs Creator with Markdown Support
 *
 * Creates, reads, and updates Google Docs with proper markdown formatting:
 * - # Title, ## Heading 1, ### Heading 2, #### Heading 3
 * - **bold**, *italic*, ***bold italic***
 * - Bullet lists (- item or * item) → Native Google Docs bullets
 * - Numbered lists (1. item) → Native Google Docs numbered lists
 * - Horizontal rules (---) → Actual horizontal line
 *
 * Usage:
 *   node google-docs-creator.js create <docName> <content|filepath> [--file]
 *   node google-docs-creator.js read <docId>
 *   node google-docs-creator.js update <docId> <content|filepath> [--file]
 *   node google-docs-creator.js append <docId> <content|filepath> [--file]
 *   node google-docs-creator.js search <docId> "text"
 *   node google-docs-creator.js insert <docId> <position> "text"
 *   node google-docs-creator.js replace <docId> "old text" "new text"
 *   node google-docs-creator.js delete <docId> "text"
 *   node google-docs-creator.js copy <docId> "new name"
 *
 *   # Legacy (no command):
 *   node google-docs-creator.js <docName> <content|filepath> [--file]  # Creates new doc
 *   node google-docs-creator.js <content|filepath> <docId> [--file]    # Updates if docId detected
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { run } = require('./lib/script-runner.cjs');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URL = 'http://localhost:3000/oauth2callback';
const TOKEN_PATH = path.join(__dirname, '.google-token.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set in .env');
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

async function authorizeAndGetToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oauth2Client.setCredentials(token);
    if (token.refresh_token) {
      return oauth2Client;
    }
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URL);
        const code = url.searchParams.get('code');

        if (!code) {
          res.writeHead(400);
          res.end('No authorization code received');
          server.close();
          reject(new Error('No auth code'));
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
              <h1>✅ Success!</h1>
              <p>Authorization complete. You can close this window.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(oauth2Client);
      } catch (error) {
        res.writeHead(500);
        res.end('Error: ' + error.message);
        server.close();
        reject(error);
      }
    });

    server.listen(3000, () => {
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/docs', 'https://www.googleapis.com/auth/drive']
      });

      console.log('\n🔐 Opening browser for authorization...\n');
      require('child_process').spawn('open', [authUrl], { stdio: 'ignore' });
    });

    server.on('error', reject);
  });
}

/**
 * Parse markdown tables and return table data
 * Returns { tables: [{startLine, endLine, headers, rows}], remainingMarkdown }
 */
function extractTables(markdown) {
  const lines = markdown.split('\n');
  const tables = [];
  const outputLines = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check if this looks like a table row (starts with |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // Look ahead to see if this is a complete table
      const tableLines = [];
      let j = i;

      while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }

      // Need at least 2 rows (header + separator or header + data)
      if (tableLines.length >= 2) {
        // Check if second line is a separator (|---|---|)
        const secondLine = tableLines[1].trim();
        const isSeparator = /^\|[\s\-:|]+\|$/.test(secondLine);

        if (isSeparator && tableLines.length >= 3) {
          // Valid markdown table with header
          const headers = tableLines[0]
            .split('|')
            .filter(cell => cell.trim() !== '')
            .map(cell => cell.trim());

          const rows = tableLines.slice(2).map(row =>
            row.split('|')
              .filter(cell => cell.trim() !== '')
              .map(cell => cell.trim())
          );

          tables.push({
            placeholder: `TABLEPLACEHOLDER${tables.length}TABLEPLACEHOLDER`,
            headers,
            rows
          });

          // Add placeholder in output
          outputLines.push(`TABLEPLACEHOLDER${tables.length - 1}TABLEPLACEHOLDER`);
          i = j;
          continue;
        }
      }
    }

    outputLines.push(line);
    i++;
  }

  return {
    tables,
    remainingMarkdown: outputLines.join('\n')
  };
}

/**
 * Insert a table into a Google Doc at a specific index
 */
async function insertTableAtIndex(docs, documentId, tableData, insertIndex) {
  const { headers, rows } = tableData;
  const numRows = rows.length + 1; // +1 for header row
  const numCols = headers.length;

  // Insert the table structure
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{
        insertTable: {
          rows: numRows,
          columns: numCols,
          location: { index: insertIndex }
        }
      }]
    }
  });

  // Get updated doc to find table cell indexes
  const updatedDoc = await docs.documents.get({ documentId });
  const content = updatedDoc.data.body.content;

  // Find the table we just inserted (should be at/after insertIndex)
  let table = null;
  for (const element of content) {
    if (element.table && element.startIndex >= insertIndex) {
      table = element;
      break;
    }
  }

  if (!table) {
    console.warn('⚠️  Could not find inserted table');
    return insertIndex;
  }

  // Build all table data (headers + rows)
  const allRows = [headers, ...rows];

  // Insert text into cells in reverse order (to avoid index shifting)
  const textRequests = [];
  for (let r = allRows.length - 1; r >= 0; r--) {
    for (let c = allRows[r].length - 1; c >= 0; c--) {
      const cell = table.table.tableRows[r]?.tableCells[c];
      if (cell && cell.content && cell.content[0]) {
        const cellIndex = cell.content[0].startIndex;
        const text = allRows[r][c] || '';

        if (text) {
          textRequests.push({
            insertText: {
              text: text,
              location: { index: cellIndex }
            }
          });
        }
      }
    }
  }

  if (textRequests.length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: textRequests }
    });
  }

  // Bold the header row
  const headerRow = table.table.tableRows[0];
  if (headerRow) {
    const boldRequests = [];
    for (let c = 0; c < headers.length; c++) {
      const cell = headerRow.tableCells[c];
      if (cell && cell.content && cell.content[0]) {
        const startIdx = cell.content[0].startIndex;
        const text = headers[c] || '';
        if (text) {
          boldRequests.push({
            updateTextStyle: {
              range: {
                startIndex: startIdx,
                endIndex: startIdx + text.length
              },
              textStyle: { bold: true },
              fields: 'bold'
            }
          });
        }
      }
    }

    if (boldRequests.length > 0) {
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: boldRequests }
        });
      } catch (e) {
        // Bold formatting may fail if indexes shifted, not critical
      }
    }
  }

  return table.endIndex;
}

/**
 * Parse markdown and return plain text + formatting requests
 */
function parseMarkdown(markdown) {
  const lines = markdown.split('\n');
  const segments = [];
  let plainText = '';
  let currentIndex = 1; // Google Docs starts at index 1

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let lineStart = currentIndex;
    let headingType = null;
    let listType = null;
    let nestLevel = 0;
    let isHorizontalRule = false;
    
    // Check for horizontal rule FIRST (before other processing)
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      isHorizontalRule = true;
      line = ''; // Will be handled specially
    }
    
    // Check for headings
    if (!isHorizontalRule) {
      if (line.startsWith('#### ')) {
        headingType = 'HEADING_4';
        line = line.substring(5);
      } else if (line.startsWith('### ')) {
        headingType = 'HEADING_3';
        line = line.substring(4);
      } else if (line.startsWith('## ')) {
        headingType = 'HEADING_2';
        line = line.substring(3);
      } else if (line.startsWith('# ')) {
        headingType = 'TITLE';
        line = line.substring(2);
      }
    }
    
    // Check for bullet lists (- item or * item), including nested
    if (!isHorizontalRule && !headingType) {
      const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
      if (bulletMatch) {
        nestLevel = Math.floor(bulletMatch[1].length / 2);
        listType = 'bullet';
        line = bulletMatch[3]; // Just the content after the bullet
      }
      
      // Check for numbered lists (1. item, 2. item)
      const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        nestLevel = Math.floor(numberedMatch[1].length / 2);
        listType = 'numbered';
        line = numberedMatch[3]; // Just the content after the number
      }
    }
    
    // Parse inline formatting (bold, italic) - skip for horizontal rules
    const inlineFormats = [];
    let processedLine = '';
    
    if (!isHorizontalRule) {
      let j = 0;
      while (j < line.length) {
        // Bold italic (***text***)
        if (line.substring(j, j + 3) === '***') {
          const endIdx = line.indexOf('***', j + 3);
          if (endIdx !== -1) {
            const text = line.substring(j + 3, endIdx);
            const startPos = currentIndex + processedLine.length;
            inlineFormats.push({ start: startPos, end: startPos + text.length, bold: true, italic: true });
            processedLine += text;
            j = endIdx + 3;
            continue;
          }
        }
        
        // Bold (**text**)
        if (line.substring(j, j + 2) === '**') {
          const endIdx = line.indexOf('**', j + 2);
          if (endIdx !== -1) {
            const text = line.substring(j + 2, endIdx);
            const startPos = currentIndex + processedLine.length;
            inlineFormats.push({ start: startPos, end: startPos + text.length, bold: true });
            processedLine += text;
            j = endIdx + 2;
            continue;
          }
        }
        
        // Italic (*text* or _text_) - careful not to match list markers
        if ((line[j] === '*' || line[j] === '_') && 
            line[j + 1] !== '*' && line[j + 1] !== '_' && 
            line[j + 1] !== ' ' && line[j + 1] !== undefined) {
          const marker = line[j];
          let endIdx = -1;
          // Find closing marker that's not preceded by space
          for (let k = j + 2; k < line.length; k++) {
            if (line[k] === marker && line[k - 1] !== ' ') {
              endIdx = k;
              break;
            }
          }
          if (endIdx !== -1) {
            const text = line.substring(j + 1, endIdx);
            const startPos = currentIndex + processedLine.length;
            inlineFormats.push({ start: startPos, end: startPos + text.length, italic: true });
            processedLine += text;
            j = endIdx + 1;
            continue;
          }
        }
        
        processedLine += line[j];
        j++;
      }
      line = processedLine;
    }
    
    // Build the final line
    let fullLine;
    if (isHorizontalRule) {
      fullLine = '\n'; // Just a newline, we'll insert the HR separately
    } else {
      fullLine = line + '\n';
    }
    
    plainText += fullLine;
    
    // Store segment info for formatting
    if (headingType) {
      segments.push({
        type: 'heading',
        style: headingType,
        start: lineStart,
        end: lineStart + fullLine.length
      });
    }
    
    // Store list info
    if (listType) {
      segments.push({
        type: 'list',
        listType: listType,
        nestLevel: nestLevel,
        start: lineStart,
        end: lineStart + fullLine.length
      });
    }
    
    // Store horizontal rule info
    if (isHorizontalRule) {
      segments.push({
        type: 'horizontalRule',
        index: lineStart
      });
    }
    
    // Store inline formatting
    for (const fmt of inlineFormats) {
      segments.push({
        type: 'inline',
        ...fmt
      });
    }
    
    currentIndex += fullLine.length;
  }
  
  return { plainText, segments, totalLength: currentIndex };
}

/**
 * Build Google Docs API formatting requests
 * Note: Must be applied in correct order - text styles first, then paragraph styles, then lists
 */
function buildFormattingRequests(segments) {
  const textStyleRequests = [];
  const paragraphStyleRequests = [];
  const listRequests = [];
  const hrRequests = [];
  
  for (const segment of segments) {
    if (segment.type === 'heading') {
      paragraphStyleRequests.push({
        updateParagraphStyle: {
          range: {
            startIndex: segment.start,
            endIndex: segment.end
          },
          paragraphStyle: {
            namedStyleType: segment.style
          },
          fields: 'namedStyleType'
        }
      });
    } else if (segment.type === 'list') {
      // Use native Google Docs bullets/numbering
      const bulletPreset = segment.listType === 'numbered' 
        ? 'NUMBERED_DECIMAL_ALPHA_ROMAN'
        : 'BULLET_DISC_CIRCLE_SQUARE';
      
      listRequests.push({
        createParagraphBullets: {
          range: {
            startIndex: segment.start,
            endIndex: segment.end
          },
          bulletPreset: bulletPreset
        }
      });
      
      // Handle nesting with indentation
      if (segment.nestLevel > 0) {
        paragraphStyleRequests.push({
          updateParagraphStyle: {
            range: {
              startIndex: segment.start,
              endIndex: segment.end
            },
            paragraphStyle: {
              indentStart: {
                magnitude: 36 * segment.nestLevel,
                unit: 'PT'
              },
              indentFirstLine: {
                magnitude: 18 + (36 * segment.nestLevel),
                unit: 'PT'
              }
            },
            fields: 'indentStart,indentFirstLine'
          }
        });
      }
    } else if (segment.type === 'horizontalRule') {
      // Insert a horizontal line using a paragraph with bottom border
      hrRequests.push({
        updateParagraphStyle: {
          range: {
            startIndex: segment.index,
            endIndex: segment.index + 1
          },
          paragraphStyle: {
            borderBottom: {
              color: { color: { rgbColor: { red: 0.8, green: 0.8, blue: 0.8 } } },
              width: { magnitude: 1, unit: 'PT' },
              padding: { magnitude: 8, unit: 'PT' },
              dashStyle: 'SOLID'
            }
          },
          fields: 'borderBottom'
        }
      });
    } else if (segment.type === 'inline') {
      const textStyle = {};
      const fields = [];
      
      if (segment.bold) {
        textStyle.bold = true;
        fields.push('bold');
      }
      if (segment.italic) {
        textStyle.italic = true;
        fields.push('italic');
      }
      
      if (fields.length > 0) {
        textStyleRequests.push({
          updateTextStyle: {
            range: {
              startIndex: segment.start,
              endIndex: segment.end
            },
            textStyle,
            fields: fields.join(',')
          }
        });
      }
    }
  }
  
  // Order matters: text styles, then paragraph styles, then lists, then HRs
  return [...textStyleRequests, ...paragraphStyleRequests, ...listRequests, ...hrRequests];
}

async function createFormattedDoc(markdownContent, docName) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log('📝 Creating document...');
    const createResponse = await docs.documents.create({
      requestBody: {
        title: docName || `Document - ${new Date().toISOString().split('T')[0]}`
      }
    });

    const documentId = createResponse.data.documentId;
    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    // Extract tables first
    const { tables, remainingMarkdown } = extractTables(markdownContent);

    // Parse markdown (with table placeholders)
    console.log('🔍 Parsing markdown...');
    const { plainText, segments } = parseMarkdown(remainingMarkdown);

    // Insert plain text first
    console.log('✏️  Inserting content...');
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          insertText: {
            text: plainText,
            location: { index: 1 }
          }
        }]
      }
    });

    // Apply formatting
    const formattingRequests = buildFormattingRequests(segments);
    if (formattingRequests.length > 0) {
      console.log(`🎨 Applying ${formattingRequests.length} formatting rules...`);

      // Apply in batches to avoid API limits
      const batchSize = 50;
      for (let i = 0; i < formattingRequests.length; i += batchSize) {
        const batch = formattingRequests.slice(i, i + batchSize);
        try {
          await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests: batch }
          });
        } catch (batchError) {
          console.warn(`⚠️  Some formatting in batch ${Math.floor(i/batchSize) + 1} failed, continuing...`);
        }
      }
    }

    // Insert tables at their placeholder positions
    if (tables.length > 0) {
      console.log(`📊 Inserting ${tables.length} table(s)...`);

      // Process tables in reverse order to maintain correct indexes
      for (let t = tables.length - 1; t >= 0; t--) {
        const table = tables[t];

        // Find the placeholder in the document
        const docResponse = await docs.documents.get({ documentId });
        const content = docResponse.data.body.content;

        let placeholderIndex = -1;
        let placeholderEndIndex = -1;

        for (const element of content) {
          if (element.paragraph) {
            for (const elem of element.paragraph.elements) {
              if (elem.textRun && elem.textRun.content.includes(table.placeholder)) {
                placeholderIndex = elem.startIndex;
                placeholderEndIndex = element.endIndex;
                break;
              }
            }
          }
          if (placeholderIndex !== -1) break;
        }

        if (placeholderIndex !== -1) {
          // Delete the placeholder text
          await docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [{
                deleteContentRange: {
                  range: {
                    startIndex: placeholderIndex,
                    endIndex: placeholderEndIndex - 1
                  }
                }
              }]
            }
          });

          // Insert the table
          await insertTableAtIndex(docs, documentId, table, placeholderIndex);
        }
      }
    }

    console.log(`\n✅ Document created: ${docUrl}\n`);
    return { documentId, url: docUrl };
  } catch (error) {
    console.error('\n❌ Error creating document:', error.message);
    if (error.errors) {
      console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

/**
 * Read the text content of an existing Google Doc
 */
async function readDoc(documentId) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log('📖 Reading document...');
    const docResponse = await docs.documents.get({ documentId });
    const doc = docResponse.data;

    // Extract text content
    let textContent = '';
    const content = doc.body.content;

    for (const element of content) {
      if (element.paragraph) {
        const paragraph = element.paragraph;
        for (const elem of paragraph.elements) {
          if (elem.textRun) {
            textContent += elem.textRun.content;
          }
        }
      } else if (element.table) {
        // Handle tables
        for (const row of element.table.tableRows) {
          for (const cell of row.tableCells) {
            for (const cellElement of cell.content) {
              if (cellElement.paragraph) {
                for (const elem of cellElement.paragraph.elements) {
                  if (elem.textRun) {
                    textContent += elem.textRun.content;
                  }
                }
              }
            }
          }
        }
      }
    }

    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    console.log(`\n✅ Document read successfully\n`);
    console.log(`Title: ${doc.title}`);
    console.log(`URL: ${docUrl}\n`);
    console.log('--- Content ---\n');
    console.log(textContent);
    console.log('\n--- End ---\n');

    return { documentId, title: doc.title, url: docUrl, content: textContent };
  } catch (error) {
    console.error('\n❌ Error reading document:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Replace ALL content in an existing Google Doc with new markdown content
 */
async function replaceDocContent(documentId, markdownContent) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log('📝 Fetching document...');
    const docResponse = await docs.documents.get({ documentId });
    const content = docResponse.data.body.content;

    // Find the end of the document
    let endIndex = 1;
    for (const element of content) {
      if (element.endIndex) {
        endIndex = Math.max(endIndex, element.endIndex);
      }
    }

    // Delete all existing content (except the first character which we can't delete)
    console.log('🗑️  Clearing existing content...');
    if (endIndex > 2) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [{
            deleteContentRange: {
              range: {
                startIndex: 1,
                endIndex: endIndex - 1
              }
            }
          }]
        }
      });
    }

    // Extract tables first
    const { tables, remainingMarkdown } = extractTables(markdownContent);

    // Parse markdown
    console.log('🔍 Parsing markdown...');
    const { plainText, segments } = parseMarkdown(remainingMarkdown);

    // Insert plain text
    console.log('✏️  Inserting new content...');
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          insertText: {
            text: plainText,
            location: { index: 1 }
          }
        }]
      }
    });

    // Apply formatting
    const formattingRequests = buildFormattingRequests(segments);
    if (formattingRequests.length > 0) {
      console.log(`🎨 Applying ${formattingRequests.length} formatting rules...`);

      const batchSize = 50;
      for (let i = 0; i < formattingRequests.length; i += batchSize) {
        const batch = formattingRequests.slice(i, i + batchSize);
        try {
          await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests: batch }
          });
          // Rate limit: pause between formatting batches
          if (i + batchSize < formattingRequests.length) {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (batchError) {
          console.warn(`⚠️  Some formatting in batch ${Math.floor(i/batchSize) + 1} failed, continuing...`);
        }
      }
    }

    // Pause before table insertion phase to stay within rate limits
    if (tables.length > 0) {
      console.log(`📊 Inserting ${tables.length} table(s)...`);
      await new Promise(r => setTimeout(r, 5000));

      for (let t = tables.length - 1; t >= 0; t--) {
        const table = tables[t];

        const docResp = await docs.documents.get({ documentId });
        const docContent = docResp.data.body.content;

        let placeholderIndex = -1;
        let placeholderEndIndex = -1;

        for (const element of docContent) {
          if (element.paragraph) {
            for (const elem of element.paragraph.elements) {
              if (elem.textRun && elem.textRun.content.includes(table.placeholder)) {
                placeholderIndex = elem.startIndex;
                placeholderEndIndex = element.endIndex;
                break;
              }
            }
          }
          if (placeholderIndex !== -1) break;
        }

        if (placeholderIndex !== -1) {
          await docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [{
                deleteContentRange: {
                  range: {
                    startIndex: placeholderIndex,
                    endIndex: placeholderEndIndex - 1
                  }
                }
              }]
            }
          });

          await insertTableAtIndex(docs, documentId, table, placeholderIndex);

          // Rate limit: pause between table insertions (each table = ~5 API calls)
          if (t > 0) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
    }

    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    console.log(`\n✅ Document replaced: ${docUrl}\n`);
    return { documentId, url: docUrl };
  } catch (error) {
    console.error('\n❌ Error replacing document:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Search for text in a Google Doc and return locations with context
 */
async function searchText(documentId, searchTerm) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log(`🔍 Searching for "${searchTerm}" in document...`);
    const docResponse = await docs.documents.get({ documentId });
    const doc = docResponse.data;

    // Extract full text with position tracking
    const matches = [];
    let fullText = '';
    const content = doc.body.content;

    for (const element of content) {
      if (element.paragraph) {
        for (const elem of element.paragraph.elements) {
          if (elem.textRun) {
            const text = elem.textRun.content;
            const startIdx = elem.startIndex;

            // Find all occurrences in this text run
            let searchIdx = 0;
            while (true) {
              const foundIdx = text.toLowerCase().indexOf(searchTerm.toLowerCase(), searchIdx);
              if (foundIdx === -1) break;

              const absoluteIdx = startIdx + foundIdx;
              const contextStart = Math.max(0, foundIdx - 40);
              const contextEnd = Math.min(text.length, foundIdx + searchTerm.length + 40);
              const context = text.substring(contextStart, contextEnd).replace(/\n/g, ' ');

              matches.push({
                index: absoluteIdx,
                endIndex: absoluteIdx + searchTerm.length,
                context: (contextStart > 0 ? '...' : '') + context + (contextEnd < text.length ? '...' : '')
              });

              searchIdx = foundIdx + 1;
            }
            fullText += text;
          }
        }
      }
    }

    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    console.log(`\n📄 Document: ${doc.title}`);
    console.log(`🔗 URL: ${docUrl}\n`);

    if (matches.length > 0) {
      console.log(`✅ Found ${matches.length} occurrence(s):\n`);
      matches.forEach((match, i) => {
        console.log(`  ${i + 1}. Index ${match.index}-${match.endIndex}: "${match.context}"`);
      });
    } else {
      console.log(`⚠️  No occurrences of "${searchTerm}" found\n`);
    }

    return { documentId, url: docUrl, matches };
  } catch (error) {
    console.error('\n❌ Error searching document:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Insert text at a specific position in a Google Doc
 * Position can be: "start", "end", a number, or "after:search term"
 */
async function insertText(documentId, position, text) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log('📝 Fetching document...');
    const docResponse = await docs.documents.get({ documentId });
    const content = docResponse.data.body.content;

    // Find the end of the document
    let endIndex = 1;
    for (const element of content) {
      if (element.endIndex) {
        endIndex = Math.max(endIndex, element.endIndex);
      }
    }

    // Determine insert index
    let insertIndex;
    if (position === 'start') {
      insertIndex = 1;
    } else if (position === 'end') {
      insertIndex = endIndex - 1;
    } else if (position.startsWith('after:')) {
      // Find the text and insert after it
      const searchTerm = position.substring(6);
      let found = false;

      for (const element of content) {
        if (element.paragraph) {
          for (const elem of element.paragraph.elements) {
            if (elem.textRun) {
              const idx = elem.textRun.content.indexOf(searchTerm);
              if (idx !== -1) {
                insertIndex = elem.startIndex + idx + searchTerm.length;
                found = true;
                break;
              }
            }
          }
        }
        if (found) break;
      }

      if (!found) {
        throw new Error(`\n❌ Could not find "${searchTerm}" in document`);
      }
    } else {
      insertIndex = parseInt(position, 10);
      if (isNaN(insertIndex)) {
        throw new Error('\\n❌ Invalid position. Use "start", "end", a number, or "after:text"');
      }
    }

    console.log(`✏️  Inserting at index ${insertIndex}...`);
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          insertText: {
            text: text,
            location: { index: insertIndex }
          }
        }]
      }
    });

    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    console.log(`\n✅ Text inserted: ${docUrl}\n`);
    return { documentId, url: docUrl, insertIndex };
  } catch (error) {
    console.error('\n❌ Error inserting text:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Delete specific text from a Google Doc
 */
async function deleteText(documentId, textToDelete) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log(`🗑️  Deleting "${textToDelete}" from document...`);

    // Use replaceAllText with empty string to delete
    const response = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          replaceAllText: {
            containsText: {
              text: textToDelete,
              matchCase: true
            },
            replaceText: ''
          }
        }]
      }
    });

    const occurrences = response.data.replies[0]?.replaceAllText?.occurrencesChanged || 0;
    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    if (occurrences > 0) {
      console.log(`\n✅ Deleted ${occurrences} occurrence(s): ${docUrl}\n`);
    } else {
      console.log(`\n⚠️  No occurrences of "${textToDelete}" found in document\n`);
    }

    return { documentId, url: docUrl, occurrences };
  } catch (error) {
    console.error('\n❌ Error deleting text:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Copy a Google Doc to a new document
 */
async function copyDoc(documentId, newName) {
  try {
    const auth = await authorizeAndGetToken();
    const drive = google.drive({ version: 'v3', auth });

    console.log('📋 Copying document...');

    const response = await drive.files.copy({
      fileId: documentId,
      requestBody: {
        name: newName
      }
    });

    const newDocId = response.data.id;
    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;

    console.log(`\n✅ Document copied: ${docUrl}`);
    console.log(`   New ID: ${newDocId}\n`);

    return { documentId: newDocId, url: docUrl, name: newName };
  } catch (error) {
    console.error('\n❌ Error copying document:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Find and replace text in an existing Google Doc
 */
async function replaceText(documentId, oldText, newText) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log(`🔍 Finding "${oldText}" in document...`);

    const response = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          replaceAllText: {
            containsText: {
              text: oldText,
              matchCase: true
            },
            replaceText: newText
          }
        }]
      }
    });

    const occurrences = response.data.replies[0]?.replaceAllText?.occurrencesChanged || 0;
    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    if (occurrences > 0) {
      console.log(`\n✅ Replaced ${occurrences} occurrence(s): ${docUrl}\n`);
    } else {
      console.log(`\n⚠️  No occurrences of "${oldText}" found in document\n`);
    }

    return { documentId, url: docUrl, occurrences };
  } catch (error) {
    console.error('\n❌ Error replacing text:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Append content to an existing Google Doc
 */
async function appendDocContent(documentId, markdownContent) {
  try {
    const auth = await authorizeAndGetToken();
    const docs = google.docs({ version: 'v1', auth });

    console.log('📝 Fetching document...');
    const docResponse = await docs.documents.get({ documentId });
    const content = docResponse.data.body.content;

    // Find the end of the document
    let endIndex = 1;
    for (const element of content) {
      if (element.endIndex) {
        endIndex = Math.max(endIndex, element.endIndex);
      }
    }

    // Parse markdown with offset
    const { plainText, segments } = parseMarkdown(markdownContent);

    // Offset all segments by the current end position
    const offsetSegments = segments.map(s => ({
      ...s,
      start: s.start !== undefined ? s.start + endIndex - 1 : undefined,
      end: s.end !== undefined ? s.end + endIndex - 1 : undefined,
      index: s.index !== undefined ? s.index + endIndex - 1 : undefined
    }));

    // Insert text
    console.log('✏️  Appending content...');
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{
          insertText: {
            text: '\n\n' + plainText,
            location: { index: endIndex - 1 }
          }
        }]
      }
    });

    // Apply formatting
    const formattingRequests = buildFormattingRequests(offsetSegments);
    if (formattingRequests.length > 0) {
      console.log(`🎨 Applying ${formattingRequests.length} formatting rules...`);
      const batchSize = 50;
      for (let i = 0; i < formattingRequests.length; i += batchSize) {
        const batch = formattingRequests.slice(i, i + batchSize);
        try {
          await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests: batch }
          });
        } catch (batchError) {
          console.warn(`⚠️  Some formatting failed, continuing...`);
        }
      }
    }

    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    console.log(`\n✅ Document appended: ${docUrl}\n`);
    return { documentId, url: docUrl };
  } catch (error) {
    console.error('\n❌ Error appending to document:', error.message);
    if (error.code === 404) {
      console.error('Document not found. Check the document ID and permissions.');
    }
    throw error;
  }
}

/**
 * Read content from stdin (for heredoc/pipe support)
 */
async function readStdin() {
  return new Promise((resolve) => {
    // Check if stdin has data (is a pipe/heredoc, not a TTY)
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim() || null);
    });
    // Timeout after 100ms if no data
    setTimeout(() => {
      if (!data) resolve(null);
    }, 100);
  });
}

// CLI handling
const args = process.argv.slice(2);

// Show help if no args
if (args.length === 0) {
  console.log(`
Google Docs API - Create, Read, Update Google Docs with Markdown

Usage:
  node google-docs-creator.js create <docName> <content|filepath> [--file]
  node google-docs-creator.js read <docId>
  node google-docs-creator.js update <docId> <content|filepath> [--file]
  node google-docs-creator.js append <docId> <content|filepath> [--file]

Commands:
  create   Create a new Google Doc with markdown content
  read     Read and display the content of an existing Google Doc
  update   Replace all content in an existing Google Doc
  append   Append content to the end of an existing Google Doc
  search   Find text and show locations with context
  insert   Insert text at a position (start, end, number, or "after:text")
  replace  Find and replace specific text
  delete   Remove specific text from the document
  copy     Duplicate a document with a new name

Markdown Support:
  # Title          → Title style
  ## Heading       → Heading 1
  ### Subheading   → Heading 2
  #### Minor       → Heading 3
  **bold**         → Bold text
  *italic*         → Italic text
  - item           → Native bullet list
  1. item          → Native numbered list
  ---              → Horizontal rule

Examples:
  # Create new doc (name first, then content)
  node google-docs-creator.js create "My Document" "# My Doc\\n\\nHello world"
  node google-docs-creator.js create "My Document" ./doc.md --file

  # Create new doc (heredoc - title first, content piped)
  node google-docs-creator.js create "My Document" << 'EOF'
  # My Doc

  Hello world with **bold** and *italic*.
  EOF

  # Read existing doc
  node google-docs-creator.js read 1abc...xyz789

  # Replace content (heredoc supported)
  node google-docs-creator.js update 1abc...xyz789 "# Updated\\n\\nNew content"
  node google-docs-creator.js update 1abc...xyz789 ./updated.md --file
  node google-docs-creator.js update 1abc...xyz789 << 'EOF'
  # New Content
  EOF

  # Append content (heredoc supported)
  node google-docs-creator.js append 1abc...xyz789 "## More content\\n\\nAdded text"
  node google-docs-creator.js append 1abc...xyz789 ./addition.md --file
  node google-docs-creator.js append 1abc...xyz789 << 'EOF'
  ## Added Section
  EOF

  # Search for text
  node google-docs-creator.js search 1abc...xyz789 "quarterly"

  # Insert text at position
  node google-docs-creator.js insert 1abc...xyz789 start "New intro\\n\\n"
  node google-docs-creator.js insert 1abc...xyz789 end "\\n\\nConclusion"
  node google-docs-creator.js insert 1abc...xyz789 "after:## Goals" "\\n\\nNew section here"

  # Find and replace text
  node google-docs-creator.js replace 1abc...xyz789 "old text" "new text"

  # Delete text
  node google-docs-creator.js delete 1abc...xyz789 "text to remove"

  # Copy document
  node google-docs-creator.js copy 1abc...xyz789 "My Document - Copy"

Legacy Usage (no command):
  node google-docs-creator.js <docName> <content|filepath>     # Creates new doc
  node google-docs-creator.js <content|filepath> <docId>       # Appends to doc (if ID detected)
`);
  return;
}

// Parse command and arguments
const command = args[0];
const isFile = args.includes('--file') || args.includes('-f');

// Helper function to check if a string looks like a document ID
function isDocumentId(str) {
  return str && str.length > 30 && /^[a-zA-Z0-9_-]+$/.test(str);
}

// Helper function to load content from file or use as-is
function loadContent(contentOrPath, requireFile = false) {
  if (!contentOrPath) return null;

  // Check if it's a file path
  if (fs.existsSync(contentOrPath) && (contentOrPath.endsWith('.md') || contentOrPath.endsWith('.txt') || requireFile)) {
    return fs.readFileSync(contentOrPath, 'utf-8');
  }

  return contentOrPath;
}

// Route commands - wrap in run() for resilient execution
run({
  name: 'google-docs-creator',
  mode: 'operational',
  services: ['google'],
}, async (ctx) => {
  try {
  // Read stdin first (for heredoc/pipe support)
  const stdinContent = await readStdin();

if (command === 'create') {
  const docName = args[1];
  const contentArg = args[2];

  // If stdin has content, first arg is the doc name, content comes from stdin
  if (stdinContent) {
    if (!docName) {
      throw new Error('Document name required for create command. Usage: create <docName> << EOF');
    }
    createFormattedDoc(stdinContent, docName);
  } else {
    // Traditional: first arg is name, second is content
    if (!docName) {
      throw new Error('Document name required for create command. Usage: create <docName> <content|filepath> [--file]');
    }

    if (!contentArg) {
      throw new Error('Content or filepath required for create command. Usage: create <docName> <content|filepath> [--file]');
    }

    // Validate argument order - detect if args appear swapped
    const nameHasNewlines = docName.includes('\n');
    const contentIsShort = contentArg.length < 100 && !contentArg.includes('\n') && !fs.existsSync(contentArg);

    if (nameHasNewlines || contentIsShort) {
      throw new Error('Arguments appear to be in wrong order.. . Expected: create <docName> <content|filepath>. . Your docName contains newlines or your content looks like a title.. The first argument should be the document title (short, no newlines).. The second argument should be the content (markdown text or filepath).');
    }

    const content = loadContent(contentArg, isFile);
    track('docs_create', { from_file: isFile, content_length: content.length });
    createFormattedDoc(content, docName);
  }

} else if (command === 'read') {
  const docId = args[1];

  if (!docId) {
    throw new Error('Document ID required for read command');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  readDoc(docId);

} else if (command === 'update') {
  const docId = args[1];
  const contentArg = args[2];

  // Support stdin: update <docId> << EOF
  const content = stdinContent || loadContent(contentArg, isFile);

  if (!docId) {
    throw new Error('Document ID required for update command');
  }

  if (!content) {
    throw new Error('Content required for update command. Usage: node google-docs-creator.js update <docId> "content".    or: node google-docs-creator.js update <docId> << EOF');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  replaceDocContent(docId, content);

} else if (command === 'append') {
  const docId = args[1];
  const contentArg = args[2];

  // Support stdin: append <docId> << EOF
  const content = stdinContent || loadContent(contentArg, isFile);

  if (!docId) {
    throw new Error('Document ID required for append command');
  }

  if (!content) {
    throw new Error('Content required for append command. Usage: node google-docs-creator.js append <docId> "content".    or: node google-docs-creator.js append <docId> << EOF');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  appendDocContent(docId, content);

} else if (command === 'search') {
  const docId = args[1];
  const searchTerm = args[2];

  if (!docId || !searchTerm) {
    throw new Error('Document ID and search term required for search command. Usage: search <docId> "text to find"');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  searchText(docId, searchTerm);

} else if (command === 'insert') {
  const docId = args[1];
  const position = args[2];
  const text = args[3];

  if (!docId || !position || text === undefined) {
    throw new Error('Document ID, position, and text required for insert command. Usage: insert <docId> <position> "text". Position: "start", "end", a number, or "after:search text"');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  insertText(docId, position, text);

} else if (command === 'replace') {
  const docId = args[1];
  const oldText = args[2];
  const newText = args[3];

  if (!docId || !oldText || newText === undefined) {
    throw new Error('Document ID, old text, and new text required for replace command. Usage: replace <docId> "old text" "new text"');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  replaceText(docId, oldText, newText);

} else if (command === 'delete') {
  const docId = args[1];
  const textToDelete = args[2];

  if (!docId || !textToDelete) {
    throw new Error('Document ID and text required for delete command. Usage: delete <docId> "text to delete"');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  deleteText(docId, textToDelete);

} else if (command === 'copy') {
  const docId = args[1];
  const newName = args[2];

  if (!docId || !newName) {
    throw new Error('Document ID and new name required for copy command. Usage: copy <docId> "New Document Name"');
  }

  if (!isDocumentId(docId)) {
    throw new Error('Invalid document ID format');
  }

  copyDoc(docId, newName);

} else {
  // Legacy mode: no command specified
  const docNameArg = args[0];
  const contentOrIdArg = args[1];

  // If stdin has content, treat first arg as doc name
  if (stdinContent) {
    if (!docNameArg) {
      throw new Error('Document name required. Usage: <docName> << EOF');
    }

    if (isDocumentId(docNameArg)) {
      console.log('⚠️  Detected document ID - appending to existing document');
      console.log('    (Use explicit commands: create, read, update, append)\n');
      appendDocContent(docNameArg, stdinContent);
    } else {
      createFormattedDoc(stdinContent, docNameArg);
    }
  } else {
    if (!docNameArg) {
      throw new Error('Document name required. Usage: <docName> <content|filepath>');
    }

    // Document ID check for legacy mode - if second arg is a doc ID, we're appending
    if (isDocumentId(contentOrIdArg)) {
      // First arg is content, second is doc ID (append mode)
      const content = loadContent(docNameArg, isFile);
      console.log('⚠️  Detected document ID - appending to existing document');
      console.log('    (Use explicit commands: create, read, update, append)\n');
      appendDocContent(contentOrIdArg, content);
    } else if (isDocumentId(docNameArg)) {
      // First arg is doc ID (legacy update mode)
      const content = loadContent(contentOrIdArg, isFile);
      console.log('⚠️  Detected document ID - appending to existing document');
      console.log('    (Use explicit commands: create, read, update, append)\n');
      appendDocContent(docNameArg, content);
    } else {
      // Create mode: first arg is name, second is content
      if (!contentOrIdArg) {
        throw new Error('Content or filepath required. Usage: <docName> <content|filepath>');
      }

      // Validate argument order - detect if args appear swapped
      const nameHasNewlines = docNameArg.includes('\n');
      const contentIsShort = contentOrIdArg.length < 100 && !contentOrIdArg.includes('\n') && !fs.existsSync(contentOrIdArg);

      if (nameHasNewlines || contentIsShort) {
        throw new Error('Arguments appear to be in wrong order.. . Expected: <docName> <content|filepath>. . Your docName contains newlines or your content looks like a title.. The first argument should be the document title (short, no newlines).. The second argument should be the content (markdown text or filepath).');
      }

      const content = loadContent(contentOrIdArg, isFile);
      createFormattedDoc(content, docNameArg);
    }
  }
}

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    throw error;
  }
});
