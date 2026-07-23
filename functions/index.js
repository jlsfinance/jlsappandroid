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
const db = getFirestore();

// ─── WhatsApp auto-reminders (server-side, runs even if PC is off) ───
const WASENDER_API_KEY = defineSecret('WASENDER_API_KEY');
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
        .where('status', 'in', ['Active', 'Disbursed', 'Overdue'])
        .get();

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
            break; // first qualifying unpaid installment per loan
          }
        }
        if (!match) continue;

        const customerDoc = await db.collection('customers').doc(loan.customerId).get();
        if (!customerDoc.exists) continue;
        const customerData = customerDoc.data();
        if (customerData.companyId !== loan.companyId) continue; // never cross-company

        const token = customerData.fcmToken;
        if (!token) continue;

        const amount = Number(match.amount);
        if (!isFinite(amount)) continue;
        const due = (match.dueDate || match.date || '').slice(0, 10);

        const overdue = due < today;
        const title = overdue ? 'EMI Overdue' : 'EMI Reminder';
        const body = overdue
          ? `Your EMI of ₹${amount.toLocaleString('en-IN')} is overdue.`
          : `Your EMI of ₹${amount.toLocaleString('en-IN')} is due today.`;

        const guardId = `${loanDoc.id}_${emiKey}_${due}`;
        const guardRef = db.collection('emi_push_sent').doc(guardId);
        const existing = await guardRef.get();
        if (existing.exists) continue; // already sent for this EMI due-date

        const message = {
          token,
          notification: { title, body },
          data: { action: 'OPEN_APP', loanId: loanDoc.id },
        };

        try {
          await getMessaging().send(message);
          await guardRef.set({ sentAt: FieldValue.serverTimestamp() });
          sent++;
        } catch (err) {
          console.error('EMI push send error', err);
        }
      }

      console.log('EMI push reminders sent: ' + sent);
    } catch (e) {
      console.error('sendDailyEmiPushReminders error', e);
    }
    return null;
  }
);

exports.sendNotificationOnCreate = onDocumentCreated('notifications/{notificationId}', async (event) => {
        const snap = event.data;
        const context = { params: { notificationId: event.params.notificationId } };
        const data = snap.data();
        const recipientId = data.recipientId;

        if (!recipientId) {
            console.log('No recipientId found in notification data');
            return;
        }

        try {
            let tokens = [];

            if (recipientId === 'all') {
                console.log('Fetching all customer tokens for broadcast');
                const customersSnap = await db.collection('customers').get();
                customersSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.fcmToken) tokens.push(d.fcmToken);
                });

                // Also fetch users (Staff)
                const usersSnap = await db.collection('users').get();
                usersSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.fcmToken) tokens.push(d.fcmToken);
                });

                console.log(`Found ${tokens.length} recipients for broadcast`);
            } else {
                // Single Recipient Logic
                // 1. Check if recipient is a Customer
                console.log(`Searching for FCM token for recipient: ${recipientId}`);
                const customerDoc = await db.collection('customers').doc(recipientId).get();
                if (customerDoc.exists && customerDoc.data().fcmToken) {
                    tokens.push(customerDoc.data().fcmToken);
                }

                // 2. If not customer, check if User (Admin/Staff)
                if (tokens.length === 0) {
                    const userDoc = await db.collection('users').doc(recipientId).get();
                    if (userDoc.exists && userDoc.data().fcmToken) {
                        tokens.push(userDoc.data().fcmToken);
                    }
                }

                // Fallback: If "recipientId" is actually the raw token
                if (tokens.length === 0 && recipientId.length > 20) {
                    tokens.push(recipientId);
                }
            }

            if (tokens.length === 0) {
                console.log('No FCM Tokens found for target:', recipientId);
                return;
            }

            // 3. Send Push Notification (FCM v1)
            const message = {
                notification: {
                    title: data.title || 'New Notification',
                    body: data.message || 'You have a new alert',
                },
                data: {
                    action: 'OPEN_APP',
                    notificationId: context.params.notificationId
                },
                tokens: tokens
            };

            const response = await getMessaging().sendEachForMulticast(message);

            if (response.failureCount > 0) {
                response.responses.forEach((result) => {
                    if (result.error) {
                        console.error('Failure sending notification:', result.error);
                    }
                });
            } else {
                console.log('Notification sent successfully!');
            }

        } catch (error) {
            console.error('Error in sendNotificationOnCreate:', error);
        }
    });

// ─── WhatsApp send (client calls this; API key stays server-side) ───
exports.sendWhatsapp = onRequest({ cors: true, secrets: [WASENDER_API_KEY] }, async (req, res) => {
  // CORS preflight
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const { phone, text, companyId } = req.body || {};
  if (!phone || !text) { res.status(400).json({ success: false, error: 'missing params' }); return; }
  // Only the JLS company may send; ignore everything else.
  if (companyId && companyId !== JLS_COMPANY_ID) { res.json({ success: false, error: 'ignored' }); return; }
  const ok = await sendWhatsApp(phone, text);
  res.json({ success: ok });
});

// ─── Server-side Company Code Verification (Zero sensitive data exposure) ───
exports.verifyCompanyCode = onCall(async (request) => {
  const { companyId, companyCode } = request.data || {};
  if (!companyId || !companyCode) {
    throw new functions.https.HttpsError('invalid-argument', 'missing params');
  }

  try {
    const companySnap = await db.collection('companies').doc(companyId).get();
    if (!companySnap.exists) {
      return { valid: false, error: 'company not found' };
    }

    const companyName = companySnap.data().name || '';
    const prefix = companyName.substring(0, 3).toLowerCase();
    const isValid = prefix === String(companyCode).toLowerCase();

    // Return ONLY minimal data — no ownerEmail, gstin, upiId, phone, address
    return {
      valid: isValid,
      companyName: isValid ? companyName : undefined
    };
  } catch (error) {
    console.error('Error in verifyCompanyCode:', error);
    throw new functions.https.HttpsError('internal', 'server error');
  }
});

// ─── Public Company Info (Customer Portal only — returns name, phone, upiId ONLY) ───
exports.getCompanyPublicInfo = onCall(async (request) => {
  const { companyId } = request.data || {};
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'missing companyId');
  }

  try {
    const companySnap = await db.collection('companies').doc(companyId).get();
    if (!companySnap.exists) {
      throw new functions.https.HttpsError('not-found', 'company not found');
    }

    const data = companySnap.data();
    // Return ONLY the 3 public-facing fields the Customer Portal needs.
    // ownerEmail, gstin, address, createdAt are NEVER returned.
    return {
      name: data.name || '',
      phone: data.phone || '',
      upiId: data.upiId || ''
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in getCompanyPublicInfo:', error);
    throw new functions.https.HttpsError('internal', 'server error');
  }
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
  exports[`stampOwner_${col}`] = onDocumentCreated(`{col}/{id}`, async (event) => {
    await stampOwner(event.data);
  });
});

// ponytail: one-time backfill for existing docs (call once, then can be removed)
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
  if (!request.auth || !request.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  // 2. Verify caller is an admin (read caller's own users/{uid} doc)
  const callerUid = request.auth.uid;
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
  if (!request.auth || !request.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerUid = request.auth.uid;
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists || !ADMIN_ROLES.includes(callerSnap.data().role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can edit users.');
  }

  const { uid, name, permissions, active, companyId } = request.data || {};

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

  if (Object.keys(updateData).length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No updatable fields provided.');
  }

  await db.collection('users').doc(uid).update(updateData);

  return { success: true, uid };
});

exports.backfillOwnerEmails = onRequest({ cors: true }, async (req, res) => {
  let total = 0;
  for (const col of BUSINESS_COLLECTIONS) {
    const snap = await db.collection(col).limit(500).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.ownerEmail) continue;            // already stamped
      if (!d.companyId) continue;
      const companySnap = await db.collection('companies').doc(d.companyId).get();
      if (!companySnap.exists) continue;
      const ownerEmail = companySnap.data().ownerEmail;
      if (ownerEmail) { await doc.ref.update({ ownerEmail }); total++; }
    }
  }
  res.json({ ok: true, stamped: total });
});
