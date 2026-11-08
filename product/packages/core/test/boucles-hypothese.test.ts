import { describe, expect, it } from 'vitest';
import {
  composerHypothese, departDepuisApprentissage, gardeRemplace, hypotheseInspirationParDefaut, lienIterationVeille, lienPreparationInspiration,
  lireHypothese, lireInspiration, lireInspirationDemandee, lireContexteNouveauProjet, noteDepartApprentissage, parentInspiration,
  raisonStructurelleInspiration, variablesInspiration, variablesIteration, verifierChoixVariable,
  NOTE_DEPART_APPRENTISSAGE, NOTE_DEPART_APPRENTISSAGE_REJETE, RAISON_DESTINATION_INSPIRATION, RAISON_NON_GAGNANTE, RAISON_TEMOIN,
  RAISON_VEILLE_ILLISIBLE, VARIABLES_ECRAN,
} from '../src/index';

/**
 * Fermer les deux boucles des lots 1 à 3 · règles pures.
 *
 *  · RJ A04 · « En tirer une hypothèse » · le départ du formulaire tiré d'un
 *    apprentissage (énoncé dans le « parce que », variable reprise), et ce
 *    qu'on fait d'un apprentissage REJETÉ (il sert à se retester, il n'est
 *    plus une raison acquise) ;
 *  · VB F26 · itérer à partir d'une pub de la Veille · la MÊME règle des
 *    variables admises (`variablesIteration`), adaptée à une source sans
 *    verdict · ce qui reste fermé, et pourquoi.
 */

describe('RJ A04 · le départ d’une hypothèse tirée d’un apprentissage', () => {
  it('validé · l’énoncé remplit le « parce que », la variable de la variante est reprise, rien d’autre n’est inventé', () => {
    const d = departDepuisApprentissage('La preuve en ouverture convertit mieux', { variable: 'proof' });
    expect(d, 'départ d’un apprentissage validé').toEqual({ parties: { si: '', alors: '', parceQue: 'La preuve en ouverture convertit mieux' }, variable: 'proof' });
    expect(composerHypothese(d.parties)).toBe('Si…, alors…, parce que La preuve en ouverture convertit mieux.');
    expect(noteDepartApprentissage({})).toBe(NOTE_DEPART_APPRENTISSAGE);
  });

  it('le témoin et une variable inconnue ne sont pas des variables d’hypothèse · non reprises', () => {
    expect(departDepuisApprentissage('x', { variable: 'none_control' }).variable).toBeNull();
    expect(departDepuisApprentissage('x', { variable: 'n’importe quoi' }).variable).toBeNull();
    expect(departDepuisApprentissage('x').variable).toBeNull();
  });

  it('rejeté · il sert à se retester · le « parce que » dit le FAIT du rejet, jamais l’énoncé comme un acquis', () => {
    const d = departDepuisApprentissage('La preuve en ouverture convertit mieux.', { variable: 'proof', rejete: true });
    expect(d.parties.parceQue, 'un rejeté entre comme raison acquise').toBe('le constat « La preuve en ouverture convertit mieux » a été rejeté et reste à retester');
    expect(d.variable, 'la variable du rejeté n’est pas reprise').toBe('proof');
    expect(composerHypothese(d.parties)).toBe('Si…, alors…, parce que le constat « La preuve en ouverture convertit mieux » a été rejeté et reste à retester.');
    expect(noteDepartApprentissage({ rejete: true })).toBe(NOTE_DEPART_APPRENTISSAGE_REJETE);
  });
});

describe('VB F26 · la règle des variables, pour une pub de la Veille sans verdict', () => {
  const choix = variablesInspiration('meta:123');
  const option = (v: string) => choix.options.find((o) => o.variable === v)!;

  it('sans l’adaptation, la règle fermerait tout faute de verdict · c’est pourquoi la source le dit (`inspiration`)', () => {
    const brut = variablesIteration({ ...parentInspiration('meta:123'), inspiration: undefined });
    expect(brut.ferme).toBe(RAISON_NON_GAGNANTE);
    expect(brut.options.every((o) => !o.admise)).toBe(true);
  });

  it('admises · tout le tunnel sauf la page de destination · angle et désir fermés · défaut l’accroche, rien de « conseillé »', () => {
    expect(choix.ferme, 'la pub de Veille est fermée en entier').toBeNull();
    expect(choix.options.filter((o) => o.admise).map((o) => o.variable), 'variables admises pour une pub de Veille')
      .toEqual(VARIABLES_ECRAN.filter((v) => !['landing', 'angle', 'desire'].includes(v)));
    expect(option('angle'), 'angle ouvert sur une pub de Veille').toMatchObject({ admise: false, motif: 'structurelle', raison: raisonStructurelleInspiration('angle') });
    expect(option('desire')).toMatchObject({ admise: false, motif: 'structurelle', raison: raisonStructurelleInspiration('desire') });
    expect(option('landing'), 'page de destination ouverte sur une pub de Veille').toMatchObject({ admise: false, motif: 'imposee', raison: RAISON_DESTINATION_INSPIRATION });
    expect(choix.defaut).toBe('hook');
    expect(choix.options.some((o) => o.conseillee), 'une variable « conseillée » sans plan').toBe(false);
    expect(raisonStructurelleInspiration('angle')).toBe('Remplacer l’angle ne garderait plus rien de cette pub · on garde sa structure et on remplace une seule variable.');
  });

  it('le serveur rejoue la même règle · fermée = refusée avec la même phrase, admise = déclinée', () => {
    const p = parentInspiration('meta:123');
    expect(verifierChoixVariable(choix, p, 'angle')).toEqual({ ok: false, raison: raisonStructurelleInspiration('angle') });
    expect(verifierChoixVariable(choix, p, 'landing')).toEqual({ ok: false, raison: RAISON_DESTINATION_INSPIRATION });
    expect(verifierChoixVariable(choix, p, 'none_control')).toEqual({ ok: false, raison: RAISON_TEMOIN });
    expect(verifierChoixVariable(choix, p, 'format')).toEqual({ ok: true, mode: 'more', etape: 'hook' });
  });

  it('« je garde / je remplace » · une seule remplacée, toutes les autres admises gardées', () => {
    const g = gardeRemplace(choix, 'cta');
    expect(g.remplace).toBe('Appel à l’action');
    expect(g.garde).not.toContain('Appel à l’action');
    expect(g.garde).toHaveLength(choix.options.filter((o) => o.admise).length - 1);
    expect(gardeRemplace(choix, 'angle').remplace, 'une fermée passe pour remplacée').toBeNull();
  });

  it('l’hypothèse proposée ne dit que le geste · relisible par la phrase « Si…, alors… »', () => {
    const h = hypotheseInspirationParDefaut({ annonceur: 'Ploufy', variable: 'hook', valeur: 'la question qui nomme le problème' });
    expect(h).toBe('Si on reprend la pub de Ploufy en remplaçant seulement l’accroche par « la question qui nomme le problème », alors… ?');
    expect(hypotheseInspirationParDefaut({ annonceur: 'Ploufy', variable: 'cta', valeur: '« Essaie-le 30 jours »' }), 'deux paires de guillemets')
      .toBe('Si on reprend la pub de Ploufy en remplaçant seulement l’appel à l’action par « Essaie-le 30 jours », alors… ?');
    expect(lireHypothese(h)?.si).toBe('on reprend la pub de Ploufy en remplaçant seulement l’accroche par « la question qui nomme le problème »');
  });

  it('l’adresse de l’écran Itérer porte la pub de la Veille · relue, une demande illisible est ignorée', () => {
    const l = lienIterationVeille({ platform: 'meta', externalId: '1234 5' });
    expect(l).toBe('/studio/iterer?veille=meta&pub=1234+5');
    expect(lireInspirationDemandee(Object.fromEntries(new URL(l, 'http://x').searchParams))).toEqual({ platform: 'meta', externalId: '1234 5' });
    expect(lireInspirationDemandee({ veille: 'myspace', pub: '1' })).toBeNull();
    expect(lireInspirationDemandee({})).toBeNull();
    expect(lireInspiration({ platform: 'meta', externalId: 'x'.repeat(301) })).toEqual({ ok: false, raison: RAISON_VEILLE_ILLISIBLE });
    expect(lireInspiration('meta:1')).toEqual({ ok: false, raison: RAISON_VEILLE_ILLISIBLE });
  });

  it('la préparation reprend la pub en mode clone (sa sauvegarde en référence) avec la variable remplacée', () => {
    const id = '0f0e0d0c-0b0a-4908-8706-050403020100';
    const l = lienPreparationInspiration({ savedAdId: id, source: { cle: 'meta:123', nom: 'Ploufy' }, video: false, code: 'v2', variable: 'hook', valeur: 'une question' });
    const c = lireContexteNouveauProjet(Object.fromEntries(new URL(l, 'http://x').searchParams));
    expect(c).toMatchObject({ type: 'ads', ref: id, objectif: 'Itération v2 · je garde la structure de la pub, je remplace l’accroche : une question', sourceVeille: { cle: 'meta:123', nom: 'Ploufy' } });
  });
});
