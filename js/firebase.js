// Firebase init + anonymous auth (SPEC §2)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, push, remove, onValue, onDisconnect, serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js';

// dev: ?emu → local Firebase emulators (auth 9099 / rtdb 9000), production untouched
export const EMU = new URLSearchParams(location.search).has('emu');

const firebaseConfig = {
  apiKey: "AIzaSyDVQGEYKgRqWYVP1tx-IEuWBx-QPOvE9Cg",
  authDomain: "wolf-1ec11.firebaseapp.com",
  databaseURL: "https://wolf-1ec11-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "wolf-1ec11",
  storageBucket: "wolf-1ec11.firebasestorage.app",
  messagingSenderId: "295565126678",
  appId: "1:295565126678:web:41b9957c96471f0e059937"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = EMU
  ? getDatabase(app, 'http://127.0.0.1:9000?ns=demo-wolf-default-rtdb')
  : getDatabase(app);
if (EMU) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
export { ref, get, set, update, push, remove, onValue, onDisconnect, serverTimestamp, increment };

export const roomRef = (code, path = '') => ref(db, `rooms/${code}${path ? '/' + path : ''}`);

export function signIn() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, user => {
      if (user) resolve(user);
      else signInAnonymously(auth).catch(reject);
    });
  });
}
