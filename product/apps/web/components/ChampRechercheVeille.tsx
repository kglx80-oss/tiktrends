'use client';

import { useState, type CSSProperties } from 'react';
import { PERIMETRES_VEILLE, infoPerimetre, CIBLE_TACTILE_MIN, type PerimetreVeille } from '@tiktrends/core';

/**
 * Le champ de recherche de la Veille et son PÉRIMÈTRE, côte à côte (recette
 * #106b) · « Dans : Texte de l'annonce » est visible à côté du champ, pas caché
 * dans « Filtres », et l'exemple du champ suit le périmètre choisi.
 * `perimetreVisible` · faux quand la plateforme n'honore pas le périmètre
 * (TikTok, Google) · on ne propose pas un choix ignoré (R14).
 */
export function ChampRechercheVeille({ q, perimetre, perimetreVisible, styleChamp }: {
  q: string; perimetre: PerimetreVeille; perimetreVisible: boolean; styleChamp: CSSProperties;
}) {
  const [p, setP] = useState<PerimetreVeille>(perimetre);
  return (
    <>
      <input name="q" defaultValue={q} aria-label={perimetreVisible ? `Rechercher dans ${infoPerimetre(p).dans}` : 'Rechercher'}
        placeholder={infoPerimetre(perimetreVisible ? p : 'ad_copy').exemple}
        style={{ flex: '1 1 100%', minWidth: 0, ...styleChamp }} />
      {perimetreVisible && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto', minHeight: CIBLE_TACTILE_MIN }}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)' }}>Dans</span>
          <select name="searchIn" value={p} onChange={(e) => setP(e.target.value as PerimetreVeille)} aria-label="Chercher dans"
            style={{ ...styleChamp, padding: '8px 12px', fontSize: 13.5, cursor: 'pointer' }}>
            {PERIMETRES_VEILLE.map((x) => <option key={x.v} value={x.v}>{x.libelle}</option>)}
          </select>
        </label>
      )}
    </>
  );
}
