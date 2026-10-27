/**
 * Spatial · le parcours d'accueil (`/onboarding`) · les étapes `#onb` de la
 * maquette (`OB_STEPS`, `onbBody`, `renderOnb`, et le script « Démarrage »
 * qui ajoute « Tes 3 premières pubs » et « Ton offre »). Pur.
 *
 * Chaque étape GARDÉE repose sur une action réelle du parcours V5
 * (`saveOnboardingAction` · profil, objectifs, marque et site, création de la
 * première marque) ou de l'outil (connexions OAuth, paiement Stripe). Une
 * étape sans action réelle est OMISE :
 *  · « Tes 3 premières pubs » · aucune génération offerte n'existe · omise ;
 *  · dans « Ta marque », le scan de boutique (10 crédits, simulé) et le secteur
 *    (aucune écriture possible au parcours) · absents ;
 *  · dans « Tes outils », Dropbox (aucun connecteur) · absent.
 * Les étapes conditionnelles le sont par la donnée : « Ta marque » seulement
 * quand l'espace n'en a pas encore et que la personne peut en créer une,
 * « Tes outils » seulement pour qui peut brancher (admin), « Ton offre »
 * seulement pour le propriétaire d'un espace sans abonnement, paiement branché.
 */

export type EtapeAccueilSpatial = 'bienvenue' | 'profil' | 'objectifs' | 'marque' | 'outils' | 'offre';

const TITRES: Readonly<Record<EtapeAccueilSpatial, string>> = {
  bienvenue: 'Bienvenue', profil: 'Ton profil', objectifs: 'Tes objectifs', marque: 'Ta marque', outils: 'Tes outils', offre: 'Ton offre',
};

export function titreEtapeParcours(e: EtapeAccueilSpatial): string {
  return TITRES[e];
}

export function etapesParcours(c: { creerMarque: boolean; outils: boolean; offre: boolean }): EtapeAccueilSpatial[] {
  const l: Array<EtapeAccueilSpatial | false> = ['bienvenue', 'profil', 'objectifs', c.creerMarque && 'marque', c.outils && 'outils', c.offre && 'offre'];
  return l.filter((x): x is EtapeAccueilSpatial => !!x);
}

/** La barre de progression (`obprog i`) · `done` avant, `on` l'étape courante. */
export function progressionParcours(n: number, i: number): Array<'done' | 'on' | ''> {
  return Array.from({ length: n }, (_, k) => (k < i ? 'done' : k === i ? 'on' : ''));
}

/** « Étape 2 sur 6 · Ton profil ». */
export function libelleEtapeParcours(etapes: readonly EtapeAccueilSpatial[], i: number): string {
  return `Étape ${i + 1} sur ${etapes.length} · ${titreEtapeParcours(etapes[i]!)}`;
}

/**
 * Les profils · le catalogue du parcours V5 (`OnboardingWizard`), mêmes clés
 * (relues par Jarvis et l'accueil) · seule l'icône change (sprite Spatial).
 */
export const PROFILS_PARCOURS: ReadonlyArray<{ cle: string; titre: string; sous: string; icone: string }> = [
  { cle: 'brand', titre: 'Marque / E-commerce', sous: 'Créa en interne', icone: 'tag' },
  { cle: 'agency', titre: 'Agence', sous: 'Travail client, en équipe', icone: 'users' },
  { cle: 'freelancer', titre: 'Freelance', sous: 'Travail client, en solo', icone: 'brush' },
  { cle: 'ai_artist', titre: 'AI Artist', sous: 'Art & expérimentations', icone: 'img' },
  { cle: 'other', titre: 'Autre', sous: 'Je verrai en avançant', icone: 'q' },
];

/** Les objectifs · le catalogue V5, mêmes clés (`accueil.ts` oriente les suggestions de Jarvis avec). */
export const OBJECTIFS_PARCOURS: ReadonlyArray<{ cle: string; libelle: string }> = [
  { cle: 'ads', libelle: 'Créer des pubs qui vendent' },
  { cle: 'clone', libelle: 'Cloner des pubs gagnantes' },
  { cle: 'analyze', libelle: 'Analyser mes performances' },
  { cle: 'scale', libelle: 'Produire à grande échelle' },
  { cle: 'multi', libelle: 'Gérer plusieurs marques' },
  { cle: 'video', libelle: 'Passer à la vidéo IA' },
];

export function basculerObjectif(objectifs: readonly string[], cle: string): string[] {
  return objectifs.includes(cle) ? objectifs.filter((x) => x !== cle) : [...objectifs, cle].slice(0, 8);
}

/**
 * Les réponses déjà enregistrées (`workspaces.onboarding`) · relues pour
 * préremplir une reprise (`?redo=1`). Le niveau publicitaire (`adLevel`) et la
 * taille d'équipe ne sont pas reposés par la maquette · ils sont REPRIS tels
 * quels à l'enregistrement, jamais effacés.
 */
export interface ReponsesParcours {
  profile: string; goals: string[]; brandName: string; siteUrl: string; adLevel: string; teamSize: string;
}

export function reponsesParcours(brut: unknown): ReponsesParcours {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const t = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
  const goals = Array.isArray(o.goals) ? o.goals.filter((g): g is string => typeof g === 'string').slice(0, 8) : [];
  return { profile: t(o.profile), goals, brandName: t(o.brandName), siteUrl: t(o.siteUrl), adLevel: t(o.adLevel), teamSize: t(o.teamSize) };
}

/** « Continuer » à l'étape Ta marque · un nom suffit (règle V5 : sans nom, aucune marque n'est créée). */
export function marqueSaisieValide(nom: string): boolean {
  return nom.trim().length > 0;
}

/** Le texte d'accueil de la première étape · dit ce que le parcours règle VRAIMENT. */
export function texteBienvenueParcours(etapes: readonly EtapeAccueilSpatial[], marque: string | null): string {
  const sujets = [
    etapes.includes('profil') && 'ton profil',
    etapes.includes('objectifs') && 'tes objectifs',
    etapes.includes('marque') && 'ta marque',
    etapes.includes('outils') && 'tes outils',
  ].filter((x): x is string => !!x);
  const liste = sujets.length > 1 ? `${sujets.slice(0, -1).join(', ')} et ${sujets[sujets.length - 1]}` : sujets[0] ?? '';
  return `En 2 minutes, je règle l’outil pour ${marque || 'ta marque'} : ${liste}. Chaque étape peut être passée, tu pourras y revenir depuis ton profil.`;
}

/** Le bouton principal du pied (`data-obnav`) selon la position. */
export function boutonPrincipalParcours(i: number, n: number): { libelle: string; fleche: boolean; fin: boolean } {
  if (i === 0) return { libelle: 'Commencer', fleche: true, fin: false };
  if (i === n - 1) return { libelle: 'Aller à l’accueil', fleche: false, fin: true };
  return { libelle: 'Continuer', fleche: true, fin: false };
}

/**
 * « Ton offre » · les lignes d'une formule (`obpl ul li`) · ses crédits
 * mensuels (barème réel) puis ce qu'elle OUVRE dans la matrice d'accès (les
 * modules dont c'est la formule minimale) · quatre au plus, comme la maquette.
 * Aucun nombre de sièges · l'outil n'en a pas.
 */
export function lignesOffreParcours(credits: number, debloque: readonly string[]): string[] {
  return [`${credits.toLocaleString('fr-FR')} crédits / mois`, ...debloque.map((d) => `Débloque ${d}`)].slice(0, 4);
}
