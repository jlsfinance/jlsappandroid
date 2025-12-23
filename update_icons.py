
import os
import shutil
from PIL import Image

# Configuration
source_image_path = r"C:/Users/Admin/.gemini/antigravity/brain/e2bec380-2565-47c8-9306-a4334608ff05/uploaded_image_1766492141161.png"
res_dir = r"d:/jlsandroid app new/jlsappandroid/android/app/src/main/res"

densities = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
}

def process_icons():
    if not os.path.exists(source_image_path):
        print(f"Error: Source image not found at {source_image_path}")
        return

    try:
        img = Image.open(source_image_path)
    except Exception as e:
        print(f"Error opening image: {e}")
        return

    for folder, size in densities.items():
        folder_path = os.path.join(res_dir, folder)
        if not os.path.exists(folder_path):
            os.makedirs(folder_path)
            print(f"Created directory: {folder_path}")

        # Delete existing webp/png/xml for ic_launcher and ic_launcher_round
        for name in ["ic_launcher", "ic_launcher_round"]:
            for ext in [".webp", ".png", ".xml"]:
                file_path = os.path.join(folder_path, name + ext)
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Removed: {file_path}")

        # Resize and Save new PNGs
        try:
            # High quality resize
            resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
            
            # Save ic_launcher.png
            launcher_path = os.path.join(folder_path, "ic_launcher.png")
            resized_img.save(launcher_path, "PNG")
            print(f"Saved: {launcher_path}")

            # Save ic_launcher_round.png (using same image)
            round_path = os.path.join(folder_path, "ic_launcher_round.png")
            resized_img.save(round_path, "PNG")
            print(f"Saved: {round_path}")
            
        except Exception as e:
            print(f"Error processing {folder}: {e}")

if __name__ == "__main__":
    process_icons()
