'use client';

import { useMemo, useState } from 'react';
import { gesteTelechargement, messageTelechargement, type DonneesDrive, type SelectionDrive } from '@tiktrends/core';
import { Ic } from '../../communs';
import { useSpatial } from '../../coquille/contexte';

/**
 * Bibliothèque · « Télécharger » de la barre de sélection · une archive ZIP des
 * fichiers et des DOSSIERS sélectionnés (un dossier avec son arborescence).
 * Ouvert ou fermé, et pourquoi, est décidé au noyau (`gesteTelechargement` ·
 * bornes de sélection, arborescence, plafonds de nombre et de volume, chemins),
 * AVANT le clic. Une taille inconnue ne ferme pas le geste · la route la relit
 * au stockage pendant la vérification, et dit son refus si elle reste illisible.
 *
 * Au clic · la route redit sa décision (`?verifier=1`, JSON) · un refus est dit
 * sans quitter la page. Puis un formulaire POSTÉ par le navigateur lui-même
 * reçoit l'archive en pièce jointe · c'est le navigateur qui la télécharge, en
 * flux, sans la garder en mémoire dans la page. Seuls des identifiants partent
 * (`ids` pour les fichiers, `dossiers` pour les dossiers).
 */

export const ROUTE_ARCHIVE = '/api/bibliotheque/archive';
const INDISPONIBLE = 'Archive indisponible · réessaie dans un instant.';

/** Le navigateur poste les identifiants · la réponse (pièce jointe) devient un téléchargement, la page reste. */
function lancerArchive(ids: readonly string[], dossiers: readonly string[]): void {
  const f = document.createElement('form');
  f.method = 'post';
  f.action = ROUTE_ARCHIVE;
  f.hidden = true;
  for (const [champ, liste] of [['ids', ids], ['dossiers', dossiers]] as const) {
    for (const id of liste) {
      const i = document.createElement('input');
      i.type = 'hidden';
      i.name = champ;
      i.value = id;
      f.appendChild(i);
    }
  }
  document.body.appendChild(f);
  try { f.submit(); } finally { f.remove(); }
}

export function BoutonTelecharger({ donnees, sel, lectureSeule, occupe }: {
  donnees: DonneesDrive; sel: Pick<SelectionDrive, 'composition' | 'dossiers' | 'fichiers'>; lectureSeule: string | null; occupe: boolean;
}) {
  const { toast } = useSpatial();
  const [prepare, setPrepare] = useState(false);
  const g = useMemo(() => gesteTelechargement(donnees, sel, lectureSeule), [donnees, sel, lectureSeule]);

  const lancer = async () => {
    if (!g.ouvert || prepare) return;
    setPrepare(true);
    try {
      const r = await fetch(`${ROUTE_ARCHIVE}?verifier=1`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: g.ids, dossiers: g.dossiers }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; raison?: string; fichiers?: number; dossiers?: number; octets?: number } | null;
      if (!r.ok || !j?.ok || typeof j.fichiers !== 'number' || typeof j.octets !== 'number') { toast(j?.raison ?? INDISPONIBLE); return; }
      lancerArchive(g.ids, g.dossiers);
      toast(messageTelechargement(j.fichiers, j.octets, typeof j.dossiers === 'number' ? j.dossiers : 0));
    } catch {
      toast(INDISPONIBLE);
    } finally {
      setPrepare(false);
    }
  };

  return (
    <button className="btn sm" type="button" data-geste="telecharger" disabled={occupe || prepare || !g.ouvert} title={g.titre} onClick={() => void lancer()}>
      <Ic n="down" />{g.libelle}
    </button>
  );
}
