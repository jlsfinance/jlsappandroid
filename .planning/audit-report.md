# ⚠️ Security & Payments Audit: JLS Finance Suite

**Audit Date:** 2026-07-24
**Audit Scope:** Cloud Functions, Payment Systems (Razorpay + Google Play), Subscription/Billing Backend
**Auditor:** Payments & Backend Infrastructure Audit

---

## EXECUTIVE SUMMARY

**11 CRITICAL, 8 HIGH, 5 MEDIUM, 4 LOW** findings identified. The most severe pattern: **plan limits are enforced entirely client-side with zero server-side verification** — the entire subscription monetization model relies on UI guards that can be trivially bypassed. Additionally, the **Razorpay webhook omits pending_orders validation** and the **Google Play RTDN webhook has no cryptographic authentication**, allowing subscription state manipulation by anyone who discovers the endpoint URL.

---

## 🔴 CRITICAL FINDINGS

### C1. Plan Limits Enforced ONLY Client-Side (No Server-Side Guard)

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\services\SubscriptionGuard.ts` (lines 51-257) — entire file |
| | `C:\Users\Admin\jlsappandroid\context\SubscriptionContext.tsx` (lines 169-195) |
| | `C:\Users\Admin\jlsappandroid\services\UsageService.ts` (lines 46-67) |
| **Impact** | A malicious client can bypass all plan limits (max 10 customers on Free, max 1 company, deposit module disabled, etc.) by directly writing to Firestore. The `SubscriptionGuard` methods (`canAddCustomer`, `canCreateLoan`, etc.) run exclusively in the browser context. No Firestore security rule or Cloud Function enforces these limits on write operations. |
| **Evidence** | `SubscriptionGuard.ts` is imported and called from `SubscriptionContext.tsx` (client-side React context). `UsageService.incrementUsage()` at line 64 even admits: *"Usage updates are restricted to Cloud Functions / Admin SDK in production"* — yet no such enforcement function exists in the codebase. |
| **Fix** | Create Firestore security rules (or a `beforeWrite` Cloud Function) that reject writes exceeding plan limits. Re-read subscription from `subscriptions/{userId}` and compare plan limits before allowing document creation. |

### C2. Razorpay Webhook Has NO `pending_orders` Validation

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 983-1051) |
| **Lines** | 1008-1048 — the `payment.captured` / `order.paid` handler |
| **Impact** | The webhook does NOT check `pending_orders` for amount, userId, planId, or status. It blindly trusts the Razorpay webhook payload's `notes.userId` and `notes.planId`. If HMAC verification is bypassed or the webhook secret is compromised, an attacker can activate any subscription for any user at any plan level without a valid payment. Compare to `verifyRazorpayPayment` (line 782-850) which performs 6 separate validations against `pending_orders`. |
| **Evidence** | Line 1009-1014: reads `notes?.userId` and `notes?.planId` directly from payload. No `pending_orders` fetch. No amount cross-check. The verification path (lines 1008-1047) skips every guard present in `verifyRazorpayPayment`. |
| **Fix** | Add a Firestore transaction that reads `pending_orders/{order_id}` and validates userId, planId, billingCycle, and amount before activating the subscription. |

### C3. Razorpay Webhook HMAC Body Stringification Is Incorrect

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (line 997) |
| **Line** | `const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);` |
| **Impact** | Firebase Cloud Functions parses JSON request bodies automatically (Express.js middleware). `req.body` is a JavaScript object, NOT the raw POST body string. `JSON.stringify()` does NOT guarantee byte-for-byte identity with the original raw request (field ordering, whitespace, Unicode escaping may differ). Razorpay signs the raw request body. This means: (a) legitimate webhooks will almost certainly fail HMAC verification, **OR** (b) if `JSON.stringify` happens to produce identical output for certain payloads, the verification succeeds by accident but is fragile and could be exploited with crafted payloads. |
| **Evidence** | `req.body` is accessed throughout (lines 1005-1006) as a parsed object, confirming Express middleware has already consumed it. The raw buffer is lost. |
| **Fix** | Use `onRequest` with raw body parsing. Configure Firebase Functions to pass through the raw request body, or use an Express middleware to capture `req.rawBody` before JSON parsing. Reference Razorpay docs: the HMAC must be computed over the **exact raw bytes** received. |

### C4. Google Play RTDN Webhook Has NO Authentication/Verification

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 1056-1097) |
| **Impact** | The `googlePlayRtdnWebhook` endpoint is a publicly accessible Firebase `onRequest` (no auth, no JWT verification, no Pub/Sub audience check). Anyone who discovers the URL can POST a crafted Pub/Sub envelope containing a `subscriptionNotification`. While the attacker needs a valid `purchaseToken` to cause damage, there is **zero** cryptographic proof that the notification came from Google. |
| **Evidence** | Line 1056: exported as raw `onRequest`. Line 1058-1065: reads `req.body?.message?.data`, base64 decodes, and JSON-parses it — no verification of where it came from. |
| **Fix** | Verify the Google Cloud Pub/Sub JWT (`req.headers.authorization` Bearer token). Validate `audience` matches the function URL. Alternatively, convert to a Pub/Sub-triggered function (`onMessagePublished`) which provides built-in authentication. |

### C5. Google Play Server-Side Verification Omits `paymentState` Validation for Pending Payments

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 894-925) |
| **Lines** | 914-916: `if (playData.paymentState === 0) { throw ... 'payment is pending.' }` |
| **Impact** | The `verifyGooglePlaySubscription` function correctly rejects `paymentState === 0` (pending). However, there is NO check on `paymentState === 2` (deferred) or other states. Additionally, the purchase token expiry check (line 910) only validates `expiryTimeMillis > Date.now()`, but a token with `paymentState: 2` could pass if the expiry is in the future. Google recommends checking `paymentState === 1` (payment received) explicitly. |
| **Evidence** | Lines 909-916: Only checks expiry and `paymentState === 0`. Should also verify `paymentState === 1` (received) and reject any other state. |
| **Fix** | Add `if (playData.paymentState !== 1) { throw ... }` to explicitly accept only confirmed payments. |

### C6. `adminUpdateSubscription` Company Check Can Be Bypassed

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 1125-1129) |
| **Lines** | 1125-1129: `if (targetCompanyId && callerCompanyId && targetCompanyId !== callerCompanyId)` |
| **Impact** | The guard condition uses `&&` — if EITHER `targetCompanyId` OR `callerCompanyId` is null/undefined/empty, the cross-company restriction is skipped entirely. An admin user whose `users/{uid}` doc has no `companyId` can modify **any** user's subscription. An admin can also target a user with no `companyId`. |
| **Evidence** | Line 1127: `if (targetCompanyId && callerCompanyId && targetCompanyId !== callerCompanyId)`. If either is falsy, the check passes. |
| **Fix** | Change to: `if (!targetCompanyId || !callerCompanyId || targetCompanyId !== callerCompanyId)`. Require both values to be present and matching. |

### C7. `adminUpdateSubscription` Grants Subscription Without Payment Record

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 1135-1156) |
| **Lines** | 1135-1146: subscription activated; 1148-1156: only writes a log |
| **Impact** | Any admin can give any user (in their company) any subscription plan — including Enterprise (₹3,999/mo) — for free and without any payment record. No `payment_history` document is created. This means the system has no audit trail for revenue: a malicious or compromised admin account can grant paid subscriptions with zero accountability. |
| **Evidence** | Lines 1135-1146: writes to `subscriptions/{targetUserId}`. Lines 1148-1156: writes to `subscription_logs`. No `payment_history` entry is created. |
| **Fix** | Require a reason/approval workflow for admin grants. At minimum, create a `payment_history` record with `amount: 0` and `gateway: 'admin_free_grant'`. |

### C8. RazorpayService.ts Has Hardcoded Fallback Test Key

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\services\RazorpayService.ts` (line 77) |
| **Line** | `key: keyId || 'rzp_test_jls_suite'` |
| **Impact** | If the Cloud Function `createRazorpayOrder` returns a response without a `keyId` (e.g., network error, misconfiguration, or future schema change), the client falls back to a hardcoded key `rzp_test_jls_suite`. This Razorpay key is a test key — payments made with it go to the test environment, not production. Real money would be lost. Additionally, the test key is hardcoded in the client bundle, visible to anyone who inspects the source. |
| **Evidence** | Line 77: `key: keyId || 'rzp_test_jls_suite'`. This string `rzp_test_jls_suite` does not appear in any server configuration. |
| **Fix** | Remove the fallback entirely. If `keyId` is missing, the payment should fail with a clear error. Never expose any Razorpay key (test or live) in client-side code — the server returns it per-session. |

### C9. `verifyRazorpayPayment` Missing Amount-to-Plan Reconciliation

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 782-850) |
| **Lines** | 796-799: `orderData.amount !== expectedAmountInPaise` |
| **Impact** | The `pending_orders` amount check at line 798 compares the order amount to the expected plan price. However, there is NO verification that the **actual Razorpay payment amount** matches the order amount. An attacker could create an order for a `starter` plan (₹59), then attempt to verify with parameters claiming `pro` or `enterprise`. The pending_order stores the starter amount, but the subscription is activated with whatever `planId` the client sends. The pending_order check validates `orderData.planId !== planId`, so this is partially blocked — but only if the pending_order was created with the mismatched planId. The attacker could create a starter pending_order and then on the verify call, claim `enterprise` — the planId mismatch is caught, but if the amount-check is circumvented (e.g., by tampering with the timestamp-dependent plan price calculation), the system is vulnerable. |
| **Evidence** | Lines 796-799: planId and billingCycle checked against pending_order. Lines 772-777: price derived from server-side constant. |
| **Fix** | Additionally verify that the `amount` in the payment capture result (queried from Razorpay API via payment_id) matches the expected plan price, not just the pending_order amount. |

### C10. Google Play Product ID Resolution Defaults to `enterprise` for Unknown Products

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\services\GooglePlayBillingService.ts` (line 93) |
| **Line** | `const planId = p.productId.includes('starter') ? 'starter' : p.productId.includes('pro') ? 'pro' : 'enterprise';` |
| **Impact** | This substring matching logic has a dangerous default: any product ID that does NOT contain 'starter' or 'pro' silently resolves to 'enterprise' (₹3,999/mo — the most expensive plan). A typo in product ID naming (e.g., `jls_enterprise_monthly_v2`) would resolve correctly. But a product ID like `jls_entrprise_monthly` (typo) or a future product ID like `jls_ultimate_monthly` would also return 'enterprise'. Additionally, the year/month billing inference (line 94): `const billingCycle = p.productId.includes('yearly') ? 'yearly' : 'monthly'` — any unknown product defaults to 'monthly', which could provide wrong-cycle access. |
| **Evidence** | Line 93: three-way ternary with `'enterprise'` as the bare `else` clause. |
| **Fix** | Add explicit matching: `if (p.productId === 'jls_starter_monthly')` etc. Throw/return error for unknown product IDs. Or derive planId/billingCycle from a server-side product catalog. |

### C11. Google Play Billing Purchase Acknowledgment Has No Error Handling

| Severity | CRITICAL |
|----------|----------|
| **Files** | `C:\Users\Admin\jlsappandroid\android\app\src\main\java\com\jls\loanbook\plugins\GooglePlayBillingPlugin.java` (line 170) |
| **Line** | `billingClient.acknowledgePurchase(ackParams, ackResult -> {});` |
| **Impact** | Google Play requires that subscriptions are acknowledged within 3 days of purchase. If acknowledgment fails (empty listener — the result is ignored), Google will automatically refund and cancel the subscription. The user gets the subscription for free, and the developer loses revenue. The empty lambda at line 170 means ALL acknowledgment failures are silently swallowed. |
| **Evidence** | Line 170: `ackResult -> {}` — no error checking, no retry logic. |
| **Fix** | Check `ackResult.getResponseCode()` and implement retry logic. If acknowledgment persistently fails, surface to the server-side verification function so it can retry via the Google Play Developer API. |

---

## 🟠 HIGH FINDINGS

### H1. Google Play Verified Purchase Not Checked Against Google's `orderId` for Replay

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 928-970) |
| **Lines** | 928-929: `safeTokenKey` derived from `purchaseToken`, used as `paymentId` |
| **Impact** | The replay protection key is derived from the `purchaseToken` alone. A purchaseToken is unique per transaction from Google Play, but Google also issues an `orderId`. If the same purchaseToken is somehow reused (Google Play bug or edge case), the replay protection catches it. However, the real issue is that the server never validates the `orderId` returned by Google Play — it only validates the purchaseToken via the API. If Google's API returns a successful response for a revoked purchase token (e.g., during the short window between purchase and refund), the subscription is activated incorrectly. |
| **Fix** | Also store and check `orderId` for replay protection. Validate `orderId` if returned by Google Play API. Check `acknowledgementState` in the API response. |

### H2. `createRazorpayOrder` No Rate Limiting or Duplicate Prevention

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 661-719) |
| **Evidence** | No duplicate `pending_orders` check for the same userId+planId+cycle. An attacker could create thousands of pending orders (no rate limit), each creating a Firestore document and calling Razorpay API. This is both a cost attack (each Razorpay order API call is metered) and a Firestore write amplification. |
| **Fix** | Add rate limiting per userId. Check for existing pending orders with same userId+planId before creating new ones. |

### H3. Subscription State Can Be Set to 'active' Without Any Payment Source Validation

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (multiple locations) |
| **Evidence** | `verifyRazorpayPayment` (line 815-828), `verifyGooglePlaySubscription` (line 942-956), `razorpayWebhook` (line 1019-1043), `adminUpdateSubscription` (line 1135-1146) — all set `status: 'active'`. Only `verifyRazorpayPayment` and `verifyGooglePlaySubscription` have proper payment verification flows. The webhook and admin paths skip critical checks. |
| **Fix** | Centralize subscription activation into a single authoritative function that validates the payment source. |

### H4. No Firestore Security Rules in Repository

| Severity | HIGH |
|----------|------|
| **Files** | Not present in repository |
| **Impact** | Without examining Firestore security rules, the entire data access model is unverifiable. If rules don't exist or are too permissive, all client-side SubscriptionGuard checks are meaningless. Firestore rules are the last line of defense for plan limits, data isolation, and preventing unauthorized writes. |
| **Fix** | Implement and deploy Firestore security rules that: (1) enforce plan limits on `customers`, `loans`, `deposits` writes; (2) restrict `subscriptions/{userId}` writes to Cloud Functions only; (3) enforce per-company read/write isolation. |

### H5. `razorpayWebhook` Returns 200 OK Even When Processing Fails

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 1044-1051) |
| **Lines** | 1044-1050: the webhook transaction `catch` logs the error but doesn't change the response |
| **Impact** | Razorpay interprets HTTP 200 as "webhook delivered successfully" and will NOT retry. If the Firestore transaction fails (line 1019-1043 catch at 1044-1046), the webhook returns 200 anyway. The payment was captured by Razorpay, but the subscription was never activated. No retry will occur. Revenue lost. |
| **Evidence** | Line 1044: `catch (whErr) { console.error(...); }`. Line 1050: `res.status(200).json({ status: 'ok' })` — always sends 200 regardless of success/failure. |
| **Fix** | Return HTTP 500 when the transaction fails, so Razorpay retries the webhook. |

### H6. Google Play Billing Connects Once on Plugin Load, No Reconnection Logic

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\android\app\src\main\java\com\jls\loanbook\plugins\GooglePlayBillingPlugin.java` (lines 42-64) |
| **Lines** | 50-63: `connectToPlayStore()` called once. `onBillingServiceDisconnected` only sets `connected = false` without reconnecting. |
| **Impact** | If the BillingClient disconnects (e.g., network change, app backgrounded), all subsequent `purchase` and `getPurchases` calls will fail with "BillingClient is not connected". The user sees an error and cannot make purchases until the app is restarted. |
| **Fix** | Add auto-reconnection in `onBillingServiceDisconnected()`. |

### H7. Purchase Flow Falls Back to Razorpay When Google Play Fails — No User Choice

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\pages\PricingPage.tsx` (lines 88-106) |
| **Lines** | 88-106: if Google Play fails, silently falls through to Razorpay |
| **Impact** | On Android, when Google Play purchase fails (e.g., user doesn't have a payment method in Google Play), the code silently falls through to Razorpay. The user may not understand why they're being asked for UPI/Credit Card after being shown a Google Play dialog. More critically, if the Google Play "failure" is ambiguous (e.g., pending/awaiting parent approval), the user could end up paying twice — once pending in Google Play and once successful in Razorpay. |
| **Evidence** | Lines 88-106: Google Play failure `if/else` with no explicit user consent for fallback. |
| **Fix** | Show the user a choice: "Google Play failed. Would you like to try Razorpay instead?" during fallback. Check for pending Google Play purchases before initiating Razorpay payment. |

### H8. `pending_orders` No TTL or Cleanup — Unbounded Growth

| Severity | HIGH |
|----------|------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 700-710) |
| **Impact** | Each `createRazorpayOrder` call creates a `pending_orders` document. Abandoned orders (user closes browser, never completes payment) remain forever with `status: 'pending'`. Over time, this collection grows indefinitely, increasing Firestore read costs and slowing queries. |
| **Fix** | Set a Firestore TTL policy on `pending_orders` (e.g., 24-hour expiration). Or delete/add a timestamp index for periodic cleanup. |

---

## 🟡 MEDIUM FINDINGS

### M1. Receipt ID Uses Truncated Substring — Potential Collisions

| Severity | MEDIUM |
|----------|--------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (line 691) |
| **Line** | `receipt: \`rcpt_${userId.substring(0, 8)}_${Date.now()}\`` |
| **Impact** | Using only 8 characters of userId (32+ chars normally) increases collision risk. Multiple orders from users with the same 8-character prefix in the same millisecond would collide. This is a receipt ID, not a primary key, so impact is limited to Razorpay dashboard confusion. |
| **Fix** | Use full userId or a UUID for receipts. |

### M2. No `startDate` Validation — Past Dates Accepted

| Severity | MEDIUM |
|----------|--------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 778-779, 918, 1016, 1131-1133) |
| **Impact** | All subscription activation uses `new Date().toISOString()` for `startDate`. If the system clock is incorrect or the adminUpdateSubscription is used to "backdate" a subscription, the startDate could be in the past. |
| **Fix** | Accept server timestamp (`FieldValue.serverTimestamp()`) for absolute time reference. |

### M3. `subscription_logs` Collection Grows Unbounded

| Severity | MEDIUM |
|----------|--------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (line 1148) |
| **Line** | `db.collection('subscription_logs').doc(\`log_${Date.now()}\`)` |
| **Impact** | Each admin subscription update creates a log entry. No cleanup or archival mechanism. Will grow indefinitely. |
| **Fix** | Set a Firestore TTL policy on `subscription_logs`. Or rotate by month (log_2026_07_...). |

### M4. `getGoogleAccessToken` Creates New JWT Auth on Every Call — No Caching

| Severity | MEDIUM |
|----------|--------|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 862-870) |
| **Impact** | Each `verifyGooglePlaySubscription` call creates a new JWT authentication to Google, which requires a network round-trip to Google's auth server (not using cached tokens). Google access tokens are valid for 1 hour. This adds 500-1500ms latency to every purchase verification and counts against Google API quotas. |
| **Fix** | Cache the access token globally and refresh only when expired. |

### M5. `firebaseConfig.ts` Exposes API Key Directly in Client Bundle

| Severity | MEDIUM |
|----------|--------|
| **Files** | `C:\Users\Admin\jlsappandroid\firebaseConfig.ts` (lines 7-14) |
| **Line** | `apiKey: "AIzaSyB52JnNNz8ul7lajtCzhdQoC9zKr_ynk-Y"` |
| **Impact** | This is expected for Firebase web SDKs (API keys are not secret by Firebase design — they rely on App Check + Security Rules). However, the key is visible to anyone who inspects the source. Firebase API keys control access to Firebase services. |
| **Fix** | Ensure App Check is enforced for all Firebase services. Consider restricting the API key to specific HTTP referrers and Android app bundle IDs in GCP Console. |

---

## 🔵 LOW FINDINGS

### L1. No `subscriptions/{userId}` Index Created for `where('purchaseToken', '==', ...)` Query

| Severity | LOW |
|----------|-----|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (line 1073) |
| **Line** | `db.collection('subscriptions').where('purchaseToken', '==', purchaseToken).limit(1).get()` |
| **Impact** | The RTDN handler queries subscriptions by `purchaseToken`. Without a composite index on `purchaseToken`, this query will fail in production with a "needs index" error, breaking the Google Play renewal loop. |
| **Fix** | Create the composite index in Firebase console or `firebase.indexes.json`. |

### L2. WhatsApp `sendWhatsApp` Falls Back to `process.env.WASENDER_API_KEY` Instead of `defineSecret`

| Severity | LOW |
|----------|-----|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (line 32) |
| **Line** | `const apiKey = process.env.WASENDER_API_KEY || '';` |
| **Impact** | In Firebase Cloud Functions v2, secrets defined via `defineSecret()` are injected at deploy time as env vars. The fallback to `process.env` is redundant (but not harmful unless the secret name differs). |
| **Fix** | Use `WASENDER_API_KEY.value()` directly instead of `process.env` fallback. |

### L3. `googlePlayRtdnWebhook` Accepts Any `notificationType` Without Handling

| Severity | LOW |
|----------|-----|
| **Files** | `C:\Users\Admin\jlsappandroid\functions\index.js` (lines 1078-1089) |
| **Lines** | Handles types 2 (renewed), 3 (canceled), 13 (expired). Unknown types silently ignored. |
| **Impact** | Google may introduce new notification types in the future. Unknown types are silently ignored, which is acceptable behavior. |
| **Fix** | Log unrecognized notification types for visibility. |

### L4. Android minifyEnabled false — No Code Obfuscation

| Severity | LOW |
|----------|-----|
| **Files** | `C:\Users\Admin\jlsappandroid\android\app\build.gradle` (line 37) |
| **Line** | `minifyEnabled false` (in release build) |
| **Impact** | Release APK is not minified/obfuscated. Makes reverse engineering easier. Sensitive logic (Razorpay API key reference via plugin, billing flow) is exposed in readable bytecode. |
| **Fix** | Enable `minifyEnabled true` with ProGuard rules for release builds. |

---

## 📊 SUMMARY TABLE

| Severity | Count | Key Areas |
|----------|-------|-----------|
| 🔴 CRITICAL | 11 | Plan limit enforcement, webhook security, auth bypass, missing payment validation |
| 🟠 HIGH | 8 | Rate limiting, replay protection, error handling, missing security rules |
| 🟡 MEDIUM | 5 | Latency, collisions, unbounded collections, API key exposure |
| 🔵 LOW | 4 | Indexing, obfuscation, minor redundancy |

### 🔴 Top 3 Fixes by Business Impact

1. **C1** (Server-side plan enforcement) — Without this, the subscription model generates no revenue; users can trivially bypass all limits.
2. **C4** (Google Play RTDN authentication) — Public unauthenticated endpoint can manipulate subscription states.
3. **C2/C3** (Razorpay webhook validation + body parsing) — Webhook-based subscription activation bypasses all checks present in the client-called verification path.

---

*End of audit — 28 findings total. No code was modified during this analysis.*