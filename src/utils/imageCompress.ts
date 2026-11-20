export async function compressReceiptImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح (PNG / JPG / WEBP)');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة المختارة'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تعذر معالجة الصورة المختارة'));
    image.src = dataUrl;
  });

  const renderAttempt = (maxDim: number, quality: number): string => {
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  };

  let output = renderAttempt(720, 0.65);
  if (output.length > 220000) {
    output = renderAttempt(560, 0.48);
  }
  if (output.length > 220000) {
    output = renderAttempt(440, 0.36);
  }
  if (output.length > 240000) {
    throw new Error('حجم الصورة كبير جداً بعد الضغط، يرجى اختيار صورة أو لقطة شاشة أصغر');
  }

  return output;
}
