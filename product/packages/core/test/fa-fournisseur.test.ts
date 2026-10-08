import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  plafondDepenseUsd, PLAFOND_DEFAUT_USD, coutSoumissionImage, idDepenseDuJob, jobDeCleFournisseur, debutFenetrePlafond,
  requeteFalImage, parametresImageDuDevis, lireParametresImage, ratioFal, corpsFalImage, contientEmplacement,
  issueStatutSoumission, issueErreurReseau, lireSoumissionFal, idRequeteFal, lireIdRequeteFal, urlSoumissionFal,
  lireStatutFal, lireResultatFal, urlSortieFalSure, indiceSortieFal, refSortieFal,
  decisionFournisseurStudio, delaiSondageMs, SONDAGE_MAX_MS,
  type MediaResolu,
} from '../src/studios/fournisseurs';
import { cleFournisseurDuJob, GRILLE_STUDIO } from '../src/studios/execution';
import { FIXED_COSTS, checkBudget } from '../src/spend-guard';

/**
 * F-A · règles pures du fournisseur image réel. Chaque garde lit une VALEUR
 * rendue (corps fal, décision, classement) · les réponses fal rejouées sont
 * écrites à la main d'après la documentation publique de la file fal (voir
 * docs/studios-v2/F-FOURNISSEUR-IMAGE.md, « Provenance des fixtures »).
 */

const JOB = '0b8a7e8e-5b2c-4f0e-9d5e-4b1c2a3d4e5f';
const SHA_P = createHash('sha256').update('photo').digest('hex');
const SHA_S = createHash('sha256').update('style').digest('hex');

const consigne = {
  generationInstruction: 'Lunettes posées sur une table en chêne, lumière du matin.',
  negativeConstraints: ['ni le logo de l’annonceur source'],
  referenceBindings: [{ referenceId: 'sta_style', role: 'style', scope: 'background' }, { referenceId: 'pph_a', role: 'product', scope: 'product' }],
  protectedComponents: ['bandeau'],
  needsDeterministicOverlay: true,
};
const parametres = () => parametresImageDuDevis({
  consigne,
  references: [{ assetId: 'pph_a', assetVersion: 'sha256-x', sha256: SHA_P, role: 'product' }, { assetId: 'sta_style', assetVersion: 'sha256-y', sha256: SHA_S, role: 'style' }],
  largeur: 1080, hauteur: 1350, promptRunId: null,
});
const medias = (): MediaResolu[] => [
  { assetId: 'pph_a', etat: 'autorise', url: 'https://cdn.marque.test/p.png', sha256: SHA_P },
  { assetId: 'sta_style', etat: 'autorise', url: 'https://s3.test/b/style.png', sha256: SHA_S },
];
const ops = [{ operation: 'keyframe:s1', profil: 'image_generation' as const }, { operation: 'composition', profil: 'calcul' as const }];
const modeles = { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' };

describe('plafond du worker · même règle que la barrière web', () => {
  it('AI_SPEND_CAP_USD lu comme spendCapUsd (défaut 50, illisible ⇒ défaut, jamais l’infini)', () => {
    expect([undefined, '', '20', '0', 'beaucoup', '-5', 'NaN', 'Infinity'].map((v) => plafondDepenseUsd(v))).toEqual([50, 50, 20, 0, 50, 50, 50, 50]);
    expect(PLAFOND_DEFAUT_USD).toBe(50);
  });

  it('le coût d’une soumission vient de la grille (FIXED_COSTS.fal_image par image), les nœuds calcul ne coûtent rien', () => {
    expect(coutSoumissionImage(ops)).toEqual({ ok: true, usd: FIXED_COSTS.fal_image, usdMicros: GRILLE_STUDIO.image_generation.usdMicros, images: 1 });
    expect(coutSoumissionImage([{ operation: 'clip:s1', profil: 'animation' }])).toMatchObject({ ok: false });
    expect(coutSoumissionImage([{ operation: 'composition', profil: 'calcul' }])).toMatchObject({ ok: false });
  });

  it('une ligne ai_spend par job : identifiant dérivé, stable, au format UUID', () => {
    const a = idDepenseDuJob(JOB);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idDepenseDuJob(JOB)).toBe(a);
    expect(idDepenseDuJob(JOB.replace('0b', '0c'))).not.toBe(a);
    expect(jobDeCleFournisseur(cleFournisseurDuJob(JOB))).toBe(JOB);
    expect(jobDeCleFournisseur('tt-studio-pas-un-uuid')).toBeNull();
  });

  it('fenêtre glissante de 30 jours', () => {
    expect(debutFenetrePlafond(new Date('2026-10-31T00:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('checkBudget refuse au-delà du plafond (décision partagée)', () => {
    expect(checkBudget({ spentUsd: 9.95, capUsd: 10 }, 0.08).allowed).toBe(false);
  });
});

describe('paramètres natifs · du job aux paramètres fal', () => {
  it('consigne + médias autorisés + format ⇒ corps Nano Banana edit, produit d’abord, contraintes intégrées', () => {
    const r = requeteFalImage({ operations: ops, parametres: parametres(), medias: medias(), modeles });
    if (!r.ok) throw new Error(r.motif);
    expect(r.modele).toBe('fal-ai/nano-banana-2/edit');
    expect(r.corps.image_urls).toEqual(['https://cdn.marque.test/p.png', 'https://s3.test/b/style.png']);
    expect(r.corps.aspect_ratio).toBe('4:5');
    expect(r.corps.num_images).toBe(1);
    expect(String(r.corps.prompt)).toContain('Lunettes posées');
    expect(String(r.corps.prompt)).toContain('Composants à préserver à l’identique : bandeau');
    expect(String(r.corps.prompt)).toContain('À éviter absolument : ni le logo');
    expect(r.operations).toEqual(['keyframe:s1']);
    expect(r.limites).toContain('instruction négative non supportée par le modèle · intégrée à la consigne');
    // Empreinte du corps EXPURGÉ : aucune adresse, identifiants et empreintes à la place.
    expect(JSON.stringify(r.expurge)).not.toContain('https://');
    expect(r.expurge.image_urls).toEqual([{ assetId: 'pph_a', sha256: SHA_P }, { assetId: 'sta_style', sha256: SHA_S }]);
    expect(r.empreinte).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sans référence liée ⇒ modèle de génération, sans image', () => {
    const p = parametresImageDuDevis({ consigne: { ...consigne, referenceBindings: [] }, references: [], largeur: 1080, hauteur: 1920 });
    const r = requeteFalImage({ operations: ops, parametres: p, medias: [], modeles });
    expect(r).toMatchObject({ ok: true, modele: 'fal-ai/nano-banana-2', corps: { aspect_ratio: '9:16' } });
    expect(r.ok && 'image_urls' in r.corps).toBe(false);
  });

  it('instantané sans consigne (parametres: {}) ⇒ bloqué, rien de complété', () => {
    expect(requeteFalImage({ operations: ops, parametres: {}, medias: medias(), modeles })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
  });

  it('média révoqué, d’une autre marque, modifié ou sans média ⇒ bloqué, AUCUNE substitution', () => {
    const cas: MediaResolu[][] = [
      [medias()[0]!],
      [medias()[0]!, { assetId: 'sta_style', etat: 'absent', motif: 'retiré' }],
      [medias()[0]!, { ...medias()[1]!, sha256: SHA_P } as MediaResolu],
      [medias()[0]!, { assetId: 'sta_style', etat: 'sans_media', motif: 'source concurrente' }],
      [medias()[0]!, { assetId: 'sta_style', etat: 'autorise', url: 'http://interne/x.png', sha256: SHA_S }],
    ];
    for (const m of cas) {
      const r = requeteFalImage({ operations: ops, parametres: parametres(), medias: m, modeles });
      expect(r, JSON.stringify(m)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE', cibles: ['sta_style'] });
    }
  });

  it('emplacement non résolu ⇒ bloqué', () => {
    const p = parametres();
    p.consigne.generationInstruction = 'Produit {{ produit.nom }} sur fond';
    expect(requeteFalImage({ operations: ops, parametres: p, medias: medias(), modeles })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(contientEmplacement('${x}')).toBe(true);
    expect(contientEmplacement('{x}')).toBe(false);
  });

  it('liaison vers une référence non transmise à la tâche ⇒ bloqué', () => {
    const p = parametres();
    p.consigne.referenceBindings.push({ referenceId: 'pph_inconnue', role: 'product', scope: 'product' });
    expect(lireParametresImage(p).ok).toBe(false);
  });

  it('animation, voix, ou plus de 4 images ⇒ capacité refusée', () => {
    expect(requeteFalImage({ operations: [{ operation: 'clip:s1', profil: 'animation' }], parametres: parametres(), medias: medias(), modeles })).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    const cinq = Array.from({ length: 5 }, (_, i) => ({ operation: `keyframe:s${i}`, profil: 'image_generation' as const }));
    expect(requeteFalImage({ operations: cinq, parametres: parametres(), medias: medias(), modeles })).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
  });

  it('modèle à image de départ unique avec deux références ⇒ refusé (aucune référence lâchée en silence)', () => {
    const r = requeteFalImage({ operations: ops, parametres: parametres(), medias: medias(), modeles: { generation: 'fal-ai/flux/dev', edition: 'fal-ai/flux/dev/image-to-image' } });
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
  });

  it('ratio · le plus proche des ratios déjà servis', () => {
    expect(ratioFal(1080, 1350)).toEqual({ ratio: '4:5', exact: true });
    expect(ratioFal(1000, 1000)).toEqual({ ratio: '1:1', exact: true });
    expect(ratioFal(1200, 628).ratio).toBe('16:9');
    expect(corpsFalImage({ modele: 'openai/gpt-image-2/edit', prompt: 'p', ratio: '4:5', references: ['https://a/x.png'], images: 2 })).toEqual({ prompt: 'p', num_images: 2, image_size: 'portrait_4_3', image_urls: ['https://a/x.png'] });
  });
});

describe('file fal · certain ou incertain selon le statut ET le moment', () => {
  it('statut de la soumission', () => {
    expect([200, 202, 400, 401, 404, 422, 429, 500, 502, 503, 504, 302].map(issueStatutSoumission))
      .toEqual(['acceptee', 'acceptee', 'certaine', 'certaine', 'certaine', 'certaine', 'certaine', 'certaine', 'incertaine', 'certaine', 'incertaine', 'certaine']);
  });

  it('erreur réseau avant réponse : certaine seulement si rien n’a pu partir', () => {
    const avec = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: { code } });
    expect(issueErreurReseau(avec('ENOTFOUND'))).toBe('certaine');
    expect(issueErreurReseau(avec('ECONNREFUSED'))).toBe('certaine');
    expect(issueErreurReseau(avec('ECONNRESET'))).toBe('incertaine');
    expect(issueErreurReseau(new DOMException('timeout', 'TimeoutError'))).toBe('incertaine');
    expect(issueErreurReseau(new Error('?'))).toBe('incertaine');
  });

  it('identifiant de requête · clé du job + suivi reconstruit, hôte en liste blanche', () => {
    const s = lireSoumissionFal({
      request_id: 'req-123', status_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123/status',
      response_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123', cancel_url: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123/cancel',
    })!;
    const id = idRequeteFal(cleFournisseurDuJob(JOB), 'fal-ai/nano-banana-2/edit', s, null)!;
    const lu = lireIdRequeteFal(id, null)!;
    expect(lu).toEqual({
      cle: cleFournisseurDuJob(JOB),
      statusUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123/status',
      responseUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123',
      annulationUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123/cancel',
    });
    // URL de suivi forgée vers un autre hôte : on retombe sur la file officielle, jamais l'hôte forgé.
    const forge = idRequeteFal(cleFournisseurDuJob(JOB), 'fal-ai/nano-banana-2/edit', { ...s, statusUrl: 'https://evil.test/x/requests/req-123/status', responseUrl: 'https://evil.test/x/requests/req-123' }, null)!;
    expect(lireIdRequeteFal(forge, null)!.statusUrl.startsWith('https://queue.fal.run/')).toBe(true);
    expect(lireIdRequeteFal(`${cleFournisseurDuJob(JOB)} falq|https://evil.test/a/requests/r/status|https://evil.test/a/requests/r`, null)).toBeNull();
    expect(lireSoumissionFal({ status: 'IN_QUEUE' })).toBeNull();
    expect(urlSoumissionFal(null, 'fal-ai/nano-banana-2/edit')).toBe('https://queue.fal.run/fal-ai/nano-banana-2/edit');
    expect(urlSoumissionFal('https://10.0.0.1', 'fal-ai/x')).toBe('https://queue.fal.run/fal-ai/x');
    expect(urlSoumissionFal(null, '../x')).toBeNull();
  });

  it('statut et résultat', () => {
    expect(lireStatutFal(202, { status: 'IN_QUEUE', queue_position: 3 })).toEqual({ etat: 'en_cours', progression: 0 });
    expect(lireStatutFal(202, { status: 'IN_PROGRESS', logs: [] })).toEqual({ etat: 'en_cours' });
    expect(lireStatutFal(200, { status: 'COMPLETED' })).toEqual({ etat: 'termine' });
    expect(lireStatutFal(404, {}).etat).toBe('inconnu');
    expect(lireStatutFal(503, {}).etat).toBe('transitoire');
    expect(lireResultatFal(200, { images: [{ url: 'https://v3.fal.media/files/a.png', content_type: 'image/png' }] })).toEqual({ etat: 'reussi', urls: ['https://v3.fal.media/files/a.png'] });
    expect(lireResultatFal(422, { detail: [{ msg: 'invalid image_urls' }] })).toMatchObject({ etat: 'echoue', facture: false });
    expect(lireResultatFal(200, { images: [] })).toMatchObject({ etat: 'echoue', facture: true });
    expect(lireResultatFal(400, { detail: 'Request was cancelled' })).toEqual({ etat: 'annule', facture: true });
    expect(lireResultatFal(500, {}).etat).toBe('transitoire');
  });

  it('sorties téléchargeables seulement depuis les hôtes fal, jamais une IP ni un port', () => {
    expect(urlSortieFalSure('https://v3.fal.media/files/a.png')).not.toBeNull();
    expect(urlSortieFalSure('https://fal.media/files/a.png')).not.toBeNull();
    for (const u of ['http://v3.fal.media/a.png', 'https://evilfal.media/a', 'https://169.254.169.254/x', 'https://v3.fal.media:8443/a', 'https://u:p@fal.media/a', 'https://fal.media.evil.test/a']) {
      expect(urlSortieFalSure(u), u).toBeNull();
    }
    expect(indiceSortieFal(refSortieFal(2))).toBe(2);
    expect(indiceSortieFal('https://x')).toBeNull();
  });
});

describe('choix du fournisseur · réel seulement quand tout est vrai', () => {
  const S3 = { S3_ENDPOINT: 's3.test', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' };
  it('refus sans clé, avec la clé de simulation, hors production sans autorisation, sans stockage', () => {
    expect(decisionFournisseurStudio({ NODE_ENV: 'production', ...S3 })).toMatchObject({ ok: false });
    expect(decisionFournisseurStudio({ NODE_ENV: 'production', FAL_KEY: 'simule-local-sans-reseau', ...S3 })).toMatchObject({ ok: false });
    expect(decisionFournisseurStudio({ NODE_ENV: 'development', FAL_KEY: 'id:secret', ...S3 })).toMatchObject({ ok: false });
    expect(decisionFournisseurStudio({ NODE_ENV: 'production', FAL_KEY: 'id:secret' })).toMatchObject({ ok: false });
  });
  it('production ou autorisation explicite ⇒ fal, modèles des variables existantes', () => {
    expect(decisionFournisseurStudio({ NODE_ENV: 'production', FAL_KEY: 'id:secret', ...S3 })).toMatchObject({ ok: true, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' } });
    expect(decisionFournisseurStudio({ NODE_ENV: 'test', STUDIO_FOURNISSEUR_REEL: 'autorise', FAL_KEY: 'id:secret', FAL_IMAGE_MODEL_EDIT: 'openai/gpt-image-2/edit', ...S3 })).toMatchObject({ ok: true, modeles: { edition: 'openai/gpt-image-2/edit' } });
  });
  it('recul du sondage borné', () => {
    expect([0, 1, 2, 3, 4, 9].map(delaiSondageMs)).toEqual([2000, 4000, 8000, 15000, 15000, SONDAGE_MAX_MS]);
  });
});
