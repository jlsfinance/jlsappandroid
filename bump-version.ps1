# Auto-increment versionCode + versionName + rebuild APK and AAB.
# Usage: powershell -ExecutionPolicy Bypass -File bump-version.ps1

$gradle = "C:\Users\Admin\jlsappandroid\android\app\build.gradle"
$content = Get-Content $gradle -Raw
$newName = ""

# 1. Bump versionCode
if ($content -match 'versionCode (\d+)') {
    $oldCode = [int]$Matches[1]
    $newCode = $oldCode + 1
    $content = $content -replace "versionCode $oldCode", "versionCode $newCode"
    Write-Output "versionCode $oldCode -> $newCode"
} else { 
    Write-Error "versionCode not found"; exit 1 
}

# 2. Bump versionName
if ($content -match 'versionName "([^"]+)"') {
    $oldName = $Matches[1]
    $parts = $oldName.Split('.')
    if ($parts.Length -eq 3) {
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2]
        
        # Increment patch version (e.g. 1.0.9 -> 1.0.10)
        $patch = $patch + 1
        $newName = "$major.$minor.$patch"
        
        $content = $content -replace "versionName `"$oldName`"", "versionName `"$newName`""
        Write-Output "versionName $oldName -> $newName"
    } else {
        $newName = $oldName
        Write-Output "versionName is not in standard semantic version format: $oldName"
    }
} else {
    Write-Error "versionName not found"; exit 1
}

# Save build.gradle changes
Set-Content -Path $gradle -Value $content -NoNewline

# 3. Update package.json version
$packageJson = "C:\Users\Admin\jlsappandroid\package.json"
if (Test-Path $packageJson) {
    $pkgContent = Get-Content $packageJson -Raw
    # Simple regex replace to avoid changing format/keys ordering of package.json
    if ($pkgContent -match '"version":\s*"([^"]+)"') {
        $oldPkgVer = $Matches[1]
        $pkgContent = $pkgContent -replace "`"version`":\s*`"$oldPkgVer`"", "`"version`": `"$newName`""
        Set-Content -Path $packageJson -Value $pkgContent -NoNewline
        Write-Output "package.json version $oldPkgVer -> $newName"
    }
}

# 4. Sync web assets with Capacitor
Write-Output "Building web assets and syncing with Capacitor..."
Set-Location -Path "C:\Users\Admin\jlsappandroid"
npm run cap:build

# 5. Set Environment & Build
$env:ANDROID_HOME = "C:\Users\Admin\AppData\Local\Android\Sdk"
Set-Location -Path "C:\Users\Admin\jlsappandroid\android"

Write-Output "Starting Gradle build for Release APK and AAB..."
.\gradlew.bat clean assembleRelease bundleRelease

Write-Output "`nBuild complete! Output files:"
$apk = "C:\Users\Admin\jlsappandroid\android\app\build\outputs\apk\release\app-release.apk"
$aab = "C:\Users\Admin\jlsappandroid\android\app\build\outputs\bundle\release\app-release.aab"

if (Test-Path $apk) {
    Get-Item $apk | Select-Object Name, Length, LastWriteTime
    Copy-Item $apk -Destination "C:\Users\Admin\jlsappandroid\app-release-v$newName.apk" -Force
    Write-Output "Copied APK to root: app-release-v$newName.apk"
}
if (Test-Path $aab) {
    Get-Item $aab | Select-Object Name, Length, LastWriteTime
    Copy-Item $aab -Destination "C:\Users\Admin\jlsappandroid\app-release-v$newName.aab" -Force
    Write-Output "Copied AAB to root: app-release-v$newName.aab"
}