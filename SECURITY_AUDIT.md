# Security Audit Report — JLS Finance Suite

**Date:** 2026-07-24
**Scope:** Authentication, Authorization, Firestore Rules, Secrets, App Check, Webhooks
**Files analyzed:** 20 source files including firestore.rules, functions/index.js (1164 lines), all pages, contexts, and config

---

## Executive Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 2 | Customer login password logic, localStorage session management |
| HIGH     | 3 | App Check not enforced, unauthenticated webhook, role granularity gaps |
| MEDIUM   | 6 | Hardcoded secrets (phone/UPI/company ID), no rate limiting, anonymous auth surface |
| LOW      | 4 | .env committed, FCM token broadcast, console.error leak, reCAPTCHA silent fallback |

---

## CRITICAL FINDINGS

### C-1: Customer Portal "Password" Is the Login ID (No Real Authentication)

**Files:** `pages/CustomerLogin.tsx` lines 59–62
**Lines:**
```
59:       if (password.toLowerCase() !== trimmedLoginId) {
60:         setError('Invalid password. Password should be same as Login ID.');
61:         setLoading(false);
62:         return;
```

**Issue:** The password check for customer login is a literal comparison against the Login ID string itself. The only "secret" is the phone number (10 digits) plus a 3-letter company prefix (e.g. `jls8003986362`). The company prefix is derived from `companyName.substring(0, 3)` (see `functions/index.js` line 375) and is therefore predictable (the company name is shown in the app). The remaining 10 digits are the customer's phone number, which may be leaked through other channels. This provides no meaningful authentication.

**Impact:** Anyone who knows or guesses a customer's phone number can:
- Log into the customer portal
- View all loan details, repayment schedules, and personal information
- Download loan agreements, receipts, and account statements
- Initiate UPI payments

**Fix:** Implement a proper password (not derived from the login ID), use a one-time PIN sent via SMS/WhatsApp, or delegate authentication to Firebase Auth with email/password or phone auth.

---

### C-2: Customer Portal Session Bound to localStorage (No HttpOnly, No Expiry)

**Files:**
- `pages/CustomerLogin.tsx` lines 124–126 (write)
- `pages/CustomerPortal.tsx` lines 82–83 (read)
- `App.tsx` lines 117–134 (CustomerSessionRedirect reads localStorage)

**Lines (CustomerLogin.tsx):**
```
124:       localStorage.setItem('customerPortalId', matchedCustomer.id);
125:       localStorage.setItem('customerPortalPhone', phone);
126:       localStorage.setItem('customerPortalCompanyId', matchedCompanyId);
```

**Issue:** After authenticating via the weak password check (C-1), the session is stored entirely in `localStorage` — a plaintext storage accessible to any JavaScript running in the same origin. There is no server-side session token, no HttpOnly cookie, no expiry/rotation mechanism. The app's `CustomerSessionRedirect` component (App.tsx line 124) unconditionally redirects to `/customer-portal` if `customerPortalId` exists in localStorage, even on cold start. Once an attacker has written this value (via XSS or direct device access), they have persistent access.

**Impact:** A single XSS vulnerability anywhere in the app would allow extraction of the customer's full session, including their customer document ID and phone number. On a shared device, any subsequent user of the browser can access the previous customer's financial data.

**Fix:** Use Firebase Auth custom claims or a properly managed auth token. If localStorage is used, clear the session on app background, bind to the device, and implement short-lived tokens with refresh.

---

## HIGH FINDINGS

### H-1: App Check Initialized But Never Enforced in Firestore Rules

**Files:**
- `firebaseConfig.ts` lines 18–26 (App Check initialization)
- `firestore.rules` (entire file, 196 lines — no `request.app.check` reference anywhere)

**Lines (firebaseConfig.ts):**
```
18:   if (typeof self !== 'undefined' && typeof self.location !== 'undefined') {
19:     const appCheckKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY;
20:     if (appCheckKey) {
21:       initializeAppCheck(app, {
22:         provider: new ReCaptchaEnterpriseProvider(appCheckKey),
23:         isTokenAutoRefreshEnabled: true,
24:       });
25:   }
```

**Issue:** App Check is initialized with reCAPTCHA Enterprise, but **every single Firestore rule** only checks `request.auth != null`. There is zero enforcement of `request.app.check != null` or `request.app.check.token` validation. Additionally, the App Check initialization is conditional on `VITE_RECAPTCHA_ENTERPRISE_KEY` being set, and if absent, App Check is silently skipped with no fallback or warning.

**Impact:** An attacker who obtains the Firebase config (which is public) can make direct Firestore REST/gRPC calls without any app attestation. The Firestore rules rely solely on Firebase Auth, which means a compromised or brute-forced credential gives full access within the auth scope. There is no device-level attestation to prevent scripted attacks.

**Fix:** Add `request.app.check != null` (or `request.app.check.token != null`) to every Firestore rule condition. Ensure `VITE_RECAPTCHA_ENTERPRISE_KEY` is set and validated at app startup — crash-early if missing.

---

### H-2: Google Play RTDN Webhook Has No Authentication Verification

**File:** `functions/index.js` lines 1056–1097
**Lines:**
```
1056: exports.googlePlayRtdnWebhook = onRequest(async (req, res) => {
1057:   try {
1058:     const message = req.body?.message;
1059:     if (!message || !message.data) {
1060:       res.status(200).send('No data');
1061:       return;
1062:     }
...
1078:         if (notificationType === 2) {
1079:           // SUBSCRIPTION_RENEWED (Type 2)
1080:           const days = subData.billingCycle === 'yearly' ? 365 : 30;
1081:           const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
1082:           await userSubDoc.ref.update({ status: 'active', expiryDate: newExpiry, updatedAt: new Date().toISOString() });
```

**Issue:** This HTTP-triggered Cloud Function accepts Google Play Real-Time Developer Notifications but **verifies no signature, no JWT, and no origin**. Compare this with the Razorpay webhook (functions/index.js lines 983–1051) which correctly validates HMAC-SHA256 signatures. There is no check that the request originates from Google Cloud Pub/Sub, no OIDC token verification, and no shared secret validation.

**Impact:** An attacker who discovers the webhook URL can forge subscription state transitions — renewing expired subscriptions, cancelling active ones, or downgrading plans — by sending crafted JSON payloads. This directly modifies the `subscriptions` Firestore collection via Admin SDK with no access control.

**Fix:** Verify the Pub/Sub JWT token from the `Authorization` header when configured as a push subscription, or add a shared secret check. At minimum, validate the request origin against known Google Cloud IP ranges.

---

### H-3: Role Granularity — `updateUserByAdmin` Does Not Accept Role But UI Shows Role Editor

**Files:**
- `pages/UserManagement.tsx` lines 163–167, 300–309 (UI shows role dropdown)
- `functions/index.js` lines 572–620 (cloud function does not accept `role`)

**Lines (UserManagement.tsx, Edit Dialog):**
```
301:                 <select
302:                   value={editedRole}
303:                   onChange={(e) => setEditedRole(e.target.value as any)}
...
306:                   <option value="customer">Customer</option>
307:                   <option value="agent">Agent</option>
308:                   <option value="admin">Admin</option>
309:                 </select>
```

**Lines (functions/index.js, updateUserByAdmin):**
```
583:   const { uid, name, permissions, active, companyId } = request.data || {};
```

**Issue:** The client-side UI provides a role dropdown with `admin`/`agent`/`customer` options, but the server-side `updateUserByAdmin` function **never accepts or processes a `role` field**. The role dropdown in the UI is entirely cosmetic — changes to role are silently discarded. While this prevents role escalation, it violates the principle of least surprise: an admin user selecting a different role in the UI will believe the change took effect when it did not. Conversely, `createUserByAdmin` (line 491, 504) **does** accept and write the `role` field, allowing an admin to create another admin. Combined, an admin who cannot edit a user's role can simply create a new admin user and have the original user log into the new account.

**Impact:** 
- UI misleads admins into thinking role changes work
- An admin can create unlimited admin accounts with no audit trail beyond who called the function
- No cross-company admin escalation prevention in `createUserByAdmin` (line 518–519 only checks company access, not that target company matches caller's company)

**Fix:** Either remove the role dropdown from the edit UI, or add proper server-side role update logic to `updateUserByAdmin` with the same validation as `createUserByAdmin`. Add audit logging for role changes and admin account creation.

---

## MEDIUM FINDINGS

### M-1: No Rate Limiting on `sendWhatsapp` Callable Function

**File:** `functions/index.js` lines 344–358
**Lines:**
```
344: exports.sendWhatsapp = onCall({ secrets: [WASENDER_API_KEY] }, async (request) => {
345:   if (!request.auth || !request.auth.uid) {
346:     throw new functions.https.HttpsError('unauthenticated', 'User must be signed in.');
347:   }
...
354:   if (companyId && companyId !== JLS_COMPANY_ID) {
355:     return { success: false, error: 'ignored' };
356:   }
357:   const ok = await sendWhatsApp(phone, text);
358:   return { success: ok };
```

**Issue:** Any authenticated user (including those with `role: "pending"`) can call `sendWhatsapp` with arbitrary phone numbers and text content. The function only checks authentication, not that the caller has a legitimate business need. The Wasender API key is a server-side secret (`defineSecret`) but the function itself has no per-user, per-IP, or per-company rate limiting.

**Impact:** An authenticated attacker could:
- Send spam/phishing WhatsApp messages to arbitrary phone numbers (costing the company Wasender API credits)
- Send messages impersonating the company
- Deplete the Wasender trial cap (`MAX_PER_RUN = 40`, but this only applies to scheduled reminders, not this callable)

**Fix:** Add rate limiting (e.g., per-user quota with Firestore counter), and validate that the caller has appropriate role/permissions (e.g., `admin` or `agent`) before allowing `sendWhatsapp`.

---

### M-2: Hardcoded Sensitive Identifiers in Source Code

**Files and Values:**

| Value | File | Line |
|-------|------|------|
| `ADMIN_NUMBER = '9413821007'` | `functions/index.js` | 118 |
| `JLS_COMPANY_ID = 'MwtqusMMlFBKTFSslRVk'` | `functions/index.js` | 19 |
| `UPI_ID = "9413821007@superyes"` | `pages/CustomerPortal.tsx` | 47 |
| `upiId: '9413821007@superyes'` | `context/CompanyContext.tsx` | 123 |
| `JLS_COMPANY_ID` hardcoded queries | `functions/index.js` | 64, 65, 66, 126–129, 354 |

**Issue:** Hardcoded identifiers create deployment friction and information leakage:
- A company's UPI ID (used for payments) is embedded in client-side code
- The JLS company's Firestore document ID is hardcoded in cloud functions, making company-specific logic impossible to deploy for other tenants
- The admin's personal phone number is embedded in server-side code

**Impact:** Anyone with access to the client-side source code (through APK decompilation or web build inspection) can see the UPI ID. The hardcoded company ID means the reminders and WhatsApp functions only work for one specific company — this is a scaling blocker and a data leak if the source is inspected.

**Fix:** Move all such values to environment variables, Firebase Remote Config, or a Firestore config document.

---

### M-3: Anonymous Authentication Used Without Explicit Authorization Boundary

**Files:**
- `pages/CustomerLogin.tsx` lines 18–21
- `pages/CustomerPortal.tsx` lines 68–76
- `firestore.rules` lines 7–16 (`canAccessCompany`)

**Lines (CustomerLogin.tsx):**
```
18:     if (!auth.currentUser) {
19:       signInAnonymously(auth).catch((e) =>
20:         console.error('Anonymous sign-in failed:', e)
21:       );
```

**Lines (firestore.rules):**
```
 7:     function canAccessCompany(cid) {
 8:       return request.auth != null && cid != null && (
 9:         (exists(...ownerEmail...) )
10:         || (exists(.../users/$(request.auth.uid)...) && cid == ...companyId)
11:         || (exists(.../users/$(request.auth.uid)...) && "companies" in ...)
12:       );
13:     }
```

**Issue:** `signInAnonymously` is called in the `CustomerLogin` component's `useEffect` on every mount, and again in `CustomerPortal.tsx`. While the current Firestore rules correctly block anonymous users via `canAccessCompany` (anonymous users have no `users/{uid}` doc and no email), the anonymous session is still created and persisted. Any future rule change that inadvertently becomes more permissive will immediately expose data to anonymous users. Additionally, anonymous UIDs are long-lived and can be recycled across app reinstalls (depending on Firebase configuration).

**Impact:** Anonymous auth creates an authenticated session with `request.auth != null` but no verifiable identity. A single Firestore rule regression (e.g., changing `canAccessCompany` to `request.auth != null` for debugging) would expose all company data to anyone.

**Fix:** Either disable Anonymous auth if not strictly necessary, or add `request.auth.token.firebase.sign_in_provider != "anonymous"` checks to all Firestore rules that access business data.

---

### M-6: `users` Collection Write Rule Allows Any Authenticated User to Write Their Own Doc (Within Constraints)

**File:** `firestore.rules` lines 126–129
**Lines:**
```
126:       allow write: if request.auth != null && request.auth.uid == document && (
127:         resource == null
128:         || request.resource.data.diff(resource.data).affectedKeys().hasOnly(["name", "fcmToken"])
129:       );
```

**Issue:** While the `hasOnly(["name", "fcmToken"])` constraint correctly prevents users from modifying their own `role`, `companyId`, or `permissions`, there is no validation on the **values** of `name` or `fcmToken`. A user could set a malicious `name` (e.g., `<script>` payload) that gets rendered elsewhere without sanitization. The `fcmToken` value is also unchecked.

**Impact:** Potential stored XSS vector if `name` values are rendered without escaping in any UI context (admin panels, reports, PDF generators). The `fcmToken` could be set to garbage, preventing legitimate push notifications to that user.

**Fix:** Add size limits and character validation to `name` in the rules. Consider moving `fcmToken` writes to a server-side function.

---

## LOW FINDINGS

### L-1: `.env` File Committed to Version History

**File:** `C:\Users\Admin\jlsappandroid\.env`
**Contents:** Contains `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` (unsigned upload preset).

**Issue:** The `.env` file exists in the repository checkout. While the credentials here are for an unsigned upload preset (intended to be public), committing `.env` files is a security anti-pattern that normalizes the practice. If real secrets (API keys, tokens) are ever added to this file, they would be committed to history.

**Impact:** Low for current contents. Configuration hygiene issue that could lead to credential leakage if the file is later used for real secrets.

**Fix:** Add `.env` to `.gitignore`. Re-secure the Cloudinary upload preset if needed (turn on signed upload or add restriction rules).

---

### L-2: Error Objects Logged to Console in Production

**Files (multiple):**
- `pages/Register.tsx` line 57 — `console.error(err)`
- `pages/Login.tsx` line 29 — `console.error(err)`
- `pages/CustomerLogin.tsx` lines 108, 130 — `console.error(...)`
- `pages/CustomerPortal.tsx` line 136 — `console.error(e)`
- `App.tsx` lines 147, 148 — `console.error(...)`
- `functions/index.js` lines 107, 168, 243, 338, 411, 537, 563, 696, 920, 1045, 1094

**Issue:** Error objects are logged via `console.error` without sanitization. In production, mobile app logs may be accessible via device logcat/console, which can leak internal state, Firestore document IDs, token values, and API error details.

**Impact:** Low-to-Medium depending on environment (debug builds leak more). Provides reconnaissance data to an attacker who gains device access.

**Fix:** Implement a structured logging service that sanitizes PII and sensitive data before logging. Strip error objects in production builds.

---

### L-3: `razorpayWebhook` Uses `JSON.stringify(req.body)` for Signature Verification

**File:** `functions/index.js` line 997
**Line:**
```
997:   const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
```

**Issue:** Razorpay sends the webhook payload as a raw JSON string. Using `JSON.stringify(req.body)` after Express/Firebase has already parsed the body can produce a different string representation than the original (e.g., key ordering, whitespace). While this may work in practice because both Razorpay and the server use the same JSON serializer, it's not spec-compliant and could break with different Node.js versions or JSON implementations.

**Impact:** Low. Signature verification could silently pass for malformed payloads or fail for legitimate ones if key ordering differs.

**Fix:** Configure the HTTP function to receive the raw body string for signature verification, using `req.rawBody` or a middleware that preserves the original payload.

---

### L-4: `userRole` Exposed in `CompanyContext` Without Explicit Authorization Check

**File:** `context/CompanyContext.tsx` lines 16, 60–65
**Lines:**
```
60:       let role: 'admin' | 'agent' | 'customer' | null = null;
...
64:         role = userData.role || 'customer';
65:         setUserRole(role);
```

**Issue:** The `userRole` value is derived from the client-side Firestore read of the user's own `users/{uid}` document. While the Firestore rules restrict writes to `role`, the role value is read from the database and trusted on the client. There is no additional server-side validation that a user's role matches what they claim. All server-side enforcement happens in Cloud Functions, which independently read the user's doc (e.g., `functions/index.js` line 482–483).

**Impact:** Low. The client-side role is only used for UI rendering, not for security decisions. All significant operations go through callable Cloud Functions or Firestore rules.

**Fix:** Add a comment noting that `userRole` is client-authoritative only and must not be used for security decisions. Consider removing it from the context to prevent misuse.

---

## SUMMARY OF FIREWALL / RULE EFFECTIVENESS

| Collection | Read | Write | Assessment |
|------------|------|-------|------------|
| `customers` | ✅ Company-isolated via `canAccessCompany` | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `loans` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `deposits` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `expenses` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `ledger` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `partner_transactions` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `partners` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `receipts` | ✅ Company-isolated | ✅ Immutable `companyId`/`ownerEmail` | Good |
| `companies` | ✅ Owner-only reads | ✅ Owner-only writes | Good |
| `users` | ⚠️ Broad — allows by uid, email, OR company | ✅ Self-only, `name`/`fcmToken` only | Medium risk |
| `notifications` | ✅ Company-isolated or by recipientId | ✅ Authenticated create with company check | Good |
| `counters` | ✅ Authenticated read | ✅ `if false` (cloud functions only) | Good |
| `subscriptions` | ✅ Self by uid/email | ✅ `if false` (cloud functions only) | Good |
| `payments` | ✅ Self by uid/email | ✅ `if false` (cloud functions only) | Good |
| `payment_history` | ✅ Self by uid/email | ✅ `if false` (cloud functions only) | Good |
| `subscription_logs` | ✅ Self by uid/email | ✅ `if false` (cloud functions only) | Good |
| `usage` | ✅ Self by uid/email | ✅ `if false` (cloud functions only) | Good |
| Fallback `/**` | ✅ Denied | ✅ Denied | Good |

**Key gap across ALL rules:** No `request.app.check` enforcement.

---

## CRITICAL QUESTIONS ANSWERED

| Question | Answer |
|----------|--------|
| **Can a user elevate their own role?** | No. Firestore rules prevent writing `role` (only `name`/`fcmToken` allowed). `updateUserByAdmin` cloud function does not accept a `role` parameter. Role is set only at creation via `createUserByAdmin`, which requires existing `admin` role. |
| **Are there any auth bypass vulnerabilities?** | Yes (C-1). Customer portal "password" is the login ID itself, which is the company prefix + phone number. No auth bypass for admin/agent paths. |
| **Can one user read another user's data?** | Within the same company, yes (by design). The rules allow any user with company access to read other users in that company. Cross-company isolation is enforced via `canAccessCompany`. |
| **Are Firestore rules too permissive?** | The `users` collection read rule is broad (by uid, email, or company). App Check is not enforced anywhere. Otherwise, rules are well-structured with proper company isolation. |
| **Are there hardcoded secrets?** | Yes (M-2). Administrator phone number, company document ID, and UPI ID hardcoded in source. |
| **Is App Check properly configured?** | No (H-1). Initialized but never enforced in rules. |
| **Is reCAPTCHA configured properly?** | The key is loaded from env but silently skipped if absent. No enforcement at the rule level. |
| **Are all DB writes properly validated server-side?** | Most. `createUserByAdmin` and `updateUserByAdmin` validate caller role and company access. Subscription/payment writes go through cloud functions only (rules enforce `allow write: if false`). Customer-facing writes (via Firestore client SDK) are validated by rules. |
| **Are there XSS or injection vulnerabilities?** | Potential stored XSS through user `name` field (M-6). `name` can be set to arbitrary values with no sanitization in the Firestore rules. Notifications use `data.title` and `data.message` unsanitized (but rendered by OS notification system, not DOM — lower risk). |

---

## TOP 5 IMMEDIATE ACTIONS

1. **🔴 Fix customer login authentication** — Replace the "password == loginId" check with proper Firebase Auth or an OTP-based flow (C-1)
2. **🔴 Move customer portal session to secure storage** — Use Firebase Auth custom claims or token-based sessions instead of localStorage (C-2)
3. **🟠 Enforce App Check in Firestore rules** — Add `request.app.check != null` to every rule (H-1)
4. **🟠 Add authentication to Google RTDN webhook** — Verify the Pub/Sub JWT or add a shared secret (H-2)
5. **🟠 Add rate limiting to `sendWhatsapp`** — Prevent abuse of the WhatsApp messaging endpoint (M-1)

---

*This audit was performed by automated static analysis and manual code review. No dynamic testing or penetration testing was conducted. Findings should be validated in a staging environment before any fixes are applied.*
