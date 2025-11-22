// main.js - VERSIÓN CON PLANIFICACIÓN ANUAL, VALIDACIÓN Y OFICINAS DINÁMICAS

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db   = getFirestore(app);
let currentUser = null;

// Fallback por si no hay oficinas en Firestore todavía
const OFICINAS_FALLBACK = [
    "RE/MAX BIG",
    "RE/MAX FLOR",
    "RE/MAX FORUM",
    "RE/MAX ACUERDO",
    "CROAR PROPIEDADES"
];

// ------------------------------------------------------------------
// CARGAR OFICINAS EN EL SELECT DESDE FIRESTORE
// ------------------------------------------------------------------
async function cargarOficinasEnSelect() {
    const select = document.getElementById("miOficina");
    if (!select) return;

    // Estado inicial: cargando
    select.innerHTML = `<option value="" selected disabled>Cargando oficinas...</option>`;

    try {
        const snap = await getDocs(collection(db, "oficinas"));

        // Si hay oficinas en Firestore, usamos esas
        if (!snap.empty) {
            let opciones = `<option value="" selected disabled>Seleccioná tu oficina...</option>`;
            const oficinasOrdenadas = [];

            snap.forEach(docSnap => {
                const data = docSnap.data();
                const nombre = (data && data.nombre) ? String(data.nombre).trim() : "";
                if (nombre) oficinasOrdenadas.push(nombre);
            });

            oficinasOrdenadas
                .sort((a, b) => a.localeCompare(b))
                .forEach(nombre => {
                    opciones += `<option value="${nombre}">${nombre}</option>`;
                });

            select.innerHTML = opciones;
            return;
        }

        // Si NO hay docs, usamos el fallback estático
        let opciones = `<option value="" selected disabled>Seleccioná tu oficina...</option>`;
        OFICINAS_FALLBACK.forEach(nombre => {
            opciones += `<option value="${nombre}">${nombre}</option>`;
        });
        select.innerHTML = opciones;

    } catch (error) {
        console.error("Error cargando oficinas:", error);
        // En error, también usamos fallback
        let opciones = `<option value="" selected disabled>Seleccioná tu oficina...</option>`;
        OFICINAS_FALLBACK.forEach(nombre => {
            opciones += `<option value="${nombre}">${nombre}</option>`;
        });
        select.innerHTML = opciones;
    }
}

// ------------------------------------------------------------------
// FUNCION DE VALIDACIÓN ESTRICTA
// ------------------------------------------------------------------
function validarPlanificacionCompleta() {
    const year    = document.getElementById('selector-plan-anio').value;
    const nombre  = document.getElementById('miNombre').value;
    const oficina = document.getElementById('miOficina').value;
    
    // Objetivos (deben ser > 0)
    const gasto     = parseFloat(document.querySelector('.gastoMensual').value) || 0;
    const condicion = parseFloat(document.querySelector('.condicionDeAgente').value) || 0;
    const objetivo  = parseFloat(document.querySelector('.objetivoAnual').value) || 0;
    const ticket    = parseFloat(document.querySelector('.ticketPromedio').value) || 0;

    // Efectividades (deben estar llenas, pueden ser 0)
    const preListAcm     = document.querySelector('.preListingAcm').value;
    const acmCaptacion   = document.querySelector('.acmCaptacion').value;
    const captacionVenta = document.querySelector('.captacionVenta').value;
    const listingPropio  = document.querySelector('.listingPropio').value;
    const busquedas      = document.querySelector('.busquedas').value;
    
    // 1. Campos de texto y selección obligatorios
    if (!year || year === "") {
        alert("ERROR: Por favor, selecciona el Año de la Planificación.");
        return false;
    }
    if (!nombre || nombre.trim() === "") {
        alert("ERROR: Por favor, ingresa tu Nombre completo.");
        return false;
    }
    if (!oficina || oficina === "") {
        alert("ERROR: Por favor, selecciona tu Oficina.");
        return false;
    }

    // 2. Objetivos financieros (deben ser > 0)
    if (gasto <= 0 || condicion <= 0 || objetivo <= 0 || ticket <= 0) {
        alert("ERROR: Los campos 'Gasto Mensual', 'Condición de Agente', 'Objetivo Anual' y 'Ticket Promedio' deben ser números mayores a cero (0).");
        return false;
    }

    // 3. Efectividades (deben estar llenas, incluso si es 0)
    if (preListAcm === '' || acmCaptacion === '' || captacionVenta === '' || listingPropio === '' || busquedas === '') {
        alert("ERROR: Por favor, completa todos los campos de 'Tus Efectividades (%)'. Si la efectividad es cero, ingresa 0.");
        return false;
    }

    return true;
}

// ------------------------------------------------------------------
// 1. SISTEMA DE SEGURIDAD Y CARGA DE DATOS
// ------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuario conectado:", user.email);
        currentUser = user;
        
        // 1. Inicializar el selector de año al año actual del sistema
        const currentYear  = new Date().getFullYear();
        const selectorAnio = document.getElementById('selector-plan-anio');
        if (selectorAnio) selectorAnio.value = currentYear;

        // 2. Cargar oficinas en el select desde Firestore (con fallback)
        await cargarOficinasEnSelect();

        // 3. Cargar los datos de la planificación para el año seleccionado (por defecto, el actual)
        await cargarDatosGuardados(user.uid);

        // 4. Listener al selector de año para recargar el formulario
        if (selectorAnio) {
            selectorAnio.addEventListener('change', () => {
                cargarDatosGuardados(user.uid);
            });
        }

        // NOTA: el menú "Panel Admin" ahora lo maneja header-user.js
        // No se agrega nada desde main.js para evitar duplicados.

    } else {
        window.location.href = "login.html";
    }
});

// ------------------------------------------------------------------
// 2. CALCULADORA: Objetivo Financiero
// ------------------------------------------------------------------
const btnObjetivo = document.querySelector('.btnCalcularObjetivo');
if (btnObjetivo) {
    btnObjetivo.addEventListener('click', () => {
        const gastoMensual = parseFloat(document.querySelector('.gastoMensual').value) || 0;
        const condicion    = parseFloat(document.querySelector('.condicionDeAgente').value) || 0;
        const respuestaEl  = document.querySelector('.respuestaInputs');

        if (gastoMensual > 0 && condicion > 0) {
            const gastoAnual    = gastoMensual * 12;
            const objetivoBruto = gastoAnual / (condicion / 100);
            const formato = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
            }).format(objetivoBruto);
            
            respuestaEl.textContent = `Tu Objetivo Anual Bruto: ${formato}`;
            respuestaEl.className   = "mb-0 fw-bold text-success respuestaInputs"; 
            document.querySelector('.objetivoAnual').value = objetivoBruto.toFixed(0);
        } else {
            respuestaEl.textContent = "Por favor, completa ambos campos.";
            respuestaEl.className   = "mb-0 fw-bold text-danger respuestaInputs"; 
        }
    });
}

// ------------------------------------------------------------------
// 3. CALCULADORA: Gestión
// ------------------------------------------------------------------
const btnGestion = document.querySelector('.btnCalcularGestion');
if (btnGestion) {
    btnGestion.addEventListener('click', () => {
        realizarCalculosYMostrar();
    });
}

function realizarCalculosYMostrar() {
    const datos = obtenerDatosFormulario();
    if (!datos) return; 

    const mostrarDatoHTML = (valorAnual) => {
        const anual   = Math.ceil(valorAnual);
        const mensual = (valorAnual / 12).toFixed(1);
        return `${anual} <br><span class="text-muted font-size-12">(${mensual}/mes)</span>`;
    };

    document.querySelector('.respuestaCantidadPreListing').innerHTML  = mostrarDatoHTML(datos.preListings);
    document.querySelector('.respuestaCantidadAcm').innerHTML         = mostrarDatoHTML(datos.acms);
    document.querySelector('.respuestaCantidadCaptaciones').innerHTML = mostrarDatoHTML(datos.captaciones);
    document.querySelector('.respuestaCantidadVentas').innerHTML      = mostrarDatoHTML(datos.ventasTotales);
    document.querySelector('.respuestaCantidadVentasPropias').innerHTML = mostrarDatoHTML(datos.ventasPropias);
    document.querySelector('.respuestaCantidadVentasBusquedas').innerHTML = mostrarDatoHTML(datos.ventasBusq);

    const fmtComision = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(datos.comisionPromedio);

    document.querySelector('.respuestaComisionPromedio').textContent =
        `Promedio de comisión por venta (3%): ${fmtComision}`;
    
    return datos; 
}

function obtenerDatosFormulario() {
    const objetivo = parseFloat(document.querySelector('.objetivoAnual').value) || 0;
    const ticket   = parseFloat(document.querySelector('.ticketPromedio').value) || 0;
    
    const rawPreListAcm = parseFloat(document.querySelector('.preListingAcm').value) || 0;
    const rawAcmCapt    = parseFloat(document.querySelector('.acmCaptacion').value) || 0;
    const rawCaptVenta  = parseFloat(document.querySelector('.captacionVenta').value) || 0;
    const rawListPropio = parseFloat(document.querySelector('.listingPropio').value) || 0;
    const rawBusquedas  = parseFloat(document.querySelector('.busquedas').value) || 0;

    const preListAcm    = rawPreListAcm / 100;
    const acmCapt       = rawAcmCapt / 100;
    const captVenta     = rawCaptVenta / 100;
    const pctListPropio = rawListPropio / 100;
    const pctBusqueda   = rawBusquedas / 100;

    if (objetivo === 0 || ticket === 0) return null;

    const comisionPromedio = ticket * 0.03;
    const ventasTotales = objetivo / comisionPromedio;
    const ventasPropias = ventasTotales * pctListPropio;
    const ventasBusq    = ventasTotales * pctBusqueda;

    let captaciones = (captVenta > 0) ? ventasPropias / captVenta : 0;
    let acms        = (acmCapt > 0) ? captaciones / acmCapt : 0;
    let preListings = (preListAcm > 0) ? acms / preListAcm : 0;

    return {
        objetivo, ticket, comisionPromedio,
        rawPreListAcm, rawAcmCapt, rawCaptVenta, rawListPropio, rawBusquedas,
        ventasTotales, ventasPropias, ventasBusq, captaciones, acms, preListings
    };
}

// ------------------------------------------------------------------
// 4. GUARDAR EN LA NUBE (CON AÑO Y VALIDACIÓN)
// ------------------------------------------------------------------
const btnGuardar = document.getElementById('btnGuardarPlanificacion');
if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
        if (!currentUser) return;
        const textoOriginal = btnGuardar.innerHTML;
        
        if (!validarPlanificacionCompleta()) { 
            return;
        }
        
        btnGuardar.innerHTML = `<i class="bx bx-loader bx-spin font-size-16 align-middle me-2"></i> Guardando...`;

        try {
            const datosCalc = obtenerDatosFormulario();
            if (!datosCalc) {
                alert("Primero calculá tu gestión.");
                return;
            }
            
            const oficina = document.getElementById('miOficina').value;
            const year    = document.getElementById('selector-plan-anio').value;
            
            const datosAGuardar = {
                nombreAgente: document.getElementById('miNombre').value,
                oficina: oficina, 
                gastoMensual: document.querySelector('.gastoMensual').value,
                condicionAgente: document.querySelector('.condicionDeAgente').value,
                objetivoAnual: datosCalc.objetivo,
                ticketPromedio: datosCalc.ticket,
                efectividades: {
                    preListAcm: datosCalc.rawPreListAcm,
                    acmCapt: datosCalc.rawAcmCapt,
                    captVenta: datosCalc.rawCaptVenta,
                    listingPropio: datosCalc.rawListPropio,
                    busquedas: datosCalc.rawBusquedas
                },
                resultados: {
                    ventas: datosCalc.ventasTotales.toFixed(1)
                },
                emailUsuario: currentUser.email,
                fechaActualizacion: new Date().toISOString()
            };

            await setDoc(doc(db, "planificaciones", `${currentUser.uid}_${year}`), datosAGuardar);
            alert(`✅ ¡Planificación para el año ${year} guardada exitosamente!`);

        } catch (error) {
            console.error("Error al guardar:", error);
            alert("❌ Error al guardar.");
        } finally {
            btnGuardar.innerHTML = textoOriginal;
        }
    });
}

// ------------------------------------------------------------------
// 5. GENERAR PDF (CON ESPACIADO CORREGIDO Y VALIDACIÓN)
// ------------------------------------------------------------------
const btnPdf = document.getElementById('btnGenerarPdf');
if (btnPdf) {
    btnPdf.addEventListener('click', () => {
        if (!window.jspdf) { alert("Error: Librería PDF no cargada."); return; }
        
        if (!validarPlanificacionCompleta()) { 
            return;
        }

        const datos = obtenerDatosFormulario();
        if (!datos) {
            alert("Primero calculá tu gestión.");
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF();
        
        const backgroundImageBase64 = ""; // opcional
        
        if (backgroundImageBase64) {
            docPdf.addImage(backgroundImageBase64, 'PNG', 0, 0, 210, 297); 
        }

        const nombre  = document.getElementById('miNombre').value || "Agente";
        const oficina = document.getElementById('miOficina').value || "";
        const year    = document.getElementById('selector-plan-anio').value || new Date().getFullYear();
        const fecha   = new Date().toLocaleDateString();
        
        let y = 70;
        const margenIzq = 20; 
        const colValor  = 115; 
        const saltoLineaItem = 8; 

        const tituloSeccion = (texto) => {
            docPdf.setFontSize(14); docPdf.setTextColor(255, 126, 0); docPdf.setFont("helvetica", "bold");
            docPdf.text(texto, margenIzq, y); y += 12;
        };
        const itemDato = (etiqueta, valor) => {
            docPdf.setFontSize(11); docPdf.setTextColor(50, 50, 50); docPdf.setFont("helvetica", "bold");
            docPdf.text(etiqueta, margenIzq, y);
            docPdf.setFont("helvetica", "normal"); docPdf.text(String(valor), colValor, y); y += saltoLineaItem;
        };

        // Encabezado
        docPdf.setFontSize(12); docPdf.setTextColor(0, 0, 0); docPdf.setFont("helvetica", "bold");
        docPdf.text(`Agente: ${nombre}`,  margenIzq, 45);
        docPdf.text(`Oficina: ${oficina}`, margenIzq, 51);
        docPdf.text(`Año de Planificación: ${year}`, margenIzq, 57); 
        docPdf.text(`Fecha de Descarga: ${fecha}`, 150, 45);

        // Datos
        tituloSeccion("Mis Efectividades:"); 
        const fmtUSD = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        });

        itemDato("Objetivo anual:",    fmtUSD.format(datos.objetivo));
        itemDato("Ticket Promedio:",   fmtUSD.format(datos.ticket));
        y += 5;
        itemDato("Porcentaje de Prelisting a ACM:", datos.rawPreListAcm + "%");
        itemDato("Porcentaje de ACM a Captación:",  datos.rawAcmCapt + "%");
        itemDato("Porcentaje de Captación a Venta:", datos.rawCaptVenta + "%");
        itemDato("Porcentaje de Listing Propio:",    datos.rawListPropio + "%");
        itemDato("Porcentaje de Búsquedas:",         datos.rawBusquedas + "%");

        y += 12;
        tituloSeccion("Resultados de Gestión necesaria"); 

        const fmtRes = (val) => {
            const anual   = Math.ceil(val);
            const mensual = (val/12).toFixed(1);
            return `${anual} Anuales / ${mensual} Mensuales`;
        };

        itemDato("Transacciones totales:", fmtRes(datos.ventasTotales));
        itemDato("Ventas Propias:",        fmtRes(datos.ventasPropias));
        itemDato("Ventas Búsquedas:",      fmtRes(datos.ventasBusq));
        y += 5;
        itemDato("Captaciones:", fmtRes(datos.captaciones));
        itemDato("ACM:",         fmtRes(datos.acms));
        itemDato("Prelisting:",  fmtRes(datos.preListings));

        y += 10;
        docPdf.setFontSize(11); docPdf.setTextColor(50, 50, 50); docPdf.setFont("helvetica", "normal");
        const fmtComisionFinal = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(datos.comisionPromedio);
        docPdf.text(`Promedio de comisión por venta (3%): ${fmtComisionFinal}`, margenIzq, y);

        docPdf.save(`Planificacion_${nombre}_${year}.pdf`); 
    });
}

// ------------------------------------------------------------------
// 6. CARGAR DATOS (MODIFICADA para usar el año)
// ------------------------------------------------------------------
async function cargarDatosGuardados(uid) {
    try {
        const year = document.getElementById('selector-plan-anio').value;
        const docSnap = await getDoc(doc(db, "planificaciones", `${uid}_${year}`));
        
        document.querySelector('.gastoMensual').value      = '';
        document.querySelector('.condicionDeAgente').value = '';
        document.querySelector('.objetivoAnual').value     = '';
        document.querySelector('.ticketPromedio').value    = '';
        
        document.querySelector('.preListingAcm').value   = '';
        document.querySelector('.acmCaptacion').value    = '';
        document.querySelector('.captacionVenta').value  = '';
        document.querySelector('.listingPropio').value   = '';
        document.querySelector('.busquedas').value       = '';

        document.querySelector('.respuestaCantidadPreListing').innerHTML  = '-';
        document.querySelector('.respuestaCantidadAcm').innerHTML         = '-';
        document.querySelector('.respuestaCantidadCaptaciones').innerHTML = '-';
        document.querySelector('.respuestaCantidadVentas').innerHTML      = '-';
        document.querySelector('.respuestaCantidadVentasPropias').innerHTML = '-';
        document.querySelector('.respuestaCantidadVentasBusquedas').innerHTML = '-';
        document.querySelector('.respuestaComisionPromedio').textContent  = '';

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.nombreAgente) document.getElementById('miNombre').value  = data.nombreAgente;
            if (data.oficina)      document.getElementById('miOficina').value = data.oficina;
            
            if (data.gastoMensual)     document.querySelector('.gastoMensual').value      = data.gastoMensual;
            if (data.condicionAgente)  document.querySelector('.condicionDeAgente').value = data.condicionAgente;
            if (data.objetivoAnual)    document.querySelector('.objetivoAnual').value     = data.objetivoAnual;
            if (data.ticketPromedio)   document.querySelector('.ticketPromedio').value    = data.ticketPromedio;
            
            if (data.efectividades) {
                document.querySelector('.preListingAcm').value  = data.efectividades.preListAcm || "";
                document.querySelector('.acmCaptacion').value   = data.efectividades.acmCapt   || "";
                document.querySelector('.captacionVenta').value = data.efectividades.captVenta || "";
                document.querySelector('.listingPropio').value  = data.efectividades.listingPropio || "";
                document.querySelector('.busquedas').value      = data.efectividades.busquedas || "";
            }
            
            if (data.objetivoAnual) {
                setTimeout(() => {
                    if (btnGestion)  btnGestion.click();
                    if (btnObjetivo && data.gastoMensual) btnObjetivo.click();
                }, 50);
            }
        }
    } catch (error) {
        console.log("Error cargando datos:", error);
    }
}

