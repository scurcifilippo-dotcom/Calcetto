/** Keep profile photos small enough for serverless requests and the free database tier. */
export function compactPhoto(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('Foto non leggibile.')); }, 10000);
    image.onerror = () => { clearTimeout(timer); reject(new Error('Foto non leggibile.')); };
    image.onload = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Impossibile preparare la foto.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/webp', .82);
        if (result.length > 512 * 1024) throw new Error('La foto è troppo grande.');
        resolve(result);
      } catch (error) { reject(error); }
    };
    image.src = source;
  });
}
