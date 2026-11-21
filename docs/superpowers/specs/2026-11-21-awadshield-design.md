# AwladShield — Contrôle parental familial — Document de conception

*Version finale — 21 novembre 2026 — à valider*

> Nom de l'application : **AwladShield**. Dépôt : `ITLearner-0/AwadShield`
> (le dépôt porte « Awad » ; renommage possible côté GitHub si souhaité). Ce
> document est la référence à partir de laquelle le plan de construction sera écrit.

## 1. Intention

Un parent veut encadrer l'usage des PC Windows de ses enfants (7 à 17 ans) avec
trois fonctions : **limiter le temps d'écran**, **surveiller l'activité**,
**filtrer les contenus**.

Contraintes exprimées par le parent :
- **Gratuit**, sans abonnement qui grossit avec l'usage.
- **Indépendant** de tout service payant (Base44, Supabase…) : l'outil doit
  continuer à marcher si un service ferme ou change ses prix.
- **Hébergé sur son propre ordinateur** pour commencer, avec la possibilité de
  passer plus tard sur un serveur (mini-PC, NAS, serveur loué).
- **Windows d'abord** ; à prévoir dans l'architecture pour plus tard :
  **Linux et macOS** (PC), puis des **applications mobiles** Android, iOS et
  HarmonyOS. Rien de tout cela n'est construit en version 1, mais rien ne doit
  l'empêcher.
- **Surveillance complète et assumée**, dont la capture des mots de passe.
- **Accès à distance** au tableau de bord.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Un profil par enfant, réglages de départ par tranche d'âge (7-10, 11-14,
  15-17), modifiables.
- Temps d'écran : quota quotidien (semaine / week-end) et plages horaires.
- Alertes avant la fin du temps (10, 5, 1 min), puis verrouillage de la session.
- Demande de temps supplémentaire par l'enfant, acceptée ou refusée par un parent.
- Surveillance complète : applications et durée, adresses complètes des sites,
  frappes au clavier, captures d'écran, titres de fenêtres, conversations
  (reconstituées), coffre de mots de passe.
- Filtrage : catégories dangereuses bloquées, recherche sécurisée forcée, liste
  noire par enfant, applications interdites par enfant.
- Tableau de bord parent accessible **à la maison et à distance**.
- **Deux parents ou plus**, chacun avec son propre accès.
- Alertes **dans le tableau de bord, par e-mail et en notification instantanée**.
- Les règles s'appliquent **même quand le PC du parent est éteint**.

**Non-objectifs** (version 1 ; prévus dans l'architecture, pas construits)
- Autres PC : **Linux, macOS**.
- **Applications mobiles** : Android, iOS, HarmonyOS.
- Quotas de temps par application (« 1 h de jeux max »).

**Anti-objectifs** (ce qui ferait de l'outil un échec même s'il « marche »)
- Une surveillance que l'enfant ignore : il doit toujours être averti.
- Des données sensibles (frappes, captures, conversations, **mots de passe**)
  lisibles par quelqu'un d'autre que les parents : fuite, accès à distance mal
  protégé, vol des comptes de l'enfant.
- Des enfants privés d'internet parce que le PC du parent est éteint ou en panne.
- Un coût récurrent caché.
- Un outil qu'un enfant en compte standard peut désactiver sans que ce soit vu.

**Information de l'enfant :** à chaque ouverture de session, un message indique
« Cet ordinateur est surveillé par tes parents », et une icône permanente près
de l'horloge le rappelle. L'enfant **ne voit pas** ce qui est relevé ni comment.
Il voit seulement son temps restant et peut demander du temps en plus.

## 3. Contraintes

- **Comptes enfants Windows en « utilisateur standard » et locaux** (pas
  administrateur, pas compte Microsoft) — voir décision D4. L'installateur le
  vérifie, prévient, et guide la conversion si besoin.
- Aucun service cloud payant. L'accès à distance passe par **Tailscale** (gratuit
  en usage personnel) : réseau privé chiffré, rien d'exposé sur internet.
- Services externes, tous gratuits et remplaçables : **Cloudflare for Families**
  (DNS filtrant, 1.1.1.3 / 1.0.0.3), **Tailscale** (accès distant), et, pour la
  notification instantanée seulement, un **bot Telegram** (optionnel : l'outil
  marche sans). Aucun n'est payant ni ne détient les données.
- **Tests :** développement en environnement Linux. Le serveur et le tableau de
  bord y sont entièrement testables ; le Gardien Windows y est compilé et testé
  en partie, mais les vérifications finales (verrouillage, service, capture,
  filtrage) devront être faites sur un vrai PC Windows de la famille.

## 4. Approches envisagées

| Approche | Pour | Contre | Décision |
|---|---|---|---|
| Tout dans Base44 | Rapide | Payant à terme, tout s'arrête au désabonnement | Écartée |
| Base44 + Supabase | Interface rapide | Payant selon l'usage, dépendance cloud | Écartée (coût) |
| Microsoft Family Safety | Gratuit, intégré | Aucune API : impossible à piloter | Écartée |
| **Serveur local (PC parent) + Gardien sur chaque PC enfant + DNS filtrant gratuit** | Gratuit, indépendant, déplaçable | Changements de règles livrés quand le PC parent est allumé | **Retenue** |

Variante prévue : le serveur, empaqueté en **Docker**, pourra tourner sur un
Raspberry Pi, un NAS ou un serveur loué, en déplaçant un seul fichier de données.

## 5. Architecture

```
 PC du parent                              PC de chaque enfant
┌──────────────────────────┐  Tailscale ┌──────────────────────────────┐
│ Serveur familial (service│  (HTTPS,   │ Service « Gardien » (SYSTEM)  │
│  au démarrage)           │  nom       │  - copie locale des règles    │
│  - tableau de bord web   │◄─stable───►│  - compte le temps, verrouille│
│  - API pour les PC       │  toutes    │  - applique le filtrage       │
│  - base SQLite chiffrée  │  les       │  - surveille, met en file     │
│  - coffre mots de passe  │  minutes   │  - watchdog de l'agent         │
└──────────────────────────┘            │ Agent de session (compte      │
     │ alertes                          │  enfant)                      │
     ▼                                  │  - icône temps restant/alertes│
 Tableau de bord · e-mail · Telegram    │  - capture écran/frappes/appli │
                                        │  - demande de temps            │
                                        └──────────────────────────────┘
                                                    │ DNS
                                                    ▼
                                        Cloudflare for Families (gratuit)
```

### 5.1 Serveur familial (PC du parent)
- Un seul programme qui sert le tableau de bord et l'API, base **SQLite**.
- **Service Windows démarrant au boot** (décision D2), donc la synchronisation,
  le décompte du temps et le filtrage fonctionnent même quand aucun parent n'est
  connecté. Livré aussi en image Docker.
- **Deux niveaux de chiffrement (D2) :**
  - *Données de fonctionnement* (profils, règles, temps, état des appareils) :
    chiffrées avec une clé liée à la machine (DPAPI portée machine). Toujours
    disponibles pour le service, même hors session parent.
  - *Données sensibles* (frappes, captures, messagerie, **coffre de mots de
    passe**) : chiffrées avec une clé dérivée d'un **mot de passe parent**,
    gardée en mémoire **uniquement** pendant qu'un parent est connecté au
    tableau de bord. Au repos, illisibles même pour le service.
- Sauvegarde automatique quotidienne, chiffrée.
- Accès au tableau de bord : **mot de passe parent + code à usage unique (TOTP)**.
- **Deux parents ou plus (D5) :** chaque parent a son propre mot de passe et son
  propre TOTP. La clé des données sensibles est ré-enveloppée pour chacun, donc
  chacun y accède avec son seul mot de passe, sans partager de secret.
- Accès à distance par Tailscale : jamais exposé publiquement.

### 5.2 Gardien sur les PC enfants
Deux pièces, et un adressage stable.
1. **Service Windows (compte SYSTEM)** : règles, temps, verrouillage, filtrage,
   communication avec le serveur, **watchdog** de l'agent de session, mise en
   file et chiffrement des données en attente.
2. **Agent de session (compte enfant)** : icône près de l'horloge (temps
   restant, alertes, « demander plus de temps ») et **capture** (écran, frappes,
   application au premier plan) — car un service SYSTEM ne voit ni l'écran ni le
   clavier de l'enfant.
   - **Anti-arrêt (D6) :** l'agent tourne avec les droits de l'enfant ; un
     standard user peut théoriquement le repérer. Le service SYSTEM le relance
     aussitôt et **lève une alerte « agent arrêté »** si l'enfant le ferme. Une
     surveillance totalement invisible et inarrêtable n'est pas atteignable pour
     un compte standard — ce qui est cohérent avec une surveillance annoncée.
- **Adressage (D7) :** le Gardien joint toujours le serveur par son **nom
  Tailscale stable** (MagicDNS), à la maison comme ailleurs. Le certificat
  auto-signé porte ce nom et est épinglé. Un changement d'IP de la box ne casse
  rien. Les PC enfants rejoignent donc le réseau Tailscale (sync possible même
  hors domicile, ex. chez un grand-parent).
- **Couplage enfant ↔ PC :** chaque compte Windows enfant est lié à un profil.
  Un PC partagé par deux enfants est géré correctement.
- **Mise en service :** un parent génère un code d'appairage ; on le saisit à
  l'installation du Gardien, qui reçoit son propre jeton d'accès.

### 5.3 Temps d'écran
- Le temps compte quand la session enfant est ouverte et active.
- Plages horaires : en plus du Gardien, les **horaires de connexion Windows** du
  compte local sont réglés, pour que Windows refuse lui-même l'ouverture hors
  plage, même Gardien arrêté.
- Fin du temps : alertes à 10, 5, 1 min, puis verrouillage ; reconnexion sans
  temps = re-verrouillage avec explication et moyen de demander du temps.
- Hors connexion : le Gardien décompte localement et rattrape la sync ensuite.

### 5.4 Surveillance de l'activité
Activable et réglable **par enfant**.
- **Applications :** appli au premier plan, titre de fenêtre, durée.
- **Sites :** adresses complètes, heure et durée approximative, lues dans
  l'historique d'Edge, Chrome, Firefox (relevé toutes les minutes pour attraper
  un historique effacé entre deux).
- **Frappes au clavier :** texte tapé, par application et fenêtre, horodaté.
- **Mots de passe — coffre (D1) :** deux sources complémentaires, car les champs
  de mot de passe ne sont pas lisibles par les API d'accessibilité :
  1. **Gestionnaires des navigateurs** (Edge/Chrome/Firefox) : leurs mots de
     passe enregistrés sont déchiffrables sur le PC enfant avec les droits de
     l'enfant ; le Gardien les lit et les range, associés à leur site.
  2. **Frappes dans les champs de mot de passe** : capturées pour les saisies non
     enregistrées, rattachées au site/appli au premier plan.
  Résultat rangé dans un **coffre chiffré à part** (voir 5.9), jamais affiché en
  clair par défaut : révélation après **seconde validation** (mot de passe +
  TOTP), chaque consultation **journalisée**. *Risque technique assumé : la
  couverture n'est pas garantie à 100 % selon les applis ; ce module est
  prototypé en premier (étape 0) pour mesurer ce qui est réellement capturable.*
- **Captures d'écran :** toutes les 5 min par défaut (réglable 1–30 min) et à
  chaque changement d'appli, compressées, envoyées au serveur.
- **Conversations :** les messageries chiffrent leurs données ; les échanges sont
  reconstitués depuis les frappes (envoyés) et les captures (reçus). Vue
  « Messagerie » du tableau de bord, regroupée par application.
- **Recherche & mots d'alerte :** recherche dans frappes, titres, adresses ; des
  mots d'alerte déclenchent une notification (voir 5.8).
- **Conservation :** activité et frappes 90 jours, captures 30 jours, réglable ;
  purge automatique. ~1 à 3 Go de captures par enfant et par mois.

### 5.5 Filtrage
Trois couches, qui fonctionnent sans le PC du parent :
1. **DNS filtrant :** cartes réseau de l'enfant réglées sur Cloudflare for
   Families (contenus adultes et sites malveillants bloqués).
2. **Règles des navigateurs** (stratégies officielles Edge/Chrome/Firefox) :
   recherche sécurisée forcée (Google, Bing), mode restreint YouTube, liste noire
   du profil, désactivation du « DNS sécurisé » du navigateur (qui contournerait
   le filtrage), navigation privée désactivée pour les 7-14 ans.
3. **Applications interdites :** liste par enfant ; une appli lancée est fermée
   et enregistrée. Un navigateur non pris en charge (installé sans droits admin)
   est traité comme une application interdite par défaut.

### 5.6 Résistance au contournement
- Service protégé, redémarrage auto, fichiers en lecture seule pour l'enfant,
  watchdog de l'agent de session.
- Alerte parent si : un PC allumé ne donne plus de nouvelles, l'heure du PC a été
  modifiée, le DNS a été changé, une appli interdite a été tentée, l'agent de
  capture a été arrêté.
- Désinstallation du Gardien protégée par le mot de passe parent.

### 5.7 Réglages par tranche d'âge (point de départ, modifiables)

| | 7-10 ans | 11-14 ans | 15-17 ans |
|---|---|---|---|
| Temps / jour (semaine · week-end) | 1 h · 2 h | 2 h · 3 h | 3 h · 4 h |
| Plage horaire | 8 h – 19 h 30 | 8 h – 21 h | 7 h – 22 h 30 |
| Navigation privée | bloquée | bloquée | autorisée |
| Adresses des sites, applications | oui | oui | oui |
| Frappes au clavier | oui | oui | oui |
| Coffre de mots de passe | oui | oui | oui |
| Captures d'écran | 5 min | 5 min | 5 min |
| Filtrage | DNS + sécurisé + liste noire | idem | DNS + sécurisé |

### 5.8 Tableau de bord parent et alertes
- **Accueil :** une carte par enfant (temps du jour / quota, statut du PC,
  demandes en attente).
- **Fiche enfant :** règles de temps, plages, filtrage, applis interdites.
- **Activité :** applications, sites, chronologie du jour.
- **Frappes, captures, messagerie :** consultation par jour et par appli,
  recherche, mots d'alerte.
- **Coffre de mots de passe :** liste des comptes (site, identifiant) ;
  révélation après seconde validation ; journal des consultations.
- **Demandes :** accepter (+15, +30, +60 min) ou refuser.
- **Alertes :** contournements et mots d'alerte.
- **Appareils :** PC rattachés, appairage.
- **Parents :** gestion des comptes parents (D5).
- **Alertes multi-canal (D3) :** chaque alerte paraît dans le tableau de bord,
  part en **e-mail** (via le serveur SMTP du parent, configuré au départ) et en
  **notification instantanée** via un bot Telegram gratuit (optionnel ; sans lui,
  tableau de bord + e-mail suffisent). Chaque parent choisit ses canaux.

Mise en page adaptée au téléphone et à l'ordinateur.

### 5.9 Sécurité des données
Données très sensibles (conversations, captures, frappes, **mots de passe**, y
compris concernant les amis de l'enfant). Le coffre est la cible la plus
précieuse : sa protection prime.
- Base et captures **chiffrées sur le disque** du PC parent (voir 5.1 pour les
  deux niveaux de clé).
- **Coffre de mots de passe chiffré séparément**, clé dérivée du mot de passe
  parent, ré-enveloppée par parent (D5). Déverrouillé à la demande, re-verrouillé
  après usage, consultations journalisées.
- Échanges Gardien ↔ serveur en HTTPS, certificat généré à l'installation,
  épinglé sur le nom Tailscale.
- Sur le PC enfant, données en attente chiffrées, effacées dès réception.
- Journal des connexions au tableau de bord. Sauvegardes chiffrées.
- **Récupération (D8) :** à la configuration, des **codes de secours** permettent
  de ré-enrôler un TOTP perdu. La perte de **tous** les mots de passe parents
  rend le coffre et les données sensibles définitivement illisibles (par
  conception) ; le contrôle du temps et du filtrage, lui, survit (clé machine).

### 5.10 Préparer les autres systèmes
Le serveur ne connaît que des « appareils » parlant une **API commune** (récupérer
les règles ; envoyer temps, activité, captures ; remonter des alertes). Chaque
nouveau système se branche sur cette même API, sans toucher au serveur ni au
tableau de bord. Pour que cela reste vrai, l'API et le modèle de données sont
pensés **neutres** (pas de notion propre à Windows), et les parties spécifiques à
un système sont isolées derrière des interfaces claires côté Gardien.
- **Linux, macOS (PC)** : un Gardien natif réutilise la logique commune (.NET
  fonctionne sur les trois) ; seules les actions système diffèrent (verrouillage,
  capture, réglage DNS, politiques de navigateur).
- **Android, iOS, HarmonyOS (mobile)** : ces systèmes **limitent fortement** ce
  qu'une application tierce peut surveiller ou bloquer (c'est voulu par Apple,
  Google et Huawei). Le plus réaliste y sera : temps d'écran et filtrage via
  leurs cadres officiels (Screen Time / Device Owner / contrôles HarmonyOS), DNS
  filtrant, et une **remontée d'activité plus limitée** que sur PC (pas de
  captures ni de frappes en arrière-plan sur un téléphone non « rooté »). Le même
  serveur AwladShield et le même tableau de bord les piloteront via l'API commune.
  À détailler dans un document de conception propre, le moment venu.

## 6. Décisions réglées par Claude (à corriger si besoin)
- **D1 — Coffre de mots de passe :** faisable via les gestionnaires des
  navigateurs (déchiffrables sur le PC enfant) + frappes dans les champs de mot
  de passe ; prototypé en étape 0 car la couverture n'est pas garantie à 100 %.
- **D2 — Serveur au boot + clés :** service démarrant au boot ; données de
  fonctionnement chiffrées par clé machine (toujours disponibles), données
  sensibles par clé dérivée du mot de passe parent (lisibles seulement pendant
  une session parent).
- **D4 — Comptes enfants :** comptes Windows **locaux** et standard exigés ;
  installateur qui vérifie et guide la conversion depuis un compte Microsoft.
- **D6 — Agent de capture :** dans la session enfant, relancé par le service
  SYSTEM, alerte si arrêté ; pas totalement invisible pour un standard user.
- **D7 — Adressage :** toujours par le nom Tailscale stable ; certificat épinglé
  sur ce nom ; PC enfants sur le réseau Tailscale.
- **D8 — Récupération :** codes de secours pour le TOTP ; perte de tous les mots
  de passe parents = coffre perdu par conception.

## 7. Choix techniques
- **C# / .NET** pour le serveur et le Gardien (naturel pour un service Windows,
  fonctionne aussi sur macOS/Linux et Docker pour la suite).
- **SQLite** (un fichier).
- **Tableau de bord** en application web (React) servie par le serveur, pensée
  mobile (PWA, utile pour la notification).
- **HTTPS** sur Tailscale ; le Gardien interroge toutes les minutes, envoie les
  captures au fil de l'eau.
- **Installateurs** : un serveur, un Gardien.
- Code dans `ITLearner-0/AwadShield`.

## 8. Cadre légal (information)
En France, des parents peuvent surveiller l'ordinateur de leurs enfants mineurs
qu'ils fournissent, si l'enfant en est informé (ce que l'outil prévoit).
Consulter les mots de passe d'un enfant mineur pour le protéger relève de
l'autorité parentale ; s'en servir pour entrer dans les comptes de tiers (ses
amis) serait illégal, d'où le journal des consultations. La loi demande aussi
d'associer l'enfant aux décisions selon son âge (art. 371-1 du Code civil) et la
CNIL recommande une surveillance proportionnée, surtout pour les adolescents —
d'où le réglage par enfant. Les messages des amis apparaîtront dans les captures :
raison de plus pour bien protéger ces données.

## 9. Laissé au développeur
- Structure exacte des tables et de l'API.
- Méthode de lecture de l'historique et des mots de passe des navigateurs,
  détection de l'application au premier plan.
- Choix de l'outil d'installation.
- Détail visuel du tableau de bord.

## 10. Livraison proposée en étapes
0. **Étape 0 — prototype de dé-risquage :** mesurer ce qui est réellement
   capturable (mots de passe, frappes, captures) sur un vrai PC Windows.
1. Serveur + tableau de bord + comptes parents + appairage d'un PC.
2. Temps d'écran (quota, plages, verrouillage, demandes de temps).
3. Filtrage (DNS, navigateurs, applis interdites).
4. Accès à distance (Tailscale) et sécurité (TOTP, chiffrement deux niveaux,
   codes de secours).
5. Surveillance (applis, sites, frappes, captures, messagerie, coffre, mots
   d'alerte) + alertes multi-canal (tableau de bord, e-mail, Telegram).
6. Résistance au contournement et alertes d'intégrité.

Chaque étape est utilisable et testable sur un vrai PC avant la suivante.
