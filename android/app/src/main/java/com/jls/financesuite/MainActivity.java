package com.jls.financesuite;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. Full Screen / Cutoff Fix
        // Isse content status bar ke niche se start hoga, jisse cutoff nahi hoga
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        
        // 2. Scroll Fix for Due List & Details
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_ALWAYS);
            bridge.getWebView().setVerticalScrollBarEnabled(true);
        }
    }
}
