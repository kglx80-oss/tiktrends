'use client';

import { useState, type ReactNode, type CSSProperties } from 'react';

/** Compresse une image navigateur en data URI léger (jpeg), directement exploitable par l'IA. */
export function imageFileToDataUri(file: File, maxSide = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const OK = /^image\/(png|jpe?g|webp|gif|avif)$/;

/**
 * Zone de glisser-déposer universelle.
 * On peut déposer une (ou plusieurs) image(s) : elles arrivent directement dans le champ.
 * Accepte aussi les liens d'image glissés depuis une autre page/onglet (text/uri-list).
 */
export function DropZone({ onImages, onError, disabled, multiple = false, maxSide, children, style, hint = 'Déposer ici' }: {
  onImages: (uris: string[]) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
  multiple?: boolean;
  maxSide?: number;
  children: ReactNode;
  style?: CSSProperties;
  hint?: string;
}) {
  const [over, setOver] = useState(false);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).some((t) => t === 'Files' || t === 'text/uri-list');

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    setOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files || []).filter((f) => OK.test(f.type));
    if (files.length) {
      try {
        const picked = multiple ? files : files.slice(0, 1);
        const uris = await Promise.all(picked.map((f) => imageFileToDataUri(f, maxSide)));
        onImages(uris);
      } catch (err) { onError?.((err as Error).message); }
      return;
    }
    // Lien d'image glissé (depuis un autre onglet) : on récupère l'URL directe.
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri && /^https?:\/\//i.test(uri.trim())) { onImages([uri.trim()]); return; }
    if (e.dataTransfer.files.length) onError?.('Formats acceptés : jpg, png, webp.');
  }

  return (
    <div
      onDragOver={(e) => { if (!disabled && hasFiles(e)) { e.preventDefault(); if (!over) setOver(true); } }}
      onDragEnter={(e) => { if (!disabled && hasFiles(e)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={handleDrop}
      style={{ position: 'relative', borderRadius: 14, transition: 'box-shadow .12s, background .12s', ...style, ...(over ? { boxShadow: '0 0 0 2px var(--accent-strong)', background: 'rgba(255,60,120,.05)' } : null) }}
    >
      {children}
      {over && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,7,12,.55)', backdropFilter: 'blur(1px)', pointerEvents: 'none', zIndex: 5 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#fff', padding: '8px 14px', borderRadius: 999, background: 'var(--grad-accent)' }}>
            <span aria-hidden>⬇</span> {hint}
          </span>
        </div>
      )}
    </div>
  );
}
