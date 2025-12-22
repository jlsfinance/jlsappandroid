Remove-Item -Path "android/capacitor-cordova-android-plugins" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Deleted plugins folder"

npx cap sync android
Write-Host "Ran cap sync"

if (Test-Path "android/capacitor-cordova-android-plugins/cordova.variables.gradle") {
    Write-Host "cordova.variables.gradle exists!"
    Get-Content "android/capacitor-cordova-android-plugins/cordova.variables.gradle"
} else {
    Write-Host "ERROR: cordova.variables.gradle MISSING!"
}
