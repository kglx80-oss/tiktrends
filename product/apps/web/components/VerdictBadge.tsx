import { VERDICT_CARTE, type EtatVerdictCarte, type TonVerdictCarte } from '@tiktrends/core';

/**
 * Le verdict du marché, sur la carte de la créa.
 *
 * La prédiction (score Jarvis) et la relecture (copie) s'affichaient déjà sans
 * clic · le RÉSULTAT payé, lui, restait dans ADSMAP. C'est pourtant le seul
 * signal qui répond à « laquelle a gagné », la question qui décide de l'itération.
 *
 * Rien ne s'affiche quand il n'y a rien à dire (créa non suivie · `etat` nul) ·
 * la carte propose déjà de la suivre, un badge vide serait du bruit. « En mesure »
 * s'affiche discrètement · gagné/perdu s'affichent fort, c'est ce qu'on cherche.
 */
const TON: Record<TonVerdictCarte, { fg: string; bord: string }> = {
  win: { fg: '#18cc8c', bord: '#18cc8c' },
  lose: { fg: '#ff9db0', bord: '#ff4d6d' },
  neutre: { fg: '#c9c9d4', bord: 'var(--line-2)' },
  attente: { fg: '#9fb4d8', bord: '#5b6b8c' },
};

export function VerdictBadge({ etat, overlay = false }: { etat?: EtatVerdictCarte | null; overlay?: boolean }) {
  if (!etat) return null;
  const def = VERDICT_CARTE[etat];
  const t = TON[def.ton];
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800,
    color: t.fg, border: `1px solid ${t.bord}`,
  } as const;
  return (
    <span
      title={`Verdict marché · ${def.court}`}
      style={overlay
        ? { ...base, position: 'absolute', top: 8, right: 8, background: 'rgba(8,5,10,.72)', backdropFilter: 'blur(4px)' }
        : { ...base, background: 'transparent' }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />
      {def.court}
    </span>
  );
}
