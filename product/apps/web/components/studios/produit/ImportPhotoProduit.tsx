'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPT_PHOTO_IMPORT, verdictFichierPhoto, raisonImportPhoto, affichageImportPhoto,
  type EtatImportPhoto, type RecuperationImport, type TransformationProduit, type ErreurStudio,
} from '@tiktrends/core';
import { importerPhotoProduit } from '../../../app/actions/studios/produit';
import { compresserPhoto } from './compression-photo';
import { carte, titre, mini, boutonPrimaire, boutonSecondaire, desactive, signal, rangee } from '../propositions/styles';

/**
 * UX V2 · lot 3a · importer une photo produit depuis l'ordinateur, DANS le
 * projet. La photo est compressée ici, revalidée au serveur par la même règle
 * du noyau, ajoutée au catalogue du produit de la marque du projet puis
 * épinglée (nouvelle version, 409 si le projet a bougé).
 *
 * États portés par des mots (`affichageImportPhoto`) : en cours, réussi,
 * échec avec au moins un geste de récupération · jamais un bouton muet.
 * Cibles de 44 px. Aucun appel modèle, aucun coût.
 */

const LIBELLES_RECUPERATION: Readonly<Record<RecuperationImport, string>> = {
  choisir: 'Choisir une autre photo',
  reessayer: 'Réessayer l’envoi',
  recharger: 'Recharger la version courante',
};

function messageServeur(r: ErreurStudio): string {
  if (r.violations?.length) return [...new Set(r.violations.map((v) => v.raison))].join(' · ');
  return r.message;
}

export interface PropsImportPhoto {
  projectId: string;
  versionId: string;
  produit: { id: string; nom: string } | null;
  composants: string[];
  transformations: TransformationProduit[];
  peutModifier: boolean;
  /** Un autre geste de l'écran est en cours. */
  occupe?: boolean;
  onOccupe?: (occupe: boolean) => void;
  onReussi?: (photoId: string) => void;
}

export function ImportPhotoProduit({ projectId, versionId, produit, composants, transformations, peutModifier, occupe = false, onOccupe, onReussi }: PropsImportPhoto) {
  const router = useRouter();
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);
  const prete = useRef<{ dataUri: string; nom: string } | null>(null);
  const [etat, setEtat] = useState<EtatImportPhoto>({ etape: 'repos' });
  const [survol, setSurvol] = useState(false);

  const enCours = etat.etape === 'preparation' || etat.etape === 'envoi';
  const raison = raisonImportPhoto({ peutModifier, produitChoisi: !!produit, enCours: enCours || occupe });
  const affichage = affichageImportPhoto(etat);

  function occuper(b: boolean) { onOccupe?.(b); }

  async function envoyer(dataUri: string, nom: string) {
    if (!produit) return;
    setEtat({ etape: 'envoi', fichier: nom });
    occuper(true);
    try {
      const r = await importerPhotoProduit({ projectId, baseVersionId: versionId, productId: produit.id, dataUri, composants, transformations });
      if (r.ok) {
        prete.current = null;
        setEtat({ etape: 'reussi', ajoutee: r.ajoutee, fichier: nom });
        onReussi?.(r.photoId);
        router.refresh();
      } else if (r.code === 'VERSION_CONFLICT') {
        setEtat({ etape: 'echec', motif: 'conflit', fichier: nom });
      } else {
        prete.current = null;
        setEtat({ etape: 'echec', motif: 'serveur', message: messageServeur(r), fichier: nom });
      }
    } catch {
      // La photo préparée est gardée · « Réessayer l'envoi » la renvoie telle quelle.
      setEtat({ etape: 'echec', motif: 'reseau', fichier: nom });
    } finally {
      occuper(false);
    }
  }

  async function traiter(f: File | undefined) {
    if (!f || raison) return;
    const v = verdictFichierPhoto({ type: f.type, taille: f.size });
    if (!v.ok) { prete.current = null; setEtat({ etape: 'echec', motif: v.motif, fichier: f.name }); return; }
    setEtat({ etape: 'preparation', fichier: f.name });
    occuper(true);
    let c: Awaited<ReturnType<typeof compresserPhoto>>;
    try {
      c = await compresserPhoto(f);
    } catch {
      c = { ok: false, motif: 'illisible' };
    }
    if (!c.ok) { occuper(false); prete.current = null; setEtat({ etape: 'echec', motif: c.motif, fichier: f.name }); return; }
    prete.current = { dataUri: c.dataUri, nom: f.name };
    await envoyer(c.dataUri, f.name);
  }

  function recuperer(g: RecuperationImport) {
    if (g === 'choisir') { champ.current?.click(); return; }
    if (g === 'reessayer') { if (prete.current) void envoyer(prete.current.dataUri, prete.current.nom); else champ.current?.click(); return; }
    setEtat({ etape: 'repos' });
    router.refresh();
  }

  return (
    <section aria-labelledby={`${id}-titre`} data-zone="import-photo" data-etape={etat.etape}
      onDragOver={(e) => { if (!raison) { e.preventDefault(); setSurvol(true); } }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); void traiter(e.dataTransfer.files?.[0]); }}
      style={{ ...carte, gap: 10, border: survol ? '2px dashed var(--accent-strong)' : '1px dashed var(--line)' }}>
      <h3 id={`${id}-titre`} style={{ ...titre, fontSize: 16 }}>Importer une photo depuis l’ordinateur</h3>
      <p id={`${id}-aide`} style={mini}>
        JPG, PNG ou WebP, compressée dans ton navigateur. Elle rejoint le catalogue {produit ? `de « ${produit.nom} »` : 'du produit'} et devient la photo épinglée du projet, avec les composants et les gestes ci-dessus · nouvelle version, aucun appel, aucun coût. Tu peux aussi la glisser ici.
      </p>
      <input ref={champ} id={`${id}-fichier`} type="file" accept={ACCEPT_PHOTO_IMPORT} tabIndex={-1} aria-hidden="true" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; void traiter(f); }} />
      {!peutModifier ? <p style={mini} data-raison="import">{raison}</p> : (
        <div style={rangee}>
          <button type="button" disabled={!!raison} aria-busy={enCours} aria-describedby={`${id}-aide${raison ? ` ${id}-raison` : ''}`}
            style={{ ...boutonPrimaire, ...(raison ? desactive : {}) }} onClick={() => champ.current?.click()} data-geste="importer">
            {enCours ? 'Import…' : 'Choisir une photo et l’épingler'}
          </button>
          {raison && <span id={`${id}-raison`} style={mini} data-raison="import">{raison}</span>}
        </div>
      )}
      {affichage && (
        <div role={affichage.role} style={signal(affichage.ton)} data-import={etat.etape} data-motif={etat.motif}>
          <span style={{ fontWeight: 600 }}>{affichage.titre} · </span>{affichage.texte}
          {affichage.recuperations.length > 0 && (
            <div style={{ ...rangee, marginTop: 10 }}>
              {affichage.recuperations.map((g) => (
                <button key={g} type="button" style={boutonSecondaire} onClick={() => recuperer(g)} data-recuperation={g}>{LIBELLES_RECUPERATION[g]}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
