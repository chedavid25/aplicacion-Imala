// header-user.js - Header optimizado con Caché de Sesión y Menos Lecturas
// Lee nombre, foto, rol y oficina. Evita lecturas repetitivas usando sessionStorage.

import {
    getAuth,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Admin raíz (Fallback de seguridad)
const ADMIN_EMAIL = "contacto@imala.com.ar";
const CACHE_KEY = "imala_user_profile";

onAuthStateChanged(auth, async (user) => {
    // 1. Si no hay usuario, limpiar caché y salir (o redirigir si es necesario)
    if (!user) {
        sessionStorage.removeItem(CACHE_KEY);
        return;
    }

    const headerNameEl   = document.getElementById("header-user-name");
    const headerAvatarEl = document.getElementById("header-avatar");
    const sideMenu       = document.getElementById("side-menu");
    const dropdownBtn    = document.getElementById("page-header-user-dropdown");
    const dropdownMenu   = dropdownBtn
        ? dropdownBtn.parentElement.querySelector(".dropdown-menu")
        : null;

    // Datos por defecto (mientras carga o si falla)
    let perfil = {
        uid: user.uid,
        nombre: user.displayName || user.email.split("@")[0],
        fotoUrl: user.photoURL || "",
        rol: "agente",
        oficina: "",
        email: user.email
    };

    // 2. Intentar cargar desde sessionStorage (Caché) para no gastar lecturas
    let datosCacheados = null;
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Validamos que el caché sea del usuario actual
            if (parsed.uid === user.uid) {
                datosCacheados = parsed;
            }
        }
    } catch (e) {
        console.warn("Error leyendo caché de sesión", e);
    }

    // 3. Si tenemos caché válido, lo usamos y evitamos ir a Firebase
    if (datosCacheados) {
        console.log("⚡ Usando perfil desde caché (Ahorro de lectura)");
        perfil = { ...perfil, ...datosCacheados };
        renderizarHeader(perfil, headerNameEl, headerAvatarEl, sideMenu, dropdownMenu);
        
        // (Opcional) Validar admin raíz en segundo plano si es necesario, 
        // pero para navegación normal esto es suficiente.
    } else {
        // 4. Si NO hay caché, vamos a Firestore (Costo: 1 lectura)
        console.log("🌐 Descargando perfil desde Firestore...");
        try {
            const ref = doc(db, "usuarios", user.uid);
            const snap = await getDoc(ref);

            if (snap.exists()) {
                const data = snap.data();
                perfil.nombre  = data.nombre  || perfil.nombre;
                perfil.fotoUrl = data.fotoUrl || perfil.fotoUrl;
                perfil.rol     = data.rol     || perfil.rol;
                perfil.oficina = data.oficina || perfil.oficina;
            } else {
                // Crear usuario si no existe
                const esAdmin = (user.email === ADMIN_EMAIL);
                perfil.rol = esAdmin ? "admin" : "agente";
                
                await setDoc(ref, {
                    nombre: perfil.nombre,
                    emailAuth: user.email || "",
                    fotoUrl: perfil.fotoUrl,
                    rol: perfil.rol,
                    oficina: "",
                    creadoEn: new Date().toISOString()
                }, { merge: true });
            }

            // Fallback duro: Asegurar que el Admin Raíz tenga rol admin
            if (user.email === ADMIN_EMAIL && perfil.rol !== "admin") {
                perfil.rol = "admin";
                await updateDoc(ref, { rol: "admin" });
                console.warn("Rol de admin forzado por seguridad.");
            }

            // 5. Guardar en Caché para la próxima página
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(perfil));

            // 6. Sincronizar Auth Profile solo si cambió (Ahorro de escritura en Auth)
            if (user.displayName !== perfil.nombre || user.photoURL !== perfil.fotoUrl) {
                await updateProfile(user, {
                    displayName: perfil.nombre,
                    photoURL: perfil.fotoUrl || null
                }).catch(e => console.warn("No se pudo sync perfil Auth:", e));
            }

        } catch (err) {
            console.error("Error cargando perfil:", err);
        }
        
        // Renderizar con datos frescos
        renderizarHeader(perfil, headerNameEl, headerAvatarEl, sideMenu, dropdownMenu);
    }
});

// --- Función de Renderizado (UI) ---
function renderizarHeader(perfil, nameEl, avatarEl, menuEl, dropMenu) {
    // Nombre
    if (nameEl) nameEl.textContent = perfil.nombre;

    // Foto
    if (avatarEl && perfil.fotoUrl) avatarEl.src = perfil.fotoUrl;

    // Link "Mi perfil"
    if (dropMenu && !dropMenu.querySelector('[href="mi-perfil.html"]')) {
        // Ajusté el href a "mi-perfil.html" que vi en tu lista de archivos, 
        // antes decía "apps-contacts-profile.html". Corregilo si usas el otro.
        const itemPerfil = document.createElement("a");
        itemPerfil.className = "dropdown-item";
        itemPerfil.href = "apps-contacts-profile.html"; 
        itemPerfil.innerHTML = `<i class="mdi mdi-face-man font-size-16 align-middle me-1"></i> Mi perfil`;
        dropMenu.insertBefore(itemPerfil, dropMenu.firstChild);
    }

    // Panel Admin en menú lateral
    // Mostrar si es admin, broker o el email raíz
    const tienePermiso = (perfil.rol === "admin" || perfil.rol === "broker" || perfil.email === ADMIN_EMAIL);
    
    if (tienePermiso && menuEl && !menuEl.querySelector('a[href="admin.html"]')) {
        const li = document.createElement("li");
        li.innerHTML = `
            <a href="admin.html" class="text-danger fw-bold">
                <i data-feather="shield"></i>
                <span>Panel Admin</span>
            </a>
        `;
        menuEl.appendChild(li);
        if (window.feather) feather.replace();
    }
}
