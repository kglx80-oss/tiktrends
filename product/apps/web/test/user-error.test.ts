import { describe, it, expect } from 'vitest';
import { userError } from '../lib/user-error';

/**
 * Ce qu'on vérifie : un message affiché ne doit jamais contenir de jargon
 * technique, doit dire quoi faire, et doit rester une phrase française lisible.
 */

const JARGON = /econnrefused|enotfound|fetch failed|rate_?limit|overloaded|api.?key|\bundefined\b|\[object|stack|at .*\.ts:\d+/i;

describe('traduction des échecs', () => {
  const cas: Array<[string, unknown, RegExp]> = [
    ['délai dépassé', new Error('The operation was aborted due to timeout'), /trop de temps/i],
    ['abandon', new Error('AbortError'), /trop de temps/i],
    ['réseau coupé', new Error('fetch failed'), /n'a pas répondu/i],
    ['DNS', new Error('getaddrinfo ENOTFOUND api.exemple.fr'), /n'a pas répondu/i],
    ['connexion refusée', new Error('connect ECONNREFUSED 10.0.0.1:443'), /n'a pas répondu/i],
    ['débit dépassé', new Error('429 rate_limit_error'), /saturé/i],
    ['modèle surchargé', new Error('overloaded_error'), /saturé/i],
    ['quota fournisseur', new Error('Your credit balance is too low'), /limite côté serveur/i],
    ['clé invalide', new Error('401 invalid_api_key'), /accès au service a été refusé/i],
    ['modération', new Error('content_policy_violation'), /refusée par le modèle/i],
    ['image illisible', new Error('image_load_error'), /image de départ/i],
    ['site refusé', new Error('Site inaccessible ou adresse refusée.'), /vérifie l'adresse/i],
    ['panne serveur', new Error('503 Service Unavailable'), /momentanément indisponible/i],
    ['requête refusée', new Error('422 Unprocessable Entity'), /refusée par le service/i],
  ];

  for (const [nom, err, attendu] of cas) {
    it(`${nom} → message actionnable`, () => {
      const m = userError(err);
      expect(m).toMatch(attendu);
      expect(m, `jargon technique visible : ${m}`).not.toMatch(JARGON);
    });
  }

  it('un échec inconnu reste utilisable et renvoie vers le support', () => {
    const m = userError(new Error('kaboom 0x8f'));
    expect(m).toMatch(/Support/);
    expect(m).not.toContain('kaboom');
  });

  it('reprend le sujet fourni, avec une majuscule', () => {
    expect(userError(new Error('timeout'), { subject: "l'analyse" })).toMatch(/^L'analyse/);
  });

  it('accepte un message brut, un objet sans message, null', () => {
    for (const e of ['fetch failed', {}, null, undefined, 42]) {
      const m = userError(e);
      expect(typeof m).toBe('string');
      expect(m.length).toBeGreaterThan(20);
      expect(m).not.toMatch(JARGON);
    }
  });

  it('le repli explicite est respecté', () => {
    expect(userError(new Error('inconnu'), { fallback: 'Rien à afficher.' })).toBe('Rien à afficher.');
  });

  it('la priorité va au diagnostic précis, pas au code HTTP générique', () => {
    // Fal renvoie « 422 image_load_error » : c'est l'image qu'il faut mentionner.
    expect(userError(new Error('422 image_load_error'))).toMatch(/image de départ/i);
  });
});
