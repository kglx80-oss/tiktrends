import type { ReactNode } from 'react';
import type { PhraseAttente } from '@tiktrends/core';

/**
 * UX V5 · l'en-tête de l'Accueil (G01 à G03).
 *
 *  · le surtitre · la date du jour (horloge du SERVEUR, fr-FR, Paris) et la
 *    marque active (`surtitreAccueil`) ;
 *  · « Bonjour <prénom> » ;
 *  · « N choses t'attendent » · calculée au noyau sur les seules sources lues
 *    (`chosesQuiAttendent`). `null` ⇒ aucune phrase, jamais un chiffre inventé.
 *    Chaque morceau porte sa source (`data-source`) et mène où le traiter.
 *
 * `vues` · le sélecteur Accueil · Analytics (lot 19A), à droite du titre.
 */
export function EnTeteAccueil({ surtitre, prenom, attente, vues }: { surtitre: string; prenom: string; attente: PhraseAttente | null; vues?: ReactNode }) {
  return (
    <header data-accueil-entete style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', margin: '0 0 24px' }}>
      <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: '1 1 320px' }}>
        <p data-accueil-surtitre style={{ margin: 0, fontSize: 12.5, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-strong)' }}>{surtitre}</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.2vw, 34px)', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.15 }}>Bonjour {prenom}</h1>
        {attente && (
          <p data-accueil-attente style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 620 }}>
            {attente.tete}
            {attente.elements.length > 0 && <> : {attente.elements.map((e, i) => (
              <span key={e.cle}>
                {i > 0 && (i === attente.elements.length - 1 ? ' et ' : ', ')}
                {e.href
                  ? <a href={e.href} data-attente={e.cle} data-source={e.source} style={{ color: 'var(--ink)', textDecoration: 'underline', textDecorationColor: 'var(--line-2)', textUnderlineOffset: 3 }}>{e.texte}</a>
                  : <span data-attente={e.cle} data-source={e.source}>{e.texte}</span>}
              </span>
            ))}.</>}
          </p>
        )}
      </div>
      {vues}
    </header>
  );
}
