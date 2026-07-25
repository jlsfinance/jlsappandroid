package com.jls.loanbook.plugins;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.AcknowledgePurchaseResponseListener;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private boolean connected = false;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        initBillingClient();
    }

    private void initBillingClient() {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases()
                .build();
        connectToPlayStore();
    }

    private void connectToPlayStore() {
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    connected = true;
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                connected = false;
            }
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId is required");
            return;
        }

        if (!connected) {
            call.reject("BillingClient is not connected to Google Play");
            return;
        }

        pendingPurchaseCall = call;

        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        productList.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
                call.reject("Failed to query product details: " + billingResult.getDebugMessage());
                pendingPurchaseCall = null;
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);
            List<BillingFlowParams.ProductDetailsParams> offerList = new ArrayList<>();

            if (productDetails.getSubscriptionOfferDetails() != null && !productDetails.getSubscriptionOfferDetails().isEmpty()) {
                String offerToken = productDetails.getSubscriptionOfferDetails().get(0).getOfferToken();
                offerList.add(BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(productDetails)
                        .setOfferToken(offerToken)
                        .build());
            } else {
                offerList.add(BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(productDetails)
                        .build());
            }

            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(offerList)
                    .build();

            Activity activity = getActivity();
            if (activity != null) {
                billingClient.launchBillingFlow(activity, flowParams);
            } else {
                call.reject("No activity context available");
                pendingPurchaseCall = null;
            }
        });
    }

    @PluginMethod
    public void getPurchases(PluginCall call) {
        if (!connected) {
            call.reject("BillingClient is not connected");
            return;
        }

        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (billingResult, purchasesList) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("Failed to query purchases: " + billingResult.getDebugMessage());
                        return;
                    }

                    List<JSObject> purchases = new ArrayList<>();
                    for (Purchase purchase : purchasesList) {
                        JSObject item = new JSObject();
                        item.put("purchaseToken", purchase.getPurchaseToken());
                        item.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
                        item.put("orderId", purchase.getOrderId());
                        item.put("purchaseState", purchase.getPurchaseState());
                        item.put("isAcknowledged", purchase.isAcknowledged());
                        purchases.add(item);
                    }

                    JSObject result = new JSObject();
                    result.put("purchases", purchases.toArray());
                    call.resolve(result);
                });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        if (pendingPurchaseCall == null) return;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    if (!purchase.isAcknowledged()) {
                        AcknowledgePurchaseParams ackParams = AcknowledgePurchaseParams.newBuilder()
                                .setPurchaseToken(purchase.getPurchaseToken())
                                .build();
                        billingClient.acknowledgePurchase(ackParams, ackResult -> {});
                    }

                    JSObject result = new JSObject();
                    result.put("purchaseToken", purchase.getPurchaseToken());
                    result.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
                    result.put("orderId", purchase.getOrderId());
                    pendingPurchaseCall.resolve(result);
                    pendingPurchaseCall = null;
                    return;
                }
            }
            pendingPurchaseCall.reject("Purchase was not completed");
            pendingPurchaseCall = null;
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            pendingPurchaseCall.reject("User cancelled the purchase");
            pendingPurchaseCall = null;
        } else {
            pendingPurchaseCall.reject("Purchase failed: " + billingResult.getDebugMessage());
            pendingPurchaseCall = null;
        }
    }
}
