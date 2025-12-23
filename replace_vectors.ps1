
$resDir = "d:\jlsandroid app new\jlsappandroid\android\app\src\main\res"
$img0 = "C:\Users\Admin\.gemini\antigravity\brain\e2bec380-2565-47c8-9306-a4334608ff05\uploaded_image_0_1766495594124.png"
$img1 = "C:\Users\Admin\.gemini\antigravity\brain\e2bec380-2565-47c8-9306-a4334608ff05\uploaded_image_1_1766495594124.png"

# 1. Remove Vector XMLs (The "Victor")
$vectors = @(
    "$resDir\drawable\ic_launcher_foreground.xml",
    "$resDir\drawable\ic_launcher_background.xml",
    "$resDir\drawable-v24\ic_launcher_foreground.xml",
    "$resDir\drawable-v24\ic_launcher_background.xml"
)

foreach ($v in $vectors) {
    if (Test-Path $v) {
        Remove-Item $v -Force
        Write-Host "Deleted Vector: $v"
    }
}

# 2. Copy PNGs as new Drawables
Copy-Item $img0 -Destination "$resDir\drawable\ic_launcher_foreground.png" -Force
Write-Host "Set Foreground Icon: $img0"

Copy-Item $img1 -Destination "$resDir\drawable\ic_launcher_background.png" -Force
Write-Host "Set Background Icon: $img1"

# 3. Clean Project (Optional trigger, handled by gradle usually)
Write-Host "Icons replaced. New icons are PNGs in 'drawable' folder."
