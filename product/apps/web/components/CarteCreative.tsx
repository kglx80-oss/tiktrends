'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CIBLE_TACTILE_MIN, type QualiteCarte, type EtatVerdictCarte } from '@tiktrends/core';
import { AdMedia } from './AdMedia';
import { VerdictBadge } from './VerdictBadge';
import { Icon } from './Icon';

/**
 * La carte créative COMMUNE · une anatomie, des zones adaptées au contexte.
 *
 * ── Ce qu'elle règle ─────────────────────────────────────────────────────────
 *
 * Chaque galerie recomposait sa propre carte · actions comprimées au bord droit,
 * boutons accolés, alertes qui débordaient, et trois natures d'information —
 * pertinence, qualité, performance — mêlées au point qu'un pouce levé se lisait
 * comme une preuve de résultat. Cette carte pose l'anatomie une fois :
 *
 * 1. Aperçu INTÉGRAL · une création interne n'est jamais rognée (`fit="contain"`).
 * 2. Une action principale STABLE et nommée · les secondaires dans « … ».
 * 3. Pertinence / Qualité / Performance dans des zones DISTINCTES et étiquetées ·
 *    la règle de synthèse qualité vit au noyau (`qualiteCarte`), pas ici.
 * 4. Aucun débordement · titre long tronqué, alertes qui reviennent à la ligne,
 *    actions qui tiennent en petite largeur.
 * 5. Menu et actions au clavier · focus visible, noms accessibles.
 */

export interface ActionCarte {
  cle: string;
  label: string;
  icon?: string;
  onClick?: () => void;
  href?: string;
  download?: string | boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Infobulle · et, pour un bouton-icône, complète le nom accessible. */
  hint?: string;
}

export interface CarteCreativeProps {
  media: { url?: string | null; thumbUrl?: string | null; isVideo?: boolean; aspect?: string; fit?: 'cover' | 'contain' };
  titre: string;
  /** Le petit cartouche du haut · gabarit, type, format. */
  format?: string;
  /** Infos secondaires en chips · filiation, essai. Reviennent à la ligne. */
  meta?: ReactNode;
  /** Note explicative sous le titre · pourquoi Jarvis l'a proposée, par exemple. */
  note?: ReactNode;
  onApercu?: () => void;
  /** Le vote de pertinence · fourni par le contexte (RatingControl). */
  pertinence?: ReactNode;
  /** La synthèse qualité · calculée au noyau. */
  qualite?: QualiteCarte | null;
  /** La performance mesurée · verdict marché, et la prédiction (pronostic). */
  performance?: { verdict?: EtatVerdictCarte | null; prediction?: number | null };
  actionPrincipale: ActionCarte;
  actionsSecondaires?: ActionCarte[];
  /** États de chargement / erreur · la grille les rend sans média. */
  chargement?: boolean;
  erreur?: string;
  /** Ouverture initiale · sert la planche d'états et les gardes de rendu HTML. */
  initial?: { menu?: boolean; qualite?: boolean };
}

const TON_QUALITE: Record<string, { fg: string; bord: string }> = {
  bon: { fg: '#18cc8c', bord: 'rgba(24,204,140,.45)' },
  attention: { fg: '#ffca6b', bord: 'rgba(255,202,107,.5)' },
  bloquant: { fg: '#ff9db0', bord: 'rgba(255,77,109,.55)' },
  inconnu: { fg: 'var(--muted)', bord: 'var(--line-2)' },
};

const carte: CSSProperties = {
  display: 'flex', flexDirection: 'column', minWidth: 0,
  border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden',
};
const labelZone: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' };

export function CarteCreative(props: CarteCreativeProps) {
  const { media, titre, format, meta, note, onApercu, pertinence, qualite, performance, actionPrincipale, actionsSecondaires = [], chargement, erreur, initial } = props;

  if (chargement) return <SqueletteCarte aspect={media.aspect} />;

  return (
    <article style={carte}>
      {/* Aperçu · intégral (contain pour une création interne), cliquable. */}
      <div style={{ position: 'relative', background: 'var(--paper)' }}>
        {erreur ? (
          <div style={{ aspectRatio: media.aspect ?? '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, color: 'var(--muted)', textAlign: 'center' }}>
            <Icon name="alert" size={20} />
            <span style={{ fontSize: 12, lineHeight: 1.4 }}>{erreur}</span>
          </div>
        ) : onApercu ? (
          <button type="button" onClick={onApercu} aria-label={`Ouvrir · ${titre}`} title="Ouvrir en grand"
            style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}>
            <AdMedia mediaUrl={media.url ?? undefined} thumbnailUrl={media.thumbUrl ?? undefined} isVideo={media.isVideo} aspect={media.aspect ?? '1 / 1'} fit={media.fit ?? 'contain'} />
          </button>
        ) : (
          <AdMedia mediaUrl={media.url ?? undefined} thumbnailUrl={media.thumbUrl ?? undefined} isVideo={media.isVideo} aspect={media.aspect ?? '1 / 1'} fit={media.fit ?? 'contain'} />
        )}
        {typeof performance?.prediction === 'number' && (
          <span title={`Prédiction Jarvis · ${performance.prediction}/100 · un pronostic, pas un résultat mesuré`}
            style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: 'rgba(8,5,10,.72)', border: '1px solid var(--line-2)', color: '#e7e7ef', fontSize: 11, fontWeight: 800, backdropFilter: 'blur(4px)' }}>
            <Icon name="sparkles" size={12} /> Préd. {performance.prediction}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px 12px', minWidth: 0 }}>
        {/* Cartouche + titre + méta · le titre long est tronqué, jamais débordé. */}
        {(format || meta) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            {format && <span style={{ ...labelZone, color: 'var(--accent-strong)' }}>{format}</span>}
            {meta}
          </div>
        )}
        <h3 title={titre} style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0, wordBreak: 'break-word' }}>{titre}</h3>
        {note && <div style={{ minWidth: 0 }}>{note}</div>}

        {/* Trois signaux DISTINCTS · un vote ne vaut pas une qualité, une qualité
            ne vaut pas une performance. */}
        <div style={{ display: 'grid', gap: 7, paddingTop: 2, borderTop: '1px solid var(--line)', marginTop: 1 }}>
          {qualite && <ZoneQualite q={qualite} initialOuvert={initial?.qualite} />}
          <ZonePerformance verdict={performance?.verdict ?? null} />
          {pertinence && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
              <span style={labelZone}>Pertinence</span>
              <span style={{ display: 'inline-flex', minWidth: 0 }}>{pertinence}</span>
            </div>
          )}
        </div>

        {/* Action principale STABLE (nommée, pleine largeur) + « … » regroupé. */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, minWidth: 0 }}>
          <ActionPrincipale a={actionPrincipale} />
          {actionsSecondaires.length > 0 && <MenuSecondaire titre={titre} actions={actionsSecondaires} initialOuvert={initial?.menu} />}
        </div>
      </div>
    </article>
  );
}

function ZoneQualite({ q, initialOuvert }: { q: QualiteCarte; initialOuvert?: boolean }) {
  const [ouvert, setOuvert] = useState(!!initialOuvert);
  const t = TON_QUALITE[q.ton] ?? TON_QUALITE.inconnu!;
  const detaillable = q.points.length > 0;
  return (
    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span style={labelZone}>Qualité</span>
        <button type="button" disabled={!detaillable} onClick={() => setOuvert((v) => !v)}
          aria-expanded={detaillable ? ouvert : undefined}
          title={detaillable ? 'Voir les points à vérifier' : q.libelle}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', minWidth: 0, padding: '3px 9px', borderRadius: 999, border: `1px solid ${t.bord}`, background: 'transparent', color: t.fg, fontSize: 11, fontWeight: 800, cursor: detaillable ? 'pointer' : 'default' }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.libelle}</span>
          {detaillable && <span aria-hidden style={{ flexShrink: 0, transform: ouvert ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}><Chevron /></span>}
        </button>
      </div>
      {detaillable && ouvert && (
        <div style={{ display: 'grid', gap: 3, padding: '2px 2px 0' }}>
          {q.automatique && <span style={{ fontSize: 10, color: 'var(--muted)' }}>Détecté automatiquement · à vérifier.</span>}
          {q.points.map((p, i) => (
            <span key={i} style={{ display: 'flex', gap: 5, fontSize: 11, color: t.fg, lineHeight: 1.35 }}>
              <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={12} /></span>
              <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{p}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ZonePerformance({ verdict }: { verdict?: EtatVerdictCarte | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
      <span style={labelZone}>Performance</span>
      {verdict
        ? <VerdictBadge etat={verdict} />
        : <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Performance inconnue</span>}
    </div>
  );
}

function ActionPrincipale({ a }: { a: ActionCarte }) {
  const style: CSSProperties = {
    flex: 1, minWidth: 0, minHeight: CIBLE_TACTILE_MIN,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10, border: 'none', cursor: a.disabled ? 'default' : 'pointer',
    background: 'var(--grad-accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 800,
    textDecoration: 'none', opacity: a.disabled ? 0.55 : 1,
  };
  const inner = (
    <>
      {a.icon && <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0 }}><Icon name={a.icon} size={14} /></span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
    </>
  );
  if (a.href && !a.disabled) {
    return <a href={a.href} download={a.download} target="_blank" rel="noreferrer" title={a.hint} style={style}>{inner}</a>;
  }
  return <button type="button" onClick={a.onClick} disabled={a.disabled} title={a.hint} style={style}>{inner}</button>;
}

function MenuSecondaire({ titre, actions, initialOuvert }: { titre: string; actions: ActionCarte[]; initialOuvert?: boolean }) {
  const [ouvert, setOuvert] = useState(!!initialOuvert);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Fermer au clic dehors et à Échap · rendre le focus au déclencheur.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOuvert(false); };
    const clavier = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOuvert(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', clavier);
    // Porter le focus sur le premier élément du menu à l'ouverture.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', clavier); };
  }, [ouvert]);

  return (
    <div ref={boxRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button ref={btnRef} type="button" onClick={() => setOuvert((v) => !v)}
        aria-haspopup="menu" aria-expanded={ouvert} aria-controls={ouvert ? menuId : undefined}
        aria-label="Plus d’actions" title="Plus d’actions"
        style={{ width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer' }}>
        <span aria-hidden style={{ display: 'inline-flex' }}><Dots /></span>
      </button>
      {ouvert && (
        <div ref={menuRef} id={menuId} role="menu" aria-label={`Actions · ${titre}`}
          style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 190, maxWidth: 260, display: 'grid', gap: 2, padding: 6, borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', boxShadow: '0 18px 44px -14px rgba(0,0,0,.7)' }}>
          {actions.map((a) => {
            const style: CSSProperties = {
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: CIBLE_TACTILE_MIN,
              padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: a.disabled ? 'default' : 'pointer',
              color: a.danger ? '#ff9db0' : 'var(--ink)', fontSize: 12.5, fontWeight: 600, textAlign: 'left', textDecoration: 'none', opacity: a.disabled ? 0.5 : 1,
            };
            const inner = (
              <>
                {a.icon && <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: a.danger ? '#ff9db0' : 'var(--muted)' }}><Icon name={a.icon} size={15} /></span>}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
              </>
            );
            const fermerPuis = (fn?: () => void) => () => { setOuvert(false); fn?.(); };
            if (a.href && !a.disabled) {
              return <a key={a.cle} role="menuitem" href={a.href} download={a.download} target="_blank" rel="noreferrer" title={a.hint} onClick={fermerPuis()} style={style}>{inner}</a>;
            }
            return <button key={a.cle} role="menuitem" type="button" disabled={a.disabled} title={a.hint} onClick={fermerPuis(a.onClick)} style={style}>{inner}</button>;
          })}
        </div>
      )}
    </div>
  );
}

function SqueletteCarte({ aspect }: { aspect?: string }) {
  const bloc = (h: number, w = '100%'): CSSProperties => ({ height: h, width: w, borderRadius: 8, background: 'var(--paper)' });
  return (
    <article style={{ ...carte, opacity: 0.75 }} aria-busy="true" aria-label="Chargement de la création">
      <div style={{ aspectRatio: aspect ?? '1 / 1', background: 'var(--paper)' }} />
      <div style={{ display: 'grid', gap: 8, padding: '10px 12px 12px' }}>
        <div style={bloc(10, '40%')} />
        <div style={bloc(12, '85%')} />
        <div style={bloc(12, '60%')} />
        <div style={bloc(CIBLE_TACTILE_MIN)} />
      </div>
    </article>
  );
}

function Chevron() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;
}
function Dots() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>;
}
