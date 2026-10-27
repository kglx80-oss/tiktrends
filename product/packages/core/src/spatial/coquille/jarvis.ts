import { visibleWhileStreaming } from '../../adsmap/jarvis-actions';
import { sansTiretCadratin } from '../../ponctuation-ecran';

/**
 * Spatial · le tiroir Jarvis de la coquille (maquette : `J`, `openJ`, `paint`
 * dans le script « Jarvis contextuel » · fragments `_jarvis*.html`). Pur.
 *
 * La maquette répond par des textes écrits d'avance, « sur la page ». L'outil
 * réel parle avec la VRAIE conversation de la marque active (route
 * `/api/jarvis/chat`, mêmes conversations que l'écran Jarvis) · la route ne
 * reçoit pas la page affichée, donc le tiroir ne prétend pas « analyser la
 * page » : il dit avec quoi Jarvis travaille (la marque).
 *
 * Rien ne part tout seul · une suggestion remplit le champ, l'envoi reste un
 * clic, et le coût est annoncé sous le champ AVANT ce clic.
 */

/** Le sous-titre de l'en-tête (`jdh small`). */
export function sousTitreTiroirJarvis(marque: string | null): string {
  return marque ? `Conversation · ${marque}` : 'Conversation · aucune marque active';
}

/** Les suggestions (`jdq`) · les vraies entrées proposées par le fil (`thread.starters`), trois au plus, sans doublon. */
export function suggestionsTiroirJarvis(starters: readonly string[] | null | undefined): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const s of starters ?? []) {
    const t = s.trim();
    if (!t || vus.has(t)) continue;
    vus.add(t); out.push(t);
    if (out.length === 3) break;
  }
  return out;
}

/** Ce qu'une suggestion fait au champ · l'ajoute, sans jamais envoyer (borne 4 000, comme la route). */
export function brouillonAvecSuggestion(saisie: string, suggestion: string): string {
  const s = saisie.trim();
  return (s ? `${s}\n${suggestion}` : suggestion).slice(0, 4000);
}

// Le texte lisible d'un tour de Jarvis · `texteTourJarvis` (spatial/projet), la seule définition.

/** Le texte affichable PENDANT le flux (un marqueur d'action à moitié reçu n'apparaît pas). */
export function texteFluxJarvis(partiel: string): string {
  return sansTiretCadratin(visibleWhileStreaming(partiel));
}
