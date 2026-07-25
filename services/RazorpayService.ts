import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';
import { PlanId, BillingCycle, SUBSCRIPTION_PLANS } from '../constants/subscriptionPlans';

export interface RazorpayPaymentResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  error?: string;
}

export class RazorpayService {
  private static scriptLoaded = false;

  /**
   * Dynamically loads Razorpay SDK script tag into head if not already loaded.
   */
  static loadScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.scriptLoaded || (window as any).Razorpay) {
        this.scriptLoaded = true;
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        this.scriptLoaded = true;
        resolve(true);
      };
      script.onerror = () => {
        console.error('Failed to load Razorpay SDK');
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }

  /**
   * Initiate Razorpay subscription payment:
   * 1. Calls Cloud Function `createRazorpayOrder`
   * 2. Opens Razorpay Checkout modal
   * 3. Sends payment output to `verifyRazorpayPayment` Cloud Function for verification
   */
  static async startPayment(
    planId: PlanId,
    billingCycle: BillingCycle,
    userEmail: string,
    userName: string
  ): Promise<RazorpayPaymentResult> {
    try {
      const loaded = await this.loadScript();
      if (!loaded) {
        return { success: false, error: 'Razorpay SDK failed to load. Please check network connection.' };
      }

      const plan = SUBSCRIPTION_PLANS[planId];
      if (!plan || plan.id === 'free') {
        return { success: false, error: 'Invalid plan selected for payment.' };
      }

      // Step 1: Request Order ID from Server-Side Cloud Function
      const createOrderFn = httpsCallable(functions, 'createRazorpayOrder');
      const orderRes = await createOrderFn({ planId, billingCycle });
      const orderData = orderRes.data as any;

      if (!orderData?.orderId) {
        return { success: false, error: orderData?.message || 'Failed to create order on server.' };
      }

      const { orderId, amount, currency, keyId } = orderData;

      // Step 2: Open Razorpay Modal
      return new Promise((resolve) => {
        const options = {
          key: keyId || 'rzp_test_jls_suite',
          amount: amount,
          currency: currency || 'INR',
          name: 'JLS Finance Suite',
          description: `Subscription: ${plan.name} (${billingCycle})`,
          order_id: orderId,
          prefill: {
            name: userName || 'Finance Manager',
            email: userEmail || '',
          },
          theme: {
            color: '#4f46e5',
          },
          handler: async (response: any) => {
            try {
              // Step 3: Backend Verification Call
              const verifyPaymentFn = httpsCallable(functions, 'verifyRazorpayPayment');
              const verifyRes = await verifyPaymentFn({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planId,
                billingCycle,
              });

              const resultData = verifyRes.data as any;
              if (resultData?.success) {
                resolve({
                  success: true,
                  paymentId: response.razorpay_payment_id,
                  orderId: response.razorpay_order_id,
                });
              } else {
                resolve({
                  success: false,
                  error: resultData?.message || 'Payment signature verification failed.',
                });
              }
            } catch (err: any) {
              console.error('Razorpay verification error:', err);
              resolve({ success: false, error: err?.message || 'Backend verification failed.' });
            }
          },
          modal: {
            ondismiss: () => {
              resolve({ success: false, error: 'Payment cancelled by user.' });
            },
          },
        };

        const razorpayInstance = new (window as any).Razorpay(options);
        razorpayInstance.open();
      });
    } catch (err: any) {
      console.error('RazorpayService.startPayment error:', err);
      return { success: false, error: err?.message || 'Razorpay payment initialization failed.' };
    }
  }
}
