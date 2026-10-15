import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/**
 * PDF download service.
 *
 * Android behaviour (in order):
 *  1. Directory.Documents → user-visible "Documents/JLS_Downloads/<file>"
 *  2. Directory.Downloads → public Downloads folder
 *  3. Cache + Share sheet ("Open with…")
 *  4. Open inline via system viewer
 *
 * Web behaviour: plain anchor download.
 */
export class DownloadService {
  static async downloadPDF(filename: string, base64Data: string): Promise<void> {
    const platform = Capacitor.getPlatform();

    // ── Web: simple anchor download ──
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

    // ── Strategy 1: user-visible Documents folder ──
    try {
      try {
        await Filesystem.mkdir({
          path: 'JLS_Downloads',
          directory: Directory.Documents,
          recursive: true,
        });
      } catch { /* directory may already exist — fine */ }

      const result = await Filesystem.writeFile({
        path: `JLS_Downloads/${filename}`,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
      console.log('PDF saved to Documents/JLS_Downloads:', result.uri);
      return; // user-visible location — done
    } catch (e1: any) {
      errors.push('Documents: ' + (e1?.message || e1));
    }

    // ── Strategy 2: app external storage (ExternalStorage = public folder) ──
    try {
      try {
        await Filesystem.mkdir({
          path: 'JLS_Downloads',
          directory: Directory.ExternalStorage,
          recursive: true,
        });
      } catch { /* may already exist */ }

      const result = await Filesystem.writeFile({
        path: `JLS_Downloads/${filename}`,
        data: base64Data,
        directory: Directory.ExternalStorage,
        recursive: true,
      });
      console.log('PDF saved to ExternalStorage/JLS_Downloads:', result.uri);
      return;
    } catch (e2: any) {
      errors.push('ExternalStorage: ' + (e2?.message || e2));
    }

    // ── Strategy 3: cache + Share sheet (acts as "Open with / Save to Files") ──
    try {
      const cacheResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });
      await new Promise(r => setTimeout(r, 200));

      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: filename,
        url: cacheResult.uri,
        dialogTitle: 'Open PDF with...',
      });
      return;
    } catch (e3: any) {
      errors.push('Share: ' + (e3?.message || e3));
    }

    // ── Strategy 4: open inline in system PDF viewer ──
    try {
      const cacheResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });
      window.open(cacheResult.uri, '_system');
      return;
    } catch (e4: any) {
      errors.push('Open: ' + (e4?.message || e4));
    }

    throw new Error('All save strategies failed — ' + errors.join(' | '));
  }
}
