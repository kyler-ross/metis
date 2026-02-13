// PM AI Starter Kit - google-drive-api.js
#!/usr/bin/env node
/**
 * Google Drive API CLI
 *
 * Command-line interface for Google Drive operations.
 *
 * Usage:
 *   node google-drive-api.js list [query]            - List files (optional Drive query)
 *   node google-drive-api.js search <text>           - Full-text search
 *   node google-drive-api.js info <fileId>           - Get file metadata
 *   node google-drive-api.js download <fileId> <dest> - Download file
 *   node google-drive-api.js upload <path> [name] [folderId] - Upload file
 *   node google-drive-api.js mkdir <name> [parentId] - Create folder
 *   node google-drive-api.js mv <fileId> <folderId>  - Move file
 *   node google-drive-api.js cp <fileId> [newName] [folderId] - Copy file
 *   node google-drive-api.js rm <fileId>             - Delete file (trash)
 *   node google-drive-api.js cat <fileId>            - Get file content as text
 *   node google-drive-api.js ls <folderId>           - List folder contents
 *
 * Examples:
 *   node google-drive-api.js list "name contains 'PRD'"
 *   node google-drive-api.js search "quarterly review"
 *   node google-drive-api.js info 1abc123def456
 *   node google-drive-api.js download 1abc123def456 ./output.pdf
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import driveClient from './lib/drive-client.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Parse arguments
const [,, command, ...args] = process.argv;

// Help text
function showHelp() {
  console.log(`
Google Drive API CLI

Usage:
  node google-drive-api.js <command> [arguments]

Commands:
  list [query]                    List files (optional Drive query syntax)
  search <text>                   Full-text search in file content
  info <fileId>                   Get file metadata
  download <fileId> <dest>        Download file to local path
  upload <path> [name] [folderId] Upload file to Drive
  mkdir <name> [parentId]         Create folder
  mv <fileId> <folderId>          Move file to folder
  cp <fileId> [newName] [folderId] Copy file
  rm <fileId>                     Delete file (move to trash)
  cat <fileId>                    Get text content of file
  ls <folderId>                   List folder contents

Query Syntax Examples:
  "name contains 'budget'"        Files with 'budget' in name
  "mimeType = 'application/pdf'"  PDF files only
  "modifiedTime > '2024-01-01'"   Modified after date
  "'folderId' in parents"         Files in specific folder

For more query syntax: https://developers.google.com/drive/api/v3/search-files
`);
}

// Format file size
function formatSize(bytes) {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = parseInt(bytes);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit > 0 ? 1 : 0)} ${units[unit]}`;
}

// Format date
function formatDate(isoDate) {
  if (!isoDate) return '-';
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Main execution
async function main() {
  try {
    switch (command) {
      case 'list': {
        const query = args[0] || null;
        const files = await driveClient.listFiles(query);
        if (files.length === 0) {
          console.log('No files found.');
        } else {
          console.log(`Found ${files.length} files:\n`);
          for (const file of files) {
            // Show file type indicator
            let type = '';
            if (file.mimeType.includes('folder')) type = '[FOLDER]';
            else if (file.mimeType.includes('spreadsheet')) type = '[SHEET]';
            else if (file.mimeType.includes('document')) type = '[DOC]';
            else if (file.mimeType.includes('presentation')) type = '[SLIDES]';
            else if (file.mimeType.includes('pdf')) type = '[PDF]';
            console.log(`${file.id}  ${formatDate(file.modifiedTime)}  ${formatSize(file.size).padStart(10)}  ${type.padEnd(9)} ${file.name}`);
          }
        }
        break;
      }

      case 'search': {
        if (!args[0]) {
          console.error('ERROR: search text is required');
          process.exit(1);
        }
        const files = await driveClient.searchFiles(args[0]);
        if (files.length === 0) {
          console.log('No files found matching search.');
        } else {
          console.log(`Found ${files.length} files:\n`);
          for (const file of files) {
            console.log(`${file.id}  ${formatDate(file.modifiedTime)}  ${file.name}`);
          }
        }
        break;
      }

      case 'info': {
        if (!args[0]) {
          console.error('ERROR: fileId is required');
          process.exit(1);
        }
        const metadata = await driveClient.getFileMetadata(args[0]);
        console.log(`File: ${metadata.name}`);
        console.log(`ID: ${metadata.id}`);
        console.log(`Type: ${metadata.mimeType}`);
        console.log(`Size: ${formatSize(metadata.size)}`);
        console.log(`Created: ${formatDate(metadata.createdTime)}`);
        console.log(`Modified: ${formatDate(metadata.modifiedTime)}`);
        if (metadata.description) {
          console.log(`Description: ${metadata.description}`);
        }
        if (metadata.webViewLink) {
          console.log(`Link: ${metadata.webViewLink}`);
        }
        if (metadata.owners && metadata.owners.length > 0) {
          console.log(`Owner: ${metadata.owners[0].displayName || metadata.owners[0].emailAddress}`);
        }
        break;
      }

      case 'download': {
        if (!args[0] || !args[1]) {
          console.error('ERROR: fileId and destination path are required');
          process.exit(1);
        }
        const destPath = path.resolve(args[1]);
        console.log(`Downloading to ${destPath}...`);
        await driveClient.downloadFile(args[0], destPath);
        console.log(`Downloaded: ${destPath}`);
        break;
      }

      case 'upload': {
        if (!args[0]) {
          console.error('ERROR: file path is required');
          process.exit(1);
        }
        const filePath = path.resolve(args[0]);
        const name = args[1] || path.basename(filePath);
        const options = {};
        if (args[2]) {
          options.folderId = args[2];
        }
        console.log(`Uploading ${filePath}...`);
        const file = await driveClient.uploadFile(name, filePath, options);
        console.log(`Uploaded: ${file.name}`);
        console.log(`ID: ${file.id}`);
        if (file.webViewLink) {
          console.log(`Link: ${file.webViewLink}`);
        }
        break;
      }

      case 'mkdir': {
        if (!args[0]) {
          console.error('ERROR: folder name is required');
          process.exit(1);
        }
        const folder = await driveClient.createFolder(args[0], args[1] || null);
        console.log(`Created folder: ${folder.name}`);
        console.log(`ID: ${folder.id}`);
        if (folder.webViewLink) {
          console.log(`Link: ${folder.webViewLink}`);
        }
        break;
      }

      case 'mv': {
        if (!args[0] || !args[1]) {
          console.error('ERROR: fileId and folderId are required');
          process.exit(1);
        }
        const file = await driveClient.moveFile(args[0], args[1]);
        console.log(`Moved: ${file.name}`);
        console.log(`New location: ${file.parents ? file.parents[0] : 'root'}`);
        break;
      }

      case 'cp': {
        if (!args[0]) {
          console.error('ERROR: fileId is required');
          process.exit(1);
        }
        const file = await driveClient.copyFile(args[0], args[1] || null, args[2] || null);
        console.log(`Copied: ${file.name}`);
        console.log(`ID: ${file.id}`);
        if (file.webViewLink) {
          console.log(`Link: ${file.webViewLink}`);
        }
        break;
      }

      case 'rm': {
        if (!args[0]) {
          console.error('ERROR: fileId is required');
          process.exit(1);
        }
        await driveClient.deleteFile(args[0]);
        console.log(`Moved to trash: ${args[0]}`);
        break;
      }

      case 'cat': {
        if (!args[0]) {
          console.error('ERROR: fileId is required');
          process.exit(1);
        }
        const content = await driveClient.getFileContent(args[0]);
        console.log(content);
        break;
      }

      case 'ls': {
        if (!args[0]) {
          console.error('ERROR: folderId is required');
          process.exit(1);
        }
        const files = await driveClient.listFolder(args[0]);
        if (files.length === 0) {
          console.log('Folder is empty.');
        } else {
          console.log(`${files.length} items:\n`);
          for (const file of files) {
            let type = '';
            if (file.mimeType.includes('folder')) type = '[FOLDER]';
            else if (file.mimeType.includes('spreadsheet')) type = '[SHEET]';
            else if (file.mimeType.includes('document')) type = '[DOC]';
            else if (file.mimeType.includes('presentation')) type = '[SLIDES]';
            else if (file.mimeType.includes('pdf')) type = '[PDF]';
            console.log(`${file.id}  ${formatDate(file.modifiedTime)}  ${formatSize(file.size).padStart(10)}  ${type.padEnd(9)} ${file.name}`);
          }
        }
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
