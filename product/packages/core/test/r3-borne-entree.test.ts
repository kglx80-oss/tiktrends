import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  octetsUtf8, mesurerRequete, borneJetonsEntree, borneMaxAppel, estimateCallCost, costOfTokens, requeteDepuisMessagesCompiles, depasseMontantApprouve,
  qualifierTotal, causeIncertaine, vueReconciliation, reessaiPermis, VISION_JETONS_IMAGE_MAX, JETONS_CADRE_REQUETE, JETONS_CADRE_BLOC,
  JETONS_ENTREE_MAX_PROPOSITION, JETONS_SORTIE_MAX_PROPOSITION,
} from '../src';

/**
 * R3 · règles PURES de la dépense prudente (`depense-prudente.ts`).
 * Chaque garde lit une VALEUR rendue.
 */

describe('octets UTF-8 · la base de la borne', () => {
  const corpus = ['', 'abc', 'é à « · »', '漢字かな', '🔥✨😍🚀💯', 'a\uD83D', '\uDE00z', 'x'.repeat(1000) + '😀'];
  it.each(corpus)('octetsUtf8(%j) = Buffer.byteLength', (s) => {
    expect(octetsUtf8(s)).toBe(Buffer.byteLength(s, 'utf8'));
  });
});

/**
 * Jetons MESURÉS hors ligne avec le seul tokenizer Claude publié
 * (`@anthropic-ai/tokenizer` 0.0.4) · le tableau complet est dans
 * `depense-prudente.ts`. L'estimation à 3,5 caractères par jeton passe SOUS ces
 * comptes ; la borne en octets jamais.
 */
const MESURES: Array<{ nom: string; texte: string; jetons: number }> = [
  { nom: 'emojis', texte: '😀🎉🔥✨🚀'.repeat(2000), jetons: 22_000 },
  { nom: 'CJK', texte: '漢字かなカナ한국어'.repeat(2000), jetons: 24_000 },
  { nom: 'accents', texte: 'éàèùçœæÉÀ«»·’'.repeat(3000), jetons: 42_000 },
  { nom: 'contrôle', texte: Array.from({ length: 5000 }, (_, i) => String.fromCharCode(i % 32)).join(''), jetons: 4_844 },
];

describe('borne d’entrée · jamais sous les jetons mesurés, contrairement à l’estimation', () => {
  it.each(MESURES)('$nom · borne ≥ jetons mesurés > estimation à 3,5 car./jeton', ({ nom, texte, jetons }) => {
    const p = { model: 'claude-sonnet-5', max_tokens: 0, messages: [{ role: 'user', content: texte }] };
    const borne = borneJetonsEntree(mesurerRequete(p));
    expect(borne, `${nom} · la borne passe sous les ${jetons} jetons mesurés · ce n’est pas une borne`).toBeGreaterThanOrEqual(jetons);
    expect(Math.ceil(texte.length / 3.5), `${nom} · l’estimation tenait · la mesure ne montre plus rien`).toBeLessThan(jetons);
  });

  it('cadres, outils et images comptés · la borne d’un appel avec image et outil', () => {
    const p = {
      model: 'claude-sonnet-5', max_tokens: 100, system: 'Système',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x'.repeat(1_000_000) } }, { type: 'text', text: 'Décris.' }] }],
      tools: [{ name: 'o', input_schema: { type: 'object' } }],
    };
    const m = mesurerRequete(p);
    expect(m).toEqual({ octets: octetsUtf8('Système') + octetsUtf8('Décris.'), images: 1, blocs: 4, octetsOutils: octetsUtf8(JSON.stringify(p.tools)) });
    expect(borneMaxAppel(p)).toBe(costOfTokens('claude-sonnet-5', borneJetonsEntree(m), 100));
    expect(borneJetonsEntree(m)).toBe(JETONS_CADRE_REQUETE + 4 * JETONS_CADRE_BLOC + m.octets + VISION_JETONS_IMAGE_MAX + 1_060 + 2 * m.octetsOutils);
  });

  it('modèle inconnu ⇒ présumé cher (même règle que la barrière)', () => {
    const p = { model: 'modele-inconnu', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] };
    expect(borneMaxAppel(p)).toBeGreaterThan(borneMaxAppel({ ...p, model: 'claude-sonnet-5' }));
  });
});

describe('studios · tâche au budget plein · effet de la borne (tableau de depense-prudente.ts)', () => {
  const PACK = JSON.parse(readFileSync(join(__dirname, '../../../../docs/studios-v2/02-PROMPTS.json'), 'utf8')) as { commonSystemInstructions: string; templates: Array<{ key: string; taskInstructions: string }> };
  const unites = Math.round(JETONS_ENTREE_MAX_PROPOSITION * 3.5);
  const systeme = (k: string) => `${PACK.commonSystemInstructions}\n\n${PACK.templates.find((t) => t.key === k)!.taskInstructions}`;
  it('84 000 unités de données : français ≈ 0,33 $, pire cas 3 octets/unité ≈ 0,83 $, estimation 0,132 $ · tout sous 2 % du plafond de 50 $', () => {
    const appel = (texte: string) => requeteDepuisMessagesCompiles({ modele: 'claude-sonnet-5', messages: [{ role: 'system', contenu: 'Politique serveur.' }, { role: 'system', contenu: systeme('brief.build') }, { role: 'user', contenu: texte }], images: 0, maxJetonsSortie: JETONS_SORTIE_MAX_PROPOSITION });
    const francais = 'Brief : une crème légère, « testée », à l’acide hyaluronique · résultat visible. '.repeat(2000).slice(0, unites);
    const pire = '漢'.repeat(unites);
    const r = { estimation: estimateCallCost({ model: 'claude-sonnet-5', promptChars: unites, maxTokens: JETONS_SORTIE_MAX_PROPOSITION }), francais: borneMaxAppel(appel(francais)), pire: borneMaxAppel(appel(pire)) };
    console.info(`[r3:mesure] studios budget plein · estimation ${r.estimation} $ · borne fr ${r.francais} $ · borne pire cas ${r.pire} $`);
    expect(r.estimation).toBe(0.132);
    expect(r.francais).toBeGreaterThan(0.3);
    expect(r.francais).toBeLessThan(0.36);
    expect(r.pire).toBeLessThan(50 * 0.02);
  });
});

describe('requête compilée · borne et montant approuvé', () => {
  it('forme de l’adaptateur réel : système en blocs, images d’abord dans le premier message', () => {
    expect(requeteDepuisMessagesCompiles({ modele: 'm', messages: [{ role: 'system', contenu: 'S' }, { role: 'user', contenu: 'U' }], images: 2, maxJetonsSortie: 7 })).toEqual({
      model: 'm', max_tokens: 7, system: [{ type: 'text', text: 'S' }], messages: [{ role: 'user', content: [{ type: 'image' }, { type: 'image' }, { type: 'text', text: 'U' }] }],
    });
  });
  it('au-delà du montant approuvé ⇒ motif ; dans le montant ⇒ null', () => {
    expect(depasseMontantApprouve(0.1, 100_000)).toBeNull();
    expect(depasseMontantApprouve(0.1000001, 100_000)).toBe('la requête peut coûter jusqu’à 0,100 $, au-delà des 0,100 $ approuvés au devis');
    expect(depasseMontantApprouve(0.2, 100_000)).toContain('au-delà des 0,100 $ approuvés');
  });
});

describe('nature d’un total', () => {
  it('« maximum » seulement si toutes les lignes sont des bornes ; sinon estimation et raison', () => {
    expect(qualifierTotal([{ nom: 'a', natureCout: 'borne' }, { nom: 'b', natureCout: 'borne' }])).toEqual({ nature: 'borne', libelle: 'maximum', raison: null });
    expect(qualifierTotal([{ nom: 'a', natureCout: 'borne' }, { nom: 'b', natureCout: 'estimation', motifEstimation: 'forfait' }])).toEqual({ nature: 'estimation', libelle: 'estimation · maximum non garanti', raison: 'b · forfait' });
    expect(qualifierTotal([{ nom: 'a' }]).nature).toBe('estimation');
    expect(qualifierTotal([]).nature).toBe('estimation');
  });
});

describe('issue incertaine · cause et lecture', () => {
  it('cause d’après le statut ou le message', () => {
    expect(causeIncertaine({ statut: 429 })).toBe('saturation');
    expect(causeIncertaine({ statut: 503 })).toBe('service');
    expect(causeIncertaine({ statut: 408 })).toBe('delai');
    expect(causeIncertaine({ texte: 'APIConnectionError Connection error. FetchError: socket hang up' })).toBe('coupure');
    expect(causeIncertaine({ texte: 'APIConnectionTimeoutError Request timed out.' })).toBe('delai');
    expect(causeIncertaine({ texte: 'bizarre' })).toBe('inconnue');
  });
  it('vue : plus récentes d’abord, total au maximum, phrase', () => {
    const l = (j: number, usd: number) => ({ id: `l${j}`, createdAt: new Date(2026, 9, j), provider: 'anthropic', model: 'm', action: 'a', workspaceId: null, estimatedUsd: usd, actualUsd: usd, cause: 'coupure' });
    const v = vueReconciliation([l(1, 0.1), l(3, 0.25)]);
    expect(v.lignes.map((x) => x.id)).toEqual(['l3', 'l1']);
    expect(v.totalUsd).toBe(0.35);
    expect(v.resume).toBe('2 dépenses à réconcilier · 0,35 $ comptés au plafond au maximum, en attendant la facture.');
    expect(vueReconciliation([]).resume).toBe('Aucune dépense à réconcilier.');
  });
  it('réessai : idempotent ou refus certain seulement', () => {
    expect(reessaiPermis({ famille: 'reseau', idempotent: false })).toBe(false);
    expect(reessaiPermis({ famille: 'saturation', idempotent: false })).toBe(true);
    expect(reessaiPermis({ famille: 'service', idempotent: true })).toBe(true);
  });
});
