// admin-config.js - Optimizado para Escalar (Paso 5)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore, collection, getDocs, doc, updateDoc, addDoc, query, limit, where, orderBy, startAfter
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";
import { ConfigService } from "./config-service.js";

const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "contacto@imala.com.ar";

let oficinasCache = [];
let usuariosCache = []; // Solo guarda los cargados actualmente en la tabla

// Referencias DOM
const el = (id) => document.getElementById(id);

// --------------------------------------------------
// 1) AUTH & INICIALIZACION
// --------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }

    // Verificar Rol
    // Nota: Podríamos usar el sessionStorage del header, pero por seguridad en admin
    // preferimos validar una vez contra Firestore al entrar.
    try {
        const snap = await getDocs(query(collection(db, "usuarios"), where("emailAuth", "==", user.email)));
        let esAdmin = (user.email === ADMIN_EMAIL);
        
        if(!esAdmin && !snap.empty) {
            // Buscar si tiene rol admin en su documento
            snap.forEach(d => { if(d.data().rol === 'admin') esAdmin = true; });
        }

        if (!esAdmin) {
            alert("Acceso denegado.");
            window.location.href = "index.html";
            return;
        }

        // Si es Admin:
        await cargarOficinas();
        await cargarUsuariosInicial(); // Carga optimizada (limit 20)
        inicializarEventos();

    } catch (e) { console.error(e); }
});

// --------------------------------------------------
// 2) GESTIÓN DE OFICINAS
// --------------------------------------------------
async function cargarOficinas() {
    try {
        const config = await ConfigService.obtenerConfiguracionCompleta();
        // Nota: ConfigService devuelve [{nombre, usaEstacionalidad}], pero acá necesitamos editar.
        // Así que mejor leemos la colección raw para tener los IDs de documento para poder editar/borrar.
        
        const snap = await getDocs(collection(db, "oficinas"));
        oficinasCache = [];
        snap.forEach(d => {
            oficinasCache.push({ id: d.id, ...d.data() });
        });
        renderizarOficinas();
    } catch (e) { console.error("Error oficinas:", e); }
}

function renderizarOficinas() {
    const tbody = el("tabla-oficinas-body");
    tbody.innerHTML = oficinasCache.map(of => `
        <tr>
            <td>${of.nombre}</td>
            <td class="text-center">${of.usaEstacionalidad ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-light text-dark">No</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-soft-primary btn-edit-oficina" data-id="${of.id}"><i class="mdi mdi-pencil"></i></button>
            </td>
        </tr>
    `).join("");

    tbody.querySelectorAll(".btn-edit-oficina").forEach(b => {
        b.addEventListener("click", () => cargarFormOficina(b.dataset.id));
    });
}

function cargarFormOficina(id) {
    const of = oficinasCache.find(o => o.id === id);
    if(of) {
        el("oficina-id").value = of.id;
        el("oficina-nombre").value = of.nombre;
        el("oficina-estacionalidad").checked = of.usaEstacionalidad;
    }
}

async function guardarOficina(e) {
    e.preventDefault();
    const id = el("oficina-id").value;
    const nombre = el("oficina-nombre").value.trim();
    const usa = el("oficina-estacionalidad").checked;
    if(!nombre) return alert("Falta nombre");

    try {
        if(id) await updateDoc(doc(db, "oficinas", id), { nombre, usaEstacionalidad: usa });
        else await addDoc(collection(db, "oficinas"), { nombre, usaEstacionalidad: usa });
        
        el("form-oficina").reset();
        el("oficina-id").value = "";
        await cargarOficinas();
        alert("Oficina guardada");
    } catch(err) { alert("Error al guardar oficina"); }
}

// --------------------------------------------------
// 3) GESTIÓN DE USUARIOS (OPTIMIZADA)
// --------------------------------------------------

// Carga inicial: Últimos 20 registrados o primeros 20 alfabéticos
async function cargarUsuariosInicial() {
    mostrarLoading(true);
    try {
        // Traer los primeros 20 usuarios ordenados por email o nombre
        // Usamos emailAuth porque suele estar presente
        const q = query(collection(db, "usuarios"), orderBy("emailAuth"), limit(20));
        const snap = await getDocs(q);
        procesarYRenderizarUsuarios(snap);
    } catch (e) { console.error(e); }
    mostrarLoading(false);
}

async function buscarUsuario() {
    const texto = el("buscador-usuario").value.trim();
    if (!texto) return cargarUsuariosInicial();

    mostrarLoading(true);
    try {
        // Búsqueda exacta por email (más rápida y barata)
        let q = query(collection(db, "usuarios"), where("emailAuth", "==", texto));
        let snap = await getDocs(q);

        if (snap.empty) {
            // Si falla, intento búsqueda por nombre (prefijo)
            // Nota: Esto requiere que el nombre en DB sea exacto al inicio (Case Sensitive en Firestore)
            // Para producción real se recomienda Algolia, pero esto sirve para MVP
            const textoEnd = texto + '\uf8ff';
            q = query(collection(db, "usuarios"), 
                where("nombre", ">=", texto), 
                where("nombre", "<=", textoEnd), 
                limit(10));
            snap = await getDocs(q);
        }

        procesarYRenderizarUsuarios(snap);

    } catch (e) { 
        console.error("Error búsqueda:", e); 
        alert("Error buscando. Asegurate de escribir bien el email completo.");
    }
    mostrarLoading(false);
}

function procesarYRenderizarUsuarios(snap) {
    usuariosCache = [];
    snap.forEach(d => usuariosCache.push({ id: d.id, ...d.data() }));
    renderizarUsuarios();
}

function renderizarUsuarios() {
    const tbody = el("tabla-usuarios-body");
    const sinRes = el("sin-resultados");
    
    tbody.innerHTML = "";
    if (usuariosCache.length === 0) {
        sinRes.classList.remove("d-none");
        return;
    }
    sinRes.classList.add("d-none");

    const badgeRol = (r) => {
        if (r==='admin') return '<span class="badge bg-danger">ADMIN</span>';
        if (r==='broker') return '<span class="badge bg-info">BROKER</span>';
        return '<span class="badge bg-secondary">AGENTE</span>';
    };

    tbody.innerHTML = usuariosCache.map(u => `
        <tr>
            <td class="fw-bold">${u.nombre || 'Sin Nombre'}</td>
            <td>${u.emailAuth || u.email || '-'}</td>
            <td>${badgeRol(u.rol)}</td>
            <td>${u.oficina || '<span class="text-muted small">Sin Asignar</span>'}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-primary btn-abrir-modal" data-uid="${u.id}">
                    Editar
                </button>
            </td>
        </tr>
    `).join("");

    // Listeners
    tbody.querySelectorAll(".btn-abrir-modal").forEach(b => {
        b.addEventListener("click", () => abrirModalUsuario(b.dataset.uid));
    });
}

function mostrarLoading(show) {
    const spinner = el("loading-users");
    if(show) spinner.classList.remove("d-none");
    else spinner.classList.add("d-none");
}

// --------------------------------------------------
// 4) MODAL DE EDICIÓN DE USUARIO
// --------------------------------------------------
async function abrirModalUsuario(uid) {
    const user = usuariosCache.find(u => u.id === uid);
    if (!user) return;

    el("edit-user-uid").value = uid;
    el("edit-user-nombre").value = user.nombre || "";
    el("edit-user-email").value = user.emailAuth || user.email || "";
    el("edit-user-rol").value = user.rol || "agente";

    // Llenar select de oficinas en el modal (desde cache)
    const selOficina = el("edit-user-oficina");
    selOficina.innerHTML = '<option value="">Sin asignar</option>';
    
    // Ordenar oficinas A-Z
    const oficinasOrdenadas = [...oficinasCache].sort((a,b) => a.nombre.localeCompare(b.nombre));
    
    oficinasOrdenadas.forEach(of => {
        const selected = (user.oficina === of.nombre) ? "selected" : "";
        selOficina.innerHTML += `<option value="${of.nombre}" ${selected}>${of.nombre}</option>`;
    });

    new bootstrap.Modal(el('modalEditarUsuario')).show();
}

async function guardarUsuarioDesdeModal() {
    const uid = el("edit-user-uid").value;
    const nuevoRol = el("edit-user-rol").value;
    const nuevaOficina = el("edit-user-oficina").value;
    const btn = el("btn-guardar-usuario-modal");

    btn.disabled = true;
    btn.innerText = "Guardando...";

    try {
        await updateDoc(doc(db, "usuarios", uid), {
            rol: nuevoRol,
            oficina: nuevaOficina
        });

        // Actualizar cache local para reflejar cambio sin recargar todo
        const uIndex = usuariosCache.findIndex(u => u.id === uid);
        if (uIndex !== -1) {
            usuariosCache[uIndex].rol = nuevoRol;
            usuariosCache[uIndex].oficina = nuevaOficina;
        }
        
        renderizarUsuarios();
        bootstrap.Modal.getInstance(el('modalEditarUsuario')).hide();
        alert("Usuario actualizado correctamente.");

    } catch (e) {
        console.error(e);
        alert("Error al guardar cambios.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Guardar Cambios";
    }
}

// --------------------------------------------------
// 5) EVENTOS GENERALES
// --------------------------------------------------
function inicializarEventos() {
    el("form-oficina").addEventListener("submit", guardarOficina);
    el("btn-limpiar-oficina").addEventListener("click", () => {
        el("form-oficina").reset();
        el("oficina-id").value = "";
    });

    el("btn-buscar").addEventListener("click", buscarUsuario);
    el("buscador-usuario").addEventListener("keyup", (e) => {
        if (e.key === "Enter") buscarUsuario();
    });

    el("btn-guardar-usuario-modal").addEventListener("click", guardarUsuarioDesdeModal);
}
