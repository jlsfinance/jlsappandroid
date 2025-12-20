import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';

export class DownloadService {
  static async downloadPDF(filename: string, base64Data: string): Promise<void> {
    try {
      const platform = Capacitor.getPlatform();

      if (platform === 'web') {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${base64Data}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Native Logic
      try {
        // Strategy A: App Specific External Storage
        // Path: /Android/data/com.jls.financesuite/files/JLS_Downloads/<filename>
        try {
          await Filesystem.mkdir({
            path: 'JLS_Downloads',
            directory: Directory.External,
            recursive: true
          });

          const result = await Filesystem.writeFile({
            path: `JLS_Downloads/${filename}`,
            data: base64Data,
            directory: Directory.External,
          });

          console.log('File saved to External:', result.uri);

          // Notification
          try {
            await LocalNotifications.schedule({
              notifications: [{
                title: 'Download Complete',
                body: `${filename} saved to JLS Downloads.`,
                id: new Date().getTime(),
                schedule: { at: new Date(Date.now() + 100) },
                sound: undefined,
                attachments: undefined,
                actionTypeId: "",
                extra: null
              }]
            });
          } catch (nErr) { console.warn('Notification failed:', nErr); }

          alert(`✅ Saved Successfully!\n\nView it in the "Downloads" tab in this app.`);

        } catch (externalError: any) {
          console.error('App Storage failed:', externalError);
          // Alert the specific error to understand why it failed
          alert(`⚠️ Direct Save Failed: ${externalError.message || externalError}\n\nOpening Share options...`);

          // Strategy B: Share Sheet (Final Fallback)
          const cacheResult = await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Cache
          });

          await Share.share({
            title: 'Save PDF',
            text: `Here is your document: ${filename}`,
            url: cacheResult.uri,
            dialogTitle: 'Save PDF'
          });
        }

      } catch (error: any) {
        console.error('Error downloading PDF:', error);
        alert('❌ Download Failed: ' + (error.message || error));
      }
    } catch (appError) {
      console.error('Unexpected error in download service:', appError);
    }
  }
}
