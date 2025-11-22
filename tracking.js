// tracking.js - LÓGICA DE LA MATRIZ MENSUAL (CON FILTRO DE AÑO)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let planificacionAnual = null; 
let datosTracking = {}; 

// --- 1. CONFIGURACIÓN DE ESTACIONALIDAD ---
const CONFIG_OFICINAS = {
    "RE/MAX BIG": true,
    "RE/MAX FORUM": true,
    "RE/MAX FLOR": true,
    "RE/MAX ACUERDO": true,
    "CROAR PROPIEDADES": false 
};

const FACTORES_ESTACIONALES = {
    0: 0.17 / 3, 1: 0.17 / 3, 2: 0.17 / 3,       // Ene, Feb, Mar (17%)
    3: 0.23 / 3, 4: 0.23 / 3, 5: 0.23 / 3,       // Abr, May, Jun (23%)
    6: 0.25 / 3, 7: 0.25 / 3, 8: 0.25 / 3,       // Jul, Ago, Sep (25%)
    9: 0.35 / 3, 10: 0.35 / 3, 11: 0.35 / 3      // Oct, Nov, Dic (35%)
};

// --- 2. SEGURIDAD Y CARGA INICIAL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log("Usuario:", user.email);
        
        // 1. Inicializar el selector de año al año actual
        document.getElementById("selector-anio").value = new Date().getFullYear();
        
        // 2. Cargar el Tracking y la Planificación con el año por defecto
        await cargarPlanificacion();
        await cargarTrackingDelAno();

        // 3. Inicializar la pantalla con el mes actual
        const mesActual = new Date().getMonth();
        document.getElementById("selector-mes").value = mesActual;
        actualizarMatriz(mesActual);

        // LÓGICA DE ADMIN: Mostrar botón solo al jefe
        if (user.email === "contacto@imala.com.ar") {
            const menu = document.getElementById("sidebar-menu").querySelector("ul");
            
            const li = document.createElement("li");
            li.innerHTML = `
                <a href="admin.html" class="text-danger fw-bold">
                    <i data-feather="shield"></i>
                    <span>Panel Admin</span>
                </a>
            `;
            
            menu.appendChild(li);
            
            if (window.feather) feather.replace();
        }
        
    } else {
        window.location.href = "login.html";
    }
});

// Evento: Cambiar de Mes -> Recarga la matriz con el mes nuevo (usa los datos del año ya cargados)
document.getElementById("selector-mes").addEventListener("change", (e) => {
    actualizarMatriz(parseInt(e.target.value));
});

// Evento: Cambiar de Año -> Llama a cargarTrackingDelAno para obtener nuevos datos de Firebase y su plan
document.getElementById("selector-anio").addEventListener("change", cargarTrackingDelAno);


// --- 3. CARGAR DATOS DE LA NUBE (MODIFICADO) ---
async function cargarPlanificacion() {
    if (!currentUser) return;

    // Lee el año seleccionado
    const year = document.getElementById("selector-anio").value; 
    
    try {
        // Consulta la planificación anual para el año seleccionado
        const docSnap = await getDoc(doc(db, "planificaciones", `${currentUser.uid}_${year}`));
        
        if (docSnap.exists()) {
            planificacionAnual = docSnap.data();
            recalcularObjetivosOperativos();
        } else {
            // Si no hay plan para el año seleccionado, cargamos un objeto vacío
            planificacionAnual = {};
            planificacionAnual.OBJETIVOS = { facturacion: 0, captaciones: 0, acm: 0, prelisting: 0 };
        }
    } catch (error) {
        console.error("Error cargando plan:", error);
    }
}

function recalcularObjetivosOperativos() {
    const p = planificacionAnual;
    const efec = p.efectividades;
    
    const objFact = parseFloat(p.objetivoAnual) || 0;
    const ticket = parseFloat(p.ticketPromedio) || 0;
    const comision = ticket * 0.03;
    
    const transacciones = comision > 0 ? objFact / comision : 0;
    
    const captVenta = (parseFloat(efec.captVenta) || 0) / 100;
    const acmCapt = (parseFloat(efec.acmCapt) || 0) / 100;
    const preListAcm = (parseFloat(efec.preListAcm) || 0) / 100;
    const pctPropio = (parseFloat(efec.listingPropio) || 0) / 100;

    const ventasPropias = transacciones * pctPropio;
    const captaciones = captVenta > 0 ? ventasPropias / captVenta : 0;
    const acms = acmCapt > 0 ? captaciones / acmCapt : 0;
    const prelistings = preListAcm > 0 ? acms / preListAcm : 0;

    planificacionAnual.OBJETIVOS = {
        facturacion: objFact,
        captaciones: captaciones,
        acm: acms,
        prelisting: prelistings
    };
}

async function cargarTrackingDelAno() {
    if (!currentUser) return;

    // *** LEE EL AÑO SELECCIONADO ***
    const year = document.getElementById("selector-anio").value; 
    const mesIndex = parseInt(document.getElementById("selector-mes").value);

    try {
        // Recargar el plan para asegurar que el objetivo base (OBJETIVOS) es del año correcto.
        await cargarPlanificacion(); 

        // Consulta de Tracking usando el año seleccionado
        const docSnap = await getDoc(doc(db, "tracking", `${currentUser.uid}_${year}`));
        if (docSnap.exists()) {
            datosTracking = docSnap.data();
        } else {
            datosTracking = {}; // No hay tracking para este año
        }
        
        // Actualiza la matriz con el mes seleccionado y los datos del año nuevo/existente
        actualizarMatriz(mesIndex); 
    } catch (error) {
        console.error("Error cargando tracking:", error);
    }
}

// --- 4. LÓGICA DE LA MATRIZ ---

function actualizarMatriz(mesIndex) {
    if (!planificacionAnual) return;

    // 1. Limpiar inputs
    document.querySelectorAll('.input-cell').forEach(i => i.value = "");

    // 2. Cargar datos guardados de este mes (si existen)
    const datosMes = datosTracking[`mes_${mesIndex}`];
    if (datosMes) {
        rellenarFila("facturacion", datosMes.facturacion);
        rellenarFila("captaciones", datosMes.captaciones);
        rellenarFila("acm", datosMes.acm);
        rellenarFila("prelisting", datosMes.prelisting);
        rellenarFila("caracara", datosMes.caracara);
        rellenarFila("prebuy", datosMes.prebuy);
        rellenarFila("reservas", datosMes.reservas);
    }

    // 3. Calcular Objetivos del Mes (Usa planificacionAnual.OBJETIVOS del año cargado)
    establecerObjetivosMensuales(mesIndex);

    // 4. Recalcular totales visuales
    document.querySelectorAll('#tabla-tracking-body tr').forEach(fila => calcularFila(fila));
}

function rellenarFila(id, valores) {
    if (!valores) return;
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    const inputs = fila.querySelectorAll('.input-cell');
    inputs[0].value = valores.sem1 || "";
    inputs[1].value = valores.sem2 || "";
    inputs[2].value = valores.sem3 || "";
    inputs[3].value = valores.sem4 || "";
    inputs[4].value = valores.sem5 || "";
}

function establecerObjetivosMensuales(mesIndex) {
    // Si planificacionAnual es vacío (porque no se cargó el plan para ese año), sale
    if (!planificacionAnual || !planificacionAnual.OBJETIVOS || planificacionAnual.OBJETIVOS.facturacion === 0) {
        pintarObjetivo("facturacion", 0, true);
        pintarObjetivo("captaciones", 0, false);
        pintarObjetivo("acm", 0, false);
        pintarObjetivo("prelisting", 0, false);
        return;
    }

    const oficina = planificacionAnual.oficina;
    const usaEstacionalidad = CONFIG_OFICINAS[oficina] === true; 

    let objetivoFact = 0;
    if (usaEstacionalidad) {
        const factor = FACTORES_ESTACIONALES[mesIndex];
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion * factor;
    } else {
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion / 12;
    }

    const objetivoCapt = planificacionAnual.OBJETIVOS.captaciones / 12;
    const objetivoAcm = planificacionAnual.OBJETIVOS.acm / 12;
    const objetivoPre = planificacionAnual.OBJETIVOS.prelisting / 12;

    pintarObjetivo("facturacion", objetivoFact, true); 
    pintarObjetivo("captaciones", objetivoCapt, false);
    pintarObjetivo("acm", objetivoAcm, false);
    pintarObjetivo("prelisting", objetivoPre, false);
}

function pintarObjetivo(id, valor, esDinero) {
    const celda = document.querySelector(`tr[data-id="${id}"] .val-objetivo`);
    if (celda) {
        celda.dataset.value = valor;
        if (esDinero) {
            celda.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(valor);
        } else {
            celda.textContent = Math.ceil(valor); 
        }
    }
}

function calcularFila(fila) {
    let total = 0;
    fila.querySelectorAll('.input-cell').forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });

    const celdaTotal = fila.querySelector('.val-total');
    const esDinero = fila.dataset.id === "facturacion";
    
    if(esDinero) {
        celdaTotal.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total);
    } else {
        celdaTotal.textContent = total;
    }

    const celdaObj = fila.querySelector('.val-objetivo');
    const celdaPct = fila.querySelector('.val-pct');

    if (celdaObj && celdaPct) {
        const objetivo = parseFloat(celdaObj.dataset.value) || 0;
        
        if (objetivo > 0) {
            const porcentaje = (total / objetivo) * 100;
            celdaPct.textContent = porcentaje.toFixed(0) + "%";

            celdaPct.className = "badge val-pct"; 
            if (porcentaje >= 100) celdaPct.classList.add("bg-success"); 
            else if (porcentaje >= 70) celdaPct.classList.add("bg-warning");
            else celdaPct.classList.add("bg-danger"); 
        } else {
            celdaPct.textContent = "-";
            celdaPct.className = "badge bg-secondary val-pct"; // Si no hay objetivo, vuelve al gris
        }
    }
}

// --- 5. GUARDAR (MODIFICADA para usar el filtro de año) ---
document.getElementById("btn-guardar-track").addEventListener("click", async () => {
    const btn = document.getElementById("btn-guardar-track");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = `<i class="bx bx-loader bx-spin"></i> Guardando...`;

    const mesIndex = document.getElementById("selector-mes").value;
    // *** LEE EL AÑO SELECCIONADO AL GUARDAR ***
    const year = document.getElementById("selector-anio").value; 

    // Recolectar datos de la matriz
    const datosAguardar = {
        facturacion: leerFila("facturacion"),
        captaciones: leerFila("captaciones"),
        acm: leerFila("acm"),
        prelisting: leerFila("prelisting"),
        caracara: leerFila("caracara"),
        prebuy: leerFila("prebuy"),
        reservas: leerFila("reservas"),
        ultimaActualizacion: new Date().toISOString()
    };

    const docRef = doc(db, "tracking", `${currentUser.uid}_${year}`);
    
    try {
        await setDoc(docRef, {
            [`mes_${mesIndex}`]: datosAguardar
        }, { merge: true });
        
        if(!datosTracking) datosTracking = {};
        datosTracking[`mes_${mesIndex}`] = datosAguardar;

        alert("✅ Avance guardado correctamente.");
    } catch (error) {
        console.error("Error guardando:", error);
        alert("Error al guardar.");
    } finally {
        btn.innerHTML = textoOriginal;
    }
});

function leerFila(id) {
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    const inputs = fila.querySelectorAll('.input-cell');
    let total = 0;
    inputs.forEach(i => total += parseFloat(i.value) || 0);

    return {
        sem1: parseFloat(inputs[0].value) || 0,
        sem2: parseFloat(inputs[1].value) || 0,
        sem3: parseFloat(inputs[2].value) || 0,
        sem4: parseFloat(inputs[3].value) || 0,
        sem5: parseFloat(inputs[4].value) || 0,
        total: total
    };
}