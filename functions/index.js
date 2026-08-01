const functions = require('firebase-functions');
const { onSchedule } = require('firebase-functions/scheduler');
const { onRequest, onCall } = require('firebase-functions/https');
const { onDocumentCreated } = require('firebase-functions/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const { JWT } = require('google-auth-library');
const Razorpay = require('razorpay');
const bcrypt = require('bcrypt');
const express = require('express');
const db = getFirestore();

const requireAuth = (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }
  return request.auth.uid;
};

// ─── WhatsApp auto-reminders (server-side, runs even if PC is off) ───
const WASENDER_API_KEY = defineSecret('WASENDER_API_KEY');
const RTDN_SECRET = defineSecret('RTDN_WEBHOOK_SECRET');
const API_BASE = 'https://www.wasenderapi.com';
const JLS_COMPANY_ID = 'MwtqusMMlFBKTFSslRVk';
const MAX_PER_RUN = 40; // Wasender trial cap guard

const normalizePhone = (p) => {
  if (!p) return '';
  let n = String(p).replace(/[^0-9]/g, '');
  if (n.length === 10) n = '91' + n;
  return n;
};

const sendWhatsApp = async (phone, text) => {
  const to = normalizePhone(phone);
  if (!to) return false;
  const apiKey = process.env.WASENDER_API_KEY || '';
  try {
    const res = await fetch(`${API_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to, text }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.success !== false;
  } catch (e) {
    console.error('Wasender send error', e);
    return false;
  }
};

const emiText = (name, amount, dueDate, loanId) =>
  `नमस्ते ${name} जी! 🙏\n\nयह JLS Finance Ltd से एक विनम्र अनुरोध है।\n\n` +
  `आपकी EMI की जानकारी:\n💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
  `📅 देय तिथि: ${dueDate}\n🆔 लोन ID: ${loanId}\n\n` +
  `कृपया समय पर भुगतान करें ताकि कोई अतिरिक्त शुल्क न लगे।\n\nधन्यवाद! 😊\n- JLS Finance Ltd`;

const depositText = (name, amount, dueDate, depositId, kistNo) =>
  `नमस्ते ${name} जी! 🙏\n\nयह JLS Finance Ltd से एक विनम्र अनुरोध है।\n\n` +
  `आपकी किस्त की जानकारी:\n💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
  `📅 देय तिथि: ${dueDate}\n🆔 डिपॉजिट ID: ${depositId} • किस्त #${kistNo}\n\n` +
  `कृपया समय पर जमा करें ताकि कोई अतिरिक्त शुल्क न लगे।\n\nधन्यवाद! 😊\n- JLS Finance Ltd`;

const runReminders = async () => {
  const ym = new Date().toISOString().slice(0, 7); // yyyy-MM
  let sent = 0;
  try {
    const [loanSnap, depSnap, custSnap] = await Promise.all([
      db.collection('loans').where('companyId', '==', JLS_COMPANY_ID).get(),
      db.collection('deposits').where('companyId', '==', JLS_COMPANY_ID).get(),
      db.collection('customers').where('companyId', '==', JLS_COMPANY_ID).get(),
    ]);
    const phoneMap = {};
    custSnap.forEach((d) => { phoneMap[d.id] = d.data().phone || ''; });

      const queue = [];
      loanSnap.forEach((d) => {
        const l = d.data();
        (l.repaymentSchedule || []).forEach((e) => {
          if (e.status === 'Pending' && (e.dueDate || '').slice(0, 7) === ym) {
            const name = l.customerName || (custSnap.docs.find(c => c.id === l.customerId)?.data().name) || 'Customer';
            queue.push({ key: `${JLS_COMPANY_ID}_${ym}_L_${l.id}_${e.emiNumber}`, phone: phoneMap[l.customerId], text: emiText(name, e.amount, (e.dueDate || '').slice(0, 10), l.id), name, amount: e.amount, emiNo: e.emiNumber, loanId: l.id });
          }
        });
      });
      depSnap.forEach((d) => {
        const x = d.data();
        (x.depositSchedule || []).forEach((s) => {
          if (s.status === 'Pending' && (s.dueDate || '').slice(0, 7) === ym) {
            const name = x.customerName || (custSnap.docs.find(c => c.id === x.customerId)?.data().name) || 'Customer';
            queue.push({ key: `${JLS_COMPANY_ID}_${ym}_D_${x.id}_${s.installmentNumber}`, phone: phoneMap[x.customerId], text: depositText(name, s.amount, (s.dueDate || '').slice(0, 10), x.id, s.installmentNumber), name, amount: s.amount, emiNo: s.installmentNumber, loanId: x.id });
          }
        });
      });

      for (const item of queue) {
        if (sent >= MAX_PER_RUN) break;
        if (!item.phone) continue;
        const ref = db.collection('wa_reminders').doc(item.key);
        const existing = await ref.get();
        if (existing.exists) continue; // already sent this month
        const ok = await sendWhatsApp(item.phone, item.text);
        if (ok) {
          await ref.set({ sentAt: FieldValue.serverTimestamp() });
          sent++;
        }
        await new Promise((r) => setTimeout(r, 60000)); // 1-min gap (API rate limit)
      }
    console.log(`WhatsApp reminders sent: ${sent}/${queue.length}`);
    return { sent, total: queue.length };
  } catch (e) {
    console.error('runReminders error', e);
    return { error: String(e) };
  }
};

exports.sendMonthlyWhatsappReminders = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'Asia/Kolkata', secrets: [WASENDER_API_KEY] }, // daily 10 AM IST (1-min gap per msg)
  async () => { await runReminders(); return null; }
);

// ponytail: daily admin detail summary at 9:05 AM IST -> 9413821007
const ADMIN_NUMBER = '9413821007';
exports.sendAdminSummary = onSchedule(
  { schedule: '5 9 * * *', timeZone: 'Asia/Kolkata', secrets: [WASENDER_API_KEY] },
  async () => {
    try {
      const ym = new Date().toISOString().slice(0, 7);
      const today = new Date().toISOString().slice(0, 10);
      const [loanSnap, depSnap, custSnap, paySnap] = await Promise.all([
        db.collection('loans').where('companyId', '==', JLS_COMPANY_ID).get(),
        db.collection('deposits').where('companyId', '==', JLS_COMPANY_ID).get(),
        db.collection('customers').where('companyId', '==', JLS_COMPANY_ID).get(),
        db.collection('payments').where('companyId', '==', JLS_COMPANY_ID).get(),
      ]);
      const phoneOf = (id) => custSnap.docs.find(c => c.id === id)?.data().phone || 'N/A';

      const lines = [];
      let dueEmi = 0, dueDep = 0;
      loanSnap.forEach((d) => {
        const l = d.data();
        (l.repaymentSchedule || []).forEach((e) => {
          if (e.status === 'Pending' && (e.dueDate || '').slice(0, 7) === ym) {
            dueEmi++;
            const name = l.customerName || 'Customer';
            lines.push(`💳 ${name} | ₹${Number(e.amount).toLocaleString('en-IN')} | EMI#${e.emiNumber} | 📞 ${phoneOf(l.customerId)} | ID ${l.id}`);
          }
        });
      });
      depSnap.forEach((d) => {
        const x = d.data();
        (x.depositSchedule || []).forEach((s) => {
          if (s.status === 'Pending' && (s.dueDate || '').slice(0, 7) === ym) {
            dueDep++;
            const name = x.customerName || 'Customer';
            lines.push(`🏦 ${name} | ₹${Number(s.amount).toLocaleString('en-IN')} | Kist#${s.installmentNumber} | 📞 ${phoneOf(x.customerId)} | ID ${x.id}`);
          }
        });
      });

      let collectedToday = 0;
      paySnap.forEach((d) => {
        const p = d.data();
        if ((p.paymentDate || '').slice(0, 10) === today || (p.date || '').slice(0, 10) === today) collectedToday++;
      });

      let text = `📊 JLS Finance Daily (${today})\nEMI due: ${dueEmi} | Dep due: ${dueDep} | Collected today: ${collectedToday}\n`;
      if (lines.length) text += `\n` + lines.join('\n');
      text += `\n\n- JLS Finance Ltd`;
      await sendWhatsApp(ADMIN_NUMBER, text);
      console.log('Admin summary sent');
    } catch (e) {
      console.error('sendAdminSummary error', e);
    }
    return null;
  }
);

// ─── Daily EMI push reminders (FCM, customer-only, per-company isolation) ───
// ponytail: V1 simplifications — single-token send (no multicast); overdue notifies once
// per due-date not daily; no "tomorrow" reminder yet. Add those when needed.
exports.sendDailyEmiPushReminders = onSchedule(
  { schedule: '30 9 * * *', timeZone: 'Asia/Kolkata' }, // daily 9:30 AM IST
  async () => {
    let sent = 0;
    try {
      const now = new Date();
      const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const today = istNow.toISOString().slice(0, 10); // yyyy-MM-dd in IST

      const loanSnap = await db.collection('loans')
        .where('companyId', '==', JLS_COMPANY_ID)
        .where('status', 'in', ['Active', 'Disbursed', 'Overdue'])
        .get();

      const matchMap = new Map();
      for (const loanDoc of loanSnap.docs) {
        const loan = loanDoc.data();
        const schedule = loan.repaymentSchedule || [];

        let match = null;
        let emiKey = null;
        for (let i = 0; i < schedule.length; i++) {
          const e = schedule[i];
          if (e.status !== 'Pending') continue;
          const due = (e.dueDate || e.date || '').slice(0, 10);
          if (!due) continue;
          if (due === today || due < today) {
            match = e;
            emiKey = e.emiNumber != null ? String(e.emiNumber) : String(i);
            break;
          }
        }
        if (!match) continue;

        if (!matchMap.has(loan.customerId)) {
          matchMap.set(loan.customerId, []);
        }
        matchMap.get(loan.customerId).push({ loanDocId: loanDoc.id, match, emiKey, companyId: loan.companyId });
      }

      if (matchMap.size === 0) {
        console.log('EMI push reminders sent: 0');
        return null;
      }

      const customerIds = Array.from(matchMap.keys());
      const customerDocs = await Promise.all(
        customerIds.map(id => db.collection('customers').doc(id).get())
      );
      const customerMap = new Map();
      for (const d of customerDocs) {
        if (d.exists) customerMap.set(d.id, d.data());
      }

      for (const [customerId, entries] of matchMap) {
        const customerData = customerMap.get(customerId);
        if (!customerData) continue;
        if (customerData.companyId !== entries[0].companyId) continue;

        const token = customerData.fcmToken;
        if (!token) continue;

        for (const { loanDocId, match, emiKey } of entries) {
          const amount = Number(match.amount);
          if (!isFinite(amount)) continue;
          const due = (match.dueDate || match.date || '').slice(0, 10);

          const overdue = due < today;
          const title = overdue ? 'EMI Overdue' : 'EMI Reminder';
          const body = overdue
            ? `Your EMI of ₹${amount.toLocaleString('en-IN')} is overdue.`
            : `Your EMI of ₹${amount.toLocaleString('en-IN')} is due today.`;

          const guardId = `${loanDocId}_${emiKey}_${due}`;
          const guardRef = db.collection('emi_push_sent').doc(guardId);
          const existing = await guardRef.get();
          if (existing.exists) continue;

          const message = {
            token,
            notification: { title, body },
            data: { action: 'OPEN_APP', loanId: loanDocId },
          };

          try {
            await getMessaging().send(message);
            await guardRef.set({ sentAt: FieldValue.serverTimestamp() });
            sent++;
          } catch (err) {
            console.error('EMI push send error', err);
          }
        }
      }

      console.log('EMI push reminders sent: ' + sent);
    } catch (e) {
      console.error('sendDailyEmiPushReminders error', e);
    }
    return null;
  }
);

/**
 * Set initial PIN for customer (admin only)
 */
exports.setCustomerPin = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists || !['admin', 'owner'].includes((callerSnap.data().role || '').toLowerCase())) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can set customer PINs.');
  }

  const { customerId, newPin } = request.data || {};
  if (!customerId || !newPin || !/^\d{6,}$/.test(newPin)) {
    throw new functions.https.HttpsError('invalid-argument', 'Customer ID and 6-digit PIN are required.');
  }

  const customerRef = db.collection('customers').doc(customerId);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Customer not found.');
  }

  const customerData = customerSnap.data();

  // Ensure authUid exists (create Auth user if not already)
  let authUid = customerData.authUid;
  if (!authUid) {
    authUid = `cust_${customerId}`;
    try {
      await getAuth().createUser({ uid: authUid, displayName: customerData.name || '' });
      await customerRef.update({ authUid });
    } catch (authErr) {
      if (authErr.code !== 'auth/uid-already-exists') throw authErr;
    }
  }

  // Hash PIN and save
  const pinHash = await bcrypt.hash(newPin, 10);
  const currentVersion = customerData.pinVersion || 0;
  await customerRef.update({
    pinHash,
    pinVersion: currentVersion + 1,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
  });

  return { success: true };
});

/**
 * Update usage counters via Admin SDK (bypasses Firestore rules)
 */
exports.updateUsage = onCall(async (request) => {
  const userId = requireAuth(request);
  const { action, field, delta } = request.data || {};

  const validFields = ['customers', 'companies', 'loans', 'deposits', 'staff'];
  const usageRef = db.collection('usage').doc(userId);

  if (action === 'init') {
    const snap = await usageRef.get();
    if (!snap.exists) {
      await usageRef.set({
        userId,
        customers: 0,
        companies: 1,
        loans: 0,
        deposits: 0,
        staff: 0,
        updatedAt: new Date().toISOString(),
      });
    }
    return { success: true };
  }

  if (action === 'increment') {
    if (!field || !validFields.includes(field)) {
      throw new functions.https.HttpsError('invalid-argument', `Invalid field. Must be one of: ${validFields.join(', ')}`);
    }
    const amount = typeof delta === 'number' ? delta : 1;
    await usageRef.set({
      userId,
      [field]: FieldValue.increment(amount),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { success: true };
  }

  if (action === 'sync') {
    const { companyId } = request.data;
    const callerEmail = request.auth.token.email || '';

    // Count companies by ownerEmail
    const compSnap = await db.collection('companies').where('ownerEmail', '==', callerEmail).get();
    const companyCount = compSnap.empty ? 1 : compSnap.size;

    let customerCount = 0;
    let loanCount = 0;
    let depositCount = 0;

    if (companyId) {
      const [custSnap, loanSnap, depSnap] = await Promise.all([
        db.collection('customers').where('companyId', '==', companyId).get(),
        db.collection('loans').where('companyId', '==', companyId).get(),
        db.collection('deposits').where('companyId', '==', companyId).get(),
      ]);
      customerCount = custSnap.size;
      loanCount = loanSnap.size;
      depositCount = depSnap.size;
    }

    await usageRef.set({
      userId,
      customers: customerCount,
      companies: companyCount,
      loans: loanCount,
      deposits: depositCount,
      staff: 0,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { success: true };
  }

  throw new functions.https.HttpsError('invalid-argument', 'Action must be "init", "increment", or "sync".');
});

// ─── Auto-stamp ownerEmail on business docs for queryable, per-company read isolation ───
// ponytail: no client-code change; trigger copies company.ownerEmail onto the doc.
const BUSINESS_COLLECTIONS = [
  'customers', 'loans', 'deposits', 'payments',
  'expenses', 'ledger', 'partner_transactions', 'partners', 'receipts',
];

const stampOwner = async (snap) => {
  const data = snap.data();
  if (!data || data.ownerEmail || !data.companyId) return;
  const companySnap = await db.collection('companies').doc(data.companyId).get();
  if (!companySnap.exists) return;
  const ownerEmail = companySnap.data().ownerEmail;
  if (ownerEmail) await snap.ref.update({ ownerEmail });
};

BUSINESS_COLLECTIONS.forEach((col) => {
  exports[`stampOwner_${col}`] = onDocumentCreated(`${col}/{id}`, async (event) => {
    await stampOwner(event.data);
  });
});

// ─── Server-side plan enforcement (race-condition safety net) ───
// ponytail: transaction-based atomic read+increment catches the race
// between rules check and usage counter update. Rules = first line,
// this = the safety net. Upgrade per-collection transactions if throughput
// becomes a bottleneck.
const getPlanTier = (planId) => {
  const p = String(planId || '');
  if (p.startsWith('enterprise')) return 'enterprise';
  if (p.startsWith('pro')) return 'pro';
  if (p.startsWith('starter')) return 'starter';
  return 'free';
};

const LIMITS = {
  free:   { customers: 10,  loans: [null, 24], deposits: [null, 0] },
  starter: { customers: 50,  loans: [null, 36], deposits: [null, 36] },
  pro:    { customers: 100, loans: [null, 60], deposits: [null, 60] },
};

const ENFORCED_COLLECTIONS = ['customers', 'loans', 'deposits'];

const enforcePlanLimit = async (snap, collectionName) => {
  const data = snap.data();
  if (!data || !data.companyId) return;

  const companySnap = await db.collection('companies').doc(data.companyId).get();
  if (!companySnap.exists) return;
  const ownerEmail = companySnap.data().ownerEmail;
  if (!ownerEmail) return;

  const userSnap = await db.collection('users').where('email', '==', ownerEmail).limit(1).get();
  if (userSnap.empty) return;
  const ownerUid = userSnap.docs[0].id;

  // Determine effective tier: no subscription or expired → free; server-side transaction catches
  // the race window between rules check and usage counter update
  const subSnap = await db.collection('subscriptions').doc(ownerUid).get();
  let tier = 'free';
  let status = null;
  if (subSnap.exists) {
    const sub = subSnap.data();
    status = sub.status || null;
    if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'cancelled') {
      tier = getPlanTier(sub.planId);
    }
  }
  if (tier === 'enterprise') return;

  const limit = LIMITS[tier];
  if (!limit) return;

  const usageRef = db.collection('usage').doc(ownerUid);

  if (collectionName === 'customers') {
    if (limit.customers < 0) return;
    await db.runTransaction(async (t) => {
      const usageSnap = await t.get(usageRef);
      const current = Number(usageSnap.data()?.customers || 0);
      if (current >= limit.customers) {
        await t.delete(snap.ref);
        await db.collection('subscription_logs').add({
          userId: ownerUid,
          action: 'plan_enforcement',
          detail: `customer create blocked: count ${current} >= limit ${limit.customers}`,
          deletedDocId: snap.id,
          timestamp: new Date().toISOString(),
        });
      } else {
        t.set(usageRef, { customers: FieldValue.increment(1), updatedAt: new Date().toISOString() }, { merge: true });
      }
    });
  }

  // ponytail: loans/deposits check tenure inline (no shared counter, no race window)
  if (collectionName === 'loans') {
    const tenure = Number(data.tenure) || 0;
    const maxTenure = limit.loans?.[1];
    if (maxTenure == null || maxTenure <= 0) return;
    if (tenure > maxTenure) {
      await snap.ref.delete();
      await db.collection('subscription_logs').add({
        userId: ownerUid,
        action: 'plan_enforcement',
        detail: `loan create blocked: tenure ${tenure} > max ${maxTenure}`,
        deletedDocId: snap.id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ponytail: deposits check tenure inline (no shared counter, no race window)
  if (collectionName === 'deposits') {
    const tenure = Number(data.tenure) || 0;
    const maxTenure = limit.deposits?.[1];
    if (maxTenure == null || maxTenure <= 0) return;
    if (tenure > maxTenure) {
      await snap.ref.delete();
      await db.collection('subscription_logs').add({
        userId: ownerUid,
        action: 'plan_enforcement',
        detail: `deposit create blocked: tenure ${tenure} > max ${maxTenure}`,
        deletedDocId: snap.id,
        timestamp: new Date().toISOString(),
      });
    }
  }
};

ENFORCED_COLLECTIONS.forEach((col) => {
  exports[`enforcePlan_${col}`] = onDocumentCreated(`${col}/{id}`, async (event) => {
    await enforcePlanLimit(event.data, col);
  });
});

// ─── User role constants (single source of truth) ───
// ADMIN_ROLES: roles allowed to create users. Extend here for future roles
//   (e.g. 'owner', 'superadmin') without touching the function body.
// ALLOWED_ROLES: roles that may be assigned to a newly created user.
const ADMIN_ROLES = ['admin'];
const ALLOWED_ROLES = ['admin', 'agent', 'customer'];

// Basic password strength: min 8 chars, at least one letter and one number.
const validatePasswordStrength = (pwd) => {
  const p = String(pwd || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(p)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(p)) return 'Password must contain at least one number.';
  return null;
};

// ─── Authorization: does the caller have access to manage this company? ───
// Mirrors firestore.rules canAccessCompany() logic. Uses server-side data only.
const canAccessCompany = async (companyId, callerUid, callerEmail) => {
  const companySnap = await db.collection('companies').doc(companyId).get();
  if (companySnap.exists && companySnap.data().ownerEmail === callerEmail) return true;

  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists) return false;
  const data = callerSnap.data();
  if (data.companyId === companyId) return true;
  if (data.companies && Array.isArray(data.companies) && data.companies.includes(companyId)) return true;

  return false;
};

// ─── Admin creates a new user (Approach A: Admin SDK, server-side) ───
// Creates a Firebase Auth user + users/{uid} Firestore doc WITHOUT touching
// the caller's client session. Caller must be authenticated AND an admin.
exports.createUserByAdmin = onCall(async (request) => {
  // 1. Verify caller is authenticated
  const callerUid = requireAuth(request);
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists || !ADMIN_ROLES.includes(callerSnap.data().role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can create users.');
  }

  const {
    name,
    email,
    password,
    role,
    companyId,
    permissions,
  } = request.data || {};

  // Validate required inputs
  if (!email || !password || !name) {
    throw new functions.https.HttpsError('invalid-argument', 'name, email and password are required.');
  }
  const pwdError = validatePasswordStrength(password);
  if (pwdError) {
    throw new functions.https.HttpsError('invalid-argument', pwdError);
  }
  const finalRole = ALLOWED_ROLES.includes(role) ? role : 'customer';
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
  }

  // Resolve ownerEmail from the company (used for read-isolation elsewhere)
  const companySnap = await db.collection('companies').doc(companyId).get();
  if (!companySnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Company not found.');
  }
  const ownerEmail = companySnap.data().ownerEmail || '';

  // Verify caller has authority to manage this company
  const callerEmail = request.auth.token.email || callerSnap.data().email;
  if (!await canAccessCompany(companyId, callerUid, callerEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company.');
  }

  let userRecord;
  try {
    // 3. Create the Firebase Authentication user (server-side, no session switch)
    userRecord = await getAuth().createUser({
      email: String(email).trim(),
      password: String(password),
      displayName: String(name).trim(),
    });
  } catch (error) {
    if (error && error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'Email is already in use.');
    }
    if (error && error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email address.');
    }
    console.error('createUserByAdmin auth error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create authentication user.');
  }

  try {
    // 4 & 5. Create the Firestore users/{uid} document
    const safePermissions =
      finalRole === 'agent' && permissions && typeof permissions === 'object' ? permissions : {};

    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: String(name).trim(),
      email: String(email).trim(),
      role: finalRole,
      companyId,
      ownerEmail,
      permissions: safePermissions,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Roll back the Auth user so we don't leave an orphaned login
    try {
      await getAuth().deleteUser(userRecord.uid);
    } catch (cleanupErr) {
      console.error('createUserByAdmin cleanup failed:', cleanupErr);
    }
    console.error('createUserByAdmin firestore error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to save user profile.');
  }

  // 6. Return success
  return { success: true, uid: userRecord.uid };
});

// ─── Admin updates a user (server-side, consistent with createUserByAdmin) ───
exports.updateUserByAdmin = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists || !ADMIN_ROLES.includes(callerSnap.data().role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can edit users.');
  }

  const { uid, name, permissions, active, companyId, role } = request.data || {};

  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
  }

  const targetSnap = await db.collection('users').doc(uid).get();
  if (!targetSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found.');
  }

  if (targetSnap.data().companyId !== companyId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot edit users in a different company.');
  }

  // Verify caller has authority to manage this company
  const callerEmail = request.auth.token.email || callerSnap.data().email;
  if (!await canAccessCompany(companyId, callerUid, callerEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company.');
  }

  const updateData = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (permissions !== undefined) updateData.permissions = permissions;
  if (active !== undefined) updateData.active = active;
  if (role !== undefined && ['admin', 'owner', 'agent', 'viewer'].includes(role)) updateData.role = role;

  if (Object.keys(updateData).length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No updatable fields provided.');
  }

  await db.collection('users').doc(uid).update(updateData);

  return { success: true, uid };
});

// ─── Subscription Server-Side Management & Verification Cloud Functions ───

const SERVER_SUBSCRIPTION_PLANS = {
  free: { name: 'Free', monthly: 0, yearly: 0 },
  starter: { name: 'Starter', monthly: 59, yearly: 599 },
  pro: { name: 'Pro', monthly: 199, yearly: 1999 },
  enterprise: { name: 'Enterprise', monthly: 3999, yearly: 39999 },
};

/**
 * 3. Create Authentic Razorpay Order (Strict REST API call, NO fake order fallbacks)
 */
exports.createRazorpayOrder = onCall(async (request) => {
  const userId = requireAuth(request);
  const userEmail = request.auth.token.email || '';
  const { planId, billingCycle } = request.data || {};
  const plan = SERVER_SUBSCRIPTION_PLANS[planId];

  if (!plan || planId === 'free') {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid plan for paid subscription.');
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new functions.https.HttpsError('failed-precondition', 'Razorpay API credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured on server.');
  }

  const amountInRupees = billingCycle === 'yearly' ? plan.yearly : plan.monthly;
  const amountInPaise = amountInRupees * 100;

  let orderId = '';
  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${userId.substring(0, 8)}_${Date.now()}`,
      notes: { userId, userEmail, planId, billingCycle },
    });
    orderId = order.id;
  } catch (apiErr) {
    console.error('Razorpay Order API creation error:', apiErr);
    throw new functions.https.HttpsError('internal', `Razorpay Order creation failed: ${apiErr.message}`);
  }

  // Store authentic pending order in Firestore (status: 'pending')
  await db.collection('pending_orders').doc(orderId).set({
    orderId,
    userId,
    userEmail,
    planId,
    billingCycle: billingCycle || 'monthly',
    amount: amountInPaise,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    orderId,
    amount: amountInPaise,
    currency: 'INR',
    keyId,
  };
});

/**
 * 4. Verify Razorpay Payment (Strict pending_orders Transaction Verification + HMAC SHA256)
 */
exports.verifyRazorpayPayment = onCall(async (request) => {
  const userId = requireAuth(request);
  const userEmail = request.auth.token.email || '';
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, billingCycle } = request.data || {};

  if (!razorpay_order_id || !razorpay_payment_id || !planId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing payment verification arguments.');
  }

  const crypto = require('crypto');
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    throw new functions.https.HttpsError('failed-precondition', 'Razorpay secret key is not configured on server.');
  }

  // 1. Strict HMAC SHA256 signature verification
  if (!razorpay_signature) {
    throw new functions.https.HttpsError('invalid-argument', 'Razorpay signature is required.');
  }

  const generatedSignature = crypto
    .createHmac('sha256', razorpaySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generatedSignature !== razorpay_signature) {
    await db.collection('payment_history').doc(razorpay_payment_id || `failed_${Date.now()}`).set({
      id: razorpay_payment_id || `failed_${Date.now()}`,
      userId,
      userEmail,
      planId,
      billingCycle: billingCycle || 'monthly',
      amount: SERVER_SUBSCRIPTION_PLANS[planId]?.[billingCycle] || 0,
      currency: 'INR',
      gateway: 'razorpay',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      status: 'failed',
      timestamp: new Date().toISOString(),
    });

    throw new functions.https.HttpsError('invalid-argument', 'Invalid Razorpay signature. Verification failed.');
  }

  const plan = SERVER_SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid plan ID.');
  }
  const expectedAmountInPaise = (billingCycle === 'yearly' ? plan.yearly : plan.monthly) * 100;
  const days = billingCycle === 'yearly' ? 365 : 30;
  const startDate = new Date().toISOString();
  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // 2. Single Firestore Transaction for pending_orders validation & atomic activation
  await db.runTransaction(async (transaction) => {
    // a. Verify pending_orders document
    const orderRef = db.collection('pending_orders').doc(razorpay_order_id);
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Pending order does not exist.');
    }

    const orderData = orderSnap.data();
    if (orderData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Order belongs to another user.');
    }
    if (orderData.planId !== planId || orderData.billingCycle !== billingCycle) {
      throw new functions.https.HttpsError('invalid-argument', 'Plan details do not match pending order.');
    }
    if (orderData.amount !== expectedAmountInPaise) {
      throw new functions.https.HttpsError('invalid-argument', 'Order amount mismatch.');
    }
    if (orderData.status !== 'pending' && orderData.status !== 'created') {
      throw new functions.https.HttpsError('already-exists', 'Order has already been processed or completed.');
    }

    // b. Verify payment_history replay protection
    const paymentRef = db.collection('payment_history').doc(razorpay_payment_id);
    const paymentSnap = await transaction.get(paymentRef);

    if (paymentSnap.exists && paymentSnap.data().status === 'success') {
      throw new functions.https.HttpsError('already-exists', 'This payment ID has already been processed.');
    }

    // c. Write subscription update, payment history, and mark pending order completed
    const subRef = db.collection('subscriptions').doc(userId);
    transaction.set(subRef, {
      userId,
      userEmail,
      planId,
      billingCycle: billingCycle || 'monthly',
      status: 'active',
      startDate,
      expiryDate,
      autoRenewal: true,
      paymentSource: 'razorpay',
      orderId: razorpay_order_id,
      lastPaymentId: razorpay_payment_id,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    transaction.set(paymentRef, {
      id: razorpay_payment_id,
      userId,
      userEmail,
      planId,
      billingCycle: billingCycle || 'monthly',
      amount: SERVER_SUBSCRIPTION_PLANS[planId]?.[billingCycle] || 0,
      currency: 'INR',
      gateway: 'razorpay',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      status: 'success',
      timestamp: new Date().toISOString(),
    });

    transaction.update(orderRef, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      razorpayPaymentId: razorpay_payment_id,
    });
  });

  return {
    success: true,
    planId,
    expiryDate,
  };
});

/**
 * Get OAuth2 access token from Google service account for Android Publisher API
 */
async function getGoogleAccessToken(serviceAccount) {
  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const tokens = await auth.authorize();
  return tokens.access_token;
}

/**
 * 1, 3 & 4. Verify Google Play Subscription (Android Publisher API + Transaction Replay Protection)
 */
exports.verifyGooglePlaySubscription = onCall(async (request) => {
  const userId = requireAuth(request);
  const userEmail = request.auth.token.email || '';
  const { purchaseToken, productId, planId, billingCycle } = request.data || {};

  if (!purchaseToken || !planId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing purchaseToken or planId.');
  }

  const packageName = process.env.ANDROID_PACKAGE_NAME || 'com.jls.loanbook';
  const targetProductId = productId || `jls_${planId}_${billingCycle}`;
  const days = billingCycle === 'yearly' ? 365 : 30;
  let expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Official Google Android Publisher API Server-Side Verification
  if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
      const googleAccessToken = await getGoogleAccessToken(serviceAccount);
      const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${targetProductId}/tokens/${purchaseToken}`;

      const playRes = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });

      const playData = await playRes.json();
      if (!playRes.ok || playData.error) {
        throw new Error(playData?.error?.message || 'Google Play purchase token rejected by Google servers.');
      }

      const expiryMillis = Number(playData.expiryTimeMillis);
      if (isNaN(expiryMillis) || expiryMillis <= Date.now()) {
        throw new Error('Google Play subscription token is expired or inactive.');
      }

      if (playData.paymentState === 0) {
        throw new Error('Google Play subscription payment is pending.');
      }

      expiryDate = new Date(expiryMillis).toISOString();
    } catch (gErr) {
      console.error('Google Play Publisher API error:', gErr);
      throw new functions.https.HttpsError('permission-denied', `Google Play verification error: ${gErr.message}`);
    }
  } else {
    throw new functions.https.HttpsError('failed-precondition', 'Google Play service account not configured on server.');
  }

  // 2. Token replay protection ID key
  const safeTokenKey = purchaseToken.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
  const paymentId = `gplay_${safeTokenKey || Date.now()}`;
  const startDate = new Date().toISOString();

  // 3. Firestore Transaction for Replay Protection & Atomic Writes
  await db.runTransaction(async (transaction) => {
    const paymentRef = db.collection('payment_history').doc(paymentId);
    const paymentSnap = await transaction.get(paymentRef);

    if (paymentSnap.exists && paymentSnap.data().status === 'success') {
      throw new functions.https.HttpsError('already-exists', 'This Google Play purchase token has already been processed.');
    }

    const subRef = db.collection('subscriptions').doc(userId);
    transaction.set(subRef, {
      userId,
      userEmail,
      planId,
      billingCycle: billingCycle || 'monthly',
      status: 'active',
      startDate,
      expiryDate,
      autoRenewal: true,
      paymentSource: 'google_play',
      purchaseToken,
      productId: targetProductId,
      lastPaymentId: paymentId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    transaction.set(paymentRef, {
      id: paymentId,
      userId,
      userEmail,
      planId,
      billingCycle: billingCycle || 'monthly',
      amount: SERVER_SUBSCRIPTION_PLANS[planId]?.[billingCycle] || 0,
      currency: 'INR',
      gateway: 'google_play',
      googlePurchaseToken: purchaseToken,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  });

  return {
    success: true,
    planId,
    expiryDate,
  };
});

/**
 * 8. Razorpay Webhook Verification
 */
const razorpayApp = express();
razorpayApp.use(express.raw({ type: 'application/json' }));
razorpayApp.post('/', async (req, res) => {
  const crypto = require('crypto');
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    res.status(500).send('Razorpay webhook secret not configured on server');
    return;
  }
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    res.status(400).send('Missing webhook signature');
    return;
  }

  const bodyString = req.body.toString();
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(bodyString).digest('hex');

  if (signature !== expectedSignature) {
    res.status(400).send('Invalid webhook signature');
    return;
  }

  const parsed = JSON.parse(bodyString);
  const event = parsed.event;
  const payload = parsed?.payload?.payment?.entity || {};

  if (event === 'payment.captured' || event === 'order.paid') {
    const { order_id, id: payment_id, notes } = payload;
    const userId = notes?.userId;
    const planId = notes?.planId;
    const billingCycle = notes?.billingCycle || 'monthly';

    if (userId && planId) {
      const days = billingCycle === 'yearly' ? 365 : 30;
      const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      try {
        await db.runTransaction(async (t) => {
          const pRef = db.collection('payment_history').doc(payment_id);
          const pSnap = await t.get(pRef);
          if (pSnap.exists && pSnap.data().status === 'success') return;

          t.set(db.collection('subscriptions').doc(userId), {
            userId,
            planId,
            billingCycle,
            status: 'active',
            expiryDate,
            paymentSource: 'razorpay_webhook',
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          t.set(pRef, {
            id: payment_id,
            userId,
            planId,
            billingCycle,
            gateway: 'razorpay_webhook',
            status: 'success',
            timestamp: new Date().toISOString(),
          });
        });
      } catch (whErr) {
        console.error('Razorpay Webhook transaction error:', whErr);
      }
    }
  } else {
    res.status(422).json({ status: 'ignored', reason: 'unknown event type' });
    return;
  }

  res.status(200).json({ status: 'ok' });
});
exports.razorpayWebhook = onRequest(razorpayApp);

/**
 * 9. Google Real-Time Developer Notifications (RTDN) Webhook
 */
exports.googlePlayRtdnWebhook = onRequest(async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const expectedToken = process.env.RTDN_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error('RTDN_WEBHOOK_SECRET not configured');
    res.status(500).send('Server configuration error');
    return;
  }

  const receivedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (receivedToken !== expectedToken) {
    console.warn('RTDN webhook: invalid auth token');
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    const message = req.body?.message;
    if (!message || !message.data) {
      res.status(200).send('No data');
      return;
    }

    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const notification = JSON.parse(decodedData);
    const subNotif = notification.subscriptionNotification;

    if (subNotif) {
      const { notificationType, purchaseToken, subscriptionId } = subNotif;
      console.log(`Google RTDN Received: type=${notificationType}, token=${purchaseToken}`);

      // Query user with matching purchaseToken
      const subQuery = await db.collection('subscriptions').where('purchaseToken', '==', purchaseToken).limit(1).get();
      if (!subQuery.empty) {
        const userSubDoc = subQuery.docs[0];
        const subData = userSubDoc.data();

        await db.runTransaction(async (t) => {
          const freshSnap = await t.get(userSubDoc.ref);
          if (!freshSnap.exists) return;

          if (notificationType === 2) {
            const days = subData.billingCycle === 'yearly' ? 365 : 30;
            const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
            t.update(userSubDoc.ref, { status: 'active', expiryDate: newExpiry, updatedAt: new Date().toISOString() });
          } else if (notificationType === 3) {
            t.update(userSubDoc.ref, { autoRenewal: false, updatedAt: new Date().toISOString() });
          } else if (notificationType === 13) {
            t.update(userSubDoc.ref, { status: 'expired', planId: 'free', updatedAt: new Date().toISOString() });
          }
        });
      }
    }
    res.status(200).send('Event processed');
  } catch (err) {
    console.error('Google RTDN error:', err);
    res.status(500).send('Error');
  }
});

exports.adminUpdateSubscription = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists || !['admin', 'owner'].includes((callerSnap.data().role || '').toLowerCase())) {
    throw new functions.https.HttpsError('permission-denied', 'Only Admins can update user subscriptions.');
  }

  const { targetUserId, targetUserEmail, planId, billingCycle, durationDays, reason } = request.data || {};

  if (!targetUserId || !planId) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUserId and planId are required.');
  }

  if (!SERVER_SUBSCRIPTION_PLANS[planId]) {
    throw new functions.https.HttpsError('invalid-argument', `Invalid planId: ${planId}. Must be one of: ${Object.keys(SERVER_SUBSCRIPTION_PLANS).join(', ')}.`);
  }

  const targetUserSnap = await db.collection('users').doc(targetUserId).get();
  if (!targetUserSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Target user not found.');
  }

  const callerCompanyId = callerSnap.data().companyId;
  const targetCompanyId = targetUserSnap.data().companyId;
  if (targetCompanyId && callerCompanyId && targetCompanyId !== callerCompanyId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot update subscription for users in a different company.');
  }

  const days = Math.max(1, Number(durationDays) || 30);
  const startDate = new Date().toISOString();
  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  await db.collection('subscriptions').doc(targetUserId).set({
    userId: targetUserId,
    userEmail: targetUserEmail || '',
    planId,
    billingCycle: billingCycle || 'monthly',
    status: 'active',
    startDate,
    expiryDate,
    autoRenewal: false,
    paymentSource: 'admin_manual',
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  await db.collection('subscription_logs').doc(`log_${Date.now()}`).set({
    id: `log_${Date.now()}`,
    userId: targetUserId,
    action: 'admin_override',
    newPlanId: planId,
    reason: reason || 'Manual Admin Update',
    performedBy: callerUid,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    targetUserId,
    planId,
    expiryDate,
  };
});

/**
 * Server-owned monotonic counter generator.
 * Clients call this instead of writing to the `counters` collection
 * (which is `allow write: if false` in rules). Admin SDK + transaction
 * guarantee atomic, duplicate-free increments.
 */
exports.getNextCounterId = onCall(async (request) => {
  requireAuth(request);
  const { counterName } = request.data || {};
  if (!counterName || typeof counterName !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'counterName is required.');
  }

  const ref = db.collection('counters').doc(counterName);
  const nextId = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const lastId = snap.exists ? snap.data().lastId || 0 : 0;
    const next = lastId + 1;
    t.set(ref, { lastId: next }, { merge: true });
    return next;
  });

  return { nextId };
});

// ─── Metrics ───────────────────────────────────────
const {onLoanWrite} = require("./metrics/loanTriggers");
exports.onLoanWrite = onLoanWrite;
const {onExpenseWrite} = require("./metrics/expenseTriggers");
exports.onExpenseWrite = onExpenseWrite;
const {onDepositWrite} = require("./metrics/depositTriggers");
exports.onDepositWrite = onDepositWrite;
const {onLedgerWrite} = require("./metrics/ledgerTriggers");
exports.onLedgerWrite = onLedgerWrite;
const {rebuildMetrics} = require("./metrics/rebuildMetrics");
exports.rebuildMetrics = rebuildMetrics;
const {onCustomerWrite} = require("./metrics/customerTriggers");
exports.onCustomerWrite = onCustomerWrite;
const {onPartnerTxWrite} = require("./metrics/partnerTriggers");
exports.onPartnerTxWrite = onPartnerTxWrite;
