// header-user.js - Sincroniza el header (nombre, avatar, link a Mi perfil y Panel Admin)

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "contacto@imala.com.ar";

onAuthStateChanged(auth, async (user) => {
    if (!user) return; // El redirect a login lo maneja cada página

    const headerNameEl   = document.getElementById("header-user-name");
    const headerAvatarEl = document.getElementById("header-avatar");
    const sideMenu       = document.getElementById("side-menu");
    const dropdownBtn    = document.getElementById("page-header-user-dropdown");
    const dropdownMenu   = dropdownBtn
        ? dropdownBtn.parentElement.querySelector(".dropdown-menu")
        : null;

    let displayName = user.displayName || (user.email ? user.email.split("@")[0] : "Agente");
    let photoURL    = user.photoURL || "";

    // Intentar leer datos del perfil en "usuarios/{uid}"
    try {
        const ref = doc(db, "usuarios", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const data = snap.data();
            if (data.nombre)    displayName = data.nombre;
            if (data.fotoUrl)   photoURL    = data.fotoUrl;
        }
    } catch (err) {
        console.error("Error cargando perfil en header:", err);
    }

    // Actualizar nombre en header
    if (headerNameEl) {
        headerNameEl.textContent = displayName;
    }

    // Actualizar avatar
    if (headerAvatarEl && photoURL) {
        headerAvatarEl.src = photoURL;
    }

    // Asegurar link "Mi perfil" en el dropdown
    if (dropdownMenu && !dropdownMenu.querySelector('[href="apps-contacts-profile.html"]')) {
        const itemPerfil = document.createElement("a");
        itemPerfil.className = "dropdown-item";
        itemPerfil.href = "apps-contacts-profile.html";
        itemPerfil.innerHTML = `
            <i class="mdi mdi-face-man font-size-16 align-middle me-1"></i>
            Mi perfil
        `;
        // Insertar al principio del menú
        dropdownMenu.insertBefore(itemPerfil, dropdownMenu.firstChild);
    }

    // Panel Admin en el menú lateral si sos ADMIN_EMAIL
    if (user.email === ADMIN_EMAIL && sideMenu && !sideMenu.querySelector('a[href="admin.html"]')) {
        const li = document.createElement("li");
        li.innerHTML = `
            <a href="admin.html" class="text-danger fw-bold">
                <i data-feather="shield"></i>
                <span>Panel Admin</span>
            </a>
        `;
        sideMenu.appendChild(li);
        if (window.feather) feather.replace();
    }
});
