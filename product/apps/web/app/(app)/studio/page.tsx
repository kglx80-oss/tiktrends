import { redirect } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { higgsfieldConfigured, falConfigured } from '@tiktrends/integrations';
import { effectiveAccess } from '../../../lib/access';
import { Hub, type HubCard, type HubNext, type HubState } from '../../../components/Hub';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

/**
 * Studio IA · la page qui oriente, et qui ne travaille pas.
 *
 * ── Ce qu'elle faisait ───────────────────────────────────────────────────────
 *
 * Elle ouvrait sur « Produit / marque / offre * ». Devant ce champ, la question
 * n'est pas « lequel choisir » mais « pourquoi on me demande ça alors que je
 * voulais voir ce que l'outil sait faire ». Les quatre studios, eux, étaient
 * relégués sous le formulaire, en liens · c'est-à-dire que la racine de la
 * section cachait la section.
 *
 * ── Ce qu'elle fait maintenant ───────────────────────────────────────────────
 *
 * Elle dit ce que chaque studio PRODUIT, QUAND s'en servir, et OÙ l'on en est.
 * Le « quand » est la seule information qui manque vraiment devant quatre
 * portes qui se ressemblent.
 *
 * ── Et elle sait dire de ne pas générer ──────────────────────────────────────
 *
 * Quand la marque a des créas et aucun verdict, le geste conseillé n'est pas
 * d'en faire une de plus · c'est d'aller trancher. Une page de garde honnête
 * peut dire cette phrase avant qu'on ait cliqué, et c'est le seul endroit de
 * l'outil où elle arrive à temps.
 */
export default async function StudioPage() {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess(effectiveAccess(s), feature)) {
    const why = denyReason(effectiveAccess(s), feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Studio IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>{why === 'plan' ? "Inclus dès l'abonnement Core" : 'Accès réservé'}</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {why === 'plan' ? 'La génération de créatives est disponible à partir du plan Core.' : "Ton rôle ne permet pas d'accéder au Studio."}
          </p>
          {why === 'plan' && s.role === 'owner' && (
            <a href="/settings" style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Gérer l'abonnement →</a>
          )}
        </div>
      </main>
    );
  }

  const brand = await getActiveBrand(s.workspaceId);
  const etat = await lireEtat(s.workspaceId, brand?.id ?? null);

  const image = falConfigured();
  const video = falConfigured() || higgsfieldConfigured();
  const texte = !!process.env.ANTHROPIC_API_KEY;

  const pret = (ok: boolean, manque: string): HubState => (ok ? { kind: 'ready' } : { kind: 'setup', why: manque });

  const cards: HubCard[] = [
    {
      href: '/studio/ads', icon: '✨', title: 'Pubs IA', tag: 'COMPLET',
      makes: 'Une publicité entière, prête à poster : le concept, la scène avec ton produit, l’accroche écrite dessus, le CTA et ton logo, composés ensemble.',
      when: 'C’est le studio par défaut. Tu veux une pub, pas un morceau de pub.',
      state: pret(image && texte, image ? 'clé IA manquante' : 'clé Fal manquante'),
      count: etat.ads,
    },
    {
      href: '/studio/image', icon: '🖼️', title: 'Image IA',
      makes: 'Un visuel seul, décrit à la main : mise en scène de ton vrai packaging, ou image partant du texte. Avec texte lisible si tu le demandes.',
      when: 'Tu as une idée d’image précise en tête, ou tu veux un visuel hors format publicitaire.',
      state: pret(image, 'clé Fal manquante'),
      count: etat.images,
    },
    {
      href: '/studio/video', icon: '🎬', title: 'Vidéo IA',
      makes: 'Une vidéo verticale de quelques secondes, écrite de zéro ou obtenue en animant une image que tu as déjà.',
      when: 'Une créa statique tient déjà et tu veux savoir si le mouvement la fait gagner davantage.',
      state: pret(video, 'clé vidéo manquante'),
      count: etat.videos,
    },
    {
      href: '/studio/textes', icon: '✍️', title: 'Textes IA',
      makes: 'Des angles, des accroches, un script seconde par seconde, des textes d’annonce et des légendes. Rien que du texte, copiable.',
      when: 'Tu cherches encore ce que la créa doit dire. Un angle trouvé ici s’envoie en un clic vers Pubs IA.',
      state: pret(texte, 'clé IA manquante'),
      count: etat.textes,
    },
  ];

  return (
    <main style={wrap}>
      <h1 style={h1}>Studio IA</h1>
      <Hub
        intro={
          brand
            ? `Quatre outils pour fabriquer des créas pour ${brand.name}. Ils ne se remplacent pas : chacun répond à une question différente, et la réponse est dans le « Quand ? » de chaque carte.`
            : 'Quatre outils pour fabriquer des créas. Ils ne se remplacent pas : chacun répond à une question différente, et la réponse est dans le « Quand ? » de chaque carte.'
        }
        next={prochainGeste(etat, brand?.name ?? null)}
        cards={cards}
      >
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 720 }}>
          Une créa fabriquée ici ne vaut rien tant qu’elle n’a pas été jugée. Envoie-la dans un lot depuis
          l’Adsmap · c’est le verdict, pas la génération, qui apprend quelque chose à Jarvis.
        </p>
      </Hub>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ce qu'on sait de l'atelier                                                */
/* -------------------------------------------------------------------------- */

interface EtatAtelier {
  ads: { n: number; label: string } | null;
  images: { n: number; label: string } | null;
  videos: { n: number; label: string } | null;
  textes: { n: number; label: string } | null;
  /** Créas passées en test · `null` quand la lecture échoue. */
  jugees: number | null;
  enAttente: number | null;
}

const VIDE: EtatAtelier = { ads: null, images: null, videos: null, textes: null, jugees: null, enAttente: null };

/**
 * Chaque lecture est isolée.
 *
 * Une page de garde qui tombe entière parce qu'un compteur manque est pire
 * qu'une page sans compteur · c'est la leçon de la colonne absente qui avait
 * fait tomber Jarvis en entier.
 */
async function lireEtat(workspaceId: string, brandId: string | null): Promise<EtatAtelier> {
  if (!db || !brandId) return VIDE;
  const base = db;

  const compter = async (kind: 'ad' | 'image' | 'video' | 'script'): Promise<number | null> => {
    try {
      const [r] = await base.select({ n: count() }).from(schema.generations)
        .where(and(eq(schema.generations.brandId, brandId), eq(schema.generations.kind, kind)));
      return r?.n ?? 0;
    } catch { return null; }
  };

  const juger = async (): Promise<{ jugees: number | null; enAttente: number | null }> => {
    try {
      const [total] = await base.select({ n: count() }).from(schema.ads)
        .where(eq(schema.ads.workspaceId, workspaceId));
      const [tranches] = await base.select({ n: count() }).from(schema.verdicts)
        .innerJoin(schema.ads, eq(schema.verdicts.adId, schema.ads.id))
        .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.verdicts.status, 'validated')));
      const j = tranches?.n ?? 0;
      return { jugees: j, enAttente: Math.max(0, (total?.n ?? 0) - j) };
    } catch { return { jugees: null, enAttente: null }; }
  };

  const [ads, images, videos, textes, verdicts] = await Promise.all([
    compter('ad'), compter('image'), compter('video'), compter('script'), juger(),
  ]);

  const c = (n: number | null, label: string) => (n === null ? null : { n, label });
  return {
    ads: c(ads, 'pub'), images: c(images, 'visuel'), videos: c(videos, 'vidéo'), textes: c(textes, 'brief'),
    jugees: verdicts.jugees, enAttente: verdicts.enAttente,
  };
}

/**
 * Le geste conseillé maintenant.
 *
 * Trois cas, dans cet ordre · et le deuxième est le seul qui compte vraiment :
 * quand il y a des créas et aucun verdict, conseiller d'en générer une de plus
 * serait vendre du volume à quelqu'un qui manque de mesure.
 */
function prochainGeste(e: EtatAtelier, marque: string | null): HubNext | null {
  const produites = (e.ads?.n ?? 0) + (e.images?.n ?? 0) + (e.videos?.n ?? 0);

  if (produites === 0) {
    return {
      title: 'Commence par une pub complète',
      why: marque
        ? `Rien n’a encore été produit pour ${marque}. Pubs IA est le seul studio qui rend une publicité entière · les autres produisent des morceaux qu’il faudra assembler.`
        : 'Rien n’a encore été produit. Pubs IA est le seul studio qui rend une publicité entière.',
      href: '/studio/ads', cta: 'Ouvrir Pubs IA',
    };
  }

  // Le cas qui justifie cette bannière · on le dit avant le clic, pas après.
  if (e.jugees === 0 && (e.enAttente ?? 0) > 0) {
    return {
      title: 'Fais trancher ce que tu as déjà',
      why: `${e.enAttente} créa(s) attendent un verdict. Tant qu’aucune n’est jugée, Jarvis n’a rien appris de cette marque · et la suivante sera aussi aveugle que la première.`,
      href: '/adsmap/lots', cta: 'Ouvrir les lots',
    };
  }

  if (e.jugees !== null && e.jugees > 0) {
    return {
      title: 'Itère sur ce qui a gagné',
      why: `${e.jugees} verdict(s) posé(s). Jarvis peut maintenant proposer la variante suivante en ne changeant qu’une seule chose · c’est ce qui rend un résultat attribuable.`,
      href: '/adsmap/suites', cta: 'Ouvrir les suites',
    };
  }

  return null;
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' } as const;
const h1 = { margin: '0 0 18px', fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
