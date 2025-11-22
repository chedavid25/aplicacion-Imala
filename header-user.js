// header-user.js - Header común para todas las vistas
// Lee nombre, foto, rol y oficina desde la colección "usuarios"

import {
    getAuth,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Admin raíz (aunque los datos estén mal, este mail siempre será admin)
const ADMIN_EMAIL = "contacto@imala.com.ar";

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    const headerNameEl   = document.getElementById("header-user-name");
    const headerAvatarEl = document.getElementById("header-avatar");
    const sideMenu       = document.getElementById("side-menu");
    const dropdownBtn    = document.getElementById("page-header-user-dropdown");
    const dropdownMenu   = dropdownBtn
        ? dropdownBtn.parentElement.querySelector(".dropdown-menu")
        : null;

    let displayName = user.displayName || (user.email ? user.email.split("@")[0] : "Agente");
    let photoURL    = user.photoURL || "";
    let rol         = "agente";
    let oficina     = "";

    try {
        const ref = doc(db, "usuarios", user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            const data = snap.data();
            if (data.nombre)   displayName = data.nombre;
            if (data.fotoUrl)  photoURL    = data.fotoUrl;
            if (data.rol)      rol         = data.rol;
            if (data.oficina)  oficina     = data.oficina;
        } else {
            // Si no existe el doc, lo creo con valores por defecto
            rol = (user.email === ADMIN_EMAIL) ? "admin" : "agente";
            await setDoc(ref, {
                nombre: displayName,
                emailAuth: user.email || "",
                fotoUrl: photoURL || "",
                rol,
                oficina: "",
                creadoEn: new Date().toISOString()
            }, { merge: true });
        }

        // Fallback duro: este mail siempre admin
        if (user.email === ADMIN_EMAIL && rol !== "admin") {
            rol = "admin";
            await setDoc(ref, { rol: "admin" }, { merge: true });
        }

        // Opcional: mantener displayName/photoURL de Auth alineado con Firestore
        try {
            await updateProfile(user, {
                displayName: displayName,
                photoURL: photoURL || null
            });
        } catch (e) {
            console.warn("No se pudo actualizar el perfil de Auth:", e);
        }

    } catch (err) {
        console.error("Error cargando perfil/rol en header:", err);
    }

    // Nombre
    if (headerNameEl) {
        headerNameEl.textContent = displayName || "Agente";
    }

    // Foto
    if (headerAvatarEl && photoURL) {
        headerAvatarEl.src = photoURL;
    }

    // Link "Mi perfil" en el dropdown (si no está)
    if (dropdownMenu && !dropdownMenu.querySelector('[href="apps-contacts-profile.html"]')) {
        const itemPerfil = document.createElement("a");
        itemPerfil.className = "dropdown-item";
        itemPerfil.href = "apps-contacts-profile.html";
        itemPerfil.innerHTML = `
            <i class="mdi mdi-face-man font-size-16 align-middle me-1"></i>
            Mi perfil
        `;
        dropdownMenu.insertBefore(itemPerfil, dropdownMenu.firstChild);
    }

    // Panel Admin en el menú lateral si sos admin
    if ((rol === "admin" || user.email === ADMIN_EMAIL) &&
        sideMenu &&
        !sideMenu.querySelector('a[href="admin.html"]')
    ) {
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

