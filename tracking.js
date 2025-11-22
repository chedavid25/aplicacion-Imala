// tracking.js - LÓGICA DE LA MATRIZ MENSUAL

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let planificacionAnual = null; // Aquí guardaremos los datos del Paso 1
let datosTracking = {}; // Aquí lo que se carga en esta pantalla

// --- 1. CONFIGURACIÓN DE ESTACIONALIDAD ---
// Define qué oficinas usan el cálculo por trimestres (17%, 23%, 25%, 35%)
// true = Estacional, false = Lineal (dividido 12)
const CONFIG_OFICINAS = {
    "RE/MAX BIG": true,
    "RE/MAX FORUM": true,
    "RE/MAX FLOR": true,
    "RE/MAX ACUERDO": true,
    "CROAR PROPIEDADES": false // Ejemplo: Esta usa lineal
};

// Porcentajes de Facturación por Trimestre (Q1, Q2, Q3, Q4)
// Se divide por 3 para saber cuánto toca por MES dentro de ese trimestre
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
        
        // 1. Cargar la Planificación Anual (Objetivos)
        await cargarPlanificacion();
        
        // 2. Cargar el Tracking (si ya guardó algo este año)
        await cargarTrackingDelAno();

        // 3. Inicializar la pantalla con el mes actual
        const mesActual = new Date().getMonth();
        document.getElementById("selector-mes").value = mesActual;
        actualizarMatriz(mesActual);
        
    } else {
        window.location.href = "login.html";
    }
});

// --- 3. CARGAR DATOS DE LA NUBE ---
async function cargarPlanificacion() {
    try {
        const docSnap = await getDoc(doc(db, "planificaciones", currentUser.uid));
        if (docSnap.exists()) {
            planificacionAnual = docSnap.data();
            // Recalcular objetivos operativos anuales (porque solo guardamos inputs)
            recalcularObjetivosOperativos();
        } else {
            alert("⚠️ Primero debes completar tu Planificación Anual.");
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Error cargando plan:", error);
    }
}

function recalcularObjetivosOperativos() {
    // Reconstruimos los objetivos anuales matemáticamente
    const p = planificacionAnual;
    const efec = p.efectividades;
    
    const objFact = parseFloat(p.objetivoAnual) || 0;
    const ticket = parseFloat(p.ticketPromedio) || 0;
    const comision = ticket * 0.03;
    
    const transacciones = comision > 0 ? objFact / comision : 0;
    
    // Embudo inverso
    const captVenta = (parseFloat(efec.captVenta) || 0) / 100;
    const acmCapt = (parseFloat(efec.acmCapt) || 0) / 100;
    const preListAcm = (parseFloat(efec.preListAcm) || 0) / 100;
    const pctPropio = (parseFloat(efec.listingPropio) || 0) / 100;

    const ventasPropias = transacciones * pctPropio;
    const captaciones = captVenta > 0 ? ventasPropias / captVenta : 0;
    const acms = acmCapt > 0 ? captaciones / acmCapt : 0;
    const prelistings = preListAcm > 0 ? acms / preListAcm : 0;

    // Guardamos los objetivos anuales calculados en el objeto
    planificacionAnual.OBJETIVOS = {
        facturacion: objFact,
        captaciones: captaciones,
        acm: acms,
        prelisting: prelistings
    };
}

async function cargarTrackingDelAno() {
    const year = new Date().getFullYear();
    try {
        const docSnap = await getDoc(doc(db, "tracking", `${currentUser.uid}_${year}`));
        if (docSnap.exists()) {
            datosTracking = docSnap.data();
        } else {
            datosTracking = {}; // Empezamos de cero este año
        }
    } catch (error) {
        console.error("Error cargando tracking:", error);
    }
}

// --- 4. LÓGICA DE LA MATRIZ ---

// Evento: Cambiar de Mes
document.getElementById("selector-mes").addEventListener("change", (e) => {
    actualizarMatriz(parseInt(e.target.value));
});

// Evento: Escribir en los inputs (Cálculo en vivo)
document.querySelectorAll('.input-cell').forEach(input => {
    input.addEventListener('input', () => {
        const fila = input.closest('tr');
        calcularFila(fila);
    });
});

function actualizarMatriz(mesIndex) {
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

    // 3. Calcular Objetivos del Mes (La magia de la Estacionalidad)
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
    if (!planificacionAnual || !planificacionAnual.OBJETIVOS) return;

    const oficina = planificacionAnual.oficina;
    const usaEstacionalidad = CONFIG_OFICINAS[oficina] === true; // Verifica si aplica la regla

    // FACTURACIÓN
    let objetivoFact = 0;
    if (usaEstacionalidad) {
        // Aplica % del trimestre
        const factor = FACTORES_ESTACIONALES[mesIndex];
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion * factor;
    } else {
        // Lineal (Dividido 12)
        objetivoFact = planificacionAnual.OBJETIVOS.facturacion / 12;
    }

    // OTROS (Siempre lineales o podrías aplicar factor también si quisieras)
    // Por defecto en el rubro, captaciones y gestión suele ser más constante, así que usamos lineal.
    const objetivoCapt = planificacionAnual.OBJETIVOS.captaciones / 12;
    const objetivoAcm = planificacionAnual.OBJETIVOS.acm / 12;
    const objetivoPre = planificacionAnual.OBJETIVOS.prelisting / 12;

    // Escribir en la tabla
    pintarObjetivo("facturacion", objetivoFact, true); // true = es dinero
    pintarObjetivo("captaciones", objetivoCapt, false);
    pintarObjetivo("acm", objetivoAcm, false);
    pintarObjetivo("prelisting", objetivoPre, false);
}

function pintarObjetivo(id, valor, esDinero) {
    const celda = document.querySelector(`tr[data-id="${id}"] .val-objetivo`);
    if (celda) {
        // Guardamos el valor numérico "escondido" para cálculos
        celda.dataset.value = valor;
        // Mostramos bonito
        if (esDinero) {
            celda.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(valor);
        } else {
            celda.textContent = Math.ceil(valor); // Redondeo hacia arriba en gestión
        }
    }
}

function calcularFila(fila) {
    // 1. Sumar inputs
    let total = 0;
    fila.querySelectorAll('.input-cell').forEach(inp => {
        total += parseFloat(inp.value) || 0;
    });

    // 2. Mostrar Total
    const celdaTotal = fila.querySelector('.val-total');
    const esDinero = fila.dataset.id === "facturacion";
    
    if(esDinero) {
        celdaTotal.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total);
    } else {
        celdaTotal.textContent = total;
    }

    // 3. Calcular % vs Objetivo (si existe objetivo)
    const celdaObj = fila.querySelector('.val-objetivo');
    const celdaPct = fila.querySelector('.val-pct');

    if (celdaObj && celdaPct) {
        const objetivo = parseFloat(celdaObj.dataset.value) || 0;
        
        if (objetivo > 0) {
            const porcentaje = (total / objetivo) * 100;
            celdaPct.textContent = porcentaje.toFixed(0) + "%";

            // Semáforo de colores
            celdaPct.className = "badge val-pct"; // Reset clases
            if (porcentaje >= 100) celdaPct.classList.add("bg-success"); // Verde
            else if (porcentaje >= 70) celdaPct.classList.add("bg-warning"); // Amarillo
            else celdaPct.classList.add("bg-danger"); // Rojo
        } else {
            celdaPct.textContent = "-";
            celdaPct.classList.add("bg-light", "text-dark");
        }
    }
}

// --- 5. GUARDAR ---
document.getElementById("btn-guardar-track").addEventListener("click", async () => {
    const btn = document.getElementById("btn-guardar-track");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = `<i class="bx bx-loader bx-spin"></i> Guardando...`;

    const mesIndex = document.getElementById("selector-mes").value;
    const year = new Date().getFullYear();

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

    // Estructura: tracking -> uid_2025 -> mes_X
    // Usamos { merge: true } para no borrar los otros meses
    const docRef = doc(db, "tracking", `${currentUser.uid}_${year}`);
    
    try {
        await setDoc(docRef, {
            [`mes_${mesIndex}`]: datosAguardar
        }, { merge: true });
        
        // Actualizamos la variable local también
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
    // Calculamos el total real para guardarlo y facilitar reportes luego
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