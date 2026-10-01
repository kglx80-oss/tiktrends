import { verdictEffectif, type VerdictValue } from './types';
import { LIBELLE_VERDICT } from './verdict-libelle';
import { PARAM_TEST_ADSMAP } from './passage-studio';

/**
 * Suites · ce que la carte doit rendre lisible pour passer de l'analyse à
 * l'itération (recette #106, sous-pages Adsmap). Pur · ni base ni réseau.
 *
 * Mesuré avant correctif · le verdict du parent et l'étape où il a lâché
 * étaient lus côté serveur puis jamais affichés · la carte disait QUOI changer
 * sans dire ce que le test avait donné. Le lien « Produire depuis la carte »
 * ouvrait /adsmap nu, sans la suite qu'on venait de créer, et l'état vide
 * disait « se remplit dès qu'un verdict est arbitré » à côté de « N tests
 * arbitrés ».
 */

/** Le résultat du test parent, en clair · verdict EFFECTIF (un gagnant non comparable reste une piste relative). */
export function resultatParentSuite(p: { verdict: VerdictValue; comparable: boolean; etapeLachee: string | null }): string {
  const eff = verdictEffectif(p.verdict, p.comparable) ?? p.verdict;
  const l = LIBELLE_VERDICT[eff];
  const morceaux = [`Résultat du test · ${l.court}`];
  if (l.note) morceaux.push(`(${l.note})`);
  if (p.etapeLachee) morceaux.push(`· a lâché sur ${p.etapeLachee}`);
  return morceaux.join(' ');
}

/** L'état vide · distingue « aucun verdict arbitré » de « arbitrés, mais rien à itérer ». */
export function videSuites(examines: number): { titre: string; pourquoi: string } {
  if (examines > 0) {
    return {
      titre: 'Rien à itérer pour l’instant.',
      pourquoi: `${examines} test(s) arbitré(s) · chacun a déjà sa suite, ou son verdict n’appelle pas de suite. Le plan se remplira au prochain verdict arbitré.`,
    };
  }
  return {
    titre: 'Rien à itérer pour l’instant.',
    pourquoi: 'Ce plan se remplit dès qu’un verdict est arbitré. Un verdict calculé ne suffit pas · engager une dépense sur une conclusion non prise, c’est parier sur un chiffre qui peut encore bouger.',
  };
}

/** La fiche Adsmap d'une ad précise (lien profond `?ad=`) · jamais la carte nue. */
export function lienFicheAdsmap(adId: string): string {
  return `/adsmap?${PARAM_TEST_ADSMAP}=${encodeURIComponent(adId)}`;
}
