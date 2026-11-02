'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  confirmationRemplacement, formatTaille, messageFichierRemplace, remplacementFichier, vueUtiliseDans,
  type FichierDrive, type UtilisationsBibliotheque,
} from '@tiktrends/core';
import { presignAssetUploadAction, remplacerAssetAction } from '../../../app/actions/assets';
import { DialogueSpatial } from '../marque/interactifs';
import { envoyerVersBucket } from './envoi-bucket';

/**
 * Bibliothèque · « Remplacer » un fichier (aperçu et menu « … ») · une
 * nouvelle version sous le MÊME identifiant. Ce qui est proposé, fermé, et
 * ce que dit la confirmation sont décidés au noyau (`remplacementFichier`,
 * `confirmationRemplacement` · `remplacer.ts`) · ici, le geste :
 *  1. le sélecteur de fichiers, filtré sur la famille du fichier ;
 *  2. la CONFIRMATION, avant tout envoi · les projets Studios qui le citent
 *     (« Utilisé dans N projets », la lecture de l'aperçu), ce qui reste,
 *     l'ancienne version gardée ;
 *  3. le dépôt par le présigné existant (`presignAssetUploadAction`, usage
 *     `remplacement`, puis `envoyerVersBucket`), puis `remplacerAssetAction`
 *     avec le jeton de dépôt opaque (jamais l'adresse de l'objet) · son refus
 *     reste dans la fenêtre, le succès est dit, l'écran se relit.
 */

const ENVOI_ECHOUE = 'L’envoi de la nouvelle version a échoué · rien n’a été remplacé, réessaie.';
const ENREGISTREMENT_ECHOUE = 'L’enregistrement a échoué · rien n’a été remplacé.';

export interface OptionsRemplacement {
  lectureSeule: string | null;
  stockage: boolean;
  utilisations: UtilisationsBibliotheque | null | undefined;
  occupe: boolean;
  setOccupe: (o: boolean) => void;
  toast: (m: string) => void;
  rafraichir: () => void;
}

/** Le geste « Remplacer » · `demarrer(f)` ouvre le sélecteur, `rendu` porte le sélecteur caché et la confirmation. */
export function useRemplacement(o: OptionsRemplacement): { demarrer: (f: FichierDrive) => void; rendu: ReactNode } {
  // Le sélecteur de fichiers est créé au geste, hors de l'arbre de l'écran (la structure de la maquette reste identique).
  const entree = useRef<HTMLInputElement | null>(null);
  const [choix, setChoix] = useState<{ f: FichierDrive; fichier: File; erreur: string | null } | null>(null);
  const retirerEntree = () => { entree.current?.remove(); entree.current = null; };
  useEffect(() => retirerEntree, []);

  const demarrer = (f: FichierDrive) => {
    const g = remplacementFichier(f, { lectureSeule: o.lectureSeule, stockage: o.stockage });
    if (!g?.ouvert || o.occupe) return;
    retirerEntree();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = g.accept;
    input.hidden = true;
    input.setAttribute('data-remplacer-fichier', f.id);
    input.addEventListener('change', () => {
      const fichier = input.files?.[0] ?? null;
      retirerEntree();
      if (fichier) setChoix({ f, fichier, erreur: null });
    });
    input.addEventListener('cancel', retirerEntree);
    document.body.appendChild(input);
    entree.current = input;
    input.click();
  };

  const fermer = () => { if (!o.occupe) setChoix(null); };

  async function confirmer() {
    if (!choix || o.occupe) return;
    const { f, fichier } = choix;
    o.setOccupe(true);
    let erreur: string | null = null;
    try {
      const pre = await presignAssetUploadAction({ filename: fichier.name, contentType: fichier.type || 'application/octet-stream', sizeBytes: fichier.size, usage: 'remplacement' })
        .catch(() => ({ error: ENREGISTREMENT_ECHOUE } as Awaited<ReturnType<typeof presignAssetUploadAction>>));
      if (pre.error || !pre.uploadUrl || !pre.jetonDepot || !pre.contentType) erreur = pre.error ?? ENVOI_ECHOUE;
      else {
        try { await envoyerVersBucket(pre.uploadUrl, fichier, pre.contentType); } catch { erreur = ENVOI_ECHOUE; }
        if (!erreur) {
          const r = await remplacerAssetAction({ id: f.id, jetonDepot: pre.jetonDepot, mimeType: fichier.type })
            .catch(() => ({ error: ENREGISTREMENT_ECHOUE } as { ok?: true; error?: string }));
          if (r.error) erreur = r.error;
        }
      }
    } finally { o.setOccupe(false); }
    if (erreur) { setChoix((c) => (c ? { ...c, erreur } : c)); return; }
    setChoix(null);
    o.toast(messageFichierRemplace(f.nom));
    o.rafraichir();
  }

  const conf = choix ? confirmationRemplacement({ nom: choix.f.nom, nouveau: choix.fichier.name, utilise: vueUtiliseDans(o.utilisations ?? null, choix.f), tags: choix.f.ia?.tags.length ?? 0 }) : null;
  const rendu = (
    <DialogueSpatial titre="Remplacer le fichier" ouvert={choix !== null} fermer={fermer}>
      {choix && conf && (
        <form style={{ display: 'grid', gap: 10 }} data-remplacer={choix.f.id} onSubmit={(e) => { e.preventDefault(); void confirmer(); }}>
          <p style={{ fontSize: 13, margin: 0 }}><strong>{conf.question}</strong> <small className="faint">{formatTaille(choix.fichier.size)}</small></p>
          {conf.lignes.map((l) => <p className="muted" key={l} style={{ fontSize: '12.5px', margin: 0 }} data-remplacer-ligne="">{l}</p>)}
          {choix.erreur && <p role="alert" style={{ fontSize: '12.5px', margin: 0, color: 'var(--bad)' }}>{choix.erreur}</p>}
          <div className="pbtns"><button className="btn" type="button" onClick={fermer} disabled={o.occupe}>Annuler</button><button className="btn pri" type="submit" disabled={o.occupe}>Remplacer</button></div>
        </form>
      )}
    </DialogueSpatial>
  );
  return { demarrer, rendu };
}
