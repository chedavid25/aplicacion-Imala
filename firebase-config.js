// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA5di88RqNoxXIF3VZet00UcsV-98t6dBY",
  authDomain: "planificador-imala.firebaseapp.com",
  projectId: "planificador-imala",
  storageBucket: "planificador-imala.firebasestorage.app",
  messagingSenderId: "900719354384",
  appId: "1:900719354384:web:31c0b00ab6bab677a6e095"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exportamos la app para usarla en otros archivos
export { app };

