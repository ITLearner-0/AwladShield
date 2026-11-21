# AwladShield — Étape 0 : sonde de diagnostic (Windows)

> ⚠️ **À n'utiliser que sur vos propres ordinateurs.** Ce prototype sert à
> mesurer, sur un PC Windows que **vous possédez et administrez** (les PC de vos
> enfants mineurs, contrôle parental informé), ce qu'un programme pourra
> réellement capturer. Ne l'exécutez jamais sur la machine de quelqu'un d'autre.

## À quoi ça sert

Avant de construire la partie « surveillance » d'AwladShield, il faut savoir ce
qui est **techniquement possible** sur un vrai PC Windows, avec un compte
**standard** (non administrateur). Ce script le mesure et produit un petit
rapport. Il ne construit rien de définitif : c'est un test, jetable.

Le script **n'envoie rien** sur internet. Le rapport qu'il génère est conçu pour
**ne jamais contenir de secret** : ni mot de passe, ni texte tapé, ni adresse
complète. Uniquement des comptages, des verdicts (« ça marche / partiel / ça ne
marche pas »), des noms de domaines, et pour les mots de passe seulement un
**nombre** (combien ont pu être déchiffrés), jamais leur contenu.

## Ce que le script teste

| Sonde | Mesure |
|---|---|
| A | L'application au premier plan et le titre de la fenêtre |
| B | Une capture d'écran (enregistrée en image pour que vous vérifiiez) |
| C | Les frappes clavier (seulement **des compteurs**, jamais ce qui est tapé) |
| D | La détection d'un **champ de mot de passe** (pour pouvoir le repérer) |
| E | Les mots de passe enregistrés dans Chrome / Edge (nombre + domaines) |
| F | L'historique de navigation récent (domaines seulement) |

## Prérequis

- Un PC **Windows 10 ou 11** (rien à installer).
- Idéalement, exécutez-le **connecté avec le compte standard d'un enfant** : le
  résultat reflète alors ce qu'un tel compte peut faire (c'est ce qui compte).
- Les navigateurs (Chrome/Edge) peuvent rester **fermés** pour la sonde E.

## Comment lancer

1. Copiez le fichier `Test-AwladCapture.ps1` sur le PC à tester (clé USB, etc.),
   dans un dossier simple, par exemple `Documents\awlad-test`.
2. Ouvrez **PowerShell** (menu Démarrer → tapez « PowerShell »).
3. Placez-vous dans le dossier, par exemple :
   ```
   cd $HOME\Documents\awlad-test
   ```
4. Lancez :
   ```
   powershell -ExecutionPolicy Bypass -File .\Test-AwladCapture.ps1
   ```
   (Le `-ExecutionPolicy Bypass` autorise ce script **pour cette fois seulement**,
   sans changer les réglages de l'ordinateur.)
5. Suivez les consignes à l'écran : pour la sonde C, on vous demandera de **taper
   quelques mots** (essayez aussi dans un champ de mot de passe d'un navigateur) ;
   pour la sonde D, de **cliquer dans différents champs**.

Durée totale : environ **1 minute**.

## Résultat

À la fin, le script écrit un fichier **`awlad-capture-report.txt`** dans le même
dossier (et une image d'exemple `awlad-screenshot-sample.png`).

**Renvoyez-moi `awlad-capture-report.txt`.** Vous pouvez l'ouvrir et le relire
avant : il ne contient aucun mot de passe ni texte tapé — uniquement les
résultats des tests. (L'image de capture d'écran, elle, montre votre écran :
gardez-la pour vous, ne l'envoyez pas.)

## Et après ?

Selon ce que le rapport montre (ce qui marche vraiment, ce qui est partiel), on
décidera quoi construire pour la surveillance, et comment. Par exemple, si les
mots de passe des navigateurs sont bien récupérables mais que la détection des
champs de mot de passe est limitée, on adaptera la conception en conséquence.

Ce prototype est **jetable** : il ne fait pas partie du logiciel final.
