const functions = require('firebase-functions');
const { onSchedule } = require('firebase-functions/scheduler');
const { onCall } = require('firebase-functions/https');
const { onDocumentCreated } = require('firebase-functions/firestore');
const admin = require('firebase-admin');
admin.initializeApp();

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const db = getFirestore();

// ─── WhatsApp auto-reminders (server-side, runs even if PC is off) ───
const WASENDER_API_KEY = 'WASENDER_API_KEY_REMOVED_FROM_HISTORY';
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
  try {
    const res = await fetch(`${API_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WASENDER_API_KEY}` },
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
  { schedule: '0 10 * * *', timeZone: 'Asia/Kolkata' }, // daily 10 AM IST (1-min gap per msg)
  async () => { await runReminders(); return null; }
);

// ponytail: daily admin detail summary at 9:05 AM IST -> 9413821007
const ADMIN_NUMBER = '9413821007';
exports.sendAdminSummary = onSchedule(
  { schedule: '5 9 * * *', timeZone: 'Asia/Kolkata' },
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
exports.sendWhatsapp = onCall(async (request) => {
  if (!request.auth) return { success: false, error: 'unauthenticated' };
  const { phone, text, companyId } = request.data || {};
  if (!phone || !text) return { success: false, error: 'missing params' };
  // Only the JLS company may send; ignore everything else.
  if (companyId && companyId !== JLS_COMPANY_ID) return { success: false, error: 'ignored' };
  const ok = await sendWhatsApp(phone, text);
  return { success: ok };
});
