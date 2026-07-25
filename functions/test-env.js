const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp();
const db = getFirestore();

async function run() {
  const companiesSnap = await db.collection('companies').limit(5).get();
  console.log('=== COMPANIES ===');
  companiesSnap.forEach(doc => {
    const d = doc.data();
    console.log('id: ' + doc.id + ' | name: ' + d.name + ' | code: ' + (d.code || (d.name ? d.name.substring(0,3).toLowerCase() : 'N/A')));
  });

  const customersSnap = await db.collection('customers').limit(10).get();
  console.log('\n=== CUSTOMERS (first 10) ===');
  customersSnap.forEach(doc => {
    const d = doc.data();
    console.log('id: ' + doc.id + ' | phone: ' + d.phone + ' | name: ' + d.name + ' | hasPin: ' + !!d.pinHash + ' | companyId: ' + d.companyId + ' | active: ' + d.active);
  });

  const pinSnap = await db.collection('customers').where('pinHash', '!=', null).limit(5).get();
  console.log('\n=== CUSTOMERS WITH PIN ===');
  pinSnap.forEach(doc => {
    const d = doc.data();
    console.log('id: ' + doc.id + ' | phone: ' + d.phone + ' | name: ' + d.name + ' | pinVersion: ' + d.pinVersion + ' | companyId: ' + d.companyId);
  });
}

run().then(() => process.exit(0)).catch(function(e) { console.error(e); process.exit(1); });
