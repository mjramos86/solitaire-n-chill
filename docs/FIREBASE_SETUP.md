# Setting up cloud sync (Google sign-in)

> Version française, avec les libellés de la console en français : [FIREBASE_SETUP.fr.md](FIREBASE_SETUP.fr.md)

Cloud sync is **optional and off by default**. The game ships with `js/firebase-config.js` set to `null`;
until you paste a Firebase config there, nobody sees any sign-in UI and no Google script is loaded.

What it stores per player, in a single Firestore document `snc_users/{their uid}`: look & widget settings,
music list, sticky note and statistics. Uploaded pictures stay on the device. Only the signed-in player can
read, change or delete that document (see `firebase/firestore.rules`).

> **Use a separate Firebase project for this game.** Publishing Firestore rules *replaces the whole ruleset*
> of a project, so sharing a project with another game (e.g. the Tower of Doom leaderboard) risks breaking one
> of them. A second project is free. If you really want to share one, add only the `match /snc_users/{uid}`
> block from `firebase/firestore.rules` to the existing file – never paste the whole file over it.

## 1. Create the project
1. Open <https://console.firebase.google.com> → **Add project** → name it e.g. `solitaire-n-chill`.
2. Google Analytics is not needed – you can switch it off.

## 2. Turn on Google sign-in
1. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
2. Pick a *public-facing name* (shown on the Google pop-up) and a *support email* → **Save**.

## 3. Authorise your website
**Authentication → Settings → Authorized domains → Add domain**, then add the host of your game, without
`https://` or any path, for example:

```
mjramos86.github.io
```

(Add your custom domain too if you use one. `localhost` is already allowed for testing.)

## 4. Create the database
1. **Build → Firestore Database → Create database.**
2. Choose **Production mode** and a location close to your players (**the location can't be changed later**).
3. Open the **Rules** tab, replace everything with the contents of `firebase/firestore.rules`, and press **Publish**.
   (Command-line alternative: `cd firebase && firebase deploy --only firestore:rules`.)

## 5. Register the web app and copy its config
1. **Project settings (gear icon) → General → Your apps → Add app → Web `</>`.**
2. Give it a nickname, leave *Firebase Hosting* unticked, press **Register app**.
3. Copy the `firebaseConfig` object. You only need these four values:

```js
{ apiKey: "…", authDomain: "…firebaseapp.com", projectId: "…", appId: "1:…:web:…" }
```

These are public identifiers, not secrets – the security rules protect the data.

## 6. Switch it on
Paste the values into `js/firebase-config.js`:

```js
window.SNC_FIREBASE = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  appId: "…"
};
```

Commit and push; once GitHub Pages redeploys, a **Login** button appears in the top bar (it becomes your avatar once signed in) and an **Account** tab in
*Customize*.

## 7. Check it works
- [ ] Customize → Account → **Continue with Google** opens the Google pop-up and signs you in.
- [ ] Change the accent colour; a few seconds later the status says *All saved*. In the Firebase console,
      **Firestore → snc_users** shows your document.
- [ ] Open the site on another device/browser, sign in: your look, music list, note and stats appear.
- [ ] Play a game on each device: the totals add up on both.

## Troubleshooting
| Message | Fix |
| --- | --- |
| "This site's address is not in Firebase's authorised domains" | Step 3 – add the exact host. |
| "Google sign-in is switched off" | Step 2 – enable the Google provider. |
| "The database refused the request" | Step 4 – publish `firebase/firestore.rules` in the **same** project as the config. |
| Pop-up blocked | The game falls back to a full-page redirect automatically. Some browsers block redirect sign-in on third-party domains; allow the pop-up instead. |

## Costs & limits
The free Spark plan allows 50,000 reads and 20,000 writes per day. One sync is about two reads and at most
two writes, and happens a few seconds after a change, when the tab becomes visible again, or when you press
*Sync now* – comfortable for thousands of players. You can add a budget alert in the Google Cloud console.

## Privacy
Signing in gives the game your Google display name, email, photo URL and a private account ID. Players can
sign out, or press **Delete cloud data**, at any time. (Deleting the Firebase *account* itself is done in the
Firebase console under Authentication → Users.)
