import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un CTA qui promet une action doit MENER à cette action.
 *
 * Les cartes de l'accueil (« Générer des hooks », « Écrire un script »)
 * pointaient vers `/studio` · or `/studio` est le hub d'orientation, une page à
 * quatre cartes qui ne lit AUCUN paramètre. Le clic « marchait » mais déposait
 * l'utilisateur sur un choix de plus, pas sur l'écran qui écrit. Le studio qui
 * rend du texte est `/studio/textes`. On lit la source de l'accueil et on
 * vérifie qu'aucune carte ne retombe sur le hub nu, et que la cible existe.
 *
 * Même classe de défaut que le CTA Radar → `?inspo=` : un geste qui a l'air de
 * marcher sans rien armer. On le mesure sur le RÉSULTAT (la destination écrite),
 * pas sur la présence d'un lien.
 */
describe('les cartes de l’accueil mènent à un écran qui agit, pas au hub nu', () => {
  const src = readFileSync(join(process.cwd(), 'components', 'AssistantHome.tsx'), 'utf8');
  // Destinations littérales des cartes · `href: '…'` (objet), pas l'attribut
  // JSX `href="…"` du bouton d'en-tête qui, lui, va légitimement au hub.
  const destinations = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]!);

  it('aucune carte ne pointe vers le hub `/studio` nu · il ne lit aucun intent', () => {
    const versHub = destinations.filter((h) => h === '/studio');
    expect(versHub, `Carte(s) menant au hub d'orientation au lieu d'un studio précis : ${versHub.length}`)
      .toEqual([]);
  });

  it('la cible des cartes texte (`/studio/textes`) existe', () => {
    expect(destinations).toContain('/studio/textes');
    expect(existsSync(join(process.cwd(), 'app', '(app)', 'studio', 'textes', 'page.tsx'))).toBe(true);
  });
});
