// admin-config.js - Versión Final con Borrado en Cascada

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore, collection, getDocs, doc, updateDoc, addDoc, query, limit, where, orderBy, deleteDoc, writeBatch
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

    try {
        // Verificar si es Admin real en base de datos o por email hardcodeado
        const snap = await getDocs(query(collection(db, "usuarios"), where("emailAuth", "==", user.email)));
        let esAdmin = (user.email === ADMIN_EMAIL);
        
        if(!esAdmin && !snap.empty) {
            snap.forEach(d => { if(d.data().rol === 'admin') esAdmin = true; });
        }

        if (!esAdmin) {
            alert("Acceso denegado.");
            window.location.href = "index.html";
            return;
        }

        // Si es Admin, cargamos todo:
        await cargarOficinas();
        await cargarUsuariosInicial(); 
        inicializarEventos();

    } catch (e) { console.error(e); }
});

// --------------------------------------------------
// 2) GESTIÓN DE OFICINAS
// --------------------------------------------------
async function cargarOficinas() {
    try {
        // Leemos la colección raw para tener los IDs y poder editar/borrar
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
        // Usamos alert nativo o Swal si prefieres, aquí dejo alert por simpleza en config
        alert("Oficina guardada");
    } catch(err) { alert("Error al guardar oficina"); }
}

// --------------------------------------------------
// 3) GESTIÓN DE USUARIOS (OPTIMIZADA)
// --------------------------------------------------

async function cargarUsuariosInicial() {
    mostrarLoading(true);
    try {
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
        let q = query(collection(db, "usuarios"), where("emailAuth", "==", texto));
        let snap = await getDocs(q);

        if (snap.empty) {
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
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-primary btn-abrir-modal" data-uid="${u.id}" title="Editar Rol/Oficina">
                        <i class="mdi mdi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-eliminar-usuario" 
                        data-uid="${u.id}" 
                        data-nombre="${u.nombre||u.emailAuth}" 
                        data-email="${u.emailAuth || u.email}" 
                        title="Eliminar Todo (Acceso y Datos)">
                        <i class="mdi mdi-trash-can"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join("");

    // Listeners Editar
    tbody.querySelectorAll(".btn-abrir-modal").forEach(b => {
        b.addEventListener("click", () => abrirModalUsuario(b.dataset.uid));
    });

    // Listeners Eliminar (Actualizado para pasar email)
    tbody.querySelectorAll(".btn-eliminar-usuario").forEach(b => {
        b.addEventListener("click", () => eliminarUsuarioCompleto(b.dataset.uid, b.dataset.nombre, b.dataset.email));
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

    const selOficina = el("edit-user-oficina");
    selOficina.innerHTML = '<option value="">Sin asignar</option>';
    
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

        const uIndex = usuariosCache.findIndex(u => u.id === uid);
        if (uIndex !== -1) {
            usuariosCache[uIndex].rol = nuevoRol;
            usuariosCache[uIndex].oficina = nuevaOficina;
        }
        
        renderizarUsuarios();
        bootstrap.Modal.getInstance(el('modalEditarUsuario')).hide();
        Swal.fire('Guardado', 'Usuario actualizado correctamente.', 'success');

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron guardar los cambios.', 'error');
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

// --------------------------------------------------
// 6) ELIMINAR USUARIO EN CASCADA (NUEVO)
// --------------------------------------------------
// --------------------------------------------------
// 6) DAR DE BAJA USUARIO (Mantiene datos, quita acceso)
// --------------------------------------------------
async function eliminarUsuarioCompleto(uid, nombre, email) {
    // Preguntamos qué tipo de eliminación quiere hacer
    const result = await Swal.fire({
        title: 'Gestión de Baja',
        text: `¿Qué deseas hacer con ${nombre}?`,
        icon: 'question',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Dar de Baja (Mantener historial)',
        denyButtonText: 'Borrar TODO (Eliminar rastro)',
        confirmButtonColor: '#f1b44c', // Naranja (Advertencia)
        denyButtonColor: '#f46a6a',    // Rojo (Peligro)
        cancelButtonText: 'Cancelar'
    });

    if (result.isDismissed) return; // Si cancela, no hacemos nada

    // OPCIÓN 1: DAR DE BAJA (Recomendado)
    // Borra acceso, pero mantiene los números para las estadísticas
    if (result.isConfirmed) {
        Swal.fire({ title: 'Procesando baja...', didOpen: () => Swal.showLoading() });
        try {
            const batch = writeBatch(db);

            // 1. Eliminar acceso (Colección usuarios)
            batch.delete(doc(db, "usuarios", uid));

            // 2. Marcar planificación como EX-AGENTE (Para que siga sumando pero se note que no está)
            if (email) {
                const qPlan = query(collection(db, "planificaciones"), where("emailUsuario", "==", email));
                const snapPlan = await getDocs(qPlan);
                snapPlan.forEach(d => {
                    // Le agregamos un prefijo para que se note y se vaya al fondo de la lista
                    batch.update(d.ref, { 
                        nombreAgente: `[EX] ${nombre} (Baja)`,
                        oficina: `${d.data().oficina} (Histórico)` // Opcional: Para saber dónde estaba
                    });
                });
            }

            await batch.commit();
            
            // Actualizar tabla visualmente
            usuariosCache = usuariosCache.filter(u => u.id !== uid);
            renderizarUsuarios();
            
            Swal.fire('Baja Exitosa', 'El usuario ya no puede entrar, pero sus datos suman a la estadística.', 'success');
        } catch (e) {
            console.error(e);
            Swal.fire('Error', e.message, 'error');
        }
    } 
    
    // OPCIÓN 2: BORRADO TOTAL (Nuclear)
    // Úsalo solo si te equivocaste al cargar el usuario o es un test
    else if (result.isDenied) {
        Swal.fire({ title: 'Eliminando todo...', didOpen: () => Swal.showLoading() });
        try {
            const batch = writeBatch(db);
            
            // 1. Borrar Usuario
            batch.delete(doc(db, "usuarios", uid));

            if (email) {
                // 2. Borrar Planificaciones
                const qPlan = query(collection(db, "planificaciones"), where("emailUsuario", "==", email));
                const snapPlan = await getDocs(qPlan);
                snapPlan.forEach(d => batch.delete(d.ref));

                // 3. Borrar Trackeo
                const qTrack = query(collection(db, "tracking"), where("emailUsuario", "==", email));
                const snapTrack = await getDocs(qTrack);
                snapTrack.forEach(d => batch.delete(d.ref));
            }

            await batch.commit();
            
            usuariosCache = usuariosCache.filter(u => u.id !== uid);
            renderizarUsuarios();
            
            Swal.fire('Eliminado', 'Se borró todo rastro del usuario.', 'success');
        } catch (e) {
            console.error(e);
            Swal.fire('Error', e.message, 'error');
        }
    }
}