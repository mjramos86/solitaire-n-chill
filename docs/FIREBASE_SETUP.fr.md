# Activer la synchronisation cloud (connexion Google) – guide en français

> English version: [FIREBASE_SETUP.md](FIREBASE_SETUP.md)

La synchronisation est **facultative et désactivée par défaut** : tant que `js/firebase-config.js` vaut `null`,
aucun bouton de connexion n'apparaît et aucun script Google n'est chargé.

Ce qui est enregistré pour chaque joueur, dans un seul document Firestore `snc_users/{identifiant}` :
réglages d'apparence et de widgets, liste de musique, post-it et statistiques. Les images importées restent
sur l'appareil. Seul le joueur connecté peut lire, modifier ou supprimer son document
(voir `firebase/firestore.rules`).

> **Utilisez un projet Firebase séparé pour ce jeu** (ne touchez pas au projet d'un autre jeu). Publier des
> règles Firestore **remplace l'ensemble des règles du projet** ; un second projet est gratuit.

> Les libellés ci-dessous sont ceux de la console Firebase en français, avec l'anglais entre parenthèses. Google
> modifie parfois les textes : si un intitulé diffère un peu, l'anglais vous aidera à retrouver l'option.

## 1. Créer le projet
1. Ouvrez <https://console.firebase.google.com> → **Ajouter un projet** (*Add project*) / **Créer un projet**.
2. Donnez un nom, par exemple `solitaire-n-chill` → **Continuer**.
3. **Google Analytics** : inutile, vous pouvez désactiver l'option *Activer Google Analytics pour ce projet*
   → **Créer le projet** → **Continuer**.

## 2. Activer la connexion Google
1. Menu de gauche **Créer** (*Build*) → **Authentication** → **Commencer** (*Get started*).
2. Onglet **Méthode de connexion** (*Sign-in method*) → **Ajouter un fournisseur** (*Add new provider*)
   → **Google**.
3. Basculez **Activer** (*Enable*), choisissez le **Nom public du projet** (*Public-facing name*, affiché dans la
   fenêtre Google) et l'**Adresse e-mail d'assistance du projet** (*Support email*) → **Enregistrer** (*Save*).

## 3. Autoriser votre site
**Authentication** → onglet **Paramètres** (*Settings*) → **Domaines autorisés** (*Authorized domains*)
→ **Ajouter un domaine** (*Add domain*), puis saisissez uniquement le nom d'hôte, **sans `https://` ni chemin** :

```
mjramos86.github.io
```

(Ajoutez aussi votre domaine personnalisé s'il y en a un. `localhost` est déjà autorisé pour les tests.)

## 4. Créer la base de données
1. Menu **Créer** (*Build*) → **Firestore Database** → **Créer une base de données** (*Create database*).
2. Si on vous propose une édition, choisissez **Standard**. Choisissez l'**emplacement** (*Location*) le plus
   proche de vos joueurs – **il ne pourra plus être modifié**.
3. Choisissez **Démarrer en mode production** (*Start in production mode*) → **Créer** / **Activer** (*Enable*).
4. Onglet **Règles** (*Rules*) : remplacez tout le contenu par celui du fichier `firebase/firestore.rules` du
   dépôt, puis cliquez sur **Publier** (*Publish*).

## 5. Enregistrer l'application Web et copier sa configuration
1. Cliquez sur la roue dentée ⚙ → **Paramètres du projet** (*Project settings*) → onglet **Général**
   → section **Vos applications** (*Your apps*) → **Ajouter une application** (*Add app*) → icône Web **`</>`**.
2. **Surnom de l'application** (*App nickname*) : par exemple `solitaire-web`. Laissez décochée l'option
   *Configurer aussi Firebase Hosting*, puis **Enregistrer l'application** (*Register app*).
3. Dans **Ajouter le SDK Firebase** (*Add Firebase SDK*), choisissez l'option **Config** (ou **npm**) pour voir
   l'objet `firebaseConfig`. Copiez ces quatre valeurs :

```js
{ apiKey: "…", authDomain: "….firebaseapp.com", projectId: "…", appId: "1:…:web:…" }
```

Ce sont des identifiants **publics**, pas des secrets : ce sont les règles de sécurité qui protègent les données.
Vous retrouvez cet objet à tout moment dans **Paramètres du projet → Général → Vos applications → Configuration du SDK**.

## 6. Activer côté jeu
Collez les valeurs dans `js/firebase-config.js` (ou envoyez-les-moi, je m'en occupe) :

```js
window.SNC_FIREBASE = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  appId: "…"
};
```

Après le déploiement GitHub Pages, un bouton 👤 apparaît dans la barre du haut et un onglet **Account** dans
*Customize*.

## 7. Vérifier
- [ ] Customize → Account → **Continue with Google** ouvre la fenêtre Google et vous connecte.
- [ ] Changez la couleur d'accent ; quelques secondes plus tard l'état indique *All saved*. Dans la console :
      **Firestore Database → Données** (*Data*) → collection **snc_users** : votre document apparaît.
- [ ] Ouvrez le jeu sur un autre appareil, connectez-vous : apparence, musique, post-it et statistiques sont là.
- [ ] Jouez une partie sur chaque appareil : les totaux s'additionnent.

## Dépannage
| Message dans le jeu | Solution |
| --- | --- |
| « This site's address is not in Firebase's authorised domains » | Étape 3 : ajoutez exactement le bon nom d'hôte dans **Domaines autorisés**. |
| « Google sign-in is switched off » | Étape 2 : activez le fournisseur **Google**. |
| « The database refused the request » | Étape 4 : publiez `firebase/firestore.rules` dans le **même** projet que la configuration. |
| Fenêtre bloquée | Le jeu bascule automatiquement vers une redirection plein écran ; autorisez aussi les fenêtres pop-up pour ce site. |

## Coûts et limites
Le forfait gratuit **Spark** autorise 50 000 lectures et 20 000 écritures par jour. Une synchronisation représente
environ deux lectures et au plus deux écritures. Vous pouvez ajouter une alerte de budget dans la console Google Cloud.

## Confidentialité
La connexion transmet au jeu le nom d'affichage, l'e-mail, l'URL de la photo et un identifiant de compte privé.
Le joueur peut se déconnecter ou cliquer sur **Delete cloud data** à tout moment. Pour supprimer le *compte*
lui-même : console Firebase → **Authentication** → **Utilisateurs** (*Users*).
