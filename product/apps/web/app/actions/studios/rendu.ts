'use server';

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  erreurStudio, declinerDocument, FORMATS_DECLINAISON, PROFILS_CANAL,
  type ErreurStudio, type DocumentStudio, type ContenuVersion, type RapportDeclinaison, type FormatDeclinaison,
} from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { lireProjet, lireVersion, enregistrerVersion, type VersionStudio } from '../../../lib/studios/depot';
import { chargerMediasDocument } from '../../../lib/studios/rendu/medias';
import { rendreDocument } from '../../../lib/studios/rendu/compositeur';

/**
 * Studios · L5-A · rendu d'une version et déclinaison de format.
 *
 * `rendreApercu` est une LECTURE : garde `studio.read`, portée relue, médias
 * lus dans la marque du projet, rendu en mémoire. Rien n'est écrit (ni version,
 * ni média, ni audit, ni cache), aucun appel externe hors la lecture du
 * stockage, aucune dépense.
 *
 * `declinerFormat` crée UNE nouvelle version par RECOMPOSITION seule
 * (`declinerDocument`, noyau) via la commande L1 `enregistrerVersion` :
 * version de base obligatoire, 409 si elle n'est plus courante, l'ancienne
 * version reste intacte. Aucun devis, aucun job, aucune génération : une
 * extension de décor éventuelle est seulement PROPOSÉE dans le rapport.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

/** Largeur maximale d'un aperçu · 1080 (la largeur des formats publicitaires). */
const LARGEUR_APERCU_MAX = 1080;

async function versionDuProjet(ctx: Parameters<typeof lireProjet>[0], projectId: unknown, versionId: unknown) {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const vid = versionId ?? p.projet.currentVersionId;
  const v = await lireVersion(ctx, vid);
  if (!v.ok) return v;
  if (v.version.projectId !== p.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  return { ok: true as const, projet: p.projet, version: v.version };
}

function documentDe(v: VersionStudio): DocumentStudio | null {
  return (v.content as ContenuVersion | null)?.document ?? null;
}

export interface Apercu {
  versionId: string;
  largeur: number;
  hauteur: number;
  largeurApercu: number;
  hauteurApercu: number;
  /** PNG de l'aperçu en `data:` · jamais une URL de stockage. */
  image: string;
  /** Empreinte du rendu PLEINE taille (même document ⇒ même empreinte). */
  sha256: string;
  avertissements: string[];
}

export async function rendreApercu(entree: { projectId: unknown; versionId?: unknown; largeurMax?: unknown }): Promise<Reponse<{ apercu: Apercu }>> {
  const g = await gardeStudio('studio.read', 'editeur');
  if (!g.ok) return g;
  const pv = await versionDuProjet(g.ctx, entree?.projectId, entree?.versionId);
  if (!pv.ok) return pv;
  const doc = documentDe(pv.version);
  if (!doc) {
    return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: [{ chemin: '/document', raison: 'cette version n’a pas de document image' }] });
  }
  const m = await chargerMediasDocument(g.ctx, pv.projet, doc);
  if (!m.ok) return m;
  const r = await rendreDocument(doc, m.medias);
  if (!r.ok) {
    return r.code === 'INVALID_SCHEMA'
      ? erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: r.violations })
      : erreurStudio(r.code, { traceId: g.ctx.traceId, message: `${r.violations[0]?.raison ?? 'rendu impossible'} · corrige le document puis réessaie.` });
  }
  const demande = typeof entree?.largeurMax === 'number' && Number.isInteger(entree.largeurMax) ? entree.largeurMax : LARGEUR_APERCU_MAX;
  const largeurApercu = Math.max(16, Math.min(LARGEUR_APERCU_MAX, demande, doc.width));
  let png = r.png;
  let hauteurApercu = doc.height;
  if (largeurApercu < doc.width) {
    const { data, info } = await sharp(r.png).resize({ width: largeurApercu }).png().toBuffer({ resolveWithObject: true });
    png = data;
    hauteurApercu = info.height;
  }
  return {
    ok: true,
    apercu: {
      versionId: pv.version.id, largeur: doc.width, hauteur: doc.height, largeurApercu, hauteurApercu,
      image: `data:image/png;base64,${png.toString('base64')}`,
      sha256: createHash('sha256').update(r.png).digest('hex'),
      avertissements: r.avertissements,
    },
  };
}

export async function declinerFormat(entree: { projectId: unknown; baseVersionId: unknown; format: unknown; profil?: unknown }): Promise<Reponse<{ version: VersionStudio; inchange: boolean; rapport: RapportDeclinaison }>> {
  const g = await gardeStudio('studio.propose', 'editeur');
  if (!g.ok) return g;
  const format = entree?.format;
  const profil = entree?.profil ?? 'meta-reels';
  if (!FORMATS_DECLINAISON.includes(format as FormatDeclinaison) || typeof profil !== 'string' || !Object.prototype.hasOwnProperty.call(PROFILS_CANAL, profil)) {
    return erreurStudio('INVALID_SCHEMA', {
      traceId: g.ctx.traceId,
      violations: [{ chemin: 'format', raison: `format ${FORMATS_DECLINAISON.join(', ')} et profil ${Object.keys(PROFILS_CANAL).join(', ')}` }],
    });
  }
  if (entree?.baseVersionId == null) {
    return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  }
  const pv = await versionDuProjet(g.ctx, entree.projectId, entree.baseVersionId);
  if (!pv.ok) return pv;
  const contenu = pv.version.content as ContenuVersion;
  const doc = contenu.document;
  if (!doc) return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: [{ chemin: '/document', raison: 'cette version n’a pas de document image' }] });

  // Le produit est le calque qui porte la photo de la référence produit, s'il y en a une.
  const photo = contenu.productRef?.assetId ?? null;
  const produitIds = photo ? Object.values(doc.layers).filter((l) => l.kind === 'image' && l.assetId === photo).map((l) => l.id) : undefined;
  const r = declinerDocument(doc, profil, format as FormatDeclinaison, produitIds?.length ? { produitIds } : {});
  if (!r.ok) {
    const resume = r.violations.slice(0, 3).map((v) => v.raison).join(' ; ');
    return erreurStudio('INVARIANT_CONFLICT', {
      traceId: g.ctx.traceId,
      targetIds: [pv.projet.id, pv.version.id],
      message: `La recomposition en ${String(format)} ne tient pas (${resume}) · ajuste les textes ou le produit, rien n’a été créé.`,
    });
  }
  const raison = `Déclinaison ${r.rapport.format} (${r.rapport.profil} ${r.rapport.version}) depuis la version ${pv.version.n} · recomposition, aucune génération`;
  const e = await enregistrerVersion(g.ctx, {
    projectId: pv.projet.id,
    baseVersionId: entree.baseVersionId,
    changes: [{ op: 'replace', path: '/document', newValue: r.document, reason: raison }],
    allowedPaths: ['/document'],
    raison,
  });
  if (!e.ok) return e;
  return { ok: true, version: e.version, inchange: e.inchange, rapport: r.rapport };
}
