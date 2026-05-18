import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB98ined1c-H5iP7ilcMs9EyJNvmI5W45s",
  authDomain: "dama-reer.firebaseapp.com",
  projectId: "dama-reer",
  storageBucket: "dama-reer.firebasestorage.app",
  messagingSenderId: "825762287032",
  appId: "1:825762287032:web:d455747c05cebf3d71534d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
