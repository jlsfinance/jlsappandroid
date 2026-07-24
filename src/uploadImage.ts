import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './config';

// Uploads an image File to Cloudinary (unsigned preset) and returns the secure URL.
export const uploadImage = async (file: File): Promise<string> => {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary not configured');
  }
  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Cloudinary ${res.status}: ${data.error?.message || 'upload failed'}`);
  }
  return data.secure_url as string;
};
