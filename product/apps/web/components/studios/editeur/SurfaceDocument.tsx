'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { calquesParZ, policeEditeur, POLICES_EDITEUR, type CalqueStudio, type DocumentStudio } from '@tiktrends/core';

/**
 * La surface visuelle · le document rendu en DOM aux bonnes proportions.
 *
 * Les positions et tailles sont des POURCENTAGES du document et la taille du
 * texte une fraction de la largeur du cadre (`cqw`) : l'aperçu garde les
 * proportions quelle que soit la largeur de l'écran. Le texte reste du texte
 * HTML (sélectionnable, lisible par un lecteur d'écran), jamais une image.
 * La transparence du document se voit en damier, ici seulement (cahier §5).
 *
 * Un média sans aperçu (route média non raccordée, média illisible) est un
 * cadre aux bonnes proportions qui porte le nom du calque · jamais une image
 * cassée.
 */

const FAMILLE_EDITEUR = 'TT Editeur Sans';
let policesChargees = false;

/** Charge les polices fournies (mêmes fichiers que le rendu) · sans effet là où FontFace manque. */
function chargerPolices() {
  if (policesChargees || typeof window === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return;
  policesChargees = true;
  for (const p of POLICES_EDITEUR) {
    try {
      const f = new FontFace(FAMILLE_EDITEUR, `url(${p.fichier})`, { weight: String(p.poids) });
      document.fonts.add(f);
      void f.load().catch(() => undefined);
    } catch { /* police indisponible · repli système */ }
  }
}

export function stylePolice(fontId: string): { fontFamily: string; fontWeight: number; fournie: boolean } {
  const p = policeEditeur(fontId);
  return p
    ? { fontFamily: `'${FAMILLE_EDITEUR}', 'Liberation Sans', Arial, sans-serif`, fontWeight: p.poids, fournie: true }
    : { fontFamily: 'Arial, sans-serif', fontWeight: 400, fournie: false };
}

const DAMIER = 'repeating-conic-gradient(#3a2a37 0% 25%, #2a1826 0% 50%) 50% / 24px 24px';
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

interface Glisse { id: string; x0: number; y0: number; px: number; py: number; dx: number; dy: number; echelle: number }

export function SurfaceDocument({
  doc, selection, apercus, editable, onSelect, onDeplacer, onClavier, hauteurMax = '70vh',
}: {
  doc: DocumentStudio;
  selection: string | null;
  apercus: Record<string, string>;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onDeplacer: (id: string, x: number, y: number) => void;
  onClavier?: (e: KeyboardEvent<HTMLDivElement>) => void;
  hauteurMax?: string;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  useEffect(() => { chargerPolices(); }, []);

  const pile = calquesParZ(doc);
  const choisi = selection ? doc.layers[selection] ?? null : null;

  const debut = (e: PointerEvent<HTMLDivElement>, c: CalqueStudio) => {
    e.stopPropagation();
    onSelect(c.id);
    if (!editable || c.locked || !cadre.current) return;
    const largeur = cadre.current.getBoundingClientRect().width || 1;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* capture indisponible */ }
    setGlisse({ id: c.id, x0: c.x, y0: c.y, px: e.clientX, py: e.clientY, dx: 0, dy: 0, echelle: doc.width / largeur });
  };
  const bouge = (e: PointerEvent<HTMLDivElement>) => {
    if (!glisse) return;
    setGlisse({ ...glisse, dx: (e.clientX - glisse.px) * glisse.echelle, dy: (e.clientY - glisse.py) * glisse.echelle });
  };
  const fin = () => {
    if (!glisse) return;
    const g = glisse;
    setGlisse(null);
    if (Math.abs(g.dx) >= 1 || Math.abs(g.dy) >= 1) onDeplacer(g.id, g.x0 + g.dx, g.y0 + g.dy);
  };

  const description = `Aperçu du document, ${doc.width} × ${doc.height} pixels, ${pile.length} calque${pile.length > 1 ? 's' : ''}`
    + (choisi ? ` · calque choisi : ${choisi.name}${editable && !choisi.locked ? ' · flèches pour le déplacer d’un pixel, Maj pour dix' : ''}` : '');

  return (
    <div style={{ width: `min(100%, calc(${hauteurMax} * ${doc.width / doc.height}))`, margin: '0 auto' }}>
      <div
        ref={cadre}
        data-surface="document"
        data-largeur={doc.width}
        data-hauteur={doc.height}
        role="group"
        aria-label={description}
        tabIndex={0}
        onKeyDown={onClavier}
        onPointerDown={() => onSelect(null)}
        onPointerMove={bouge}
        onPointerUp={fin}
        onPointerCancel={fin}
        style={{
          position: 'relative', width: '100%', aspectRatio: `${doc.width} / ${doc.height}`, overflow: 'hidden',
          background: DAMIER, containerType: 'inline-size', touchAction: glisse ? 'none' : 'auto', borderRadius: 4,
          outlineOffset: 3,
        } as CSSProperties}
      >
        {pile.map((c, rang) => {
          if (!c.visible) return null;
          const g = glisse?.id === c.id ? glisse : null;
          const x = g ? g.x0 + g.dx : c.x;
          const y = g ? g.y0 + g.dy : c.y;
          const choisiIci = c.id === selection;
          return (
            <div
              key={c.id}
              data-calque={c.id}
              data-type={c.kind}
              onPointerDown={(e) => debut(e, c)}
              style={{
                position: 'absolute', left: pct(x, doc.width), top: pct(y, doc.height),
                width: pct(c.width, doc.width), height: pct(c.height, doc.height),
                transform: c.rotationDeg ? `rotate(${c.rotationDeg}deg)` : undefined, transformOrigin: 'center',
                opacity: c.opacity, zIndex: rang + 1, boxSizing: 'border-box',
                outline: choisiIci ? '2px solid var(--accent-strong)' : undefined, outlineOffset: 0,
                cursor: editable && !c.locked ? (g ? 'grabbing' : 'grab') : 'default', userSelect: 'none',
              }}
            >
              <ContenuCalque c={c} doc={doc} apercu={c.kind === 'image' || c.kind === 'logo' ? apercus[c.assetId] ?? null : null} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContenuCalque({ c, doc, apercu }: { c: CalqueStudio; doc: DocumentStudio; apercu: string | null }) {
  if (c.kind === 'text') {
    const p = stylePolice(c.fontId);
    return (
      <div
        data-texte="editable"
        style={{
          width: '100%', height: '100%', color: c.color, textAlign: c.align, lineHeight: c.lineHeight,
          fontFamily: p.fontFamily, fontWeight: p.fontWeight, fontSize: `${(c.fontSizePx / doc.width) * 100}cqw`,
          whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'visible',
        }}
      >{c.text}</div>
    );
  }
  if (c.kind === 'shape') {
    return <div aria-hidden style={{ width: '100%', height: '100%', background: c.fill, borderRadius: c.shape === 'ellipse' ? '50%' : 0 }} />;
  }
  if (apercu) {
    return <img src={apercu} alt={c.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />;
  }
  return (
    <div
      data-apercu="absent"
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box', border: '2px dashed rgba(255,255,255,.45)',
        background: 'rgba(18,8,16,.55)', color: '#f6eef4', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '0.6cqw', padding: '1cqw', textAlign: 'center', overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: 'max(10px, 2.4cqw)', fontWeight: 700, overflowWrap: 'anywhere' }}>{c.name}</span>
      <span style={{ fontSize: 'max(9px, 1.8cqw)', opacity: 0.8 }}>{c.kind === 'logo' ? 'Logo' : 'Image'} · aperçu indisponible</span>
    </div>
  );
}
