'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CIBLE_TACTILE_MIN, FORMAT_NON_CLASSE, estFormatCreatif, formatCreatif, formatsPourMedia, mediaAnnonce, type FormatCreatifId } from '@tiktrends/core';
import { classerFormatSauvegarde } from '../../actions/inspo';
import { useToast } from '../../../components/Toast';

type Etat = { t: 'repos' } | { t: 'envoi' } | { t: 'ok'; msg: string } | { t: 'echec'; msg: string };

/**
 * Le choix « Format » d'une annonce sauvegardée (formats créatifs v1 · lot 19C).
 *
 * Un `<select>` natif étiqueté · clavier et lecteur d'écran sans effort, 44 px
 * de haut. La liste est filtrée par le MÉDIA de l'annonce (règle du noyau) ·
 * `Non classé` par défaut. Le retour est honnête · « Enregistré » seulement
 * quand l'action serveur a répondu oui ; sinon le choix revient à l'état
 * précédent et l'échec est dit, avec quoi faire.
 *
 * `vue` · le format affiché par la grille autour (ou `non_classe`). Quand le
 * nouveau choix sort l'annonce de cette vue, le rafraîchissement va la retirer ·
 * on rend d'abord le focus au choix suivant (sinon il tomberait en haut de page).
 */
export function FormatChoix({ platform, externalId, mediaType, initial, versionAncienne = false, vue = null }: {
  platform: string; externalId: string; mediaType?: string | null; initial: FormatCreatifId | null; versionAncienne?: boolean; vue?: string | null;
}) {
  const media = mediaAnnonce(mediaType);
  const options = formatsPourMedia(media);
  // Un classement ancien hors du média reste AFFICHÉ tel quel · on ne le
  // réécrit pas en douce.
  if (initial && !options.some((f) => f.id === initial)) options.push(formatCreatif(initial));
  const [valeur, setValeur] = useState<string>(initial ?? FORMAT_NON_CLASSE);
  const [etat, setEtat] = useState<Etat>({ t: 'repos' });
  const verrou = useRef(false);
  const id = useId();
  const router = useRouter();
  const { toast } = useToast();

  const definition = estFormatCreatif(valeur) ? formatCreatif(valeur).definition : 'Choisis le format de cette annonce · rien n’est deviné ni classé automatiquement.';

  const changer = async (v: string, cible: HTMLSelectElement) => {
    if (verrou.current) return;
    verrou.current = true;
    const avant = valeur;
    setValeur(v);
    setEtat({ t: 'envoi' });
    try {
      const r = await classerFormatSauvegarde({ platform, externalId, format: v });
      if (!r.ok) { setValeur(avant); setEtat({ t: 'echec', msg: r.error }); return; }
      const msg = r.format ? `Enregistré · ${formatCreatif(r.format).libelle}` : 'Enregistré · non classée';
      setEtat({ t: 'ok', msg });
      toast(msg + '.');
      if (vue && v !== vue) {
        const tous = [...document.querySelectorAll<HTMLSelectElement>('select[data-format-choix]')];
        const i = tous.indexOf(cible);
        const suivant = tous[i + 1] ?? tous[i - 1] ?? document.getElementById('formats-titre');
        suivant?.focus();
      }
      router.refresh();
    } catch {
      setValeur(avant);
      setEtat({ t: 'echec', msg: 'Échec de l’enregistrement · vérifie ta connexion puis réessaie.' });
    } finally {
      verrou.current = false;
    }
  };

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Format</label>
      <select
        id={id} data-format-choix value={valeur} aria-busy={etat.t === 'envoi'} aria-describedby={`${id}-def ${id}-etat`}
        onChange={(e) => { void changer(e.target.value, e.currentTarget); }}
        style={{
          width: '100%', minHeight: CIBLE_TACTILE_MIN, padding: '8px 10px', borderRadius: 9,
          border: '1px solid ' + (etat.t === 'echec' ? 'var(--danger, #e5484d)' : 'var(--line-2)'),
          background: 'var(--paper)', color: valeur === FORMAT_NON_CLASSE ? 'var(--muted)' : 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <option value={FORMAT_NON_CLASSE}>Non classé</option>
        {options.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
      </select>
      <p id={`${id}-def`} style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
        {definition}
        {versionAncienne && etat.t === 'repos' && <> · classée avec une version antérieure de la liste, à revoir</>}
      </p>
      <p id={`${id}-etat`} role="status" aria-live="polite" style={{ margin: 0, minHeight: 16, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: etat.t === 'echec' ? 'var(--danger, #e5484d)' : etat.t === 'ok' ? 'var(--accent-strong)' : 'var(--muted)' }}>
        {etat.t === 'envoi' ? 'Enregistrement…' : etat.t === 'ok' || etat.t === 'echec' ? etat.msg : ''}
      </p>
    </div>
  );
}
