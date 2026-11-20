import { pouvoirFondateur } from '@tiktrends/core';
import type * as Fondateurs from '../../lib/founder';

/**
 * Inscrit des adresses de TEST dans la liste CODÉE des fondateurs, le temps
 * d'un fichier · `vi.mock('../lib/founder', …)`. Depuis « Codé seul » (suivi de
 * #1115), `FOUNDER_EMAILS` n'ouvre plus aucun pouvoir fondateur · un test qui a
 * besoin d'un fondateur le déclare ici, comme le code le ferait, et tout
 * lecteur (`estFondateurCode`, `aPouvoirsFondateur`, `equipeDeSession`) le voit
 * de la même façon.
 */
export function fondateursCodesDeTest(actual: typeof Fondateurs, emails: readonly string[]): typeof Fondateurs {
  const codes = new Set(emails.map((e) => e.trim().toLowerCase()));
  const estFondateurCode = (e?: string | null) => codes.has((e ?? '').trim().toLowerCase()) || actual.estFondateurCode(e);
  return {
    ...actual,
    fondateursCodes: () => [...actual.fondateursCodes(), ...codes],
    estFondateurCode,
    estFondateurEnvironnement: (e?: string | null) => !estFondateurCode(e) && actual.estFondateurEnvironnement(e),
    aPouvoirsFondateur: (e?: string | null) => pouvoirFondateur({ fondateurCode: estFondateurCode(e), fondateurEnvironnement: false }),
  };
}
