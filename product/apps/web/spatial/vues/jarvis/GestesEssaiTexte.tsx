import {
  EFFET_CORRIGER, EFFET_TESTER, LIBELLE_CORRIGER, LIBELLE_TESTER, gestesEssaiTexteJarvis,
  type DemandeContexteJarvis, type VarianteEssaiJarvis,
} from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Lot 5 quater (RJ G07) · « Tester » et « Corriger le texte » sous UNE réponse
 * de Jarvis · des LIENS vers les écrans existants du projet de la variante
 * désignée (rattachement ou lot d'essai, atelier Textes) · rien n'est écrit ni
 * appelé ici. La règle vit au noyau (`gestesEssaiTexteJarvis`, liste fermée
 * des variantes du contexte) · une réponse qui n'en parle pas ne montre rien ;
 * qui en parle sans désigner sûrement une variante · aucun lien, la phrase dit
 * pourquoi. L'écran d'arrivée relit la réponse et rejoue la règle.
 */
export function GestesEssaiTexte({ texte, reponse, contexte, variantes, exclus, taille }: {
  texte: string; reponse: string; contexte: DemandeContexteJarvis; variantes: readonly VarianteEssaiJarvis[]; exclus: readonly string[]; taille: number;
}) {
  const g = gestesEssaiTexteJarvis({ texte, reponse, contexte, variantes, exclus });
  if (!g || (!g.tester && !g.corriger)) return null;
  const items = [
    { cle: 'tester' as const, geste: g.tester, libelle: LIBELLE_TESTER, effet: EFFET_TESTER, icone: 'flask' },
    { cle: 'corriger' as const, geste: g.corriger, libelle: LIBELLE_CORRIGER, effet: EFFET_CORRIGER, icone: 'brush' },
  ];
  return (
    <div data-essai-jarvis="" style={{ display: 'grid', gap: 6 }}>
      <div className="jm-a" style={{ flexWrap: 'wrap' }}>
        {items.map(({ cle, geste, effet, icone }) => (geste && 'href' in geste ? (
          <Lien key={cle} className="btn sm" href={geste.href} data-geste-jarvis={cle} data-variante={geste.varianteId} title={effet} style={{ minHeight: 44 }}>
            <Ic n={icone} />{geste.libelle}
          </Lien>
        ) : null))}
      </div>
      {items.map(({ cle, geste, libelle, effet }) => (geste && 'href' in geste
        ? <small key={cle} className="faint" data-effet-geste={cle} style={{ fontSize: taille }}>{geste.detail} · {effet}</small>
        // Rien de sûr · le geste est ABSENT, la phrase dit pourquoi.
        : geste ? <small key={cle} className="faint" data-raison-geste={cle} style={{ fontSize: taille }}>{libelle} · {geste.raison}</small> : null))}
    </div>
  );
}
