// Reads a user-selected image file and downscales it to a compact data URL so
// it can be stored with the deck profile. Aspect ratio is preserved; the frame
// decides whether to crop with object-fit.
export async function imageFileToDataUrl(file, { maxSize = 900, quality = 0.82 } = {}) {
  if (!file) throw new Error('Choose an image file');
  if (!/^image\//.test(file.type)) throw new Error('That file is not an image');
  if (file.size > 12 * 1024 * 1024) throw new Error('Pick an image smaller than 12 MB');

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // A dark backdrop keeps transparent PNGs looking intentional.
  ctx.fillStyle = '#0a0f24';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();

  let url = canvas.toDataURL('image/jpeg', quality);
  if (url.length > 2_400_000) url = canvas.toDataURL('image/jpeg', 0.6);
  return url;
}

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
