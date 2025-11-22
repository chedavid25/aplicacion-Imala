// tracking.js - TRACKING MENSUAL POR AÑO (CON ESTACIONALIDAD POR OFICINA)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let planificacionAnual = null;   // Documento de "planificaciones"
let datosTracking = {};          // Documento de "tracking"

// --- 1. CONFIGURACIÓN DE ESTACIONALIDAD ---
// true  = usa 17/23/25/35 para FACTURACIÓN
// false = divide la facturación anual en 12 meses
const CONFIG_OFICINAS = {
    "RE/MAX BIG": true,
    "RE/MAX FORUM": true,
    "RE/MAX FLOR": true,
    "RE/MAX ACUERDO": true,
    "CROAR PROPIEDADES": false
};

// 17% Q1, 23% Q2, 25% Q3, 35% Q4 (repartido en 3 meses cada uno)
const FACTORES_ESTACIONALES = {
    0: 0.17 / 3, 1: 0.17 / 3, 2: 0.17 / 3,       // Ene, Feb, Mar
    3: 0.23 / 3, 4: 0.23 / 3, 5: 0.23 / 3,       // Abr, May, Jun
    6: 0.25 / 3, 7: 0.25 / 3, 8: 0.25 / 3,       // Jul, Ago, Sep
    9: 0.35 / 3, 10: 0.35 / 3, 11: 0.35 / 3      // Oct, Nov, Dic
};

// --- 2. SEGURIDAD Y ARRANQUE ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;
    console.log("Usuario tracking:", user.email);

    const selectorAnio = document.getElementById("selector-anio");
    const selectorMes  = document.getElementById("selector-mes");

    // Año por defecto = año actual
    const añoActual = new Date().getFullYear();
    if (selectorAnio && !selectorAnio.value) {
        selectorAnio.value = añoActual;
    }

    // Cargar planificación + tracking del año seleccionado
    await cargarPlanificacion();
    await cargarTrackingDelAno();

    // Mes por defecto = mes actual
    const mesActual = new Date().getMonth();
    if (selectorMes) {
        selectorMes.value = String(mesActual);
        actualizarMatriz(mesActual);
    }

    // Link al panel admin SOLO para el mail definido
    if (user.email === "contacto@imala.com.ar") {
        const sidebar = document.getElementById("sidebar-menu");
        if (sidebar) {
            const menu = sidebar.querySelector("ul");
            if (menu) {
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
        }
    }

    // Eventos de cambio de mes/año
    if (selectorMes) {
        selectorMes.addEventListener("change", (e) => {
            const idx = parseInt(e.target.value, 10) || 0;
            actualizarMatriz(idx);
        });
    }

    if (selectorAnio) {
        selectorAnio.addEventListener("change", () => {
            cargarTrackingDelAno();
        });
    }

    // Recalcular fila cuando el usuario tipea en cualquier input
    document.addEventListener("input", (e) => {
        if (e.target.classList && e.target.classList.contains("input-cell")) {
            const fila = e.target.closest("tr");
            if (fila) calcularFila(fila);
        }
    });

    // Botón de guardar tracking
    const btnGuardar = document.getElementById("btn-guardar-track");
    if (btnGuardar) {
        btnGuardar.addEventListener("click", guardarTrackingMesActual);
    }
});

// --- 3. CARGA DE PLANIFICACIÓN ---

async function cargarPlanificacion() {
    if (!currentUser) return;

    const selectorAnio = document.getElementById("selector-anio");
    if (!selectorAnio) return;

    const year = selectorAnio.value;

    try {
        const docRef = doc(db, "planificaciones", `${currentUser.uid}_${year}`);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            planificacionAnual = snap.data();
            recalcularObjetivosOperativos();
        } else {
            planificacionAnual = {
                OBJETIVOS: { facturacion: 0, captaciones: 0, acm: 0, prelisting: 0 }
            };
        }
    } catch (err) {
        console.error("Error cargando planificación:", err);
        planificacionAnual = {
            OBJETIVOS: { facturacion: 0, captaciones: 0, acm: 0, prelisting: 0 }
        };
    }
}

// Calcula objetivos anuales operativos a partir de la planificación
function recalcularObjetivosOperativos() {
    if (!planificacionAnual) return;

    const p = planificacionAnual;
    const efec = p.efectividades || {};

    const objFact = parseFloat(p.objetivoAnual) || 0;
    const ticket  = parseFloat(p.ticketPromedio) || 0;
    const comision = ticket * 0.03;
    const transacciones = comision > 0 ? objFact / comision : 0;

    const captVenta  = (parseFloat(efec.captVenta)     || 0) / 100;
    const acmCapt    = (parseFloat(efec.acmCapt)       || 0) / 100;
    const preListAcm = (parseFloat(efec.preListAcm)    || 0) / 100;
    const pctPropio  = (parseFloat(efec.listingPropio) || 0) / 100;

    const ventasPropias = transacciones * pctPropio;
    const captaciones   = captVenta   > 0 ? ventasPropias / captVenta : 0;
    const acms          = acmCapt     > 0 ? captaciones / acmCapt     : 0;
    const prelistings   = preListAcm  > 0 ? acms / preListAcm         : 0;

    planificacionAnual.OBJETIVOS = {
        facturacion: objFact,
        captaciones: captaciones,
        acm:         acms,
        prelisting:  prelistings
    };
}

// --- 4. CARGA DE TRACKING DEL AÑO ---

async function cargarTrackingDelAno() {
    if (!currentUser) return;

    const selectorAnio = document.getElementById("selector-anio");
    const selectorMes  = document.getElementById("selector-mes");
    if (!selectorAnio || !selectorMes) return;

    const year = selectorAnio.value;
    const mesIndex = parseInt(selectorMes.value, 10) || 0;

    try {
        await cargarPlanificacion(); // asegura que OBJETIVOS esté recalculado

        const docRef = doc(db, "tracking", `${currentUser.uid}_${year}`);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            datosTracking = snap.data();
        } else {
            datosTracking = {};
        }

        actualizarMatriz(mesIndex);
    } catch (err) {
        console.error("Error cargando tracking:", err);
        datosTracking = {};
        actualizarMatriz(mesIndex);
    }
}

// --- 5. LÓGICA DE LA MATRIZ ---

function actualizarMatriz(mesIndex) {
    if (!planificacionAnual) return;

    // 1. Limpiar inputs
    document.querySelectorAll(".input-cell").forEach(i => { i.value = ""; });

    // 2. Cargar datos guardados de este mes (si existen)
    const datosMes = datosTracking[`mes_${mesIndex}`];
    if (datosMes) {
        rellenarFila("facturacion", datosMes.facturacion);
        rellenarFila("captaciones", datosMes.captaciones);
        rellenarFila("acm",         datosMes.acm);
        rellenarFila("prelisting",  datosMes.prelisting);
        rellenarFila("caracara",    datosMes.caracara);
        rellenarFila("prebuy",      datosMes.prebuy);
        rellenarFila("reservas",    datosMes.reservas);
    }

    // 3. Calcular objetivos mensuales del mes elegido
    establecerObjetivosMensuales(mesIndex);

    // 4. Recalcular totales y porcentajes
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

// Solo facturación usa estacionalidad; el resto siempre anual/12
function establecerObjetivosMensuales(mesIndex) {
    if (!planificacionAnual || !planificacionAnual.OBJETIVOS) {
        pintarObjetivo("facturacion", 0, true);
        pintarObjetivo("captaciones", 0, false);
        pintarObjetivo("acm",         0, false);
        pintarObjetivo("prelisting",  0, false);
        return;
    }

    const oficina = planificacionAnual.oficina || "";
    const usaEstacionalidad = CONFIG_OFICINAS[oficina] === true;

    // FACTURACIÓN
    let objetivoFact = 0;
    if (usaEstacionalidad) {
        const factor = FACTORES_ESTACIONALES[mesIndex] ?? (1 / 12);
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion * factor;
    } else {
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion / 12;
    }

    // RESTO SIEMPRE /12
    const objetivoCapt = planificacionAnual.OBJETIVOS.captaciones / 12;
    const objetivoAcm  = planificacionAnual.OBJETIVOS.acm / 12;
    const objetivoPre  = planificacionAnual.OBJETIVOS.prelisting / 12;

    pintarObjetivo("facturacion", objetivoFact, true);
    pintarObjetivo("captaciones", objetivoCapt, false);
    pintarObjetivo("acm",         objetivoAcm,  false);
    pintarObjetivo("prelisting",  objetivoPre,  false);
}

function pintarObjetivo(id, valor, esDinero) {
    const celda = document.querySelector(`tr[data-id="${id}"] .val-objetivo`);
    if (!celda) return;

    celda.dataset.value = String(valor || 0);

    if (esDinero) {
        celda.textContent = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0
        }).format(valor || 0);
    } else {
        celda.textContent = Math.ceil(valor || 0);
    }
}

function calcularFila(fila) {
    let total = 0;
    fila.querySelectorAll(".input-cell").forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });

    const celdaTotal = fila.querySelector(".val-total");
    const esDinero = fila.dataset.id === "facturacion";

    if (celdaTotal) {
        if (esDinero) {
            celdaTotal.textContent = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0
            }).format(total || 0);
        } else {
            celdaTotal.textContent = total || 0;
        }
    }

    const celdaObj = fila.querySelector(".val-objetivo");
    const celdaPct = fila.querySelector(".val-pct");

    if (celdaObj && celdaPct) {
        const objetivo = parseFloat(celdaObj.dataset.value) || 0;

        if (objetivo > 0) {
            const porcentaje = (total / objetivo) * 100;
            const pctRedondeado = Math.round(porcentaje);

            celdaPct.textContent = pctRedondeado + "%";
            celdaPct.className = "badge val-pct";

            if (pctRedondeado >= 100) {
                celdaPct.classList.add("bg-success");
            } else if (pctRedondeado >= 70) {
                celdaPct.classList.add("bg-warning");
            } else {
                celdaPct.classList.add("bg-danger");
            }
        } else {
            celdaPct.textContent = "-";
            celdaPct.className = "badge bg-secondary val-pct";
        }
    }
}

// --- 6. GUARDAR MES ACTUAL EN FIRESTORE ---

async function guardarTrackingMesActual() {
    if (!currentUser) return;

    const btn = document.getElementById("btn-guardar-track");
    if (!btn) return;

    const textoOriginal = btn.innerHTML;
    btn.innerHTML = `<i class="bx bx-loader bx-spin"></i> Guardando...`;
    btn.disabled = true;

    try {
        const selectorMes  = document.getElementById("selector-mes");
        const selectorAnio = document.getElementById("selector-anio");
        if (!selectorMes || !selectorAnio) throw new Error("Faltan selectores de mes/año");

        const mesIndex = parseInt(selectorMes.value, 10) || 0;
        const year = selectorAnio.value;

        const datosAguardar = {
            facturacion: leerFila("facturacion"),
            captaciones: leerFila("captaciones"),
            acm:         leerFila("acm"),
            prelisting:  leerFila("prelisting"),
            caracara:    leerFila("caracara"),
            prebuy:      leerFila("prebuy"),
            reservas:    leerFila("reservas"),
            ultimaActualizacion: new Date().toISOString()
        };

        const docRef = doc(db, "tracking", `${currentUser.uid}_${year}`);
        await setDoc(docRef, { [`mes_${mesIndex}`]: datosAguardar }, { merge: true });

        if (!datosTracking) datosTracking = {};
        datosTracking[`mes_${mesIndex}`] = datosAguardar;

        alert("✅ Avance guardado correctamente.");
    } catch (err) {
        console.error("Error guardando tracking:", err);
        alert("❌ Error al guardar el avance.");
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

function leerFila(id) {
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    if (!fila) {
        return { sem1: 0, sem2: 0, sem3: 0, sem4: 0, sem5: 0, total: 0 };
    }

    const inputs = fila.querySelectorAll(".input-cell");
    let total = 0;
    const valores = [];

    for (let i = 0; i < 5; i++) {
        const v = parseFloat(inputs[i]?.value) || 0;
        valores.push(v);
        total += v;
    }

    return {
        sem1: valores[0],
        sem2: valores[1],
        sem3: valores[2],
        sem4: valores[3],
        sem5: valores[4],
        total
    };
}
