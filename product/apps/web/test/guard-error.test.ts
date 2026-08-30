import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { guardError, GUARD, type GuardReason } from '../lib/guard-error';

const TOUS: GuardReason[] = ['session', 'no_brand', 'role', 'plan', 'db', 'ai_off', 'not_found'];

describe('un refus dit toujours quoi faire', () => {
  /**
   * La règle qui gouverne le fichier, vérifiée sur chaque branche.
   *
   * Dire ce qui a échoué sans dire quoi faire est une impasse · on annonce un
   * mur à quelqu'un et on le laisse chercher la porte.
   */
  const SORTIES = [
    'reconnecte-toi', 'Sélectionne', 'demande à un', 'comparer les formules',
    'réessaie', 'préviens-nous', 'changé de marque',
  ];

  for (const r of TOUS) {
    it(`« ${r} » porte une sortie`, () => {
      const m = guardError(r, { subject: 'le lot', needPlan: 'Plus', needRole: 'admin' });
      expect(SORTIES.some((s) => m.includes(s)), m).toBe(true);
    });
  }

  it('aucun message ne se réduit à un constat', () => {
    for (const r of TOUS) {
      const m = guardError(r, { subject: 'le lot', needPlan: 'Plus' });
      expect(m.length, r).toBeGreaterThan(40);
      // Le séparateur du produit · il sépare le fait de la suite.
      expect(m, r).toContain('·');
    }
  });
});

describe('les formulations sont uniques', () => {
  it('deux appels au même refus donnent le même texte', () => {
    expect(GUARD.session()).toBe(GUARD.session());
    expect(GUARD.noBrand()).toBe(guardError('no_brand'));
  });

  it('« marque active » indique quoi faire, ne constate pas un manque', () => {
    // « Aucune marque active » laissait chercher où on en sélectionne une.
    expect(GUARD.noBrand()).toContain('Sélectionne');
    expect(GUARD.noBrand()).not.toMatch(/^Aucune/);
  });

  it('un refus de rôle dit lequel, et comment l’obtenir', () => {
    const m = GUARD.role({ needRole: 'admin', action: 'Armer le radar' });
    expect(m).toContain('Armer le radar');
    expect(m).toContain('administrateur');
    expect(m).toContain('Membres');
  });

  it('un refus de rôle sans contexte reste une phrase complète', () => {
    expect(GUARD.role()).toContain('Cette action demande');
  });

  it('le propriétaire se distingue de l’administrateur', () => {
    expect(GUARD.role({ needRole: 'owner' })).toContain('propriétaire');
  });

  it('un refus d’offre nomme l’offre', () => {
    expect(GUARD.plan('Plus')).toContain('offre Plus');
  });
});

describe('« introuvable » ne fait pas croire à une suppression', () => {
  it('évoque le changement de marque active', () => {
    // C'est la cause la plus fréquente · le taire fait chercher un objet
    // supprimé qui existe toujours.
    expect(GUARD.notFound('le lot')).toContain('changé de marque active');
  });

  it('met le sujet en majuscule', () => {
    expect(GUARD.notFound('le lot')).toMatch(/^Le lot/);
  });

  it('sans sujet, la phrase tient debout', () => {
    expect(guardError('not_found')).toMatch(/^Cet élément/);
  });
});

describe('ce qui n’est pas la faute de l’utilisateur le dit', () => {
  it('base et IA écartent explicitement son compte', () => {
    expect(GUARD.db()).toContain('pas lié à ton compte');
    expect(GUARD.aiOff()).toContain('pas lié à ton compte');
  });
});

describe('aucune chaîne brute ne fuit vers l’écran', () => {
  /**
   * Le garde qui vise le vrai défaut trouvé à l'audit.
   *
   * Trois jetons techniques partaient tels quels dans un champ `error` :
   * `'session'`, `'name'`, `'forbidden'`. Rien ne l'empêchait, parce que le
   * champ accepte n'importe quelle chaîne.
   */
  const fichiers = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out.push(...fichiers(p));
      else if (e.endsWith('.ts')) out.push(p);
    }
    return out;
  };

  it('un message d’erreur n’est jamais un jeton technique', () => {
    const coupables: string[] = [];
    for (const f of fichiers(join(process.cwd(), 'app', 'actions'))) {
      const src = readFileSync(f, 'utf8');
      for (const [i, ligne] of src.split('\n').entries()) {
        const m = ligne.match(/error:\s*'([^']*)'/);
        if (!m) continue;
        const texte = m[1]!;
        // Un vrai message contient un espace et commence par une majuscule.
        // Un jeton (`session`, `forbidden`) n'a ni l'un ni l'autre.
        if (texte && !texte.includes(' ') && texte === texte.toLowerCase()) {
          coupables.push(`${f.split('/app/')[1]}:${i + 1} · « ${texte} »`);
        }
      }
    }
    expect(coupables, `Jeton(s) technique(s) affiché(s) à l'utilisateur : ${coupables.join(', ')}`).toEqual([]);
  });
});
