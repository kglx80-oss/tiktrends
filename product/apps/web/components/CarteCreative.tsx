'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CIBLE_TACTILE_MIN, type QualiteCarte, type EtatVerdictCarte, type FaitControle } from '@tiktrends/core';
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
  /** L'accent visuel de l'action principale · « neutre » pour « Ouvrir », qui ne
   *  doit plus rivaliser avec le visuel (CDC v7 · N06). Défaut · accentué. */
  variant?: 'accent' | 'neutre';
}

export interface CarteCreativeProps {
  media: { url?: string | null; thumbUrl?: string | null; isVideo?: boolean; aspect?: string; fit?: 'cover' | 'contain' };
  titre: string;
  /** Un distingueur sous le titre · date ou variante, quand un titre est partagé
   *  par une autre carte (CDC v7 · N06). Absent quand le titre est unique. */
  sousTitre?: string;
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
  /** Vérifier un fait · enregistre une preuve à partir d'une source (N04-suite). */
  onVerifierFait?: (cle: string, source: string) => void;
  /** Une vérification est en cours · fige le formulaire. */
  verifEnCours?: boolean;
  /** L'échec de la dernière vérification · affiché sous le fait. */
  erreurVerif?: string;
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
  const { media, titre, sousTitre, format, meta, note, onApercu, pertinence, qualite, performance, onVerifierFait, verifEnCours, erreurVerif, actionPrincipale, actionsSecondaires = [], chargement, erreur, initial } = props;

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
            {/* `interactive={false}` · le bouton porte déjà le clic · sans ça
                l'`<a>`/le bouton de lecture d'AdMedia s'imbriquait ici et ouvrait
                un onglet de miniature en plus du détail (CDC v8 · F04). */}
            <AdMedia mediaUrl={media.url ?? undefined} thumbnailUrl={media.thumbUrl ?? undefined} isVideo={media.isVideo} aspect={media.aspect ?? '1 / 1'} fit={media.fit ?? 'contain'} interactive={false} />
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
        {/* Le distingueur des homonymes · deux titres identiques ne se confondent
            plus (CDC v7 · N06). */}
        {sousTitre && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginTop: -2 }}>{sousTitre}</span>}
        {note && <div style={{ minWidth: 0 }}>{note}</div>}

        {/* Trois signaux DISTINCTS · un vote ne vaut pas une qualité, une qualité
            ne vaut pas une performance. */}
        <div style={{ display: 'grid', gap: 7, paddingTop: 2, borderTop: '1px solid var(--line)', marginTop: 1 }}>
          {qualite && <ZoneQualite q={qualite} initialOuvert={initial?.qualite} onVerifierFait={onVerifierFait} verifEnCours={verifEnCours} erreurVerif={erreurVerif} />}
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

function ZoneQualite({ q, initialOuvert, onVerifierFait, verifEnCours, erreurVerif }: { q: QualiteCarte; initialOuvert?: boolean; onVerifierFait?: (cle: string, source: string) => void; verifEnCours?: boolean; erreurVerif?: string }) {
  const [ouvert, setOuvert] = useState(!!initialOuvert);
  const t = TON_QUALITE[q.ton] ?? TON_QUALITE.inconnu!;
  const panneauId = useId();
  // Le badge est TOUJOURS activable · même « Prête à diffuser » ouvre sa
  // justification (CDC v7 · N04). Un badge inerte ne se consulte pas au clavier.
  return (
    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span style={labelZone}>Qualité</span>
        <button type="button" onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert} aria-controls={ouvert ? panneauId : undefined}
          title="Consulter le contrôle qualité"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', minWidth: 0, minHeight: 28, padding: '3px 9px', borderRadius: 999, border: `1px solid ${t.bord}`, background: 'transparent', color: t.fg, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.libelle}</span>
          <span aria-hidden style={{ flexShrink: 0, transform: ouvert ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}><Chevron /></span>
        </button>
      </div>
      {ouvert && <PanneauQualite q={q} t={t} id={panneauId} onVerifierFait={onVerifierFait} verifEnCours={verifEnCours} erreurVerif={erreurVerif} />}
    </div>
  );
}

/**
 * La justification du badge · trois natures DISTINCTES et consultables ·
 * contrôle technique, validation factuelle, approbation humaine · plus la
 * provenance. On lit ce qui est approuvé ET ce qui reste en réserve.
 */
function PanneauQualite({ q, t, id, onVerifierFait, verifEnCours, erreurVerif }: { q: QualiteCarte; t: { fg: string; bord: string }; id: string; onVerifierFait?: (cle: string, source: string) => void; verifEnCours?: boolean; erreurVerif?: string }) {
  const bon = TON_QUALITE.bon!;
  return (
    <div id={id} style={{ display: 'grid', gap: 8, padding: '8px 2px 2px' }}>
      {/* Nature 1 · contrôle technique. */}
      <NatureBloc titre="Contrôle technique">
        {!q.technique.fait ? (
          <LigneReserve texte="Non relue · aucun contrôle technique." ton="var(--muted)" icone="clock" />
        ) : q.technique.points.length === 0 ? (
          <LigneReserve texte="Relecture automatique · rien à signaler." ton={bon.fg} icone="check" />
        ) : (
          <>
            {q.automatique && <span style={{ fontSize: 10, color: 'var(--muted)' }}>Détecté automatiquement · à vérifier.</span>}
            {q.technique.points.map((p, i) => <LigneReserve key={i} texte={p} ton={t.fg} icone="alert" />)}
          </>
        )}
      </NatureBloc>

      {/* Nature 2 · validation factuelle · chaque fait montre sa preuve, ou de
          quoi la fournir. Une case cochée ne suffit pas · il faut une source. */}
      <NatureBloc titre="Validation factuelle">
        {q.factuel.faits.length > 0 && (
          <>
            {q.factuel.faits.map((f) => <FaitLigne key={f.cle} f={f} bonFg={bon.fg} onVerifier={onVerifierFait} enCours={verifEnCours} erreur={erreurVerif} />)}
            <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.35 }}>Une absence de défaut détecté n’équivaut pas à la vérification d’une preuve.</span>
          </>
        )}
        {/* CDC v8 · F02 · en mode entière le texte est cuit dans l'image · le
            contrôle factuel ne lit que des champs, il ne peut donc pas certifier
            l'absence d'offre. On le DIT, au lieu de conclure « aucun fait ». */}
        {q.couvertureInconnue ? (
          <LigneReserve texte="Texte écrit dans l’image · couverture factuelle non établie. Vérifie l’offre à l’œil avant de diffuser." ton={t.fg} icone="alert" />
        ) : q.factuel.faits.length === 0 ? (
          <LigneReserve texte="Aucun fait à valider sur cette création." ton="var(--muted)" icone="check" />
        ) : null}
      </NatureBloc>

      {/* Nature 3 · approbation humaine. */}
      <NatureBloc titre="Approbation humaine">
        {q.humain.approuve
          ? <LigneReserve texte={`Approuvée par ${q.humain.par}${q.humain.le ? ` · ${q.humain.le}` : ''}`} ton={bon.fg} icone="check" />
          : <LigneReserve texte="Pas encore d’approbation humaine." ton="var(--muted)" icone="clock" />}
      </NatureBloc>

      {q.provenance && (
        <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          {[q.provenance.auteur && `Par ${q.provenance.auteur}`, q.provenance.date, q.provenance.version && `Version ${q.provenance.version}`].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

/**
 * Un fait et l'état de sa preuve · vérifié (avec source, validateur, date,
 * version), caduc (le contenu a changé depuis la validation · l'approbation
 * reste dans l'historique), ou à vérifier. Quand on peut vérifier, un petit
 * champ de SOURCE s'ouvre · une case cochée seule ne suffit pas.
 */
function FaitLigne({ f, bonFg, onVerifier, enCours, erreur }: {
  f: FaitControle;
  bonFg: string;
  onVerifier?: (cle: string, source: string) => void;
  enCours?: boolean;
  erreur?: string;
}) {
  const [ouvertForm, setOuvertForm] = useState(false);
  const [source, setSource] = useState('');
  const attention = TON_QUALITE.attention!.fg;
  const bloquant = TON_QUALITE.bloquant!.fg;
  const ton = f.etat === 'verifiee' ? bonFg : f.etat === 'invalidee' ? bloquant : attention;
  const texte = f.etat === 'verifiee' ? `${f.label} · vérifié` : f.etat === 'invalidee' ? `${f.label} · validation caduque` : `${f.label} · à vérifier`;
  const verifiable = f.etat !== 'verifiee' && !!onVerifier;
  const estLien = !!f.source && /^https?:\/\//i.test(f.source);

  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
      <LigneReserve texte={texte} ton={ton} icone={f.etat === 'verifiee' ? 'check' : 'alert'} />

      {/* La provenance de la preuve · consultable. Sur un fait caduc, on garde
          l'approbation d'origine (qui/quand) · elle ne vaut juste plus pour le
          contenu actuel. */}
      {(f.etat === 'verifiee' || f.etat === 'invalidee') && (f.source || f.validateur) && (
        <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4, paddingLeft: 17, display: 'grid', gap: 1, minWidth: 0 }}>
          {f.source && (estLien
            ? <a href={f.source} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-strong)', textDecoration: 'none', wordBreak: 'break-all' }}>Source ↗</a>
            : <span style={{ wordBreak: 'break-word' }}>Source · {f.source}</span>)}
          {(f.validateur || f.date || f.version) && (
            <span>{[f.validateur && `Par ${f.validateur}`, f.date && f.date.slice(0, 10), f.version].filter(Boolean).join(' · ')}</span>
          )}
          {f.etat === 'invalidee' && <span style={{ color: bloquant }}>Le contenu a changé depuis · à re-vérifier.</span>}
        </div>
      )}

      {/* Vérifier · un champ de source obligatoire, puis on enregistre la preuve. */}
      {verifiable && (
        ouvertForm ? (
          <div style={{ display: 'grid', gap: 4, paddingLeft: 17 }}>
            <input value={source} onChange={(e) => setSource(e.target.value)} disabled={enCours}
              placeholder="Source consultable · lien ou référence"
              aria-label={`Source de la preuve · ${f.label}`}
              style={{ width: '100%', minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" disabled={enCours || !source.trim()} onClick={() => onVerifier!(f.cle, source.trim())}
                style={{ minHeight: 30, padding: '5px 10px', borderRadius: 8, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 800, cursor: enCours || !source.trim() ? 'default' : 'pointer', opacity: enCours || !source.trim() ? 0.55 : 1 }}>
                {enCours ? 'Enregistrement…' : 'Enregistrer la preuve'}
              </button>
              <button type="button" disabled={enCours} onClick={() => { setOuvertForm(false); setSource(''); }}
                style={{ minHeight: 30, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
            {erreur && <span role="alert" style={{ fontSize: 10, color: bloquant, lineHeight: 1.35 }}>{erreur}</span>}
          </div>
        ) : (
          <button type="button" onClick={() => setOuvertForm(true)}
            style={{ justifySelf: 'start', marginLeft: 17, padding: '3px 9px', borderRadius: 999, border: `1px solid ${attention}`, background: 'transparent', color: attention, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
            {f.etat === 'invalidee' ? 'Re-vérifier' : 'Vérifier'}
          </button>
        )
      )}
    </div>
  );
}

function NatureBloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
      <span style={{ ...labelZone, fontSize: 9 }}>{titre}</span>
      {children}
    </div>
  );
}

function LigneReserve({ texte, ton, icone }: { texte: string; ton: string; icone: string }) {
  return (
    <span style={{ display: 'flex', gap: 5, fontSize: 11, color: ton, lineHeight: 1.35, minWidth: 0 }}>
      <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}><Icon name={icone} size={12} /></span>
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{texte}</span>
    </span>
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
  // « Ouvrir » se pose en NEUTRE · un cadre sobre qui ne rivalise pas avec le
  // visuel · l'accent reste pour l'action de création (CDC v7 · N06).
  const neutre = a.variant === 'neutre';
  const style: CSSProperties = {
    flex: 1, minWidth: 0, minHeight: CIBLE_TACTILE_MIN,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10, cursor: a.disabled ? 'default' : 'pointer',
    fontSize: 12.5, fontWeight: neutre ? 700 : 800, textDecoration: 'none', opacity: a.disabled ? 0.55 : 1,
    ...(neutre
      ? { border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)' }
      : { border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)' }),
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
