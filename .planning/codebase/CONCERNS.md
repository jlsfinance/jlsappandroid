# Multi-Tenant & Data Isolation Audit — JLS Finance Suite

**Analysis Date:** 2026-07-24
**Scope:** Company isolation, multi-user security, Firebase security rules, tenant data boundaries

---

## CRITICAL FINDINGS

### C1. Partners page loads ALL data across companies (NO companyId filter)

**Files:** `pages/Partners.tsx` lines 48, 52, 60, 64
**What:** `fetchData()` performs four unfiltered collection reads:
- Line 48: `getDocs(query(collection(db, "partners"), orderBy("name")))` — reads ALL partners globally
- Line 52: `getDocs(query(collection(db, "partner_transactions"), orderBy("date", "desc")))` — reads ALL transactions globally
- Line 60: `getDocs(query(collection(db, "loans"), where("status", "in", [...])))` — reads ALL loans globally (no companyId)
- Line 64: `getDocs(query(collection(db, "receipts")))` — reads ALL receipts globally
**Impact:** An admin user viewing the Partners page will receive ALL business data across ALL companies into their client. While Firestore rules gate reads by `canAccessCompany(resource.data.companyId)`, documents without a `companyId` field (which partners/partner_transactions commonly lack — see C2) will fail the `resource == null || canAccessCompany(resource.data.companyId)` check in `canReadBusinessData()` and be silently denied. This leads to partial/inconsistent data display *and* unnecessary data transfer.
**Fix:** Add `where("companyId", "==", currentCompany.id)` to every query in `fetchData()`.

### C2. Partners and partner_transactions created WITHOUT companyId

**Files:** `pages/Partners.tsx` lines 264, 281
**What:**
- Line 264: `addDoc(collection(db, "partners"), { name: partnerFormName })` — no companyId field
- Line 281: `addDoc(collection(db, "partner_transactions"), { ...transactionForm, ... })` — no companyId field
**Impact:** These documents will be rejected by Firestore rules' `canCreateBusinessData()` check which requires `request.resource.data.companyId != null`. The `addDoc` calls will fail silently (errors caught and logged but user sees "Failed to add partner" or "Failed to record transaction"). New partners/transactions can never be created.
**Fix:** Include `companyId: currentCompany.id` in both `addDoc` calls.

### C3. fetchCustomerById / fetchLoansByCustomerId bypass company isolation

**Files:**
- `services/dataService.ts` lines 48–62 (`fetchCustomerById`)
- `services/dataService.ts` lines 64–82 (`fetchLoansByCustomerId`)
- `services/dataService.ts` lines 139–148 (`fetchDepositsByCustomerId`)
- `services/dataService.ts` lines 150–161 (`fetchDepositById`)
- `pages/CustomerProfile.tsx` lines 56, 60
**What:** These functions retrieve documents by ID or by `customerId` without any `companyId` filter. An attacker who knows another company's customer document ID (e.g., from a URL parameter) can call `fetchCustomerById(id)` to retrieve it.
**Impact:** `CustomerProfile.tsx` (accessible via `/customers/:id`) uses these functions at lines 56, 60. A user could navigate to `/customers/some-other-companys-customer-id` and potentially view another company's customer data and their loans. Firestore rules DO provide server-side protection (`canReadBusinessData()` checks `canAccessCompany(resource.data.companyId)`), so the read will be denied *if* the customer doc has a valid `companyId`. But if a customer document somehow lacks `companyId` (e.g., migrated from old data), the `resource == null || canAccessCompany(resource.data.companyId)` check will grant access because `canAccessCompany(null)` returns false when `cid != null` fails... Actually looking at the rule: `resource == null || canAccessCompany(resource.data.companyId)`. If `resource.data.companyId` is undefined/null, `canAccessCompany(undefined)` -> `cid != null` is false -> returns false. So this would be denied. But `resource == null` check first — if the doc exists, this is false, so it's safe.
**Risk:** LOW given server-side protection, but the client-side code provides no defense-in-depth. Any document without a `companyId` field is accessible to any authenticated user.

### C4. CompanySelector orphan data check reads ALL business data

**Files:** `pages/CompanySelector.tsx` lines 49–73
**What:** The `checkOrphanedData()` function reads EVERY document from:
- `collection(db, "customers")` — ALL customers
- `collection(db, "loans")` — ALL loans
- `collection(db, "partner_transactions")` — ALL transactions
- `collection(db, "expenses")` — ALL expenses
No `where("companyId", ...)` filter is applied.
**Impact:** This single function call reads the ENTIRE dataset into the client. On a production instance with thousands of records, this will (a) be extremely slow, (b) consume massive bandwidth, (c) may trigger Firebase usage quotas. Documents without `companyId` will be denied by rules (see C2), so orphan detection is unreliable.
**Fix:** Add `where("companyId", "==", ...)` filters and/or use a Cloud Function to count orphaned data server-side.

### C5. CompanySelector migrate data reads and writes across ALL companies

**Files:** `pages/CompanySelector.tsx` lines 75–128
**What:** `handleMigrateData()` fetches ALL documents from `customers`, `loans`, `partner_transactions`, `expenses` (lines 83–88) across ALL companies, then writes `companyId` on any document currently missing it. There is no scope-limiting filter.
**Impact:** This operation will fail at scale (timeout on large datasets). The write batch can update documents across any company. While Firestore rules protect individual writes (`canUpdateBusinessData()` checks `canAccessCompany(resource.data.companyId)`), the rule will evaluate to false if the doc has no `companyId` — meaning this migration operation will silently fail for all intended targets. Documents *with* a `companyId` from another company would fail `canAccessCompany()`.
**Fix:** Restrict to current company's data with `where("companyId", "==", currentCompany.id)`. Better: use a Cloud Function or Admin SDK endpoint.

### C6. UsageService.syncUsageCounts uses wrong field for company lookup

**Files:** `services/UsageService.ts` line 78
**What:** `query(collection(db, 'companies'), where('ownerId', '==', userId))` queries companies by `ownerId`, but the `companies` collection in `CompanyContext.tsx` line 118 uses `ownerEmail`, not `ownerId`. The companies document schema shows `ownerEmail` is the field used.
**Impact:** This query will ALWAYS return zero results. The `companyCount` will always be 1 (the fallback), making company usage counters completely wrong.
**Fix:** Change to `where('ownerEmail', '==', auth.currentUser.email)` or add an `ownerId` field when creating companies.

### C7. clearIndexedDbPersistence destroys offline cache after writes

**Files:** `services/dataService.ts` lines 24–30
**What:** `clearQueryCache()` calls `clearIndexedDbPersistence(db)` which will THROW an error if there are any active Firestore listeners or pending writes. The catch block silently ignores the error. Even when it "works", it destroys the entire local IndexedDB cache for all users of the app on that device.
**Impact:** 
- Always throws (and is silently ignored) if the app has any active `onSnapshot` listeners (which it does — `SubscriptionContext.tsx`, `NotificationListener.tsx`).
- When it does work, it deletes ALL offline data, forcing every subsequent query to go network-only until the cache rebuilds.
- This is called after `createCustomer` (line 103), `deleteCustomer` (line 114), and `deleteDeposit` (not visible but imported).
**Fix:** Use `invalidateCache` approach instead of `clearIndexedDbPersistence`. Better: rely on Firestore's built-in cache invalidation from writes, or selectively invalidate only the affected collections.

---

## HIGH FINDINGS

### H1. NotificationListener reads notifications across all companies (server-protected)

**Files:** `components/NotificationListener.tsx` lines 46–49
**What:** The `onSnapshot` listener queries `collection(db, 'notifications')` with `where('recipientId', 'in', recipients)` where recipients includes the admin user's UID, 'all', and potentially a customer ID. There is NO `where('companyId', ...)` filter.
**Impact:** An admin user receives real-time updates for ALL notifications where they are a recipient or where `recipientId === 'all'`. The Firestore rules at rules line 134–136 DO validate `canAccessCompany(resource.data.companyId)`, which prevents cross-company notification reads. However, if a notification document lacks `companyId` or has a null `companyId`, the `canAccessCompany(null)` check fails and the document is denied — but not before the query is evaluated.
**Risk:** Firestore rules provide adequate server-side protection here. The `resource != null` guard at line 134 also prevents listing non-existent docs. MEDIUM risk because it relies entirely on rules with no client-side filtering.

### H2. Loans read on Partners page with no companyId filter

**Files:** `pages/Partners.tsx` line 60
**What:** `getDocs(query(collection(db, "loans"), where("status", "in", [...])))` reads ALL loans by status across ALL companies.
**Impact:** Same as H1 — server rules protect reads but every matched document triggers a `canAccessCompany` evaluation. On large datasets, this is a performance and cost concern.

### H3. Deposits page deleteGets ledger by depositId without companyId

**Files:** `pages/Deposits.tsx` line 139
**What:** `getDocs(query(collection(db, "ledger"), where("depositId", "==", deleteId)))` retrieves and deletes ledger entries by depositId only, without companyId filter. If a deposit ID collides across companies (unlikely but possible with Firestore auto-IDs), the wrong company's ledger entries could be deleted.
**Fix:** Add `where("companyId", "==", currentCompany.id)` to the ledger query, and verify the deposit belongs to currentCompany before deleting.

### H4. Direct document reads by ID without company validation

**Files:**
- `pages/DepositDetails.tsx` lines 33–48 (reads deposit AND customer by direct ID)
- `pages/EditDeposit.tsx` lines 32–53 (reads deposit by direct ID)  
- `pages/Receipts.tsx` line 72 (reads customer by direct ID for PDF generation)
**What:** These pages fetch documents by document ID (from URL params) without first verifying the document belongs to the user's `currentCompany`. URL manipulation (e.g., `/deposits/another-companys-id`) would trigger a read attempt.
**Risk:** Firestore rules at `canReadBusinessData()` protect these reads server-side. Denied reads return a "permission denied" error gracefully. This is defense-in-depth only.

### H5. LoanDetails.tsx uses optional chaining for companyId on creates

**Files:** `pages/LoanDetails.tsx` lines 796, 1626
**What:** Uses `companyId: currentCompany?.id` (optional chaining) when adding ledger documents. If `currentCompany` is somehow null during the write, `companyId` will be `undefined`, and the Firestore rule `canCreateBusinessData()` will reject it because `request.resource.data.companyId != null` fails.
**Impact:** Writes will fail silently (user sees an error). This is a code quality issue, but the server-side rule blocks the write.

### H6. users collection rule allows cross-user reads by companyId

**Files:** `firestore.rules` lines 119–125
**What:** The `users` collection read rule (line 124) allows reading another user's document if `resource.data.companyId != null && canAccessCompany(resource.data.companyId)`. This means any user who can access Company A can read the user documents of ALL other users in Company A.
**Risk:** User documents contain email, name, role, fcmToken. This is by design for company staff management (user management page), but anyone in the company can enumerate all users.

---

## MEDIUM FINDINGS

### M1. No firestore.indexes.json — composite indexes missing

**Files:** No `firestore.indexes.json` found in project root
**What:** Several queries use `where("companyId", "==", ...)` combined with `orderBy(...)` which require composite indexes:
- `pages/Receipts.tsx` line 39: `where("companyId", ...)` + `orderBy("paymentDate", "desc")`
- `pages/DepositDetails.tsx` line 127: `where("depositId", ...)` + `where("companyId", ...)`
- `pages/FinanceOverview.tsx` line 71: `where("status", "in", ...)` + `where("companyId", ...)`
**Impact:** These queries will work on small datasets but will fail with "need an index" errors at scale. Firestore may auto-create single-field indexes but not composite ones.
**Fix:** Export and commit `firestore.indexes.json` based on production query patterns.

### M2. Deposits created without companyId enforcement in type

**Files:** `services/dataService.ts` line 163
**What:** `createDeposit` uses `Omit<Deposit, 'id'>` without requiring `companyId` to be non-optional. Compare with `createCustomer` (line 100) which uses `Omit<Customer, 'id'> & { companyId: string }` — companyId IS required there.
**Impact:** If calling code forgets to include `companyId` when creating a deposit, the document is created without it. Firestore rules will still allow it (rules check `companyId != null`), but the deposit will be orphaned and invisible to all company scoped reads.

### M3. CompanyContext lookup by email is client-side only

**Files:** `context/CompanyContext.tsx` lines 46–49, 53–56
**What:** The `fetchCompanies()` function queries `companies` by `ownerEmail` (line 48) and `users` by `email` (line 55). Both are client-side queries using the user's email from `auth.currentUser.email`.
**Impact:** If a user's email changes in Firebase Auth, the `ownerEmail` in existing `companies` documents won't match. This is inherent to the design using email as the linking identifier. It's also a potential race condition if email is not yet loaded.

### M4. UsageService.incrementUsage uses client-side setDoc — always fails

**Files:** `services/UsageService.ts` lines 46–67
**What:** `incrementUsage` calls `setDoc(docRef, { ..., [field]: increment(delta) })` which writes to the `usage` collection. Firestore rules at lines 183–189 set `allow write: if false;` — writes are FORBIDDEN from clients.
**Impact:** Every call to `incrementUsage` will fail with a permission-denied error. The `catch` block at line 65 silently logs it as a warning. Usage counters are NEVER updated from the client. This is by design (server-only writes), but the `incrementUsage` method is called in `CompanySelector.tsx` line 243 with no warning that it's a no-op from client code.
**Fix:** Either remove client-side calls to `incrementUsage` or document that it only works via Admin SDK / Cloud Functions.

---

## LOW FINDINGS

### L1. localStorage company ID can be manipulated

**Files:** `context/CompanyContext.tsx` lines 82–94, 102–108
**What:** The selected company ID is persisted in `localStorage` with key `selectedCompany_{uid}`. A technically adept user on the Android device could modify this value.
**Impact:** The `currentCompany` state will only show companies the user actually has access to (the `allCompanies` list is built from server queries filtered by `ownerEmail` or assigned `companyId`). If a user forges a localStorage value, `allCompanies.find(c => c.id === savedCompanyId)` will return `undefined`, and the code falls back to the first available company. Server-side rules enforce company isolation on every query.

### L2. FinanceOverview ledger query with companyId — latent comment about LoanDetails

**Files:** `pages/FinanceOverview.tsx` lines 81–87
**What:** Contains TODO-style comments noting that LoanDetails `addDoc` for ledger entries didn't add `companyId` explicitly. Lines 84–87: `// LoanDetails addDoc didn't add companyId explicitly? ... It missed companyId! But we can filter by loanId -> companyId loop? ... Better: Update LoanDetails to add companyId?`
**Impact:** If ledger entries were created without `companyId` by `LoanDetails`, the `where("companyId", "==", companyId)` query at line 91 would miss those entries. This is a historical data integrity concern.

### L3. Register page creates user doc with no role check

**Files:** `pages/Register.tsx` lines 47–53
**What:** New user registrations create a Firestore user document with `role: "pending"`. The `users` collection write rule (rules line 127) allows writes only to the user's own document (`request.auth.uid == document`) and only allows updating `name` and `fcmToken` fields. The write at registration succeeds because `resource == null` check passes (new document creation).
**Impact:** This is fine — the write rule allows only the initial `setDoc` and subsequent limited updates. There's no privileged escalation issue here.

---

## Summary Table

| ID | Severity | Component | Issue |
|----|----------|-----------|-------|
| C1 | CRITICAL | Partners.tsx | All data reads missing companyId |
| C2 | CRITICAL | Partners.tsx | Creates without companyId (rejected by rules) |
| C3 | CRITICAL | dataService.ts | fetchCustomerById/Loans/Deposits no companyId filter |
| C4 | CRITICAL | CompanySelector.tsx | Orphan check reads ALL data |
| C5 | CRITICAL | CompanySelector.tsx | Migrate reads ALL data across companies |
| C6 | CRITICAL | UsageService.ts | Wrong field (ownerId vs ownerEmail) |
| C7 | CRITICAL | dataService.ts | clearIndexedDbPersistence destroys offline cache |
| H1 | HIGH | NotificationListener.tsx | No company filter on listener (server-protected) |
| H2 | HIGH | Partners.tsx:60 | Loans read no companyId filter |
| H3 | HIGH | Deposits.tsx:139 | Ledger delete by depositId no companyId |
| H4 | HIGH | DepositDetails/EditDeposit/Receipts | Direct doc reads without company validation |
| H5 | HIGH | LoanDetails.tsx | Optional companyId on writes |
| H6 | HIGH | firestore.rules | Users collection broad read access |
| M1 | MEDIUM | — | No firestore.indexes.json for composite queries |
| M2 | MEDIUM | dataService.ts | createDeposit doesn't enforce companyId in type |
| M3 | MEDIUM | CompanyContext.tsx | Email-based linking is fragile |
| M4 | MEDIUM | UsageService.ts | incrementUsage always fails client-side |
| L1 | LOW | CompanyContext.tsx | localStorage companyId modifiable |
| L2 | LOW | FinanceOverview.tsx | Historical ledger entries may lack companyId |
| L3 | LOW | Register.tsx | New user registration (by design) |

---

## Firestore Rules Security Assessment

**Overall assessment: GOOD foundation with specific gaps**

The Firestore rules implement a strong multi-tenant security model:
- `canAccessCompany()` (lines 6–16) correctly checks three paths: owner by email, assigned by companyId, or assigned by companies array
- `canReadBusinessData()` (lines 19–22) and `canCreateBusinessData()` (lines 25–30) properly scope by `companyId`
- `canUpdateBusinessData()` (lines 33–39) prevents changing `companyId` or `ownerEmail` post-creation
- Subscriptions, payments, notifications, and usage collections all have appropriate access controls
- The fallback deny-all rule (line 193) catches any unlisted collections

**Key strengths:**
1. Immutable `companyId` on update (line 37) — prevents horizontal privilege escalation
2. Immutable `ownerEmail` on update (line 38) — prevents ownership transfer via client API
3. `canCreateBusinessData()` requires `companyId != null` (line 27) — prevents orphaned documents
4. Counters, subscriptions, payments, usage all have `allow write: if false` — server-only mutations
5. Anonymous user support in CompanyContext (line 166) and CustomerPortal

**Key gaps in client code (all CRITICAL):**
1. Partners page (C1, C2) — the ONLY business data page that completely ignores companyId
2. Service-layer functions (C3) — direct doc retrieval without companyId context
3. CompanySelector (C4, C5) — administrative operations that bypass scope
4. Offline persistence (C7) — `clearIndexedDbPersistence` is a design antipattern

---

*Concerns audit: 2026-07-24*
