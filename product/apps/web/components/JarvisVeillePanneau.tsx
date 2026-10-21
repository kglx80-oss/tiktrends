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
    <a href={href} aria-haspopup="dialog" style={style} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); onOpen?.(); setOuvert(true); if (!contexte) void charger();
    }}>{children}</a>
    {ouvert && <Portail><div onClick={() => setOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 240, background: 'var(--voile-media)', display: 'flex', justifyContent: 'flex-end', padding: 10, boxSizing: 'border-box' }}>
      <div ref={panneau} role="dialog" aria-modal="true" aria-label="Jarvis · créative en contexte" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: large ? 'min(980px, 100%)' : 'min(600px, 100%)', height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: 24, background: 'var(--surface)', color: 'var(--ink)', overflow: 'hidden', boxShadow: '0 16px 48px var(--line-2)' }}>
        <header style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' }}>
          <span aria-hidden style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', background: 'radial-gradient(circle at 32% 26%, var(--clair-fixe), transparent 23%), var(--grad-accent)' }} />
          <div style={{ flex: 1, minWidth: 0 }}><strong>Jarvis</strong><div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>{contexte?.ok ? `${titre} · ${contexte.brandName}` : titre}</div></div>
          <button type="button" aria-label={large ? 'Réduire Jarvis' : 'Agrandir Jarvis'} onClick={() => setLarge(!large)} style={commande}><Icon name="layers" size={18} /></button>
          <button type="button" aria-label="Fermer Jarvis" onClick={() => setOuvert(false)} style={commande}><Icon name="x" size={18} /></button>
        </header>
        <div style={{ margin: '16px 20px 0', padding: 16, borderRadius: 16, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden style={{ fontWeight: 600 }}>{(annonceur || 'A').slice(0,1)}</span><div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 14 }}>{annonceur || 'Annonce observée'}</strong><p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{extrait || 'Texte non fourni'}</p></div><span style={{ color: 'var(--accent)', fontSize: 12 }}>Contexte</span>
        </div>
        <div style={{ padding: '8px 20px 16px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {erreur ? <div role="alert"><p>Connexion interrompue. Réessaie de charger le contexte.</p><button type="button" onClick={() => void charger()}>Réessayer</button></div> : contexte?.ok ? <JarvisChat key={href} compact veille={Object.fromEntries(new URL(href, window.location.origin).searchParams)} fiche={contexte.fiche} brandId={contexte.brandId} brandName={contexte.brandName} kpiSource={null} projets={[]} brouillonInitial={contexte.brouillon} /> : <p role="status">{contexte ? contexte.message : 'Chargement de la source et de ta marque…'}</p>}
        </div>
      </div>
    </div></Portail>}
  </>;
}
const commande: CSSProperties = { width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 12, cursor: 'pointer', flexShrink: 0 };
