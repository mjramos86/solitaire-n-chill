/*
 * Cloud sync (optional) – paste your Firebase *web app* config here to switch on
 * "Sign in with Google" + automatic saving of preferences and stats.
 * See docs/FIREBASE_SETUP.md. These values are public identifiers, not secrets:
 * your data is protected by the Firestore security rules (firebase/firestore.rules).
 *
 * Setting it to `null` switches cloud sync off again (everything then stays in the browser).
 */
window.SNC_FIREBASE = {
  apiKey: "AIzaSyAb5BHj6lpdLIAB4UqO9eR-J3e6sBUONaY",
  authDomain: "solitaire-n-chill.firebaseapp.com",
  projectId: "solitaire-n-chill",
  appId: "1:159133771209:web:40d0e0e652df9e050af418"
};

/* Example (replace with your own values from Firebase console → Project settings → Your apps):
window.SNC_FIREBASE = {
  apiKey: "AIza…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "1:1234567890:web:abcdef123456"
};
*/
