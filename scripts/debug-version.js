const { confluence } = require('./atlassian-api');

async function main() {
  const pageId = '801440083';
  try {
    const verData = await confluence.getVersion(pageId, 7);
    console.log('Keys:', Object.keys(verData));
    console.log('Body:', JSON.stringify(verData.body || 'missing'));
    console.log('History:', JSON.stringify(verData.history || 'missing'));
  } catch (e) {
    console.error(e);
  }
}

main();

