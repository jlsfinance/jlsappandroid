package com.jls.suite;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Status bar ko transparent banao
        getWindow().setStatusBarColor(getResources().getColor(android.R.color.transparent));
        
        // Content ko status bar ke peeche extend karo
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE | 
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );
        
        // 1. Full Screen / Cutoff Fix
        // Isse content status bar ke niche se start hoga, jisse cutoff nahi hoga
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        // 2. Scroll Fix for Due List & Details
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_ALWAYS);
            bridge.getWebView().setVerticalScrollBarEnabled(true);
        }
    }
}
