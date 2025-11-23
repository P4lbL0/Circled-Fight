// 1. On importe les outils Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    // AJOUTEZ arrayUnion ici :
    arrayUnion // NOUVEAU pour les badges
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. TA CONFIGURATION (Utilise ta vraie configuration ici !)
const firebaseConfig = {
  apiKey: "AIzaSyDmB93XV2HP54I5tiHfd02wDoa0F10qwKg",
  authDomain: "circled-fight-app.firebaseapp.com",
  projectId: "circled-fight-app",
  storageBucket: "circled-fight-app.firebasestorage.app",
  messagingSenderId: "978955769876",
  appId: "1:978955769876:web:cfa51bdb651e06756d6f01"
};

// 3. On lance Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 4. On exporte les outils pour les utiliser dans d'autres fichiers JS
export { 
    auth, 
    db, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    onAuthStateChanged, 
    signOut,
    // EXPORTE arrayUnion :
    arrayUnion
};