import type { CSSProperties, ReactNode } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Icon } from '../../../../components/Icon';

/**
 * Le rail d'actions de la fiche créa (vue détail d'une pub · `AdsStudio`).
 *
 * ── Pourquoi ce composant existe ─────────────────────────────────────────────
 *
 * Le rail empilait dix actions À PLAT · décliner, varier, scorer, éditer,
 * copier, télécharger, noter, archiver se suivaient sans regroupement, à la
 * même graisse. On ne lisait pas d'un coup « où j'itère », « où je contrôle »,
 * « où j'exporte » · la hiérarchie était portée par le seul ordre vertical.
 *
 * Ici les actions sont rangées en QUATRE rubriques nommées · Itérer, Modifier,
 * Contrôler, Exporter · chacune avec un intitulé court en capitales teinté. Le
 * regroupement est porté par l'ESPACE (rubrique > bouton > aide), pas par des
 * filets · l'écart entre rubriques (18px) est plus du double de l'écart interne
 * (6-8px), donc le groupe se lit sans traits.
 *
 * Composant PRÉSENTIEL · aucune action serveur, aucun hook, aucune API
 * navigateur · tout entre par props (données + rappels + nœuds déjà rendus).
 * C'est ce qui le rend RENDABLE en test (`renderToStaticMarkup`), là où
 * `AdsStudio` ne l'est pas · on prouve le RÉSULTAT (les quatre rubriques dans
 * le bon ordre, l'accroche en tête, la croix à la cible tactile).
 *
 * Aucun comportement ne change · mêmes rappels, mêmes libellés de prix, mêmes
 * cibles tactiles que l'empilement d'origine · c'est une réorganisation
 * visuelle et de hiérarchie.
 */

/** Un bouton de déclinaison · une variable tenue, le reste changé. */
export type DeclinaisonRow = {
  key: string;
  label: string;
  /** Prix déjà mis en forme · « gratuit » ou « 3 cr. ». */
  prixLabel: string;
  /** Le contrat écrit sous le bouton · « Change … · garde … », ou l'empêchement. */
  contrat: ReactNode;
  disabled: boolean;
  /** Cette ligne est en cours de déclinaison. */
  busy: boolean;
  /** Une AUTRE ligne est en cours · on estompe celle-ci. */
  autreBusy: boolean;
  title: string;
  onClick: () => void;
};

/** L'intitulé d'une rubrique · court, en capitales, teinté accent. */
const rubriqueTitre: CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em',
  textTransform: 'uppercase', color: 'var(--accent-strong)',
};
/** Un sous-groupe DANS une rubrique · un cran sous l'intitulé (Décliner, Varier). */
const sousTitre: CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em',
  textTransform: 'uppercase', color: 'var(--ink-2)',
};

/** Une rubrique · un intitulé teinté, puis son contenu · l'espace la sépare de la suivante. */
function Rubrique({ titre, premiere, children }: { titre: string; premiere?: boolean; children: ReactNode }) {
  return (
    <section style={{ marginTop: premiere ? 6 : 18 }}>
      <div style={{ ...rubriqueTitre, marginBottom: 9 }}>{titre}</div>
      {children}
    </section>
  );
}

export function RailFicheCrea(props: {
  /** Borne la hauteur du rail sur desktop · il défile seul, la zone média reste en place (F04). */
  maxHeight?: number | string;
  onClose: () => void;
  editText: boolean;
  // Branche « Éditer le texte »
  champsTexte?: ReactNode;
  textPret?: boolean;
  textBusy?: boolean;
  onAppliquerTexte?: () => void;
  onAnnulerTexte?: () => void;
  // Identité de la créa (en tête du rail)
  templateLabel: string;
  verdict: ReactNode;
  declinaison?: { label: string; change: string; garde: string } | null;
  lignee: ReactNode;
  headline: string;
  // Itérer
  declinaisons: DeclinaisonRow[];
  onVarier: () => void;
  varierBusy: boolean;
  varierDisabled: boolean;
  varierCredits: number;
  // Modifier
  onEditerTexte: () => void;
  // Contrôler
  score: ReactNode;
  pertinence: ReactNode;
  // Exporter
  onCopierLien: () => void;
  lienCopie: boolean;
  telechargementHref: string;
  telechargementLabel: string;
  noteFormat?: string;
  // Pied
  onArchiver: () => void;
}) {
  return (
    <div style={{ width: 236, flexShrink: 0, maxHeight: props.maxHeight, borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', padding: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <b style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>Créa</b>
        <button type="button" onClick={props.onClose} aria-label="Fermer" style={{ width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 8, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }}>×</button>
      </div>

      {props.editText ? (
        /* Panneau d'édition de texte (gratuit · l'overlay est recomposé) */
        <>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>Éditer le texte</span>
          {props.textPret ? (
            props.champsTexte
          ) : (
            <p style={{ margin: '10px 0', fontSize: 12.5, color: 'var(--muted)' }}>Chargement…</p>
          )}
          <p style={{ margin: '8px 0 10px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>Modifie le texte sans régénérer l'image · <b>gratuit</b>.</p>
          <button type="button" onClick={props.onAppliquerTexte} disabled={props.textBusy || !props.textPret} style={toolPrimary}>{props.textBusy ? 'Application…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="check" size={14} /> Appliquer les textes</span>}</button>
          <button type="button" onClick={props.onAnnulerTexte} style={{ ...toolBtn, marginTop: 8 }}>Annuler</button>
        </>
      ) : (
        <>
          {/* Identité de la créa · gabarit, verdict marché, déclinaison, lignée,
              accroche · ce qui la NOMME, avant les actions. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>{props.templateLabel}</span>
            {/* Le verdict du marché · au sommet du détail, avec le gabarit.
                C'est le résultat payé, la seule mesure qui tranche l'itération. */}
            {props.verdict}
          </div>
          {props.declinaison && (
            <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
              <b style={{ color: 'var(--ink-2)' }}>Déclinaison · {props.declinaison.label}</b><br />
              Change {props.declinaison.change} · garde {props.declinaison.garde}.
            </p>
          )}
          {/* La lignée · « accroche v3 » n'a de sens qu'en face de v2 et v1. */}
          {props.lignee}
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{props.headline}</p>

          {/* ── ITÉRER ── Décliner (une seule chose change · l'écart est
              ATTRIBUABLE, donc c'est la seule qui APPREND) porte la primauté ·
              Varier (tout change) suit en second, pour explorer vite sans
              rien conclure. */}
          <Rubrique titre="Itérer" premiere>
            {/* « Décliner » n'a plus de sous-titre · l'intitulé ITÉRER le porte
                déjà, et deux capitales empilées feraient du bruit. La primauté
                de la déclinaison tient par sa place (première, en gros bloc) et
                par sa raison, écrite juste sous le titre. */}
            <p style={{ margin: '0 0 9px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
              <b style={{ color: 'var(--ink-2)', fontWeight: 800 }}>Décliner</b> · une seule chose change, le reste est tenu · l’écart devient interprétable, et la mesure tranche (une variation isolée aide à lire, elle ne prouve pas seule). La scène est déjà payée, elle reste.
            </p>
            {props.declinaisons.map((d) => (
              <button key={d.key} type="button" onClick={d.onClick}
                disabled={d.disabled} title={d.title}
                style={{ ...toolBtn, marginBottom: 6, textAlign: 'left', opacity: d.autreBusy ? 0.5 : 1 }}>
                {d.busy ? 'Déclinaison…' : (
                  <>
                    <span style={{ display: 'block' }}>
                      {d.label}
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{' · '}{d.prixLabel}</span>
                    </span>
                    {/* Le contrat, écrit sur le bouton · une infobulle ne se lit
                        pas au doigt, et c'est ce qui est TENU qui donne son sens
                        à la déclinaison. */}
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35, marginTop: 2 }}>
                      {d.contrat}
                    </span>
                  </>
                )}
              </button>
            ))}
            <div style={{ marginTop: 12 }}>
              <span style={{ ...sousTitre, display: 'block', marginBottom: 6 }}>Varier</span>
              <button type="button" onClick={props.onVarier} disabled={props.varierBusy || props.varierDisabled} style={{ ...toolBtn, marginBottom: 0, textAlign: 'left' }}>
                {props.varierBusy ? 'Génération…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={14} /> Varier (3) · explorer vite</span>}
              </button>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>3 nouvelles créas · tout change à la fois, l’écart n’est attribuable à rien ({props.varierCredits} cr.).</p>
            </div>
          </Rubrique>

          {/* ── MODIFIER ── retoucher le texte sans régénérer l'image. */}
          <Rubrique titre="Modifier">
            <button type="button" onClick={props.onEditerTexte} style={{ ...toolBtn, marginBottom: 0 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="pen" size={14} /> Éditer le texte <span style={{ color: 'var(--muted)' }}>· gratuit</span></span></button>
          </Rubrique>

          {/* ── CONTRÔLER ── le pronostic Jarvis et la note de pertinence
              (qui entraîne Jarvis) · juger avant d'exporter. */}
          <Rubrique titre="Contrôler">
            {props.score}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Pertinence · entraîne Jarvis</span>
              {props.pertinence}
            </div>
          </Rubrique>

          {/* ── EXPORTER ── sortir la créa · lien ou fichier. */}
          <Rubrique titre="Exporter">
            <button type="button" onClick={props.onCopierLien} style={toolBtn}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name={props.lienCopie ? 'check' : 'link'} size={14} /> {props.lienCopie ? 'Lien copié' : 'Copier le lien'}</span></button>
            <a href={props.telechargementHref} target="_blank" rel="noreferrer" style={{ ...toolBtn, marginBottom: 0, textAlign: 'center', textDecoration: 'none', display: 'block' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="download" size={14} /> {props.telechargementLabel}</span></a>
            {/* La limite dite en clair · une entière ne se recadre pas sans
                régénérer · on ne présente pas un recadrage comme une adaptation. */}
            {props.noteFormat && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{props.noteFormat}</p>}
          </Rubrique>

          {/* L'espace pousse « Archiver » en pied · action discrète, séparée
              du reste, jamais mêlée aux actions d'itération. */}
          <span style={{ flex: 1, minHeight: 18 }} />
          <button type="button" onClick={props.onArchiver} style={{ ...toolBtn, marginBottom: 0, fontSize: 12, color: '#ff9db0', borderColor: 'var(--line-2)' }}>Archiver</button>
        </>
      )}
    </div>
  );
}

export const toolPrimary = { width: '100%', padding: '11px 14px', borderRadius: 11, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' } as const;
export const toolBtn = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 8 } as const;
