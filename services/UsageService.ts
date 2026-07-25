import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';
import { UserUsage } from '../types';

export class UsageService {
  /**
   * Fetch current usage metrics for a given user from `usage/{userId}`.
   */
  static async getUsage(userId: string): Promise<UserUsage> {
    try {
      const docRef = doc(db, 'usage', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as UserUsage;
      }

      // Default initial usage
      return {
        userId,
        customers: 0,
        companies: 1,
        loans: 0,
        deposits: 0,
        staff: 0,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error('UsageService.getUsage error:', err);
      return {
        userId,
        customers: 0,
        companies: 1,
        loans: 0,
        deposits: 0,
        staff: 0,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Atomically increment or decrement a usage counter (e.g. customers, companies, loans, deposits).
   */
  static async incrementUsage(
    userId: string,
    field: 'customers' | 'companies' | 'loans' | 'deposits' | 'staff',
    delta: number = 1
  ): Promise<void> {
    if (!userId) return;
    try {
      const updateUsage = httpsCallable(functions, 'updateUsage');
      await updateUsage({ action: 'increment', field, delta });
    } catch (err) {
      console.warn('UsageService.incrementUsage skipped:', err);
    }
  }

  /**
   * Recount actual Firestore documents for a company/user and sync `usage/{userId}`.
   */
  static async syncUsageCounts(userId: string, companyId?: string): Promise<UserUsage> {
    if (!userId) {
      return { userId, customers: 0, companies: 1, loans: 0, deposits: 0, staff: 0, updatedAt: new Date().toISOString() };
    }
    try {
      const updateUsage = httpsCallable(functions, 'updateUsage');
      const result = await updateUsage({ action: 'sync', companyId });
      const docRef = doc(db, 'usage', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as UserUsage;
      }
      return { userId, customers: 0, companies: 1, loans: 0, deposits: 0, staff: 0, updatedAt: new Date().toISOString() };
    } catch (err) {
      console.error('UsageService.syncUsageCounts error:', err);
      return { userId, customers: 0, companies: 1, loans: 0, deposits: 0, staff: 0, updatedAt: new Date().toISOString() };
    }
  }
}
