package com.jls.loanbook;

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        try {
            // Enable edge-to-edge display using AndroidX WindowCompat (Google recommended implementation)
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // Enable overscroll & scrollbar on webview if available
        if (bridge != null && bridge.getWebView() != null) {
            View webView = bridge.getWebView();
            webView.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
            webView.setVerticalScrollBarEnabled(true);
        }

        // Apply WindowInsets directly to root content layout (android.R.id.content)
        // This guarantees the physical container for the WebView is placed below the status bar natively
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                v.setPadding(0, systemBars.top, 0, systemBars.bottom);
                return windowInsets;
            });
        }
    }
}

