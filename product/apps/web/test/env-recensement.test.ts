import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_INTERRUPTEURS } from '@tiktrends/core';

/**
 * Recensement des variables d'environnement · chaque variable que le web ou le
 * worker lit (`process.env.X`, `process.env['X']`) est déclarée dans
 * `.env.deploy.example`, ou nommée ci-dessous avec sa raison.
 *
 * Défaut réparé : `CRON_SECRET`, `AI_SPEND_CAP_USD`, `SMTP_URL` et
 * `KLAVIYO_API_KEY` étaient lues mais absentes du gabarit que le propriétaire
 * recopie sur le VPS. Sans `CRON_SECRET`, aucun passage planifié ne partait, et
 * seul un `console.warn` du worker le disait · personne ne pouvait deviner
 * qu'il fallait la poser.
 *
 * On lit le RÉSULTAT · les sources réelles (pas une liste recopiée) et le
 * gabarit tel qu'il est. Une ligne commentée `# X=` compte comme déclarée
 * (variable optionnelle dont le défaut du code convient).
 *
 * Bruit mesuré avant de figer la liste (26/11) · 30 variables distinctes lues
 * littéralement dans `apps/web` et `apps/workers` (hors tests) ; 15 absentes du
 * gabarit ; 6 ajoutées au gabarit (CRON_SECRET, AI_SPEND_CAP_USD, SMTP_URL,
 * KLAVIYO_API_KEY, et en commentaire ANTHROPIC_GEN_MODEL, MAIL_FROM) ; 9
 * exceptions ci-dessous, chacune avec sa raison.
 *
 * Hors de portée (dit, pas caché) · les lectures DYNAMIQUES
 * (`process.env[nom]`, prix Stripe construits, mentions légales `LEGAL_*`,
 * clés de l'écran Modèles IA) et celles des paquets (`packages/*`). Les prix
 * Stripe ont leur propre garde (`stripe-env-exemples.test.ts`).
 *
 * Mutation faite (copie mktemp, restaurée, diff vide) · retirer
 * `CRON_SECRET=` du gabarit ⇒ trois cas tombent, dont « CRON_SECRET · lue par
 * … et apps/workers/src/adsmap.ts, absente de .env.deploy.example ».
 */
const PRODUIT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RACINES = ['apps/web', 'apps/workers'];
const IGNORES = new Set(['node_modules', '.next', 'test', 'dist', '.turbo']);
const EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

/** Exceptions nommées · lues par le code, volontairement absentes du gabarit. */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  NODE_ENV: 'posée par l’image (Dockerfile) et par le compose de production, jamais par .env.deploy',
  BUILD_SHA: 'argument de build passé par le déploiement (docker-compose.yml, `args`), pas une variable d’exécution',
  BUILD_TIME: 'figée au build par next.config.mjs (repli : l’heure du build)',
  INTERNAL_APP_URL: 'adresse interne du web vue du worker · le défaut (`http://web:3000`, nom de service du compose) est le bon en production',
  FOUNDER_EMAILS: 'lue SANS pouvoir depuis #1115 (CLES-A-BRANCHER, « Admin+ ») · ne pas la poser',
  STUDIO_WEBHOOK_SECRET: 'inutilisée tant qu’aucune route webhook Studios n’est branchée (fal est sondé) · .env.example la déclare',
  VEILLE_RECETTE: 'recette locale seulement (ignorée quand NODE_ENV=production)',
  TRENDTRACK_BASE_URL: 'recette locale seulement, avec VEILLE_RECETTE (hôte loopback exigé)',
  RECETTE_SORTIE: 'script de recette local (apps/web/scripts/recette), jamais sur le VPS',
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORES.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (EXTENSIONS.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const LECTURE = /process\.env(?:\.([A-Z_][A-Z0-9_]*)|\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\])/g;

/** Chaque variable lue → les fichiers qui la lisent (pour un message qui dit où regarder). */
function releve(): Map<string, string[]> {
  const lues = new Map<string, string[]>();
  for (const r of RACINES) {
    for (const f of sources(join(PRODUIT, r))) {
      for (const m of readFileSync(f, 'utf8').matchAll(LECTURE)) {
        const nom = m[1] ?? m[2];
        if (!nom) continue;
        const fichiers = lues.get(nom) ?? [];
        const chemin = relative(PRODUIT, f);
        if (!fichiers.includes(chemin)) lues.set(nom, [...fichiers, chemin]);
      }
    }
  }
  return lues;
}

const GABARIT = readFileSync(join(PRODUIT, '.env.deploy.example'), 'utf8').split('\n');
const declarees = new Set(GABARIT.flatMap((l) => {
  const m = /^#?\s?([A-Z_][A-Z0-9_]*)=/.exec(l);
  return m?.[1] ? [m[1]] : [];
}));
/** La ligne active (non commentée) d'une variable du gabarit. */
const ligneActive = (nom: string) => GABARIT.find((l) => l.startsWith(`${nom}=`));

describe('recensement des variables · .env.deploy.example', () => {
  const lues = releve();

  it('le relevé voit bien les variables de ce sujet (garde qui regarde la bonne chose)', () => {
    expect(lues.get('CRON_SECRET')).toContain('apps/workers/src/adsmap.ts');
    for (const v of ['AI_SPEND_CAP_USD', 'SMTP_URL', 'KLAVIYO_API_KEY', 'NODE_ENV', 'ANTHROPIC_API_KEY']) expect(lues.has(v), v).toBe(true);
    expect(lues.size).toBeGreaterThanOrEqual(25);
  });

  it('chaque variable lue est déclarée dans le gabarit ou nommée en exception', () => {
    const manquent = [...lues].filter(([n]) => !declarees.has(n) && !(n in EXCEPTIONS))
      .map(([n, f]) => `${n} · lue par ${f.join(' et ')}, absente de .env.deploy.example (l’y déclarer vide, ou l’ajouter aux exceptions avec sa raison)`);
    expect(manquent).toEqual([]);
  });

  it('chaque exception est encore lue, et n’est pas aussi dans le gabarit (aucune exception périmée)', () => {
    const perimees = Object.keys(EXCEPTIONS).filter((n) => !lues.has(n) || declarees.has(n));
    expect(perimees).toEqual([]);
  });

  it('les interrupteurs Studios et les clés de ce sujet sont déclarés VIDES (aucune valeur réelle dans un gabarit)', () => {
    const noms = ['CRON_SECRET', 'AI_SPEND_CAP_USD', 'SMTP_URL', 'KLAVIYO_API_KEY', ...Object.values(ENV_INTERRUPTEURS)];
    const problemes = noms.flatMap((n) => {
      const l = ligneActive(n);
      if (l === undefined) return [`${n} absente (ligne active attendue)`];
      return l.trim() === `${n}=` ? [] : [`${n} doit rester vide`];
    });
    expect(problemes).toEqual([]);
  });

  it('chaque variable ajoutée dit ce qui se passe sans elle (commentaire au-dessus)', () => {
    for (const n of ['CRON_SECRET', 'AI_SPEND_CAP_USD', 'SMTP_URL', ENV_INTERRUPTEURS.generales, ENV_INTERRUPTEURS.capacitesPilotes]) {
      const i = GABARIT.findIndex((l) => l.startsWith(`${n}=`));
      const dessus: string[] = [];
      for (let k = i - 1; k >= 0 && GABARIT[k]?.startsWith('#'); k--) dessus.unshift(GABARIT[k] ?? '');
      expect(dessus.join(' '), `${n} · aucun commentaire « ABSENT / VIDE » au-dessus`).toMatch(/ABSENTE?|VIDE/);
    }
  });
});
