/*
 * Cloud sync (optional) – paste your Firebase *web app* config here to switch on
 * "Sign in with Google" + automatic saving of preferences and stats.
 * See docs/FIREBASE_SETUP.md. These values are public identifiers, not secrets:
 * your data is protected by the Firestore security rules (firebase/firestore.rules).
 *
 * Leave it as `null` and the game works exactly as before (everything stays in the browser).
 */
window.SNC_FIREBASE = null;

/* Example (replace with your own values from Firebase console → Project settings → Your apps):
window.SNC_FIREBASE = {
  apiKey: "AIza…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "1:1234567890:web:abcdef123456"
};
*/
