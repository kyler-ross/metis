/**
 * Google Drive Client Library
 *
 * Shared library for Google Drive operations.
 * Uses unified google-auth.js for OAuth2 authentication.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getAuthClient } = require('./google-auth.cjs');

// ============ Public API ============

/**
 * List files in Drive with optional query
 * @param {string} query - Drive query syntax (e.g., "name contains 'PRD'")
 * @param {Object} options - Options
 * @param {number} options.pageSize - Number of results (default 100)
 * @param {string} options.orderBy - Sort order (default 'modifiedTime desc')
 * @param {string} options.folderId - Limit to specific folder
 * @returns {Promise<Array<Object>>} Array of file objects
 */
async function listFiles(query = null, options = {}) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const params = {
    pageSize: options.pageSize || 100,
    orderBy: options.orderBy || 'modifiedTime desc',
    fields: 'files(id, name, mimeType, size, modifiedTime, parents, webViewLink)',
    spaces: 'drive'
  };

  // Build query
  const queryParts = [];
  if (query) {
    queryParts.push(query);
  }
  if (options.folderId) {
    queryParts.push(`'${options.folderId}' in parents`);
  }
  // Exclude trashed files by default
  queryParts.push('trashed = false');

  if (queryParts.length > 0) {
    params.q = queryParts.join(' and ');
  }

  const response = await drive.files.list(params);
  return response.data.files || [];
}

/**
 * Search files by full-text content
 * @param {string} searchText - Text to search for
 * @param {Object} options - Options (same as listFiles)
 * @returns {Promise<Array<Object>>} Array of matching files
 */
async function searchFiles(searchText, options = {}) {
  return listFiles(`fullText contains '${searchText.replace(/'/g, "\\'")}'`, options);
}

/**
 * Get file metadata
 * @param {string} fileId - The file ID
 * @returns {Promise<Object>} File metadata
 */
async function getFileMetadata(fileId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink, description, owners'
  });

  return response.data;
}

/**
 * Download file to local path
 * @param {string} fileId - The file ID
 * @param {string} destPath - Local destination path
 * @param {Object} options - Options
 * @param {string} options.mimeType - Export mimeType for Google Docs (e.g., 'application/pdf')
 * @returns {Promise<string>} Path to downloaded file
 */
async function downloadFile(fileId, destPath, options = {}) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // First get file metadata to determine type
  const metadata = await getFileMetadata(fileId);

  // Create destination directory if it doesn't exist
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const dest = fs.createWriteStream(destPath);

  // Google Workspace files need export, others use media download
  const isGoogleWorkspace = metadata.mimeType.startsWith('application/vnd.google-apps.');

  if (isGoogleWorkspace) {
    // Determine export format
    let exportMimeType = options.mimeType;
    if (!exportMimeType) {
      // Default exports by type
      const exportDefaults = {
        'application/vnd.google-apps.document': 'application/pdf',
        'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.google-apps.presentation': 'application/pdf',
        'application/vnd.google-apps.drawing': 'image/png'
      };
      exportMimeType = exportDefaults[metadata.mimeType] || 'application/pdf';
    }

    const response = await drive.files.export(
      { fileId, mimeType: exportMimeType },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve(destPath))
        .on('error', reject)
        .pipe(dest);
    });
  } else {
    // Regular file download
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve(destPath))
        .on('error', reject)
        .pipe(dest);
    });
  }
}

/**
 * Upload a file to Drive
 * @param {string} name - File name
 * @param {string|Buffer} content - File content (path to local file or buffer)
 * @param {Object} options - Options
 * @param {string} options.mimeType - MIME type of the file
 * @param {string} options.folderId - Parent folder ID
 * @param {string} options.description - File description
 * @returns {Promise<Object>} Created file metadata
 */
async function uploadFile(name, content, options = {}) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name
  };

  if (options.folderId) {
    fileMetadata.parents = [options.folderId];
  }

  if (options.description) {
    fileMetadata.description = options.description;
  }

  // Determine media body
  let media;
  if (typeof content === 'string' && fs.existsSync(content)) {
    // It's a file path
    media = {
      mimeType: options.mimeType || 'application/octet-stream',
      body: fs.createReadStream(content)
    };
  } else if (Buffer.isBuffer(content)) {
    // It's a buffer
    const { Readable } = require('stream');
    media = {
      mimeType: options.mimeType || 'application/octet-stream',
      body: Readable.from(content)
    };
  } else {
    // It's string content
    const { Readable } = require('stream');
    media = {
      mimeType: options.mimeType || 'text/plain',
      body: Readable.from([content])
    };
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, mimeType, webViewLink'
  });

  return response.data;
}

/**
 * Create a folder
 * @param {string} name - Folder name
 * @param {string} parentId - Parent folder ID (optional)
 * @returns {Promise<Object>} Created folder metadata
 */
async function createFolder(name, parentId = null) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name, webViewLink'
  });

  return response.data;
}

/**
 * Move a file to a different folder
 * @param {string} fileId - File ID to move
 * @param {string} newParentId - New parent folder ID
 * @returns {Promise<Object>} Updated file metadata
 */
async function moveFile(fileId, newParentId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // First get current parents
  const file = await drive.files.get({
    fileId,
    fields: 'parents'
  });

  const previousParents = file.data.parents ? file.data.parents.join(',') : '';

  const response = await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: previousParents,
    fields: 'id, name, parents, webViewLink'
  });

  return response.data;
}

/**
 * Copy a file
 * @param {string} fileId - File ID to copy
 * @param {string} newName - Name for the copy (optional)
 * @param {string} folderId - Destination folder ID (optional)
 * @returns {Promise<Object>} Copied file metadata
 */
async function copyFile(fileId, newName = null, folderId = null) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const requestBody = {};

  if (newName) {
    requestBody.name = newName;
  }

  if (folderId) {
    requestBody.parents = [folderId];
  }

  const response = await drive.files.copy({
    fileId,
    requestBody,
    fields: 'id, name, mimeType, webViewLink'
  });

  return response.data;
}

/**
 * Delete a file (move to trash)
 * @param {string} fileId - File ID to delete
 * @param {boolean} permanent - If true, permanently delete (default: false)
 * @returns {Promise<void>}
 */
async function deleteFile(fileId, permanent = false) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  if (permanent) {
    await drive.files.delete({ fileId });
  } else {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true }
    });
  }
}

/**
 * Get file content as text (for text-based files)
 * @param {string} fileId - File ID
 * @returns {Promise<string>} File content as string
 */
async function getFileContent(fileId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  // First check if it's a Google Docs file
  const metadata = await getFileMetadata(fileId);

  if (metadata.mimeType === 'application/vnd.google-apps.document') {
    // Export as plain text
    const response = await drive.files.export({
      fileId,
      mimeType: 'text/plain'
    });
    return response.data;
  } else if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Export as CSV
    const response = await drive.files.export({
      fileId,
      mimeType: 'text/csv'
    });
    return response.data;
  } else {
    // Regular file - get media
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    return response.data;
  }
}

/**
 * List contents of a folder
 * @param {string} folderId - Folder ID
 * @param {Object} options - Options (same as listFiles)
 * @returns {Promise<Array<Object>>} Array of file objects
 */
async function listFolder(folderId, options = {}) {
  return listFiles(null, { ...options, folderId });
}

module.exports = {
  listFiles,
  searchFiles,
  getFileMetadata,
  downloadFile,
  uploadFile,
  createFolder,
  moveFile,
  copyFile,
  deleteFile,
  getFileContent,
  listFolder
};
