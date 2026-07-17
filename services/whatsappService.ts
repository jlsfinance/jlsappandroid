// ponytail: client hits the cloud function over HTTP; Wasender key stays server-side.
const SEND_URL = 'https://us-central1-jls-finance-company.cloudfunctions.net/sendWhatsapp';

// Only the JLS company may send WhatsApp messages; ignore all others.
const JLS_COMPANY_ID = 'MwtqusMMlFBKTFSslRVk';
let ACTIVE_COMPANY = '';
export const setActiveCompany = (id?: string) => { ACTIVE_COMPANY = id || ''; };

const normalizePhone = (p?: string) => {
  if (!p) return '';
  let n = p.replace(/[^0-9]/g, '');
  if (n.length === 10) n = '91' + n;
  return n;
};

const callSend = async (phone: string, text: string): Promise<boolean> => {
  if (ACTIVE_COMPANY !== JLS_COMPANY_ID) return false; // ignore non-JLS companies
  if (!normalizePhone(phone)) return false;
  try {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text, companyId: ACTIVE_COMPANY }),
    });
    const data: any = await res.json().catch(() => ({}));
    return data?.success === true;
  } catch (e) {
    console.error('WhatsApp send error', e);
    return false;
  }
};

export const WhatsappService = {
  setActiveCompany(id?: string) { setActiveCompany(id); },
  phoneOf(customer: any): string {
    return customer?.phone || customer?.mobile || customer?.whatsapp || '';
  },

  // Send a due EMI reminder — exact body as the whatsapp-ai-bot (send-bulk-reminder.js)
  sendEmiReminder(customerName: string, phone: string, amount: number, dueDate: string, loanId: string) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `यह JLS Finance Ltd से एक विनम्र अनुरोध है।\n\n` +
      `आपकी EMI की जानकारी:\n` +
      `💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `📅 देय तिथि: ${dueDate}\n` +
      `🆔 लोन ID: ${loanId}\n\n` +
      `कृपया समय पर भुगतान करें ताकि कोई अतिरिक्त शुल्क न लगे।\n\n` +
      `धन्यवाद! 😊\n` +
      `- JLS Finance Ltd`;
    return callSend(phone, text);
  },

  // Deposit reminder — same structure as the bot's EMI message
  sendDepositReminder(customerName: string, phone: string, amount: number, dueDate: string, depositId: string, kistNo: number) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `यह JLS Finance Ltd से एक विनम्र अनुरोध है।\n\n` +
      `आपकी किस्त की जानकारी:\n` +
      `💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `📅 देय तिथि: ${dueDate}\n` +
      `🆔 डिपॉजिट ID: ${depositId} • किस्त #${kistNo}\n\n` +
      `कृपया समय पर जमा करें ताकि कोई अतिरिक्त शुल्क न लगे।\n\n` +
      `धन्यवाद! 😊\n` +
      `- JLS Finance Ltd`;
    return callSend(phone, text);
  },

  // Loan account created
  sendLoanCreated(customerName: string, phone: string, amount: number, emi: number, loanId: string) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `आपका लोन JLS Finance में स्वीकृत हो गया है:\n` +
      `💰 लोन राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `💵 मासिक EMI: ₹${Number(emi).toLocaleString('en-IN')}\n` +
      `🆔 लोन ID: ${loanId}\n\n` +
      `साधुवाद! कृपया समय पर EMI का भुगतान करें। 😊`;
    return callSend(phone, text);
  },

  // Deposit account created
  sendDepositCreated(customerName: string, phone: string, type: string, amount: number, maturity: number, depositId: string) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `आपका ${type} JLS Finance में खुल गया है:\n` +
      `💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `🏆 परिपक्वता राशि: ₹${Number(maturity).toLocaleString('en-IN')}\n` +
      `🆔 डिपॉजिट ID: ${depositId}\n\n` +
      `साधुवाद! कृपया नियमित किस्त जमा करें। 😊`;
    return callSend(phone, text);
  },

  // EMI collected (payment received)
  sendEmiReceived(customerName: string, phone: string, amount: number, loanId: string, paidOn: string) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `आपकी EMI प्राप्त हुई धन्यवाद:\n` +
      `💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `📅 जमा तिथि: ${paidOn}\n` +
      `🆔 लोन ID: ${loanId}\n\n` +
      `आभार! JLS Finance`;
    return callSend(phone, text);
  },

  // Deposit kist collected (payment received)
  sendDepositReceived(customerName: string, phone: string, amount: number, depositId: string, kistNo: number, paidOn: string) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `आपकी किस्त प्राप्त हुई धन्यवाद:\n` +
      `💰 राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `🆔 डिपॉजिट ID: ${depositId} • किस्त #${kistNo}\n` +
      `📅 जमा तिथि: ${paidOn}\n\n` +
      `आभार! JLS Finance`;
    return callSend(phone, text);
  },

  // Loan foreclosed / pre-closed
  sendForeclosed(customerName: string, phone: string, amount: number, loanId: string, on: string) {
    const text =
      `नमस्ते ${customerName} जी! 🙏\n\n` +
      `आपका लोन JLS Finance Ltd से प्री-क्लोज़ हो गया है:\n` +
      `💰 भुगतान राशि: ₹${Number(amount).toLocaleString('en-IN')}\n` +
      `📅 तिथि: ${on}\n` +
      `🆔 लोन ID: ${loanId}\n\n` +
      `अब आपका सारा बकाया साफ़ हो गया है।\n\n` +
      `धन्यवाद! 😊\n` +
      `- JLS Finance Ltd`;
    return callSend(phone, text);
  },
};
