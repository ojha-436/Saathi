import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { clientConfig } from "./config";

let app: FirebaseApp | undefined;

function firebaseApp() {
  if (!app) app = getApps()[0] ?? initializeApp(clientConfig().firebase);
  return app;
}

// Lazily initialised so nothing touches Firebase during server rendering.
export const getFbAuth = (): Auth => getAuth(firebaseApp());
export const getDb = (): Firestore => getFirestore(firebaseApp());
export const apiUrl = () => clientConfig().apiUrl;
