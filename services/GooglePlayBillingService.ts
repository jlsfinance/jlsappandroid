import { Capacitor } from '@capacitor/core';
import { SUBSCRIPTION_PLANS, PlanId, BillingCycle } from '../constants/subscriptionPlans';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

export interface PurchaseResult {
  success: boolean;
  purchaseToken?: string;
  orderId?: string;
  error?: string;
}

export class GooglePlayBillingService {
  static isAvailable(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  static async purchaseSubscription(planId: PlanId, billingCycle: BillingCycle): Promise<PurchaseResult> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Google Play Billing is only available on native Android devices.' };
    }

    try {
      const plan = SUBSCRIPTION_PLANS[planId];
      if (!plan || plan.id === 'free') {
        return { success: false, error: 'Invalid plan selected.' };
      }

      const productId = `jls_${planId}_${billingCycle}`;
      let purchaseToken = '';

      const nativeBilling = (window as any)?.Capacitor?.Plugins?.GooglePlayBilling;

      if (nativeBilling && typeof nativeBilling.purchase === 'function') {
        const nativeRes = await nativeBilling.purchase({ productId });
        if (nativeRes && (nativeRes.purchaseToken || nativeRes.token)) {
          purchaseToken = nativeRes.purchaseToken || nativeRes.token;
        } else {
          return { success: false, error: 'Google Play billing transaction failed or was cancelled.' };
        }
      } else {
        return {
          success: false,
          error: 'Google Play Billing plugin is not available. Make sure you have the latest APK installed.',
        };
      }

      const verifyGooglePlay = httpsCallable(functions, 'verifyGooglePlaySubscription');
      const response = await verifyGooglePlay({
        productId,
        purchaseToken,
        planId,
        billingCycle,
      });

      const resData = response.data as any;
      if (resData?.success) {
        return {
          success: true,
          purchaseToken,
          orderId: resData.orderId || `GPA.${Date.now()}`,
        };
      } else {
        return { success: false, error: resData?.message || 'Google Play server verification failed.' };
      }
    } catch (err: any) {
      console.error('GooglePlayBillingService error:', err);
      return { success: false, error: err?.message || 'Google Play purchase process failed.' };
    }
  }

  static async restorePurchases(): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable()) {
      return { success: false, message: 'Restore purchases is only supported on Android devices.' };
    }

    try {
      const nativeBilling = (window as any)?.Capacitor?.Plugins?.GooglePlayBilling;
      if (!nativeBilling || typeof nativeBilling.getPurchases !== 'function') {
        return { success: false, message: 'Native Play Store Billing plugin unavailable for restore.' };
      }

      const activePurchases = await nativeBilling.getPurchases();
      if (!activePurchases || !Array.isArray(activePurchases.purchases) || activePurchases.purchases.length === 0) {
        return { success: false, message: 'No active Google Play subscriptions found to restore.' };
      }

      let restoredCount = 0;
      const verifyGooglePlay = httpsCallable(functions, 'verifyGooglePlaySubscription');

      for (const p of activePurchases.purchases) {
        if (p.purchaseToken && p.productId) {
          const planId = p.productId.includes('starter') ? 'starter' : p.productId.includes('pro') ? 'pro' : 'enterprise';
          const billingCycle = p.productId.includes('yearly') ? 'yearly' : 'monthly';

          const res = await verifyGooglePlay({
            productId: p.productId,
            purchaseToken: p.purchaseToken,
            planId,
            billingCycle,
          });
          if ((res.data as any)?.success) {
            restoredCount++;
          }
        }
      }

      if (restoredCount > 0) {
        return { success: true, message: `Successfully restored ${restoredCount} active Google Play subscription(s)!` };
      } else {
        return { success: false, message: 'No unverified active subscriptions found to restore.' };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to restore Google Play purchases.' };
    }
  }
}
