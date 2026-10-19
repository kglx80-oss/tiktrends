-- TikTrends · semis « ZÉRO PROPRE » · amorçage d'une app VIDE (pilote / prod neuve).
--
-- ── À quoi ça sert ───────────────────────────────────────────────────────────
--
-- Démarrer l'application sur une base au schéma de `main` SANS la moindre marque
-- de démonstration : il ne pose QUE l'espace fondateur et son compte
-- propriétaire. Zéro marque, zéro projet, zéro lot, zéro média, zéro donnée
-- métier. L'onboarding et la création de la première marque se font ensuite
-- DANS l'application, à la main, par le propriétaire.
--
-- Ce n'est PAS le semis de recette (`semis-synthetique.sql`, `semis-studios.sql`,
-- `packages/db/scripts/seed-fixtures.mjs`) : ceux-là restent la variante de
-- banc/test et ne sont ni modifiés ni remplacés. Celui-ci est la variante
-- « production neuve » · il n'insère aucune fausse donnée.
--
-- ── Garde-fous ───────────────────────────────────────────────────────────────
--
-- · AMORÇAGE SEULEMENT · refuse de tourner si une seule marque existe déjà
--   (base non vide). Pour vider une base déjà peuplée, c'est `reset-pilote.sql`.
-- · IDEMPOTENT · le compte propriétaire est clé sur son e-mail (unique) ;
--   relancer ne crée pas de doublon d'espace tant que le propriétaire a déjà le
--   sien.
-- · AUCUN secret · aucun mot de passe en dur. `password_hash` reste NULL · le
--   propriétaire pose son mot de passe par le parcours d'invitation / de
--   réinitialisation de l'application.
-- · Transaction · tout ou rien.
--
-- ── Activation ───────────────────────────────────────────────────────────────
--
--   psql "$DATABASE_URL" \
--     -v owner_email="proprietaire@exemple.fr" \
--     -v owner_name="Propriétaire" \
--     -v workspace_name="Mon espace" \
--     -f ops/migration/semis-zero-propre.sql
--
--   Variables (toutes optionnelles · valeurs par défaut ci-dessous) :
--     owner_email      e-mail du compte propriétaire fondateur
--     owner_name       nom affiché du propriétaire
--     workspace_name   nom de l'espace fondateur
--     plan             libellé de plan (défaut : starter)
--
--   Sur le VPS, le propriétaire exécute cette commande lui-même · la session
--   n'a pas d'accès SSH.

\set ON_ERROR_STOP on

-- Valeurs par défaut si une variable n'est pas fournie par -v.
\if :{?owner_email}    \else \set owner_email    'proprietaire@exemple.fr' \endif
\if :{?owner_name}     \else \set owner_name     'Propriétaire'            \endif
\if :{?workspace_name} \else \set workspace_name 'Espace fondateur'        \endif
\if :{?plan}           \else \set plan           'starter'                 \endif

BEGIN;

DO $$
DECLARE
  v_owner_email text := lower(:'owner_email');
  v_owner_name  text := :'owner_name';
  v_ws_name     text := :'workspace_name';
  v_plan        text := :'plan';
  v_user_id     uuid;
  v_ws_id       uuid;
  v_marques     int;
BEGIN
  -- Barrière d'amorçage · ce semis n'écrit QUE sur une base vide de marques.
  SELECT count(*) INTO v_marques FROM brands;
  IF v_marques > 0 THEN
    RAISE EXCEPTION 'Semis « zéro propre » refusé · % marque(s) déjà présente(s). Ce semis n''amorce qu''une base VIDE. Pour vider une base peuplée, utilisez reset-pilote.sql.', v_marques;
  END IF;

  -- Compte propriétaire · idempotent par e-mail unique (ne touche pas un mot de passe déjà posé).
  INSERT INTO users (email, name)
    VALUES (v_owner_email, v_owner_name)
    ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name)
    RETURNING id INTO v_user_id;

  -- Espace fondateur · créé une seule fois (si le propriétaire n'est propriétaire d'aucun espace).
  SELECT m.workspace_id INTO v_ws_id
    FROM workspace_members m
    WHERE m.user_id = v_user_id AND m.role = 'owner'
    LIMIT 1;

  IF v_ws_id IS NULL THEN
    INSERT INTO workspaces (name, plan) VALUES (v_ws_name, v_plan) RETURNING id INTO v_ws_id;
    INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (v_ws_id, v_user_id, 'owner')
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
  END IF;

  RAISE NOTICE 'Socle « zéro propre » prêt · espace % · propriétaire % · 0 marque, 0 projet, 0 lot, 0 média.', v_ws_id, v_owner_email;
END $$;

COMMIT;
