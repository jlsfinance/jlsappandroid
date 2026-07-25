const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const bcrypt = require('bcrypt');

admin.initializeApp();
const db = getFirestore();

async function runSummary() {
  console.log('=== POST-TEST CLEANUP ===');
  
  // Reset test customer PIN back to 123456
  const hash = await bcrypt.hash('123456', 10);
  await db.collection('customers').doc('076xwddIWO7B4dXZOVG7').update({
    pinHash: hash,
    pinVersion: FieldValue.increment(1),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    active: true,
  });
  console.log('Test customer PIN reset to 123456, attempts cleared');
  
  // Remove rate limit entries
  const rlSnap = await db.collection('rate_limits').get();
  let deleted = 0;
  for (const doc of rlSnap.docs) {
    await doc.ref.delete();
    deleted++;
  }
  console.log('Deleted ' + deleted + ' rate limit entries');
  
  // Verify final state
  const c = await db.collection('customers').doc('076xwddIWO7B4dXZOVG7').get();
  const d = c.data();
  console.log('\nFinal customer state:');
  console.log('  hasPin: ' + !!d.pinHash);
  console.log('  attempts: ' + d.pinFailedAttempts);
  console.log('  lockedUntil: ' + d.pinLockedUntil);
  console.log('  active: ' + d.active);
  console.log('  pinVersion: ' + d.pinVersion);
  
  console.log('\n=== CLEANUP COMPLETE ===');
}

runSummary().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
