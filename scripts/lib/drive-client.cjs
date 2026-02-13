// PM AI Starter Kit - Google Drive Client Library
// See scripts/README.md for setup instructions
//
// Shared library for Google Drive operations.
// Uses unified google-auth.cjs for OAuth2 authentication.

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getAuthClient } = require('./google-auth.cjs');

async function listFiles(query = null, options = {}) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const params = {
    pageSize: options.pageSize || 100,
    orderBy: options.orderBy || 'modifiedTime desc',
    fields: 'files(id, name, mimeType, size, modifiedTime, parents, webViewLink)',
    spaces: 'drive'
  };
  const queryParts = [];
  if (query) queryParts.push(query);
  if (options.folderId) queryParts.push(`'${options.folderId}' in parents`);
  queryParts.push('trashed = false');
  if (queryParts.length > 0) params.q = queryParts.join(' and ');
  const response = await drive.files.list(params);
  return response.data.files || [];
}

async function searchFiles(searchText, options = {}) {
  return listFiles(`fullText contains '${searchText.replace(/'/g, "\\'")}'`, options);
}

async function getFileMetadata(fileId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink, description, owners'
  });
  return response.data;
}

async function downloadFile(fileId, destPath, options = {}) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const metadata = await getFileMetadata(fileId);
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = fs.createWriteStream(destPath);
  const isGoogleWorkspace = metadata.mimeType.startsWith('application/vnd.google-apps.');
  if (isGoogleWorkspace) {
    let exportMimeType = options.mimeType;
    if (!exportMimeType) {
      const exportDefaults = {
        'application/vnd.google-apps.document': 'application/pdf',
        'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.google-apps.presentation': 'application/pdf',
        'application/vnd.google-apps.drawing': 'image/png'
      };
      exportMimeType = exportDefaults[metadata.mimeType] || 'application/pdf';
    }
    const response = await drive.files.export({ fileId, mimeType: exportMimeType }, { responseType: 'stream' });
    return new Promise((resolve, reject) => { response.data.on('end', () => resolve(destPath)).on('error', reject).pipe(dest); });
  } else {
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return new Promise((resolve, reject) => { response.data.on('end', () => resolve(destPath)).on('error', reject).pipe(dest); });
  }
}

async function uploadFile(name, content, options = {}) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = { name };
  if (options.folderId) fileMetadata.parents = [options.folderId];
  if (options.description) fileMetadata.description = options.description;
  let media;
  if (typeof content === 'string' && fs.existsSync(content)) {
    media = { mimeType: options.mimeType || 'application/octet-stream', body: fs.createReadStream(content) };
  } else if (Buffer.isBuffer(content)) {
    const { Readable } = require('stream');
    media = { mimeType: options.mimeType || 'application/octet-stream', body: Readable.from(content) };
  } else {
    const { Readable } = require('stream');
    media = { mimeType: options.mimeType || 'text/plain', body: Readable.from([content]) };
  }
  const response = await drive.files.create({ requestBody: fileMetadata, media, fields: 'id, name, mimeType, webViewLink' });
  return response.data;
}

async function createFolder(name, parentId = null) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) fileMetadata.parents = [parentId];
  const response = await drive.files.create({ requestBody: fileMetadata, fields: 'id, name, webViewLink' });
  return response.data;
}

async function moveFile(fileId, newParentId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const file = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = file.data.parents ? file.data.parents.join(',') : '';
  const response = await drive.files.update({ fileId, addParents: newParentId, removeParents: previousParents, fields: 'id, name, parents, webViewLink' });
  return response.data;
}

async function copyFile(fileId, newName = null, folderId = null) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const requestBody = {};
  if (newName) requestBody.name = newName;
  if (folderId) requestBody.parents = [folderId];
  const response = await drive.files.copy({ fileId, requestBody, fields: 'id, name, mimeType, webViewLink' });
  return response.data;
}

async function deleteFile(fileId, permanent = false) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  if (permanent) { await drive.files.delete({ fileId }); } else { await drive.files.update({ fileId, requestBody: { trashed: true } }); }
}

async function getFileContent(fileId) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const metadata = await getFileMetadata(fileId);
  if (metadata.mimeType === 'application/vnd.google-apps.document') {
    const response = await drive.files.export({ fileId, mimeType: 'text/plain' });
    return response.data;
  } else if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const response = await drive.files.export({ fileId, mimeType: 'text/csv' });
    return response.data;
  } else {
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
    return response.data;
  }
}

async function listFolder(folderId, options = {}) {
  return listFiles(null, { ...options, folderId });
}

module.exports = {
  listFiles, searchFiles, getFileMetadata, downloadFile, uploadFile,
  createFolder, moveFile, copyFile, deleteFile, getFileContent, listFolder
};
