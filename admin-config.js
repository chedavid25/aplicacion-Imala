// admin-config.js
// Pantalla para administrar oficinas y usuarios desde la app

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    getDocs,
    doc,
    updateDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db   = getFirestore(app);

// Admin raíz por si el rol está mal cargado en Firestore
const ADMIN_EMAIL = "contacto@imala.com.ar";

// Cache en memoria
let oficinasCache = [];   // {id, nombre, usaEstacionalidad}
let usuariosCache = [];   // {id, ...data}

const el = (id) => document.getElementById(id);

// --------------------------------------------------
// 1) CONTROL DE ACCESO: SOLO ADMIN
// --------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Cargamos su documento en "usuarios" para ver el rol
        const ref = doc(db, "usuarios", user.uid);
        const snap = await getDocs(collection(db, "usuarios"));
        let rol = "agente";

        // Buscar el documento del usuario actual
        snap.forEach(d => {
            if (d.id === user.uid) {
                const data = d.data();
                if (data.rol) rol = data.rol;
            }
        });

        // Respaldo: el mail de admin raíz siempre es admin
        if (user.email === ADMIN_EMAIL) {
            rol = "admin";
        }

        if (rol !== "admin") {
            alert("No tenés permisos para ver esta pantalla.");
            window.location.href = "index.html";
            return;
        }

        // Si llegó hasta acá, es admin → cargamos data
        await cargarOficinas();
        await cargarUsuarios();
        inicializarEventos();

    } catch (error) {
        console.error("Error validando rol:", error);
        alert("Error validando permisos. Volvé a iniciar sesión.");
        window.location.href = "login.html";
    }
});

// --------------------------------------------------
// 2) CARGA DE OFICINAS
// --------------------------------------------------
async function cargarOficinas() {
    try {
        const snap = await getDocs(collection(db, "oficinas"));
        oficinasCache = [];

        snap.forEach(docSnap => {
            const data = docSnap.data();
            oficinasCache.push({
                id: docSnap.id,
                nombre: data.nombre || "",
                usaEstacionalidad: !!data.usaEstacionalidad
            });
        });

        renderizarTablaOficinas();
    } catch (error) {
        console.error("Error cargando oficinas:", error);
        alert("No se pudieron cargar las oficinas.");
    }
}

function renderizarTablaOficinas() {
    const tbody = el("tabla-oficinas-body");
    if (!tbody) return;

    tbody.innerHTML = oficinasCache.map(of => `
        <tr>
            <td>${of.nombre}</td>
            <td class="text-center">
                ${of.usaEstacionalidad
                    ? '<span class="badge bg-success">Sí</span>'
                    : '<span class="badge bg-secondary">No</span>'}
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary btn-edit-oficina"
                        data-id="${of.id}">
                    Editar
                </button>
            </td>
        </tr>
    `).join("");

    // Asignar eventos de editar
    tbody.querySelectorAll(".btn-edit-oficina").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            cargarOficinaEnFormulario(id);
        });
    });
}

function cargarOficinaEnFormulario(id) {
    const of = oficinasCache.find(o => o.id === id);
    if (!of) return;

    el("oficina-id").value = of.id;
    el("oficina-nombre").value = of.nombre;
    el("oficina-estacionalidad").checked = of.usaEstacionalidad;
}

// --------------------------------------------------
// 3) CARGA DE USUARIOS
// --------------------------------------------------
async function cargarUsuarios() {
    try {
        const snap = await getDocs(collection(db, "usuarios"));
        usuariosCache = [];

        snap.forEach(docSnap => {
            const data = docSnap.data();
            usuariosCache.push({
                id: docSnap.id,
                ...data
            });
        });

        renderizarTablaUsuarios();
    } catch (error) {
        console.error("Error cargando usuarios:", error);
        alert("No se pudieron cargar los usuarios.");
    }
}

function renderizarTablaUsuarios() {
    const tbody = el("tabla-usuarios-body");
    if (!tbody) return;

    const opcionesOficina = oficinasCache
        .map(of => `<option value="${of.nombre}">${of.nombre}</option>`)
        .join("");

    tbody.innerHTML = usuariosCache.map(u => {
        const nombre  = u.nombre || "(sin nombre)";
        const email   = u.emailAuth || u.email || "";
        const rol     = u.rol || "agente";
        const oficina = u.oficina || "";

        return `
            <tr data-uid="${u.id}">
                <td>
                    <strong>${nombre}</strong><br>
                    <span class="text-muted small">${u.id}</span>
                </td>
                <td>${email}</td>
                <td>
                    <select class="form-select form-select-sm sel-rol">
                        <option value="admin"   ${rol==="admin"   ? "selected":""}>admin</option>
                        <option value="broker"  ${rol==="broker"  ? "selected":""}>broker</option>
                        <option value="agente"  ${rol==="agente"  ? "selected":""}>agente</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm sel-oficina">
                        <option value="">(sin oficina)</option>
                        ${opcionesOficina}
                    </select>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-primary btn-guardar-usuario">
                        Guardar
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    // Asignar la oficina actual en cada fila
    tbody.querySelectorAll("tr").forEach(tr => {
        const uid = tr.getAttribute("data-uid");
        const user = usuariosCache.find(u => u.id === uid);
        if (!user) return;
        const selOf = tr.querySelector(".sel-oficina");
        if (selOf && user.oficina) {
            selOf.value = user.oficina;
        }
    });

    // Eventos de guardar fila
    tbody.querySelectorAll(".btn-guardar-usuario").forEach(btn => {
        btn.addEventListener("click", async () => {
            const tr  = btn.closest("tr");
            const uid = tr.getAttribute("data-uid");
            await guardarFilaUsuario(uid, tr);
        });
    });
}

async function guardarFilaUsuario(uid, tr) {
    try {
        const selRol = tr.querySelector(".sel-rol");
        const selOf  = tr.querySelector(".sel-oficina");

        const nuevoRol = selRol ? selRol.value : "agente";
        const nuevaOfi = selOf  ? selOf.value  : "";

        await updateDoc(doc(db, "usuarios", uid), {
            rol: nuevoRol,
            oficina: nuevaOfi
        });

        alert("Usuario actualizado.");
    } catch (error) {
        console.error("Error al guardar usuario:", error);
        alert("No se pudo guardar el usuario.");
    }
}

// --------------------------------------------------
// 4) EVENTOS DEL FORMULARIO DE OFICINAS
// --------------------------------------------------
function inicializarEventos() {
    const formOficina = el("form-oficina");
    const btnLimpiar  = el("btn-limpiar-oficina");
    const btnRefUsr   = el("btn-refrescar-usuarios");

    if (formOficina) {
        formOficina.addEventListener("submit", async (e) => {
            e.preventDefault();
            await guardarOficinaDesdeFormulario();
        });
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener("click", () => {
            limpiarFormularioOficina();
        });
    }

    if (btnRefUsr) {
        btnRefUsr.addEventListener("click", async () => {
            await cargarUsuarios();
        });
    }
}

async function guardarOficinaDesdeFormulario() {
    const id    = el("oficina-id").value.trim();
    const nombre = el("oficina-nombre").value.trim();
    const usaEst = el("oficina-estacionalidad").checked;

    if (!nombre) {
        alert("Ingresá un nombre de oficina.");
        return;
    }

    try {
        if (id) {
            // Update
            await updateDoc(doc(db, "oficinas", id), {
                nombre,
                usaEstacionalidad: usaEst
            });
        } else {
            // Create
            await addDoc(collection(db, "oficinas"), {
                nombre,
                usaEstacionalidad: usaEst
            });
        }

        alert("Oficina guardada.");
        limpiarFormularioOficina();
        await cargarOficinas();
        await cargarUsuarios(); // por si querés asignar oficinas nuevas a usuarios

    } catch (error) {
        console.error("Error guardando oficina:", error);
        alert("No se pudo guardar la oficina.");
    }
}

function limpiarFormularioOficina() {
    el("oficina-id").value = "";
    el("oficina-nombre").value = "";
    el("oficina-estacionalidad").checked = false;
}
