/**
 * Studios · corpus du contrôle de la parole · paires (réplique validée,
 * transcription de la prise) étiquetées à la main.
 *
 * Pur, données seulement. Sert à MESURER le seuil de `parole.ts`
 * (`ECARTS_TOLERES`) : `test/parole-controle.test.ts` recompte les écarts de
 * chaque paire et exige l'égalité avec `MESURE_CORPUS_PAROLE`.
 *
 * Les transcriptions imitent la sortie d'un transcripteur mot à mot (casse et
 * ponctuation à lui, nombres souvent en chiffres, graphie d'un homophone au
 * hasard) ; les vrais écarts sont ceux qu'un modèle vidéo parlant commet : un
 * mot sauté, un mot ajouté (salutation, relance), un mot remplacé, une phrase
 * coupée par la fin du clip, une autre réplique, un silence.
 */

export type FamilleParole =
  | 'variante · casse et ponctuation'
  | 'variante · apostrophes et tirets'
  | 'variante · nombres'
  | 'variante · homophones et finales muettes'
  | 'variante · mots soudés ou coupés'
  | 'écart · mot manquant'
  | 'écart · mot ajouté'
  | 'écart · mot remplacé'
  | 'écart · réplique tronquée'
  | 'écart · autre réplique ou silence';

export interface PaireParole { famille: FamilleParole; replique: string; transcription: string }

export const estVarianteParole = (f: FamilleParole) => f.startsWith('variante');

export const CORPUS_PAROLE: readonly PaireParole[] = [
  // ── Variantes · à accepter ─────────────────────────────────────────────
  { famille: 'variante · casse et ponctuation', replique: 'Découvre notre nouvelle crème hydratante.', transcription: 'découvre notre nouvelle crème hydratante' },
  { famille: 'variante · casse et ponctuation', replique: 'Tu en as marre des cheveux secs ? On a la solution !', transcription: 'Tu en as marre des cheveux secs. On a la solution.' },
  { famille: 'variante · casse et ponctuation', replique: 'Résultat visible dès le premier jour, promis.', transcription: 'Résultat visible dès le premier jour. Promis !' },
  { famille: 'variante · casse et ponctuation', replique: 'LIVRAISON OFFERTE ce week-end seulement', transcription: 'Livraison offerte ce week-end seulement.' },
  { famille: 'variante · casse et ponctuation', replique: 'Testé, approuvé : adopté.', transcription: 'Testé approuvé, adopté !' },
  { famille: 'variante · casse et ponctuation', replique: '« Je ne m’en passe plus », dit Léa.', transcription: 'Je ne m’en passe plus, dit Léa.' },

  { famille: 'variante · apostrophes et tirets', replique: 'C’est l’heure de prendre soin de toi.', transcription: "C'est l'heure de prendre soin de toi." },
  { famille: 'variante · apostrophes et tirets', replique: "Aujourd'hui, l'offre s'arrête à minuit.", transcription: 'Aujourd’hui, l’offre s’arrête à minuit.' },
  { famille: 'variante · apostrophes et tirets', replique: 'Un anti-âge qui ne pique pas.', transcription: 'Un anti âge qui ne pique pas.' },
  { famille: 'variante · apostrophes et tirets', replique: 'Peut-être la meilleure crème de l’année.', transcription: 'Peut être la meilleure crème de l’année.' },
  { famille: 'variante · apostrophes et tirets', replique: 'Qu’est-ce que tu attends ?', transcription: "Qu'est ce que tu attends ?" },

  { famille: 'variante · nombres', replique: 'Moins vingt pour cent sur tout le site.', transcription: '-20 % sur tout le site.' },
  { famille: 'variante · nombres', replique: 'Plus de mille avis cinq étoiles.', transcription: 'Plus de 1 000 avis 5 étoiles.' },
  { famille: 'variante · nombres', replique: 'Seulement 9,99 €.', transcription: 'Seulement neuf euros quatre-vingt-dix-neuf.' },
  { famille: 'variante · nombres', replique: 'Trois gestes, trente secondes.', transcription: '3 gestes, 30 secondes.' },
  { famille: 'variante · nombres', replique: 'Déjà 25 000 clientes conquises.', transcription: 'Déjà vingt-cinq mille clientes conquises.' },
  { famille: 'variante · nombres', replique: 'Une note de 4,8 sur 5.', transcription: 'Une note de quatre virgule huit sur cinq.' },
  { famille: 'variante · nombres', replique: 'Livré en 24h.', transcription: 'Livré en vingt-quatre heures.' },
  { famille: 'variante · nombres', replique: 'Rendez-vous à 14h30.', transcription: 'Rendez-vous à quatorze heures trente.' },
  { famille: 'variante · nombres', replique: 'Le 2e flacon est offert.', transcription: 'Le deuxième flacon est offert.' },
  { famille: 'variante · nombres', replique: 'Le n°1 des ventes en France.', transcription: 'Le numéro un des ventes en France.' },
  { famille: 'variante · nombres', replique: 'Soixante et onze ingrédients, quatre-vingt-dix-sept pour cent naturels.', transcription: '71 ingrédients, 97 % naturels.' },

  { famille: 'variante · homophones et finales muettes', replique: 'C’est la crème qu’il te faut.', transcription: 'Ses la crème qu’il te faut.' },
  { famille: 'variante · homophones et finales muettes', replique: 'Tes cheveux sont doux et brillants.', transcription: 'Tes cheveux son doux est brillant.' },
  { famille: 'variante · homophones et finales muettes', replique: 'Hydratez votre peau tous les jours.', transcription: 'Hydrater votre peau tout les jours.' },
  { famille: 'variante · homophones et finales muettes', replique: 'Où que tu sois, elle a ta routine.', transcription: 'Ou que tu sois, elle à ta routine.' },
  { famille: 'variante · homophones et finales muettes', replique: 'Quelle texture incroyable !', transcription: 'Quel texture incroyable !' },
  { famille: 'variante · homophones et finales muettes', replique: 'Ils ont adoré nos produits.', transcription: 'Ils on adorés nos produit.' },
  { famille: 'variante · homophones et finales muettes', replique: 'OK, on y va.', transcription: 'Okay, on y va.' },
  { famille: 'variante · homophones et finales muettes', replique: 'Cette routine peut tout changer.', transcription: 'Cet routine peu tout changé.' },

  { famille: 'variante · mots soudés ou coupés', replique: 'Le soin Glowup pour l’été.', transcription: 'Le soin Glow Up pour l’été.' },
  { famille: 'variante · mots soudés ou coupés', replique: 'Parfait pour ton week-end.', transcription: 'Parfait pour ton weekend.' },
  { famille: 'variante · mots soudés ou coupés', replique: 'Essaie le sérum Nuit Douce.', transcription: 'Essaie le sérum Nuitdouce.' },
  { famille: 'variante · mots soudés ou coupés', replique: 'Un best-seller en skincare.', transcription: 'Un best seller en skin care.' },

  // ── Vrais écarts · à refuser ───────────────────────────────────────────
  { famille: 'écart · mot manquant', replique: 'Un shampooing sans sulfate.', transcription: 'Un shampooing sulfate.' },
  { famille: 'écart · mot manquant', replique: 'Ça ne colle pas, ça ne graisse pas.', transcription: 'Ça ne colle pas, ça graisse pas.' },
  { famille: 'écart · mot manquant', replique: 'Découvre la nouvelle crème Lumina.', transcription: 'Découvre la nouvelle crème.' },
  { famille: 'écart · mot manquant', replique: 'Commande avant minuit et profite de la livraison offerte.', transcription: 'Commande avant minuit et profite de la livraison.' },
  { famille: 'écart · mot manquant', replique: 'Trois gestes simples pour une peau plus douce.', transcription: 'Trois gestes pour une peau douce.' },
  { famille: 'écart · mot manquant', replique: 'Notre formule végane, fabriquée en France avec des ingrédients naturels, protège ta peau jour après jour sans jamais l’assécher ni l’irriter.', transcription: 'Notre formule végane, fabriquée en France avec des ingrédients naturels, protège ta peau jour après jour sans jamais l’assécher l’irriter.' },

  { famille: 'écart · mot ajouté', replique: 'Découvre notre nouvelle crème.', transcription: 'Bonjour, découvre notre nouvelle crème.' },
  { famille: 'écart · mot ajouté', replique: 'Profite de l’offre.', transcription: 'Profite vite de l’offre.' },
  { famille: 'écart · mot ajouté', replique: 'La routine qui change tout.', transcription: 'La routine qui change tout, abonne-toi.' },
  { famille: 'écart · mot ajouté', replique: 'Une peau douce.', transcription: 'Une peau euh douce.' },
  { famille: 'écart · mot ajouté', replique: 'Elle est vraiment bien.', transcription: 'Elle est vraiment vraiment très bien.' },

  { famille: 'écart · mot remplacé', replique: 'Découvre la crème Lumina.', transcription: 'Découvre la crème Lumière.' },
  { famille: 'écart · mot remplacé', replique: 'Moins vingt pour cent ce soir.', transcription: 'Moins trente pour cent ce soir.' },
  { famille: 'écart · mot remplacé', replique: 'Ta peau va adorer.', transcription: 'Ta pomme va adorer.' },
  { famille: 'écart · mot remplacé', replique: 'Livraison offerte dès trente euros.', transcription: 'Livraison offerte dès quarante euros.' },
  { famille: 'écart · mot remplacé', replique: 'Le 2e flacon est offert.', transcription: 'Le troisième flacon est offert.' },
  { famille: 'écart · mot remplacé', replique: 'Ce n’est pas gras.', transcription: 'Ce n’est pas grave.' },
  { famille: 'écart · mot remplacé', replique: 'Testé sous contrôle dermatologique.', transcription: 'Testé sans contrôle dermatologue.' },

  { famille: 'écart · réplique tronquée', replique: 'Découvre notre nouvelle crème hydratante au jasmin.', transcription: 'Découvre notre nouvelle crème.' },
  { famille: 'écart · réplique tronquée', replique: 'Commande maintenant et reçois ton cadeau demain.', transcription: 'Commande maintenant et' },
  { famille: 'écart · réplique tronquée', replique: 'Ta routine du soir en trois gestes.', transcription: 'Ta routine du soir.' },

  { famille: 'écart · autre réplique ou silence', replique: 'Découvre notre nouvelle crème.', transcription: '' },
  { famille: 'écart · autre réplique ou silence', replique: 'Profite de la livraison offerte.', transcription: 'Merci de nous avoir regardés.' },
  { famille: 'écart · autre réplique ou silence', replique: 'Un sérum pour des cheveux brillants.', transcription: 'Abonne-toi pour plus de vidéos comme celle-ci.' },
  { famille: 'écart · autre réplique ou silence', replique: 'Une peau douce et lumineuse dès le premier jour.', transcription: 'Je ne sais pas.' },
];
