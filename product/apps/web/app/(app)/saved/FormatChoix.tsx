'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CIBLE_TACTILE_MIN, FORMAT_NON_CLASSE, estFormatCreatif, formatCreatif, formatsPourMedia, mediaAnnonce, type FormatCreatifId } from '@tiktrends/core';
import { classerFormatSauvegarde } from '../../actions/inspo';
import { useToast } from '../../../components/Toast';

type Etat = { t: 'repos' } | { t: 'envoi' } | { t: 'ok'; msg: string } | { t: 'echec'; msg: string };

/**
 * Le choix « Format » d'une annonce sauvegardée (formats créatifs v1 · lot 19C).
 *
 * Un `<select>` natif étiqueté, 44 px, puis « Enregistrer ». L'enregistrement est
 * un geste EXPLICITE · sur un select fermé, chaque flèche du clavier déclenche
 * `change` · un enregistrement au changement écrivait une fois par touche et,
 * dans la file « à classer », sortait l'annonce de la vue dès la première
 * flèche (mesuré en préparant la recette). Le bouton n'apparaît que quand le
 * choix diffère de ce qui est enregistré.
 *
 * La liste est filtrée par le MÉDIA de l'annonce (règle du noyau) · `Non classé`
 * par défaut. Retour honnête · « Enregistré » seulement quand l'action serveur a
 * répondu oui ; sinon le choix revient à l'état enregistré et l'échec est dit.
 *
 * `vue` · le format affiché par la grille autour (ou `non_classe`). Quand
 * l'enregistrement sort l'annonce de cette vue, le rafraîchissement va la
 * retirer · on rend d'abord le focus au choix suivant (sinon il tomberait en haut
 * de page).
 */
export function FormatChoix({ platform, externalId, mediaType, initial, versionAncienne = false, vue = null, indisponible = null }: {
  platform: string; externalId: string; mediaType?: string | null; initial: FormatCreatifId | null; versionAncienne?: boolean; vue?: string | null;
  /**
   * Raison pour laquelle le classement n'est PAS ouvert à cette session ·
   * calculée côté serveur avec le même droit que l'action et `/veille/formats`
   * (`canAccess(effectiveAccess(s), Veille)`) · jamais recalculée ici. Présente
   * → choix désactivé dès la carte, la raison est dite (et liée au choix pour
   * un lecteur d'écran). L'action serveur garde son propre refus.
   */
  indisponible?: string | null;
}) {
  const media = mediaAnnonce(mediaType);
  const options = formatsPourMedia(media);
  // Un classement ancien hors du média reste AFFICHÉ tel quel · on ne le
  // réécrit pas en douce.
  if (initial && !options.some((f) => f.id === initial)) options.push(formatCreatif(initial));
  const [enregistre, setEnregistre] = useState<string>(initial ?? FORMAT_NON_CLASSE);
  const [valeur, setValeur] = useState<string>(initial ?? FORMAT_NON_CLASSE);
  const [etat, setEtat] = useState<Etat>({ t: 'repos' });
  const verrou = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const racineRef = useRef<HTMLDivElement>(null);
  const etatRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const router = useRouter();
  const { toast } = useToast();
  const modifie = !indisponible && valeur !== enregistre;

  const definition = estFormatCreatif(valeur) ? formatCreatif(valeur).definition
    : indisponible ? 'Non classée.' : 'Choisis le format de cette annonce · rien n’est deviné ni classé automatiquement.';

  // Lot 20B · un échec remet le choix enregistré · `modifie` repasse à faux et
  // le bouton « Enregistrer », qui avait le focus, est démonté · le focus
  // tombait sur <body>, en haut du document (mesuré au navigateur, clavier).
  // Il revient au choix de CETTE carte AVANT le démontage, s'il était encore
  // dans la carte (un focus parti ailleurs entre-temps est respecté) · le champ
  // est lié au message d'état (`aria-describedby`), l'échec est donc annoncé, et
  // le message est amené à l'écran (défilement minimal) une fois rendu.
  const [montrerEchec, setMontrerEchec] = useState(0);
  useEffect(() => { if (montrerEchec) etatRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [montrerEchec]);
  const rendreFocusApresEchec = () => {
    const a = document.activeElement;
    if (!a || a === document.body || racineRef.current?.contains(a)) selectRef.current?.focus();
    setMontrerEchec((n) => n + 1);
  };

  const enregistrer = async () => {
    if (verrou.current || !modifie) return;
    verrou.current = true;
    const v = valeur;
    setEtat({ t: 'envoi' });
    try {
      const r = await classerFormatSauvegarde({ platform, externalId, format: v });
      if (!r.ok) { rendreFocusApresEchec(); setValeur(enregistre); setEtat({ t: 'echec', msg: r.error }); return; }
      const msg = r.format ? `Enregistré · ${formatCreatif(r.format).libelle}` : 'Enregistré · non classée';
      setEnregistre(v);
      setEtat({ t: 'ok', msg });
      toast(msg + '.');
      if (vue && v !== vue) {
        const tous = [...document.querySelectorAll<HTMLSelectElement>('select[data-format-choix]')];
        const i = selectRef.current ? tous.indexOf(selectRef.current) : -1;
        const suivant = (i >= 0 ? tous[i + 1] ?? tous[i - 1] : null) ?? document.getElementById('formats-titre');
        suivant?.focus();
      } else {
        selectRef.current?.focus();
      }
      router.refresh();
    } catch {
      rendreFocusApresEchec();
      setValeur(enregistre);
      setEtat({ t: 'echec', msg: 'Échec de l’enregistrement · vérifie ta connexion puis réessaie.' });
    } finally {
      verrou.current = false;
    }
  };

  const message = etat.t === 'envoi' ? 'Enregistrement…'
    : etat.t === 'ok' || etat.t === 'echec' ? etat.msg
      : modifie ? 'Pas encore enregistré.' : '';

  return (
    <div ref={racineRef} style={{ display: 'grid', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Format</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          ref={selectRef} id={id} data-format-choix value={valeur} disabled={!!indisponible} aria-describedby={indisponible ? `${id}-indispo ${id}-def` : `${id}-def ${id}-etat`}
          onChange={(e) => { setValeur(e.target.value); if (etat.t !== 'envoi') setEtat({ t: 'repos' }); }}
          style={{
            flex: 1, minWidth: 0, minHeight: CIBLE_TACTILE_MIN, padding: '8px 10px', borderRadius: 9,
            border: '1px solid ' + (etat.t === 'echec' ? 'var(--danger, #e5484d)' : modifie ? 'var(--accent-strong)' : 'var(--line-2)'),
            background: 'var(--paper)', color: valeur === FORMAT_NON_CLASSE || indisponible ? 'var(--muted)' : 'var(--ink)', fontSize: 13, fontWeight: 600,
            cursor: indisponible ? 'not-allowed' : 'pointer', opacity: indisponible ? 0.6 : 1,
          }}
        >
          <option value={FORMAT_NON_CLASSE}>Non classé</option>
          {options.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
        </select>
        {modifie && (
          <button type="button" onClick={() => { void enregistrer(); }} aria-busy={etat.t === 'envoi'} aria-label={`Enregistrer le format · ${estFormatCreatif(valeur) ? formatCreatif(valeur).libelle : 'non classé'}`}
            style={{ flexShrink: 0, minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, padding: '6px 12px', borderRadius: 9, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 12.5, cursor: etat.t === 'envoi' ? 'default' : 'pointer' }}>
            {etat.t === 'envoi' ? '…' : 'Enregistrer'}
          </button>
        )}
      </div>
      {indisponible && (
        <p id={`${id}-indispo`} data-format-indisponible style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.4 }}>{indisponible}</p>
      )}
      <p id={`${id}-def`} style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
        {definition}
        {versionAncienne && !modifie && etat.t === 'repos' && <> · classée avec une version antérieure de la liste, à revoir</>}
      </p>
      <p ref={etatRef} id={`${id}-etat`} role="status" aria-live="polite" style={{ margin: 0, minHeight: 16, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: etat.t === 'echec' ? 'var(--danger, #e5484d)' : etat.t === 'ok' ? 'var(--accent-strong)' : 'var(--muted)' }}>
        {message}
      </p>
    </div>
  );
}
