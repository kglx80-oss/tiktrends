import { CIBLE_TACTILE_MIN, type OngletAccueil } from '@tiktrends/core';

/**
 * Le sélecteur de vue de l'Accueil · lot 19A.
 *
 * De VRAIS liens (`?vue=`), pas un état local · la vue survit au rechargement,
 * au bouton Retour et au partage d'adresse. L'onglet actif s'annonce
 * (`aria-current="page"`), pas seulement par sa couleur · 44 px au doigt
 * (`CIBLE_TACTILE_MIN`) · le focus clavier suit le `:focus-visible` global.
 *
 * ── Pourquoi `<a>` et pas `<Link>` ───────────────────────────────────────────
 *
 * Chaque onglet mène au MÊME chemin (`/dashboard`) avec une autre recherche ·
 * le cas que le routeur client ne termine pas toujours (noyau
 * `chargementCompletRequis`, recette #106b). Mesuré ici en production locale ·
 * avec `<Link>`, un clic souris réel sur « Analytics » lançait la requête mais
 * l'écran et l'URL restaient sur l'Accueil 2 fois sur 5 (et encore 1 fois sur
 * 5, 5 s après l'hydratation), quand la carte Adsmap (autre chemin) passait
 * 5 sur 5. Comme le rail, on confie donc la bascule au navigateur ·
 * chargement complet, fiable, Retour natif.
 *
 * Les onglets viennent du noyau (`resoudreAccueil`) · une liste vide (rôle qui
 * n'ouvre pas Analytics) ne rend RIEN · l'Accueil reste celui d'avant.
 */
export function OngletsAccueil({ onglets }: { onglets: readonly OngletAccueil[] }) {
  if (onglets.length === 0) return null;
  return (
    // Emprise mesurée (1440×720, lot 19A) · avant le sélecteur, la rangée de
    // cartes « Tes marques » finissait à 682 px ; un sélecteur de 44 + 1 + 14
    // la poussait à 740, coupée sous la ligne de flottaison que l'Accueil promet
    // de garder visible à 720. Il mord donc 18 px sur la respiration haute du
    // cadre (32 px, il en reste 14) et ne laisse que 6 px dessous · 717 px.
    <nav aria-label="Vues de l’accueil" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', margin: '-18px 0 6px' }}>
      {onglets.map((o) => (
        <a
          key={o.vue}
          href={o.href}
          aria-current={o.actif ? 'page' : undefined}
          style={{
            display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', marginBottom: -1,
            fontSize: 14, fontWeight: o.actif ? 700 : 600, textDecoration: 'none', whiteSpace: 'nowrap',
            color: o.actif ? 'var(--ink)' : 'var(--muted)',
            borderBottom: `2px solid ${o.actif ? 'var(--accent-strong)' : 'transparent'}`,
          }}
        >
          {o.libelle}
        </a>
      ))}
    </nav>
  );
}
