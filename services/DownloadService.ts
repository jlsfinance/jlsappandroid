import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

/**
 * PDF download service.
 *
 * Android behaviour (in order):
 *   1. Directory.External -> app-owned folder "JLS_Downloads/<file>".
 *      On Android 11+ scoped storage means this is the ONLY directory a
 *      plugin can both write and have another plugin/list read back from,
 *      so it is also what the Downloads screen lists from (Directory.External
 *      + path "JLS_Downloads"). No legacy-storage permission needed.
 *   2. Directory.Cache + Share sheet ("Open with..." / "Save to Files").
 *   3. Open inline via system viewer.
 *
 * Web behaviour: plain anchor download.
 */
export class DownloadService {
  static async downloadPDF(filename: string, base64Data: string): Promise<void> {
    const platform = Capacitor.getPlatform();

    // --- Web: simple anchor download ---
    if (platform === 'web') {
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${base64Data}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const errors: string[] = [];

    // --- Strategy 1: app-owned external folder (user-visible to this app) ---
    try {
      try {
        await Filesystem.mkdir({
          path: 'JLS_Downloads',
          directory: Directory.External,
          recursive: true,
        });
      } catch {
        // directory may already exist - fine
      }

      const result = await Filesystem.writeFile({
        path: `JLS_Downloads/${filename}`,
        data: base64Data,
        directory: Directory.External,
        recursive: true,
      });
      console.log('PDF saved to External/JLS_Downloads:', result.uri);
      DownloadService.notifyDownloadComplete();
      return; // user-visible location - done
    } catch (e1: any) {
      errors.push('External: ' + (e1?.message || e1));
    }

    // --- Strategy 2: cache + Share sheet (open-with / save-to-files) ---
    try {
      const cacheResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });
      await new Promise((r) => setTimeout(r, 200));

      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: filename,
        url: cacheResult.uri,
        dialogTitle: 'Open PDF with...',
      });
      DownloadService.notifyDownloadComplete();
      return;
    } catch (e2: any) {
      errors.push('Share: ' + (e2?.message || e2));
    }

    // --- Strategy 3: open inline in system PDF viewer ---
    try {
      const cacheResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });
      window.open(cacheResult.uri, '_system');
      DownloadService.notifyDownloadComplete();
      return;
    } catch (e3: any) {
      errors.push('Open: ' + (e3?.message || e3));
    }

    throw new Error('All save strategies failed - ' + errors.join(' | '));
  }

  private static notifyDownloadComplete(): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('jls-downloads-refresh'));
    }
  }
}
