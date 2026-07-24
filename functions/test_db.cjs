const fs = require('fs');
const path = require('path');
const os = require('os');

async function main() {
  const homeDir = os.homedir();
  const p = path.join(homeDir, '.config', 'configstore', 'firebase-tools.json');

  let accessToken = null;

  if (fs.existsSync(p)) {
    try {
      const content = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (content.tokens && content.tokens.access_token) {
        accessToken = content.tokens.access_token;
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }

  if (accessToken) {
    await runRestQueries(accessToken);
  } else {
    process.exit(1);
  }
}

async function runRestQueries(accessToken) {
  const projectId = 'jls-finance-company';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  
  async function runQuery(structuredQuery) {
    const res = await fetch(`${baseUrl}:runQuery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ structuredQuery })
    });
    return await res.json();
  }

  try {
    // Count ALL docs in ledger collection
    const res = await runQuery({
      from: [{ collectionId: 'ledger' }]
    });
    const totalLedgerDocs = res.filter(r => r.document).length;
    console.log("TOTAL_LEDGER_DOCS:" + totalLedgerDocs);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
