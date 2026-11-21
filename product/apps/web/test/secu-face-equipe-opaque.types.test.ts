import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { roleVoitRubrique } from '@tiktrends/core';
import { FEATURES, canAccess, faceEquipeReconnue, type Access, type FaceEquipeLue } from '../lib/rbac';
import { compilerSondes, sondesDuFichier, type ErreurDeSonde } from './helpers/sondes-de-type';

/**
 * Suite de #1128 · `Access.equipe` est OPAQUE au niveau du type, comme
 * `Session.equipe`.
 *
 * Sur main ea01a5aa, la face portait une marque de type (`[FACE_EQUIPE]`) qui
 * la rendait inconstructible hors de `effectiveAccess`, mais LISIBLE · `role`
 * et `matrice` se lisaient en clair (`a.equipe?.role`), sans passer par
 * `faceEquipeReconnue`, le seul lecteur qui consulte le registre. Une face
 * forgée (cast, `any`, copie, JSON) que le registre refuse se lisait donc
 * comme une vraie par quiconque l'ouvrait directement.
 *
 * Désormais `Access.equipe` est un `FaceEquipe` · la marque SEULE, aucun champ
 * lisible. `faceEquipeReconnue` (lib/rbac.ts) est le seul passage vers la face
 * lisible (`FaceEquipeLue`), après le registre · `voitFeature`, `verrouille`,
 * `canAccess`, `denyReason`, le rail et le menu passent tous par lui.
 *
 * Même mécanique que `secu-equipe-opaque.types.test.ts` · chaque ligne sous un
 * `@ts-expect-error` doit être refusée par le compilateur, et le cas de vitest
 * vérifie qu'elle l'est sur l'OPACITÉ (le message cite `FaceEquipe`). Sur
 * main, les sondes de lecture compilaient (mesuré · six sur sept) · seule la
 * forge littérale était déjà refusée, par la marque.
 *
 * Ce que le type ne ferme pas · un cast (`a.equipe as unknown as …`), un
 * `any`. Là, la barrière est le registre · une face forgée vaut face client
 * pour `faceEquipeReconnue` (éprouvé par `secu-face-equipe-execution.test.ts`).
 */

// ── Les sondes · jamais appelées, lues par le compilateur. Une sonde par ligne.
/** La marque, désignée par l'accès · son nom n'est écrit que par rbac.ts et le helper de test (`secu-fondateurs-codes-sources`). */
type Marque = NonNullable<Access['equipe']>;
type FaceLocale = { equipe?: { role: string; matrice: object } };
const lireLocale = (x: FaceLocale) => x.equipe?.role;
export function sondes(a: Access, f: Marque): unknown[] {
  return [
    // @ts-expect-error (face) lecture directe du rôle
    a.equipe?.role,
    // @ts-expect-error (face) lecture directe de la matrice
    a.equipe?.matrice,
    // @ts-expect-error (face) la décision du rail refaite à la main, sans le registre
    a.equipe && roleVoitRubrique(a.equipe.role, 'studio', a.equipe.matrice),
    // @ts-expect-error (face) déstructuration du rôle
    (({ role }: Marque) => role)(f),
    // @ts-expect-error (face) type local nommé
    lireLocale(a),
    // @ts-expect-error (face) la face lisible reçue sans le lecteur
    ((r: FaceEquipeLue | undefined) => r?.role)(a.equipe),
    // @ts-expect-error (forge) une face littérale
    canAccess({ role: 'member', plan: 'starter', equipe: { role: 'adminplus', matrice: {} } }, FEATURES[0]!),
    faceEquipeReconnue(a)?.role, // TÉMOIN · le lecteur compile
    faceEquipeReconnue(a)?.matrice, // TÉMOIN
  ];
}

const ICI = join(__dirname, 'secu-face-equipe-opaque.types.test.ts');
const SONDES_ATTENDUES = 7;
/** Le nom de la marque, recomposé (voir `Marque`) · le message d'une sonde doit le citer. */
const OPACITE = new RegExp(`\\b${['Face', 'Equipe'].join('')}\\b`);

let erreurs: ErreurDeSonde[] = [];
let lignes: string[] = [];

describe('Access.equipe opaque · le compilateur refuse toute lecture de la face sans faceEquipeReconnue', () => {
  beforeAll(() => { erreurs = compilerSondes(ICI); lignes = readFileSync(ICI, 'utf8').split('\n'); }, 300_000);

  it('chaque sonde échoue À LA COMPILATION, sur l’opacité de la face · aucune autre ligne n’a d’erreur', () => {
    const sondes = sondesDuFichier(lignes);
    expect(sondes.length, 'la sonde a perdu ses cas').toBe(SONDES_ATTENDUES);
    for (const s of sondes) {
      const siennes = erreurs.filter((e) => e.ligne === s.ligne);
      expect(siennes.length, `${s.quoi} · ligne ${s.ligne} « ${lignes[s.ligne - 1]!.trim()} » COMPILE · la face équipe se lit sans faceEquipeReconnue`).toBeGreaterThan(0);
      expect(siennes.some((e) => OPACITE.test(e.message)), `${s.quoi} · ligne ${s.ligne} refusée pour une autre raison que l’opacité · ${siennes.map((e) => e.message).join(' | ')}`).toBe(true);
    }
    const ailleurs = erreurs.filter((e) => !sondes.some((s) => s.ligne === e.ligne)).map((e) => `ligne ${e.ligne} · ${e.message}`);
    expect(ailleurs, 'une erreur hors des sondes · le témoin (le lecteur) ne compile plus, ou le fichier est cassé').toEqual([]);
  });
});
