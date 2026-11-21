# Essayer AwladShield — étape 1 (en local)

Cette étape 1 tourne **sur un seul ordinateur** : le serveur familial et son
tableau de bord web. Le programme des PC enfants (le « Gardien ») arrive dans
une étape suivante.

## Préalable : installer Node.js

Installez **Node.js version 22** (ou plus récente) depuis <https://nodejs.org>
(choisissez « LTS »). Pour vérifier, ouvrez un terminal (sur Windows :
« PowerShell ») et tapez :

```
node --version
```

Vous devez voir un numéro commençant par `v22` (ou plus).

## Lancer l'application

Dans un terminal, placez-vous dans le dossier du projet, puis :

**1. Construire le tableau de bord (une seule fois, ou après une mise à jour)**

```
cd dashboard
npm install
npm run build
cd ..
```

**2. Démarrer le serveur**

```
cd server
npm install
npm run dev
```

Laissez cette fenêtre ouverte : le serveur tourne tant qu'elle reste ouverte.

**3. Ouvrir le tableau de bord**

Dans votre navigateur, allez sur : <http://localhost:3000>

- La **première fois**, l'écran de configuration vous demande de créer le
  premier compte parent (e-mail, nom, mot de passe d'au moins 10 caractères).
  Il affiche ensuite un **QR code** : scannez-le avec une application
  d'authentification (Google Authenticator, Microsoft Authenticator, etc.) et
  notez les **codes de secours**. Vous confirmez avec le code à 6 chiffres.
- Ensuite, vous vous connectez avec votre e-mail, votre mot de passe et le code
  à 6 chiffres de l'application.
- Vous pouvez alors **ajouter un enfant**, **ajouter un second parent**, et
  **générer un code d'appairage** pour un PC (le PC enfant s'y rattachera à
  l'étape suivante, quand le Gardien existera).

## Depuis un téléphone sur le même Wi-Fi

Sur le PC qui fait tourner le serveur, trouvez son adresse locale (sur Windows,
tapez `ipconfig` et lisez « Adresse IPv4 », par ex. `192.168.1.20`). Sur le
téléphone, ouvrez `http://192.168.1.20:3000`. (L'accès depuis l'extérieur de la
maison, de façon sécurisée, viendra avec Tailscale à l'étape 4.)

## Où sont les données ?

Dans un seul fichier, `server/awladshield.db`. Le supprimer remet tout à zéro
(utile pour refaire un essai propre). À ce stade, ce fichier n'est pas encore
chiffré (le chiffrement arrive à l'étape 4) : ne mettez donc pas de vraies
données sensibles pendant les essais.

## Lancer les tests (facultatif)

```
cd server && npm test        # 43 tests
cd dashboard && npm test     # 4 tests
```
