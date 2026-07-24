# Capacitor / Cordova
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * implements com.getcapacitor.Plugin { *; }

# WebView JS interface
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Keep model/data classes used by Firestore serialization
-keepattributes Signature
-keepattributes *Annotation*
-keep class * extends com.google.firebase.firestore.** { *; }

# Gson / JSON model classes (Firestore .data() maps)
-keep class com.jls.**.models.** { *; }
-keep class * { @com.google.firebase.firestore.* <fields>; }

# Don't strip line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# OkHttp / network
-dontwarn okhttp3.**
-dontwarn okio.**
