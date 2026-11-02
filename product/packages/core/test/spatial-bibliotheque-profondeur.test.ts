import { describe, expect, it } from 'vitest';
import {
  clePage, lireDemandePage, limiteDemande, noterListeChargee, PAGE_BIBLIOTHEQUE, pagesApresRelecture, profondeurApresPage, PROFONDEUR_MAX_BIBLIOTHEQUE,
  REFUS_PAGE, relecturesApresGeste, reprise,
  type ListeChargee, type MediaSource, type PorteePageBibliotheque,
} from '../src';

/**
 * Bibliothèque · après un geste, chaque liste chargée se relit jusqu'à sa
 * PROFONDEUR · règles pures. Ce qu'on relit (depuis le début, la plus récente
 * d'abord, dans la borne mesurée), ce que le navigateur peut demander (une
 * profondeur bornée, sinon rien n'est lu), et où « Charger plus » reprend
 * ensuite.
 */

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C = { t: '2026-10-20T09:00:00.123456Z', id: U(1) };
const dossier = (n: number): PorteePageBibliotheque => ({ type: 'dossier', dossier: U(n) });
const liste = (portee: PorteePageBibliotheque, profondeur: number, filtre: ListeChargee['filtre'] = 'tous'): ListeChargee => ({ cle: clePage(portee, filtre), portee, filtre, profondeur });
const media = (n: number): MediaSource => ({ id: U(n), name: `f-${n}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: '', thumbUrl: null, sizeBytes: 1, createdAt: '2026-10-20T10:00:00.000Z', folderId: null, rights: null, ia: { utilisable: true, template: false, tags: [] } });

describe('lireDemandePage · la profondeur demandée est bornée, sinon rien n’est lu', () => {
  it('absente · une page (et la demande reste celle d’avant) · présente, entière, de 1 à la borne', () => {
    const sans = lireDemandePage({ portee: { type: 'dossier', dossier: 'r:assets' } });
    expect(sans).toEqual({ ok: true, demande: { portee: { type: 'dossier', dossier: 'r:assets' }, filtre: 'tous', curseur: null } });
    expect(sans.ok && limiteDemande(sans.demande)).toBe(PAGE_BIBLIOTHEQUE);
    for (const limite of [1, 600, PROFONDEUR_MAX_BIBLIOTHEQUE]) {
      const r = lireDemandePage({ portee: { type: 'corbeille' }, curseur: C, limite });
      expect(r.ok && limiteDemande(r.demande), String(limite)).toBe(limite);
    }
  });
  it('au-delà de la borne, nulle, fractionnaire, en texte ou non finie · refusée', () => {
    for (const limite of [PROFONDEUR_MAX_BIBLIOTHEQUE + 1, 0, -1, 1.5, '200', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(lireDemandePage({ portee: { type: 'corbeille' }, limite }), String(limite)).toEqual({ ok: false, raison: REFUS_PAGE.illisible });
    }
  });
});

describe('les listes chargées · la plus récente d’abord, une fois chacune', () => {
  it('une liste relue passe en tête, sans doublon · sa profondeur est ce qu’elle affichait plus ce qui arrive', () => {
    const a = liste(dossier(1), 400), b = liste(dossier(2), 300);
    const l = noterListeChargee(noterListeChargee([], a), b);
    expect(l.map((x) => x.cle)).toEqual([b.cle, a.cle]);
    const a2 = { ...a, profondeur: profondeurApresPage(400, 200) };
    expect(noterListeChargee(l, a2)).toEqual([a2, b]);
    expect(profondeurApresPage(400, 200)).toBe(600);
    expect(profondeurApresPage(-3, 5)).toBe(5);
  });
});

describe('relecturesApresGeste · chaque liste depuis son début, à sa profondeur, dans la borne', () => {
  it('le dossier chargé à 600 · relu depuis le début (curseur null), 600 fichiers, son filtre gardé', () => {
    const l = liste(dossier(1), 600, 'video');
    expect(relecturesApresGeste([l])).toEqual([{ cle: l.cle, demande: { portee: dossier(1), filtre: 'video', curseur: null, limite: 600 } }]);
  });
  it('la borne vaut pour toutes les listes · la plus récente d’abord, la suivante prend le reste, la dernière n’est pas relue', () => {
    const r = relecturesApresGeste([liste(dossier(1), 1500), liste({ type: 'recherche', q: 'ete' }, 800), liste({ type: 'corbeille' }, 100)]);
    expect(r.map((x) => [x.cle, x.demande.limite])).toEqual([[clePage(dossier(1)), 1500], [clePage({ type: 'recherche', q: 'ete' }), PROFONDEUR_MAX_BIBLIOTHEQUE - 1500]]);
    expect(r.reduce((a, x) => a + (x.demande.limite ?? 0), 0)).toBe(PROFONDEUR_MAX_BIBLIOTHEQUE);
  });
  it('une liste plus profonde que la borne · relue jusqu’à la borne · une borne plus large ne la dépasse jamais', () => {
    expect(relecturesApresGeste([liste(dossier(1), 5000)]).map((x) => x.demande.limite)).toEqual([PROFONDEUR_MAX_BIBLIOTHEQUE]);
    expect(relecturesApresGeste([liste(dossier(1), 5000)], 10 * PROFONDEUR_MAX_BIBLIOTHEQUE).map((x) => x.demande.limite)).toEqual([PROFONDEUR_MAX_BIBLIOTHEQUE]);
    expect(relecturesApresGeste([liste(dossier(1), 500)], 300).map((x) => x.demande.limite)).toEqual([300]);
  });
  it('rien à relire · aucune liste, une profondeur nulle ou illisible, une clé déjà relue', () => {
    expect(relecturesApresGeste([])).toEqual([]);
    expect(relecturesApresGeste([liste(dossier(1), 0), liste(dossier(2), Number.NaN), liste(dossier(3), -4)])).toEqual([]);
    const a = liste(dossier(1), 300);
    expect(relecturesApresGeste([a, { ...a, profondeur: 900 }]).map((x) => x.demande.limite)).toEqual([300]);
    // Chaque demande produite passe la relecture du serveur.
    for (const r of relecturesApresGeste([liste(dossier(1), 5000)])) expect(lireDemandePage(r.demande)).toEqual({ ok: true, demande: r.demande });
  });
});

describe('pagesApresRelecture · la fenêtre neuve, puis où chaque liste relue reprend', () => {
  const fenetres = { vivants: C, corbeille: null };
  it('liste relue pleine · « Charger plus » reprend après son dernier fichier · liste finie · `fin` · la recherche garde son total', () => {
    const D = dossier(1), Q: PorteePageBibliotheque = { type: 'recherche', q: 'ete' };
    const apres = { t: '2026-10-01T00:00:00.000001Z', id: U(42) };
    const { pages, listes } = pagesApresRelecture(fenetres, [
      { cle: clePage(D), demande: { portee: D, filtre: 'tous', curseur: null, limite: 3 }, page: { medias: [media(1), media(2), media(3)], suivant: apres } },
      { cle: clePage(Q), demande: { portee: Q, filtre: 'tous', curseur: null, limite: 10 }, page: { medias: [media(4)], suivant: null, total: 1 } },
    ]);
    expect(reprise(pages, D, 'tous')).toEqual(apres);
    expect(reprise(pages, Q, 'tous')).toBe('fin');
    expect(pages.totaux).toEqual({ [clePage(Q)]: 1 });
    // Une liste NON relue repart de la fenêtre neuve, comme avant.
    expect(reprise(pages, dossier(2), 'tous')).toEqual(C);
    expect(listes.map((l) => [l.cle, l.profondeur])).toEqual([[clePage(D), 3], [clePage(Q), 1]]);
  });
});
