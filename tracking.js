// tracking.js - TRACKING MENSUAL POR AÑO (Configuración Centralizada)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";
import { ConfigService } from "./config-service.js"; // <--- IMPORTANTE

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let planificacionAnual = null;
let datosTracking = {};

// Variables dinámicas
let FACTORES_GLOBAL = [];
let CONFIG_OFICINAS = {}; // mapa: nombre -> usaEstacionalidad

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;
    console.log("Usuario tracking:", user.email);

    // 1. Cargar Configuración Global
    await cargarConfiguracionGlobal();

    const selectorAnio = document.getElementById("selector-anio");
    const selectorMes  = document.getElementById("selector-mes");

    // Año por defecto
    const añoActual = new Date().getFullYear();
    if (selectorAnio && !selectorAnio.value) selectorAnio.value = añoActual;

    // Cargar datos
    await cargarPlanificacion();
    await cargarTrackingDelAno();

    // Mes por defecto
    const mesActual = new Date().getMonth();
    if (selectorMes) {
        selectorMes.value = String(mesActual);
        actualizarMatriz(mesActual);
    }

    // Link admin si corresponde
    if (user.email === "contacto@imala.com.ar") {
        const sidebar = document.getElementById("sidebar-menu");
        if (sidebar) {
            const menu = sidebar.querySelector("ul");
            if (menu) {
                const li = document.createElement("li");
                li.innerHTML = `<a href="admin.html" class="text-danger fw-bold"><i data-feather="shield"></i><span>Panel Admin</span></a>`;
                menu.appendChild(li);
                if (window.feather) feather.replace();
            }
        }
    }

    // Listeners
    if (selectorMes) {
        selectorMes.addEventListener("change", (e) => {
            actualizarMatriz(parseInt(e.target.value, 10) || 0);
        });
    }
    if (selectorAnio) {
        selectorAnio.addEventListener("change", () => cargarTrackingDelAno());
    }

    document.addEventListener("input", (e) => {
        if (e.target.classList && e.target.classList.contains("input-cell")) {
            const fila = e.target.closest("tr");
            if (fila) calcularFila(fila);
        }
    });

    const btnGuardar = document.getElementById("btn-guardar-track");
    if (btnGuardar) btnGuardar.addEventListener("click", guardarTrackingMesActual);
});

async function cargarConfiguracionGlobal() {
    const config = await ConfigService.obtenerConfiguracionCompleta();
    FACTORES_GLOBAL = config.factores;
    
    CONFIG_OFICINAS = {};
    config.oficinas.forEach(of => {
        CONFIG_OFICINAS[of.nombre] = of.usaEstacionalidad;
    });
}

async function cargarPlanificacion() {
    if (!currentUser) return;
    const year = document.getElementById("selector-anio").value;
    try {
        const snap = await getDoc(doc(db, "planificaciones", `${currentUser.uid}_${year}`));
        if (snap.exists()) {
            planificacionAnual = snap.data();
            recalcularObjetivosOperativos();
        } else {
            planificacionAnual = { OBJETIVOS: { facturacion: 0, captaciones: 0, acm: 0, prelisting: 0 } };
        }
    } catch (err) {
        console.error("Error plan:", err);
        planificacionAnual = { OBJETIVOS: { facturacion: 0, captaciones: 0, acm: 0, prelisting: 0 } };
    }
}

function recalcularObjetivosOperativos() {
    if (!planificacionAnual) return;
    const p = planificacionAnual;
    const efec = p.efectividades || {};
    const objFact = parseFloat(p.objetivoAnual) || 0;
    const ticket  = parseFloat(p.ticketPromedio) || 0;
    const comision = ticket * 0.03;
    const transacciones = comision > 0 ? objFact / comision : 0;
    const captVenta = (parseFloat(efec.captVenta)||0)/100;
    const acmCapt = (parseFloat(efec.acmCapt)||0)/100;
    const preListAcm = (parseFloat(efec.preListAcm)||0)/100;
    const pctPropio = (parseFloat(efec.listingPropio)||0)/100;
    const ventasPropias = transacciones * pctPropio;
    const captaciones = captVenta>0 ? ventasPropias/captVenta : 0;
    const acms = acmCapt>0 ? captaciones/acmCapt : 0;
    const prelistings = preListAcm>0 ? acms/preListAcm : 0;

    planificacionAnual.OBJETIVOS = {
        facturacion: objFact,
        captaciones: captaciones,
        acm: acms,
        prelisting: prelistings
    };
}

async function cargarTrackingDelAno() {
    if (!currentUser) return;
    const year = document.getElementById("selector-anio").value;
    const mesIndex = parseInt(document.getElementById("selector-mes").value, 10) || 0;

    try {
        await cargarPlanificacion();
        const snap = await getDoc(doc(db, "tracking", `${currentUser.uid}_${year}`));
        datosTracking = snap.exists() ? snap.data() : {};
        actualizarMatriz(mesIndex);
    } catch (err) {
        console.error("Error tracking:", err);
        datosTracking = {};
        actualizarMatriz(mesIndex);
    }
}

function actualizarMatriz(mesIndex) {
    if (!planificacionAnual) return;
    document.querySelectorAll(".input-cell").forEach(i => { i.value = ""; });

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
    establecerObjetivosMensuales(mesIndex);
    document.querySelectorAll("#tabla-tracking-body tr").forEach(fila => calcularFila(fila));
}

function rellenarFila(id, valores) {
    if (!valores) return;
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    if (!fila) return;
    const inputs = fila.querySelectorAll(".input-cell");
    if (inputs.length < 5) return;
    inputs[0].value = valores.sem1 ?? "";
    inputs[1].value = valores.sem2 ?? "";
    inputs[2].value = valores.sem3 ?? "";
    inputs[3].value = valores.sem4 ?? "";
    inputs[4].value = valores.sem5 ?? "";
}

function establecerObjetivosMensuales(mesIndex) {
    if (!planificacionAnual || !planificacionAnual.OBJETIVOS) return;

    const oficina = planificacionAnual.oficina || "";
    const usaEstacionalidad = CONFIG_OFICINAS[oficina] === true;

    // FACTURACIÓN (Usa factores globales cargados de DB)
    let objetivoFact = 0;
    if (usaEstacionalidad && FACTORES_GLOBAL.length === 12) {
        const factor = FACTORES_GLOBAL[mesIndex];
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion * factor;
    } else {
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion / 12;
    }

    pintarObjetivo("facturacion", objetivoFact, true);
    pintarObjetivo("captaciones", planificacionAnual.OBJETIVOS.captaciones/12, false);
    pintarObjetivo("acm", planificacionAnual.OBJETIVOS.acm/12, false);
    pintarObjetivo("prelisting", planificacionAnual.OBJETIVOS.prelisting/12, false);
}

function pintarObjetivo(id, valor, esDinero) {
    const celda = document.querySelector(`tr[data-id="${id}"] .val-objetivo`);
    if (!celda) return;
    celda.dataset.value = String(valor||0);
    if (esDinero) {
        celda.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(valor||0);
    } else {
        celda.textContent = Math.ceil(valor||0);
    }
}

function calcularFila(fila) {
    let total = 0;
    fila.querySelectorAll(".input-cell").forEach(inp => { total += parseFloat(inp.value)||0; });
    
    const celdaTotal = fila.querySelector(".val-total");
    const esDinero = fila.dataset.id === "facturacion";
    
    if (celdaTotal) {
        celdaTotal.textContent = esDinero 
            ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(total)
            : total;
    }

    const celdaObj = fila.querySelector(".val-objetivo");
    const celdaPct = fila.querySelector(".val-pct");

    if (celdaObj && celdaPct) {
        const objetivo = parseFloat(celdaObj.dataset.value)||0;
        if (objetivo > 0) {
            const porcentaje = (total/objetivo)*100;
            const pctRed = Math.round(porcentaje);
            celdaPct.textContent = pctRed + "%";
            celdaPct.className = "badge val-pct " + (pctRed>=100 ? "bg-success" : (pctRed>=70 ? "bg-warning" : "bg-danger"));
        } else {
            celdaPct.textContent = "-";
            celdaPct.className = "badge bg-secondary val-pct";
        }
    }
}

async function guardarTrackingMesActual() {
    if (!currentUser) return;
    const btn = document.getElementById("btn-guardar-track");
    btn.innerHTML = `<i class="bx bx-loader bx-spin"></i> Guardando...`;
    btn.disabled = true;

    try {
        const mesIndex = parseInt(document.getElementById("selector-mes").value, 10) || 0;
        const year = document.getElementById("selector-anio").value;

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

        // NOTA: Agregamos el campo "anio" para facilitar el Paso 4 del plan
        const docRef = doc(db, "tracking", `${currentUser.uid}_${year}`);
        await setDoc(docRef, { 
            [`mes_${mesIndex}`]: datosAguardar,
            anio: parseInt(year) // Guardamos el año como número para filtrado futuro
        }, { merge: true });

        if (!datosTracking) datosTracking = {};
        datosTracking[`mes_${mesIndex}`] = datosAguardar;
        alert("✅ Avance guardado.");
    } catch (err) {
        console.error("Error guardando:", err);
        alert("❌ Error al guardar.");
    } finally {
        btn.innerHTML = "Guardar Avance";
        btn.disabled = false;
    }
}

function leerFila(id) {
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    if (!fila) return { sem1:0, sem2:0, sem3:0, sem4:0, sem5:0, total:0 };
    const inputs = fila.querySelectorAll(".input-cell");
    let total=0; const valores=[];
    for(let i=0; i<5; i++) {
        const v = parseFloat(inputs[i]?.value)||0;
        valores.push(v);
        total+=v;
    }
    return { sem1:valores[0], sem2:valores[1], sem3:valores[2], sem4:valores[3], sem5:valores[4], total };
}