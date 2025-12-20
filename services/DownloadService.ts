import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@capacitor/core';

export class DownloadService {
  static async ensureDownloadsFolder(): Promise<string> {
    try {
      const platform = Platform.getPlatform();
      
      if (platform === 'web') {
        // For web, we don't need a folder
        return '';
      }

      // For Android/native platforms
      const documentsPath = `${Directory.Documents}`;
      
      try {
        await Filesystem.mkdir({
          path: `${documentsPath}/JLS_Downloads`,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch (e) {
        // Folder might already exist
      }

      return `${documentsPath}/JLS_Downloads`;
    } catch (error) {
      console.error('Error ensuring downloads folder:', error);
      return '';
    }
  }

  static async downloadPDF(filename: string, base64Data: string): Promise<void> {
    try {
      const platform = Platform.getPlatform();

      if (platform === 'web') {
        // For web, use traditional download
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${base64Data}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For native platforms (Android)
      await this.ensureDownloadsFolder();
      
      const path = `JLS_Downloads/${filename}`;
      
      const result = await Filesystem.writeFile({
        path: path,
        data: base64Data,
        directory: Directory.Documents,
      });

      console.log('File saved to:', result.uri);
      
      // Show a notification or toast
      alert(`File downloaded: ${filename}`);

    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download file. Please try again.');
    }
  }

}
