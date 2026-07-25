const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const bcrypt = require('bcrypt');

admin.initializeApp();
const db = getFirestore();

const TEST_PIN = '123456';
const COMPANY_ID = 'MwtqusMMlFBKTFSslRVk';  // JLS FINANCE LTD
const COMPANY_CODE = 'jls';

// Use a test customer with a specific phone - GEETA DEVI
const TEST_CUSTOMER_ID = '076xwddIWO7B4dXZOVG7';
const TEST_PHONE = '8003986362';

async function setTestPin() {
  const hash = await bcrypt.hash(TEST_PIN, 10);
  await db.collection('customers').doc(TEST_CUSTOMER_ID).update({
    pinHash: hash,
    pinVersion: FieldValue.increment(1),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    active: true,
  });
  console.log('Test PIN set for customer', TEST_CUSTOMER_ID);
}

async function verifyCustomerPin(phone, companyCode, pin, label) {
  const url = 'https://verifycustomerpin-exc2ifqbqq-uc.a.run.app';
  const body = { data: { phone, companyCode, pin } };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const result = json.error ? 'FAIL: ' + json.error.message : 'PASS: logged in as ' + (json.result?.customerName || 'unknown');
    console.log('  [' + label + '] ' + result + (json.result?.customToken ? ' (got token)' : ''));
    return { pass: !json.error, data: json.result || json.error };
  } catch (e) {
    console.log('  [' + label + '] ERROR: ' + e.message);
    return { pass: false, data: null };
  }
}

async function runTests() {
  console.log('=== PHASE A PRODUCTION VALIDATION ===\n');

  // Setup: set test PIN
  console.log('[SETUP] Setting test PIN for ' + TEST_PHONE);
  await setTestPin();

  // ===== TEST 1: Correct phone + correct PIN =====
  console.log('\n--- Test 1: Customer login with correct phone + correct PIN ---');
  const t1 = await verifyCustomerPin(TEST_PHONE, COMPANY_CODE, TEST_PIN, 'T1 correct login');
  if (t1.pass) console.log('  RESULT: PASS');
  else console.log('  RESULT: FAIL');

  // ===== TEST 2: Wrong PIN =====
  console.log('\n--- Test 2: Wrong PIN ---');
  const t2 = await verifyCustomerPin(TEST_PHONE, COMPANY_CODE, '999999', 'T2 wrong PIN');
  if (!t2.pass && t2.data?.message === 'Invalid phone number or PIN.') {
    console.log('  RESULT: PASS (generic error, no enumeration)');
  } else if (t2.pass) {
    console.log('  RESULT: FAIL (should not succeed with wrong PIN)');
  } else {
    console.log('  RESULT: FAIL (wrong error: ' + t2.data?.message + ')');
  }

  // ===== TEST 3: Wrong phone =====
  console.log('\n--- Test 3: Wrong phone ---');
  const t3 = await verifyCustomerPin('9999999999', COMPANY_CODE, TEST_PIN, 'T3 wrong phone');
  if (!t3.pass && t3.data?.message === 'Invalid phone number or PIN.') {
    console.log('  RESULT: PASS (generic error, no enumeration)');
  } else if (t3.pass) {
    console.log('  RESULT: FAIL (should not succeed with wrong phone)');
  } else {
    console.log('  RESULT: FAIL (wrong error: ' + t3.data?.message + ')');
  }

  // ===== TEST 4: Five failed attempts → lock for 15 minutes =====
  console.log('\n--- Test 4: Five failed attempts → lock for 15 minutes ---');
  for (let i = 1; i <= 5; i++) {
    const r = await verifyCustomerPin(TEST_PHONE, COMPANY_CODE, '000000', 'T4 attempt ' + i);
    if (i < 5 && r.pass) {
      console.log('  FAIL: attempt ' + i + ' should not succeed');
    }
    if (i === 5 && !r.pass) {
      console.log('  Attempt 5 blocked as expected');
    }
  }
  // Verify lockout - 6th attempt should also fail
  const t4LockCheck = await verifyCustomerPin(TEST_PHONE, COMPANY_CODE, TEST_PIN, 'T4 after lock (correct PIN)');
  if (t4LockCheck.pass) {
    console.log('  RESULT: FAIL (correct PIN succeeded during lockout)');
  } else {
    console.log('  RESULT: PASS (correct PIN blocked during lockout)');
  }

  // ===== Cleanup: reset test customer's PIN and failed attempts =====
  console.log('\n[CLEANUP] Resetting test customer state');
  await db.collection('customers').doc(TEST_CUSTOMER_ID).update({
    pinHash: '',
    pinVersion: FieldValue.increment(1),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
  });
  console.log('Test customer reset complete');

  console.log('\n=== VALIDATION COMPLETE ===');
}

runTests().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
