/**
 * Studios · L5 · RÉFÉRENCES TYPÉES (cahier 01 §4.4 point 2 ; recette IMG-04).
 *
 * Pur. Chaque fichier porte un rôle EXPLICITE : Produit, Identité personnage,
 * Style, Composition, Logo ou Élément à intégrer. Un même fichier avec deux
 * rôles = deux associations explicites. AUCUN rôle n'est déduit : sans rôle
 * choisi, rien n'est associé.
 *
 * Les associations vivent dans `brief.references` (le `Reference` du contrat :
 * assetId, version, empreinte, rôle, portée, changements permis, composants
 * requis). L'unicité est (fichier, rôle), pas le fichier seul.
 *
 * ── Référence concurrente ────────────────────────────────────────────────────
 *
 * Une source du projet (annonce d'un concurrent) ne peut servir que de STYLE
 * ou de COMPOSITION, appliqués au décor ou à l'image entière. Jamais Produit,
 * Identité, Logo ni Élément à intégrer, jamais sur le produit ni le sujet : on
 * n'en transfère ni le sujet, ni le personnage, ni le produit, ni le logo.
 */

import type { ViolationStudio } from '../document';
import type { PorteeReference, ReferenceBrief, RoleReference } from '../brief';
import type { FichierCatalogue } from './catalogue';
import { associationProduit, type ReferenceProduitEpinglee } from './epinglage';

export const ROLES_REFERENCE: readonly RoleReference[] = ['product', 'identity', 'style', 'composition', 'logo', 'integrate'];
export const PORTEES_REFERENCE: readonly PorteeReference[] = ['product', 'subject', 'background', 'global'];

export const LIBELLES_ROLE: Readonly<Record<RoleReference, string>> = {
  product: 'Produit',
  identity: 'Identité personnage',
  style: 'Style',
  composition: 'Composition',
  logo: 'Logo',
  integrate: 'Élément à intégrer',
};

export const LIBELLES_PORTEE: Readonly<Record<PorteeReference, string>> = {
  product: 'Produit',
  subject: 'Sujet',
  background: 'Décor',
  global: 'Image entière',
};

/** Ce que chaque rôle autorise à reprendre · dit à l'écran, à côté du choix. */
export const EFFET_ROLE: Readonly<Record<RoleReference, string>> = {
  product: 'Le produit tel quel, photographique · ses composants obligatoires sont contrôlés.',
  identity: 'Les traits du personnage (visage, cheveux, tenue) · pas le décor.',
  style: 'Matière, lumière, palette · ni le sujet, ni le produit, ni le logo.',
  composition: 'Le placement et le cadrage · ni le sujet, ni le produit, ni le logo.',
  logo: 'Le logo, posé tel quel par un calque · jamais redessiné.',
  integrate: 'L’objet du fichier, intégré dans la scène.',
};

export const ROLES_PERMIS_CONCURRENT: readonly RoleReference[] = ['style', 'composition'];
export const PORTEES_PERMISES_CONCURRENT: readonly PorteeReference[] = ['background', 'global'];
/** Provenances qui appartiennent à la marque · seules elles portent un logo. */
const PROVENANCES_MARQUE = new Set(['logo', 'bibliotheque', 'studio', 'produit']);
export const ASSOCIATIONS_MAX = 100;

export const estRole = (x: unknown): x is RoleReference => typeof x === 'string' && (ROLES_REFERENCE as readonly string[]).includes(x);
export const estPortee = (x: unknown): x is PorteeReference => typeof x === 'string' && (PORTEES_REFERENCE as readonly string[]).includes(x);

/**
 * Les règles d'UNE association (fichier, rôle, portée) · indépendantes de la
 * liste. Rejouées sur chaque association stockée avant compilation : une ligne
 * altérée hors de l'écran ne passe pas.
 */
export function violationsAssociation(
  f: FichierCatalogue, role: unknown, scope: unknown, produit: ReferenceProduitEpinglee | null, chemin = 'association',
): ViolationStudio[] {
  const v: ViolationStudio[] = [];
  if (!estRole(role)) return [{ chemin: `${chemin}/role`, raison: 'choisis un rôle explicite · aucun rôle n’est déduit du fichier' }];
  if (!estPortee(scope)) return [{ chemin: `${chemin}/scope`, raison: 'choisis une portée explicite' }];
  if (f.provenance === 'concurrent') {
    if (!ROLES_PERMIS_CONCURRENT.includes(role)) v.push({ chemin: `${chemin}/role`, raison: 'une annonce concurrente ne sert que de Style ou de Composition · ni produit, ni personnage, ni logo, ni élément à intégrer' });
    if (!PORTEES_PERMISES_CONCURRENT.includes(scope)) v.push({ chemin: `${chemin}/scope`, raison: 'le style d’une annonce concurrente s’applique au décor ou à l’image entière, jamais au produit ni au sujet' });
  }
  if (role === 'product') {
    if (!produit) v.push({ chemin: `${chemin}/role`, raison: 'épingle d’abord le produit et sa photo' });
    else if (f.provenance !== 'produit' || f.productId !== produit.productId) v.push({ chemin: `${chemin}/role`, raison: 'le rôle Produit est réservé aux photos du produit épinglé' });
    if (scope !== 'product') v.push({ chemin: `${chemin}/scope`, raison: 'une référence Produit porte sur le produit' });
  }
  if (role === 'logo' && !PROVENANCES_MARQUE.has(f.provenance)) v.push({ chemin: `${chemin}/role`, raison: 'un logo vient de la marque, jamais d’une source' });
  return v;
}

export interface DemandeAssociation { assetId: unknown; role: unknown; scope: unknown }

export type ResultatAssociations = { ok: true; references: ReferenceBrief[] } | { ok: false; violations: ViolationStudio[] };

/**
 * Ajoute UNE association · le fichier vient du catalogue serveur, le rôle et
 * la portée de l'utilisateur. (fichier, rôle) déjà présent : refus explicite ;
 * même fichier avec un AUTRE rôle : seconde association.
 */
export function ajouterAssociation(
  refs: readonly ReferenceBrief[], d: DemandeAssociation, fichiers: ReadonlyMap<string, FichierCatalogue>, produit: ReferenceProduitEpinglee | null,
): ResultatAssociations {
  const f = typeof d.assetId === 'string' ? fichiers.get(d.assetId) : undefined;
  if (!f) return { ok: false, violations: [{ chemin: 'association/assetId', raison: 'fichier absent du catalogue de la marque ou des sources du projet' }] };
  const v = violationsAssociation(f, d.role, d.scope, produit);
  if (v.length) return { ok: false, violations: v };
  const role = d.role as RoleReference;
  if (refs.some((r) => r.assetId === f.assetId && r.role === role)) return { ok: false, violations: [{ chemin: 'association', raison: `ce fichier porte déjà le rôle ${LIBELLES_ROLE[role]}` }] };
  if (refs.length >= ASSOCIATIONS_MAX) return { ok: false, violations: [{ chemin: 'association', raison: `${ASSOCIATIONS_MAX} associations au plus` }] };
  const nouvelle: ReferenceBrief = role === 'product' && produit && f.assetId === produit.photo.assetId
    ? associationProduit(produit)
    : {
      assetId: f.assetId, assetVersion: f.assetVersion, sha256: f.sha256, role, scope: d.scope as PorteeReference,
      allowedChanges: role === 'product' && produit ? [...produit.transformationsAutorisees] : [],
      requiredComponents: role === 'product' && produit ? [...produit.composantsObligatoires] : [],
    };
  return { ok: true, references: [...refs, nouvelle] };
}

/** Retire l'association (fichier, rôle) · l'association Produit de la photo épinglée ne se retire pas ici. */
export function retirerAssociation(refs: readonly ReferenceBrief[], d: { assetId: unknown; role: unknown }, produit: ReferenceProduitEpinglee | null): ResultatAssociations {
  if (!estRole(d.role) || typeof d.assetId !== 'string') return { ok: false, violations: [{ chemin: 'association', raison: 'association illisible' }] };
  if (d.role === 'product' && produit && d.assetId === produit.photo.assetId) {
    return { ok: false, violations: [{ chemin: 'association', raison: 'la photo épinglée reste la référence Produit · épingle une autre photo pour la changer' }] };
  }
  const reste = refs.filter((r) => !(r.assetId === d.assetId && r.role === d.role));
  if (reste.length === refs.length) return { ok: false, violations: [{ chemin: 'association', raison: 'association introuvable' }] };
  return { ok: true, references: reste };
}

/**
 * Contrôle de TOUTES les associations stockées contre le catalogue ACTUEL ·
 * fichier connu, même version et même empreinte, règles du rôle, unicité
 * (fichier, rôle).
 */
export function controlerAssociations(refs: readonly ReferenceBrief[], fichiers: ReadonlyMap<string, FichierCatalogue>, produit: ReferenceProduitEpinglee | null): ViolationStudio[] {
  const v: ViolationStudio[] = [];
  const vus = new Set<string>();
  refs.forEach((r, i) => {
    const c = `/brief/references/${i}`;
    const cle = `${r.assetId}|${r.role}`;
    if (vus.has(cle)) v.push({ chemin: c, raison: 'même fichier, même rôle, deux fois' });
    vus.add(cle);
    const f = fichiers.get(r.assetId);
    if (!f) { v.push({ chemin: `${c}/assetId`, raison: 'fichier qui n’est plus dans le catalogue ni dans les sources du projet' }); return; }
    if (f.assetVersion !== r.assetVersion || f.sha256 !== r.sha256) v.push({ chemin: `${c}/sha256`, raison: 'version ou empreinte différente du fichier actuel' });
    v.push(...violationsAssociation(f, r.role, r.scope, produit, c));
  });
  return v;
}
