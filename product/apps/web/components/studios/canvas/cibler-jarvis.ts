/**
 * Cibler le panneau Jarvis EXISTANT de la page projet (propositions, L4-A)
 * depuis le détail d'une carte · cahier 01 §127 « le détail du plan
 * sélectionné cible explicitement Jarvis ».
 *
 * Ce geste ne demande RIEN à Jarvis : il choisit la cible dans le formulaire
 * « Demander une proposition », ouvre l'onglet « Demander à Jarvis » et place
 * le focus dans « Ta demande ». L'envoi (appel texte payant, coût annoncé dans
 * le formulaire) reste un clic séparé de la personne. Aucune génération, aucune
 * dépense, aucune écriture.
 *
 * Raccord · le formulaire n'expose pas (encore) de cible initiale ; on passe
 * par son DOM rendu (emplacement `data-emplacement="propositions"`, section
 * « Demander une proposition », premier `<select>` = la cible). Si l'un manque
 * (version antérieure, droits de lecture seule, Jarvis non chargé), on le dit.
 */

export type ResultatCiblage = 'ok' | 'panneau-absent' | 'cible-absente';

export function ciblerJarvis(cible: string, doc: Document = document, o: { fluide?: boolean } = {}): ResultatCiblage {
  const emplacement = doc.querySelector('[data-emplacement="propositions"]');
  const formulaire = emplacement?.querySelector('section[aria-label="Demander une proposition"]') ?? null;
  if (!formulaire) return 'panneau-absent';

  // Onglet « Demander à Jarvis » · le choisir n'envoie rien.
  const onglet = [...formulaire.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.trim() === 'Demander à Jarvis');
  if (onglet && onglet.getAttribute('aria-selected') !== 'true') onglet.click();

  const select = formulaire.querySelector<HTMLSelectElement>('select');
  if (!select || ![...select.options].some((op) => op.value === cible)) return 'cible-absente';
  if (select.value !== cible) {
    // Sélecteur contrôlé par React · on passe par le setter natif puis l'événement `change`.
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')?.set;
    if (setter) setter.call(select, cible); else select.value = cible;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  emplacement!.scrollIntoView({ block: 'start', behavior: o.fluide ? 'smooth' : 'auto' });
  const demande = formulaire.querySelector<HTMLTextAreaElement>('textarea');
  (demande ?? select).focus({ preventScroll: true });
  return 'ok';
}
