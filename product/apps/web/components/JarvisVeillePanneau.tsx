'use client';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { chargerPanneauVeille } from '../app/actions/jarvis-veille-panneau';
import { JarvisChat } from '../app/(app)/jarvis/JarvisChat';
import { Portail } from './Portail';
import { usePiegeFocus } from './use-piege-focus';
import { Icon } from './Icon';

type Contexte = Awaited<ReturnType<typeof chargerPanneauVeille>>;
export function JarvisVeillePanneau({ href, children, style, titre = 'Adapter cette créative', annonceur, extrait, onOpen }: {
  href: string; children: ReactNode; style?: CSSProperties; titre?: string; annonceur?: string | null; extrait?: string | null; onOpen?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [large, setLarge] = useState(false);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [erreur, setErreur] = useState(false);
  const panneau = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  usePiegeFocus(panneau, { actif: ouvert, onFermer: () => setOuvert(false) });
  async function charger() {
    const seq = ++sequence.current;
    setErreur(false);
    try {
      const params = Object.fromEntries(new URL(href, window.location.origin).searchParams);
      const resultat = await chargerPanneauVeille(params);
      if (seq === sequence.current) setContexte(resultat);
    } catch { if (seq === sequence.current) setErreur(true); }
  }
  return <>
    <a href={href} className="veille-jarvis-trigger" aria-haspopup="dialog" style={style} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); onOpen?.(); setOuvert(true); if (!contexte) void charger();
    }}>{children}</a>
    {ouvert && <Portail><div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 240, background: 'var(--voile)', display: 'flex', justifyContent: 'flex-end', padding: 12, boxSizing: 'border-box' }}>
      <div ref={panneau} role="dialog" aria-modal="true" aria-label="Jarvis · créative en contexte" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: large ? 'min(980px, 100%)' : 'min(460px, 100%)', height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: 22, background: 'var(--surface)', color: 'var(--ink)', overflow: 'hidden', boxShadow: '0 24px 64px color-mix(in srgb, var(--ombre) 28%, transparent)' }}>
        <header style={{ padding: '14px 14px 12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', background: 'radial-gradient(100% 140% at 0 0, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%)' }}>
          <span aria-hidden style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', background: 'radial-gradient(circle at 32% 26%, var(--clair-fixe), transparent 23%), var(--grad-accent)' }} />
          <div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 15, fontWeight: 600 }}>Jarvis</strong><div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>{contexte?.ok ? `${titre} · ${contexte.brandName}` : titre}</div></div>
          <button type="button" aria-label={large ? 'Réduire Jarvis' : 'Agrandir Jarvis'} onClick={() => setLarge(!large)} style={commande}><Icon name="layers" size={18} /></button>
          <button type="button" aria-label="Fermer Jarvis" onClick={() => setOuvert(false)} style={commande}><Icon name="x" size={18} /></button>
        </header>
        <div style={{ margin: '12px 14px 0', padding: 8, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--rail)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden style={{ fontWeight: 600, width: 40, height: 50, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--hover)' }}>{(annonceur || 'A').slice(0,1)}</span><div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 13, fontWeight: 600 }}>{annonceur || 'Annonce observée'}</strong><p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{extrait || 'Texte non fourni'}</p></div><span style={{ color: 'var(--accent-strong)', fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--selected)' }}>Contexte</span>
        </div>
        <div style={{ padding: '8px 14px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {erreur ? <div role="alert"><p>Connexion interrompue. Réessaie de charger le contexte.</p><button type="button" onClick={() => void charger()}>Réessayer</button></div> : contexte?.ok ? <JarvisChat key={href} compact veille={Object.fromEntries(new URL(href, window.location.origin).searchParams)} fiche={contexte.fiche} brandId={contexte.brandId} brandName={contexte.brandName} kpiSource={null} projets={[]} brouillonInitial={contexte.brouillon} /> : <p role="status">{contexte ? contexte.message : 'Chargement de la source et de ta marque…'}</p>}
        </div>
      </div>
    </div></Portail>}
  </>;
}
const commande: CSSProperties = { width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 12, cursor: 'pointer', flexShrink: 0 };
