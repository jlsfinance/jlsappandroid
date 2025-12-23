
$resDir = "d:\jlsandroid app new\jlsappandroid\android\app\src\main\res"

# Get all launcher foreground files recursively
$allFiles = Get-ChildItem -Path $resDir -Recurse -Include "ic_launcher_foreground.*"

foreach ($file in $allFiles) {
    # If the file is NOT a PNG, delete it.
    if ($file.Extension -ne ".png") {
        Remove-Item $file.FullName -Force
        Write-Host "Deleted Duplicate/Conflict: $($file.FullName)"
    }
}
Write-Host "Cleanup Complete. Only PNGs should remain."
