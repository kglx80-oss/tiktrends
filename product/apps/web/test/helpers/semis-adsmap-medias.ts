/**
 * Le semis Adsmap des gardes `adresses-brutes-*` (pages #1007/#1019, points
 * d'entrée #1010) · un seul semis, pour que les deux gardes éprouvent les MÊMES
 * cas sur les médias d'une ad (lien, vignette de la créa, brief) :
 *  - une GAGNANTE arbitrée (verdict validé, comparable, apprentissage), rangée
 *    dans le lot, dont le « Lien de l'Ad », la miniature de sa créa et le « Lien
 *    du Brief créa » sont des objets du stockage de l'espace ;
 *  - dans le même lot, deux ads de la marque portant la créa d'une AUTRE marque
 *    (miniature au stockage, miniature de régie) · la première a aussi un lien
 *    Drive (candidate à la vignette du lot), et passe avant la gagnante ;
 *  - la plus petite variante du lot, qui n'a qu'un lien Drive (pas une image) ;
 *  - une seconde GAGNANTE, hors lot, qui porte la créa d'une autre marque · elle
 *    est proposée par Itérer et l'Accueil (prochaines itérations), qui lisent la
 *    créa par leur propre requête · sans elle, une jointure non bornée dans ces
 *    fichiers ne se verrait sur aucun écran.
 * Les identifiants des deux plus petites variantes sont FIXÉS (l'ordre des
 * candidates à la vignette du lot suit l'identifiant). Le semis n'écrit que la
 * base · les octets des objets, chaque garde les range dans son faux bucket.
 */

// Le client drizzle et le schéma sont ceux de la garde · le semis n'en lit que les tables Adsmap.
type Db = any;
type Schema = any;

/** La plus petite variante du lot · une page de partage Drive, pas une image · la vignette du lot passe à la suivante. */
export const AD_DRIVE = '00000000-0000-4000-8000-000000000001';
/** La suivante · la créa d'une AUTRE marque (miniature au stockage) et un lien Drive · candidate à la vignette, jamais montrée. */
export const AD_ETRANGERE = '00000000-0000-4000-8000-000000000002';
/** La miniature de régie d'une créa d'une autre marque · externe, elle ne doit pas sortir non plus. */
export const MINI_ETRANGERE_EXTERNE = 'https://cdn.autre-marque.test/mini.jpg';
const DRIVE = 'https://drive.google.com/file/d/1AbC/view';

/** Les objets du stockage de l'espace que le semis nomme · `objet(nom)` les place sous `assets/<espace>/`. */
export function objetsAdsmap(objet: (n: string) => string) {
  return {
    /** Le « Lien de l'Ad » de la gagnante. */
    lien: objet('1700000000007-44444444-gagnante.png'),
    /** La miniature de la créa de la gagnante. */
    vignetteCrea: objet('1700000000004-2b3c4d5e-vignette.jpg'),
    /** Le « Lien du Brief créa » de la gagnante. */
    brief: objet('1700000000005-3c4d5e6f-brief.png'),
    /** La miniature, au stockage, d'une créa d'une autre marque collée sur une ad du lot. */
    miniEtrangere: objet('1700000000006-4d5e6f70-autre-marque.jpg'),
    /** La miniature, au stockage, de la créa d'une autre marque collée sur la seconde gagnante. */
    miniGagnanteEtrangere: objet('1700000000010-5e6f7081-gagnante-autre-marque.jpg'),
  };
}
export type ObjetsAdsmap = ReturnType<typeof objetsAdsmap>;

export type SemisAdsmap = {
  persona: string; desire: string; angle: string; concept: string;
  /** La gagnante rangée au lot (lien, créa, brief au stockage). */
  ad: string;
  /** Les deux ads du lot qui portent la créa d'une autre marque (miniature au stockage · de régie). */
  adEtrangere: string; adEtrangereExterne: string;
  /** La gagnante hors lot qui porte la créa d'une autre marque. */
  gagnanteEtrangere: string;
};

export async function semerAdsmapMedias(db: Db, schema: Schema, p: {
  workspaceId: string; brandId: string; autreMarqueId: string; lotId: string; objets: ObjetsAdsmap;
}): Promise<SemisAdsmap> {
  const { workspaceId, brandId, autreMarqueId, lotId, objets: o } = p;
  // La chaîne · persona → désir → angle → concept.
  const [pe] = await db.insert(schema.personas).values({ brandId, name: 'Persona' }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId, personaId: pe.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId, desireId: de.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId, angleId: an.id, title: 'Concept' }).returning();
  const crea = async (marque: string, thumbUrl: string) =>
    (await db.insert(schema.creatives).values({ brandId: marque, fingerprintHash: `adsmap:${thumbUrl}`, type: 'image', thumbUrl }).returning({ id: schema.creatives.id }))[0].id as string;
  const gagnante = async (adId: string, statement: string) => {
    await db.insert(schema.verdicts).values({ adId, workspaceId, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { roas: 2.4, spend: 120, purchases: 6, daysElapsed: 7 } });
    await db.insert(schema.learnings).values({ workspaceId, brandId, adId, scope: 'ad', statement, status: 'validated' });
  };

  const [ad] = await db.insert(schema.ads).values({
    workspaceId, conceptId: co.id, batchId: lotId, creativeId: await crea(brandId, o.vignetteCrea), variantCode: 'V1', status: 'done',
    hypothesis: 'Si on montre la preuve d’abord, alors on convertit mieux.', testedVariable: 'proof', assetUrl: o.lien, briefUrl: o.brief,
  }).returning({ id: schema.ads.id });
  await gagnante(ad.id, 'Une preuve en ouverture convertit mieux.');

  await db.insert(schema.ads).values({ id: AD_DRIVE, workspaceId, conceptId: co.id, batchId: lotId, variantCode: 'V0', assetUrl: DRIVE });
  await db.insert(schema.ads).values({ id: AD_ETRANGERE, workspaceId, conceptId: co.id, batchId: lotId, creativeId: await crea(autreMarqueId, o.miniEtrangere), variantCode: 'V2', assetUrl: DRIVE });
  const [e2] = await db.insert(schema.ads).values({ workspaceId, conceptId: co.id, batchId: lotId, creativeId: await crea(autreMarqueId, MINI_ETRANGERE_EXTERNE), variantCode: 'V3' }).returning({ id: schema.ads.id });

  const [ge] = await db.insert(schema.ads).values({
    workspaceId, conceptId: co.id, creativeId: await crea(autreMarqueId, o.miniGagnanteEtrangere), variantCode: 'V4', status: 'done',
    hypothesis: 'Si l’accroche nomme le problème, alors on retient mieux.', testedVariable: 'hook',
  }).returning({ id: schema.ads.id });
  await gagnante(ge.id, 'Une accroche qui nomme le problème retient mieux.');

  return { persona: pe.id, desire: de.id, angle: an.id, concept: co.id, ad: ad.id, adEtrangere: AD_ETRANGERE, adEtrangereExterne: e2.id, gagnanteEtrangere: ge.id };
}

/** Ce qu'aucun écran ni point d'entrée ne doit montrer des créas d'une autre marque · leurs miniatures (adresse, clé) et la route gardée qui les nommerait. */
export function interditsCreasEtrangeres(s: SemisAdsmap, o: ObjetsAdsmap, cleDe: (u: string) => string): string[] {
  return [
    `/api/adsmap/${s.adEtrangere}/apercu`, `/api/adsmap/${s.adEtrangereExterne}/apercu`, `/api/adsmap/${s.gagnanteEtrangere}/apercu`,
    'cdn.autre-marque.test', cleDe(o.miniEtrangere), cleDe(o.miniGagnanteEtrangere),
  ];
}
