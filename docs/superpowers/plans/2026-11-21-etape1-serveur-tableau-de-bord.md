# AwladShield — Étape 1 : Serveur + tableau de bord + comptes parents + appairage — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un serveur familial auto-hébergé qui démarre, sert un tableau de bord web, gère un ou plusieurs comptes parents (mot de passe + TOTP + codes de secours), des profils enfants, et l'appairage d'un PC enfant qui obtient un jeton d'accès.

**Architecture:** Serveur Node.js/TypeScript (Fastify) avec base SQLite (better-sqlite3) et migrations ; tableau de bord React (Vite) servi en statique par le serveur ; API HTTP+JSON. Authentification parent par session cookie après mot de passe + code TOTP. Un PC enfant s'appaire via un code à usage unique et reçoit un jeton d'appareil (haché en base).

**Tech Stack:** Node.js 22, TypeScript, Fastify, better-sqlite3, argon2 (argon2id), otplib (TOTP), zod (validation), React 18 + Vite, Vitest + @testing-library/react, Playwright (fumée).

**Spec:** `docs/superpowers/specs/2026-11-21-awadshield-design.md`

## Global Constraints

- Node.js 22 (déjà présent), TypeScript strict (`"strict": true`).
- Tranches d'âge, valeurs exactes : `"7-10"`, `"11-14"`, `"15-17"` (spec 5.7).
- Hachage des mots de passe : **argon2id** (spec 5.9/D2).
- TOTP standard (otplib `authenticator` : 6 chiffres, période 30 s).
- Codes de secours : **10** codes générés à l'enrôlement, stockés **hachés** (spec D8).
- Jetons d'appareil et codes d'appairage : stockés **hachés**, jamais en clair en base.
- Nom de l'application affiché : **AwladShield**.
- **Deux parents ou plus** doivent pouvoir se créer un accès et agir (spec 5.1/D5).
- Tout le code de cette étape vit sous `server/` (serveur + API) et `dashboard/` (React).
- **Hors périmètre de l'étape 1, câblé plus tard :** chiffrement au repos (clé machine / clé dérivée du mot de passe parent) en étape 4 ; règles de temps, filtrage, surveillance en étapes 2-5. L'étape 1 ne collecte aucune donnée sensible, donc la base reste en clair ici, ce que l'étape 4 corrigera.

## Review Focus

- **Deuxième `/api/setup` après qu'un parent existe déjà :** doit être refusé (409), sinon n'importe qui ré-initialise le premier compte. → testé en Task 3.
- **Login avec bon mot de passe mais TOTP faux ou absent :** doit échouer (401) sans créer de session. → testé en Task 4.
- **Réclamer un code d'appairage expiré ou déjà utilisé :** doit échouer (410/409), un code ne sert qu'une fois. → testé en Task 6.
- **Heartbeat avec jeton d'appareil invalide ou révoqué :** doit échouer (401), pas de mise à jour `last_seen_at`. → testé en Task 7.
- **Accès à une route protégée sans session parent :** doit échouer (401) avant toute lecture de données. → testé en Task 4.

---

### Task 1: Scaffold du serveur (Fastify + SQLite + migrations + /health)

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
- Create: `server/src/db/connection.ts`, `server/src/db/migrate.ts`, `server/src/db/migrations/001_init.sql`
- Create: `server/src/app.ts`, `server/src/server.ts`
- Test: `server/test/health.test.ts`, `server/test/migrate.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path: string): DatabaseType` — ouvre/crée la base SQLite (better-sqlite3), active `PRAGMA foreign_keys = ON`.
  - `runMigrations(db: DatabaseType): void` — applique en ordre les fichiers `migrations/*.sql` non encore appliqués, suivis dans une table `_migrations`.
  - `buildApp(db: DatabaseType): FastifyInstance` — construit l'app Fastify sans écouter ; `GET /health` renvoie `{ status: "ok", app: "AwladShield" }`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// health.test.ts
test("GET /health renvoie ok", async () => {
  const app = buildApp(openDb(":memory:"));
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok", app: "AwladShield" });
});
// migrate.test.ts
test("runMigrations crée la table _migrations et est idempotent", () => {
  const db = openDb(":memory:");
  runMigrations(db); runMigrations(db); // deux fois = pas d'erreur
  const row = db.prepare("SELECT count(*) c FROM _migrations").get();
  expect(row.c).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd server && npm test`
Expected: FAIL (modules/fonctions introuvables).

- [ ] **Step 3: Implémenter le scaffold**

Créer `package.json` (scripts `dev`, `build`, `test` → vitest ; deps : fastify, better-sqlite3, zod ; devDeps : typescript, vitest, @types/node, tsx). `tsconfig.json` en `strict`. Implémenter `openDb`, `runMigrations` (lit les `.sql` du dossier migrations, les applique dans une transaction, enregistre le nom dans `_migrations`), `buildApp` avec la route `/health`. `001_init.sql` peut être vide à ce stade (juste un commentaire) ; les tables arrivent aux tâches suivantes via de nouveaux fichiers de migration.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat(server): scaffold Fastify + SQLite + migrations + /health"
```

---

### Task 2: Primitives de sécurité (mot de passe, TOTP, codes de secours)

**Files:**
- Create: `server/src/auth/crypto.ts`
- Test: `server/test/crypto.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `hashPassword(plain: string): Promise<string>` / `verifyPassword(hash: string, plain: string): Promise<boolean>` — argon2id.
  - `generateTotpSecret(): string` et `otpauthUrl(secret: string, label: string): string` (otplib `authenticator.keyuri`, issuer `AwladShield`).
  - `verifyTotp(secret: string, token: string): boolean`.
  - `generateBackupCodes(n?: number): string[]` (défaut 10, format `XXXX-XXXX` base32) et `hashBackupCode(code: string): string` (SHA-256 hex). La vérification compare le haché.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
test("un mot de passe se vérifie, un faux échoue", async () => {
  const h = await hashPassword("s3cret!");
  expect(await verifyPassword(h, "s3cret!")).toBe(true);
  expect(await verifyPassword(h, "mauvais")).toBe(false);
});
test("TOTP: un jeton courant est accepté", () => {
  const s = generateTotpSecret();
  const token = authenticator.generate(s); // otplib dans le test
  expect(verifyTotp(s, token)).toBe(true);
  expect(verifyTotp(s, "000000")).toBe(false);
});
test("10 codes de secours, uniques, hachage vérifiable", () => {
  const codes = generateBackupCodes();
  expect(codes).toHaveLength(10);
  expect(new Set(codes).size).toBe(10);
  expect(hashBackupCode(codes[0])).toBe(hashBackupCode(codes[0]));
});
```

- [ ] **Step 2: Lancer les tests → FAIL.** Run: `cd server && npm test crypto`

- [ ] **Step 3: Implémenter `crypto.ts`** avec argon2 et otplib (ajouter `argon2`, `otplib` aux deps).

- [ ] **Step 4: Lancer les tests → PASS.** Run: `cd server && npm test crypto`

- [ ] **Step 5: Commit** `feat(server): primitives mot de passe, TOTP, codes de secours`

---

### Task 3: Comptes parents — bootstrap et ajout

**Files:**
- Create: `server/src/db/migrations/002_parents.sql` (table `parents`)
- Create: `server/src/parents/parents.repo.ts`, `server/src/parents/parents.routes.ts`
- Modify: `server/src/app.ts` (enregistrer les routes)
- Test: `server/test/parents.test.ts`

**Interfaces:**
- Consumes: Task 2 (`hashPassword`, `generateTotpSecret`, `otpauthUrl`, `verifyTotp`, `generateBackupCodes`, `hashBackupCode`).
- Produces:
  - Table `parents(id TEXT PK, email TEXT UNIQUE, display_name TEXT, password_hash TEXT, totp_secret TEXT, totp_enabled INTEGER, backup_codes_hashes TEXT /*json*/, created_at TEXT)`.
  - `countParents(db): number`, `createParent(db, {email, displayName, password}): Promise<{id, totpSecret, otpauthUrl, backupCodes}>` (totp_enabled=0 jusqu'à confirmation), `confirmTotp(db, parentId, token): boolean` (passe totp_enabled=1), `getParentByEmail(db, email)`.
  - `POST /api/setup` — refusé **409** si `countParents > 0` ; sinon crée le premier parent et renvoie `{ parentId, otpauthUrl, backupCodes }`.
  - `POST /api/setup/confirm` `{ parentId, token }` → active le TOTP.
  - `POST /api/parents` (protégé, voir Task 4) — ajoute un parent supplémentaire ; même retour d'enrôlement TOTP.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
test("premier /api/setup crée le parent et renvoie l'enrôlement TOTP", async () => {
  const res = await app.inject({ method:"POST", url:"/api/setup",
    payload:{ email:"p1@x.fr", displayName:"Parent 1", password:"s3cret!" }});
  expect(res.statusCode).toBe(201);
  expect(res.json().otpauthUrl).toContain("AwladShield");
  expect(res.json().backupCodes).toHaveLength(10);
});
test("un deuxième /api/setup est refusé (409)", async () => {
  // après un premier setup réussi
  const res = await app.inject({ method:"POST", url:"/api/setup",
    payload:{ email:"p2@x.fr", displayName:"P2", password:"x" }});
  expect(res.statusCode).toBe(409);
});
```

- [ ] **Step 2: FAIL.** Run: `cd server && npm test parents`
- [ ] **Step 3:** Écrire la migration `002_parents.sql`, le repo et les routes (validation zod des corps). `id` = uuid. `/api/parents` est enregistré derrière le middleware d'auth de la Task 4 (jusque-là, test unitaire du repo seulement pour l'ajout).
- [ ] **Step 4: PASS.** Run: `cd server && npm test parents`
- [ ] **Step 5: Commit** `feat(server): comptes parents (bootstrap + ajout) avec enrôlement TOTP`

---

### Task 4: Authentification (login mot de passe + TOTP, sessions, middleware)

**Files:**
- Create: `server/src/db/migrations/003_sessions.sql` (table `sessions`)
- Create: `server/src/auth/sessions.ts`, `server/src/auth/auth.routes.ts`, `server/src/auth/require-parent.ts`
- Modify: `server/src/app.ts`, `server/src/parents/parents.routes.ts` (protéger `POST /api/parents`)
- Test: `server/test/auth.test.ts`

**Interfaces:**
- Consumes: Task 2 (`verifyPassword`, `verifyTotp`), Task 3 (`getParentByEmail`).
- Produces:
  - Table `sessions(id TEXT PK, parent_id TEXT, created_at TEXT, expires_at TEXT)`.
  - `createSession(db, parentId): string` (id aléatoire 32 o, durée 7 j), `getSessionParent(db, sessionId): parentId|null` (null si expirée).
  - `POST /api/auth/login` `{ email, password, totp }` → **401** si mot de passe faux, TOTP faux **ou** TOTP absent ; sinon pose un cookie `awlad_session` (HttpOnly, SameSite=Lax) et renvoie `{ parentId, displayName }`.
  - `POST /api/auth/logout` (supprime la session).
  - `requireParent` — décorateur/préhandler Fastify : **401** si pas de session valide, sinon attache `req.parentId`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
test("login échoue si le TOTP est faux", async () => {
  const res = await login({ email, password, totp:"000000" });
  expect(res.statusCode).toBe(401);
  expect(res.cookies.find(c=>c.name==="awlad_session")).toBeUndefined();
});
test("login réussit avec mot de passe + bon TOTP et pose un cookie", async () => {
  const res = await login({ email, password, totp: current() });
  expect(res.statusCode).toBe(200);
  expect(res.cookies.some(c=>c.name==="awlad_session")).toBe(true);
});
test("route protégée sans session → 401", async () => {
  const res = await app.inject({ method:"GET", url:"/api/children" });
  expect(res.statusCode).toBe(401);
});
```

- [ ] **Step 2: FAIL.** Run: `cd server && npm test auth`
- [ ] **Step 3:** Implémenter sessions, routes de login/logout, `requireParent` (via `@fastify/cookie`). Protéger `POST /api/parents`.
- [ ] **Step 4: PASS.** Run: `cd server && npm test auth`
- [ ] **Step 5: Commit** `feat(server): auth parent (login mot de passe+TOTP, sessions, middleware)`

---

### Task 5: Profils enfants (CRUD minimal)

**Files:**
- Create: `server/src/db/migrations/004_children.sql`
- Create: `server/src/children/children.repo.ts`, `server/src/children/children.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/children.test.ts`

**Interfaces:**
- Consumes: Task 4 (`requireParent`).
- Produces:
  - Table `children(id TEXT PK, display_name TEXT, age_band TEXT, created_at TEXT)`.
  - `age_band` ∈ `"7-10" | "11-14" | "15-17"` (rejet zod sinon).
  - `GET /api/children` (protégé) → `[{ id, displayName, ageBand }]`.
  - `POST /api/children` (protégé) `{ displayName, ageBand }` → 201 `{ id }`.

- [ ] **Step 1: Test qui échoue**

```ts
test("créer puis lister un enfant", async () => {
  const c = await authed("POST","/api/children",{ displayName:"Sara", ageBand:"11-14" });
  expect(c.statusCode).toBe(201);
  const list = await authed("GET","/api/children");
  expect(list.json()).toContainEqual(expect.objectContaining({ displayName:"Sara", ageBand:"11-14" }));
});
test("age_band invalide refusé (400)", async () => {
  const r = await authed("POST","/api/children",{ displayName:"X", ageBand:"5-6" });
  expect(r.statusCode).toBe(400);
});
```

- [ ] **Step 2: FAIL.** Run: `cd server && npm test children`
- [ ] **Step 3:** Migration, repo, routes (zod enum pour `ageBand`).
- [ ] **Step 4: PASS.** Run: `cd server && npm test children`
- [ ] **Step 5: Commit** `feat(server): profils enfants (CRUD minimal)`

---

### Task 6: Appairage des appareils (code à usage unique + réclamation)

**Files:**
- Create: `server/src/db/migrations/005_devices.sql` (tables `devices`, `pairing_codes`)
- Create: `server/src/devices/pairing.repo.ts`, `server/src/devices/pairing.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/pairing.test.ts`

**Interfaces:**
- Consumes: Task 4 (`requireParent`), Task 5 (enfant existant).
- Produces:
  - Table `devices(id TEXT PK, child_id TEXT, name TEXT, os TEXT, token_hash TEXT, paired_at TEXT, last_seen_at TEXT)`.
  - Table `pairing_codes(code_hash TEXT PK, child_id TEXT, device_name TEXT, expires_at TEXT, used_at TEXT)`.
  - `POST /api/pairing/code` (protégé) `{ childId, deviceName }` → `{ code, expiresAt }` ; code lisible renvoyé une seule fois, **haché** en base, **expire 15 min**.
  - `POST /api/pairing/claim` (non protégé) `{ code, hostname, os }` → **410** si expiré, **409** si déjà utilisé, sinon crée le `device`, marque le code `used`, renvoie `{ deviceId, deviceToken }` (jeton 32 o, renvoyé une fois, **haché** en base).

- [ ] **Step 1: Tests qui échouent**

```ts
test("un code valide crée un appareil et renvoie un jeton", async () => {
  const { code } = (await authed("POST","/api/pairing/code",{ childId, deviceName:"PC-Sara" })).json();
  const r = await app.inject({ method:"POST", url:"/api/pairing/claim",
    payload:{ code, hostname:"PC-SARA", os:"windows" }});
  expect(r.statusCode).toBe(200);
  expect(r.json().deviceToken).toBeTruthy();
});
test("réclamer deux fois le même code → 409", async () => {
  // après une première réclamation réussie
  const r = await app.inject({ method:"POST", url:"/api/pairing/claim",
    payload:{ code, hostname:"X", os:"windows" }});
  expect(r.statusCode).toBe(409);
});
test("code expiré → 410", async () => { /* forcer expires_at dans le passé */ });
```

- [ ] **Step 2: FAIL.** Run: `cd server && npm test pairing`
- [ ] **Step 3:** Migrations, repo (génération et hachage des codes/jetons via Task 2 patterns), routes avec les codes HTTP ci-dessus.
- [ ] **Step 4: PASS.** Run: `cd server && npm test pairing`
- [ ] **Step 5: Commit** `feat(server): appairage des appareils (code à usage unique + réclamation)`

---

### Task 7: Jeton d'appareil, heartbeat et liste des appareils

**Files:**
- Create: `server/src/devices/require-device.ts`, `server/src/devices/devices.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/devices.test.ts`

**Interfaces:**
- Consumes: Task 6 (`devices.token_hash`), Task 4 (`requireParent`).
- Produces:
  - `requireDevice` — préhandler : lit `Authorization: Bearer <token>`, compare au `token_hash`, **401** sinon ; attache `req.deviceId`.
  - `POST /api/devices/heartbeat` (device) → met à jour `last_seen_at`, renvoie `{ serverTime }`.
  - `GET /api/devices` (protégé parent) → `[{ id, childId, name, os, lastSeenAt, online }]` (`online` = vu il y a < 3 min).

- [ ] **Step 1: Tests qui échouent**

```ts
test("heartbeat avec bon jeton met à jour last_seen", async () => {
  const r = await app.inject({ method:"POST", url:"/api/devices/heartbeat",
    headers:{ authorization:`Bearer ${deviceToken}` }});
  expect(r.statusCode).toBe(200);
  const list = await authed("GET","/api/devices");
  expect(list.json()[0].online).toBe(true);
});
test("heartbeat avec jeton invalide → 401", async () => {
  const r = await app.inject({ method:"POST", url:"/api/devices/heartbeat",
    headers:{ authorization:"Bearer faux" }});
  expect(r.statusCode).toBe(401);
});
```

- [ ] **Step 2: FAIL.** Run: `cd server && npm test devices`
- [ ] **Step 3:** Implémenter `requireDevice`, les routes, le calcul `online`.
- [ ] **Step 4: PASS.** Run: `cd server && npm test devices`
- [ ] **Step 5: Commit** `feat(server): jeton d'appareil, heartbeat, liste des appareils`

---

### Task 8: Tableau de bord React (login, accueil, enfants, parents, appairage)

**Files:**
- Create: `dashboard/` (projet Vite React TS : `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/api.ts`, `src/pages/{Setup,Login,Home,Children,Parents,Pairing}.tsx`, `src/App.tsx`)
- Modify: `server/src/app.ts` (servir `dashboard/dist` en statique via `@fastify/static`, fallback SPA)
- Test: `dashboard/test/{login,home}.test.tsx` (Vitest + @testing-library/react), `dashboard/e2e/smoke.spec.ts` (Playwright)

**Interfaces:**
- Consumes: toutes les routes `/api/*` des tâches précédentes.
- Produces: une SPA servie à `/`. `src/api.ts` expose des fonctions typées (`login`, `getChildren`, `createChild`, `createPairingCode`, `getDevices`, `addParent`, `setup`).

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
test("le formulaire de login envoie email+password+totp", async () => {
  render(<Login onSuccess={fn} />);
  // remplir les trois champs, cliquer "Se connecter", attendre l'appel api.login
  expect(apiLogin).toHaveBeenCalledWith({ email:"p@x.fr", password:"s3cret!", totp:"123456" });
});
test("l'accueil affiche une carte par enfant", async () => {
  mockGetChildren([{ id:"1", displayName:"Sara", ageBand:"11-14" }]);
  render(<Home/>);
  expect(await screen.findByText("Sara")).toBeInTheDocument();
});
```

Et une fumée Playwright : `setup → login → créer un enfant → générer un code d'appairage` contre le serveur réel lancé sur un port de test.

- [ ] **Step 2: FAIL.** Run: `cd dashboard && npm test` puis `npx playwright test --trace off`
- [ ] **Step 3:** Construire la SPA : routage (setup si aucun parent, sinon login), pages Accueil (cartes enfants + statut appareils via `/api/devices`), Enfants (ajout), Parents (ajout d'un parent + enrôlement TOTP avec QR de `otpauthUrl`), Appairage (choisir un enfant, générer et afficher le code). Brancher `@fastify/static` côté serveur. Lancer Playwright avec `--headless --no-sandbox`, `executablePath: '/opt/pw-browsers/chromium'` si besoin.
- [ ] **Step 4: PASS.** Run: `cd dashboard && npm test && npx playwright test --trace off`
- [ ] **Step 5: Commit** `feat(dashboard): tableau de bord (setup, login, enfants, parents, appairage)`

---

## Auto-revue (effectuée)

- **Couverture spec :** comptes parents multi (5.1/D5) → T3/T4 ; TOTP + codes de secours (5.1/D8) → T2/T3 ; profils enfants par âge (5.7) → T5 ; appairage par code → jeton (5.2) → T6 ; heartbeat/statut appareil (5.2/5.6) → T7 ; tableau de bord mobile (5.8) → T8. Hors périmètre volontaire : temps (ét. 2), filtrage (ét. 3), accès distant/chiffrement (ét. 4), surveillance (ét. 5), prototype capture (ét. 0, nécessite un vrai PC Windows).
- **Review Focus :** les 5 cas (double setup, TOTP faux, code expiré/réutilisé, jeton appareil invalide, route protégée sans session) ont chacun un test dans la tâche propriétaire.
- **Cohérence des types :** `age_band`/`ageBand`, `token_hash`, `requireParent`, `requireDevice` nommés de façon identique d'une tâche à l'autre.
- **Proportion :** signatures + noms de tests + valeurs exactes ; corps laissés à l'implémenteur.
