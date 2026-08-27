/** Redimensionne une photo (navigateur) en petit data URI carré · léger pour la BDD. */
export function avatarToDataUri(file: File, side = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        // Recadrage centré carré.
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
        const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, sx, sy, min, min, 0, 0, side, side);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
