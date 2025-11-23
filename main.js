// main.js - Planificación Anual (Configuración Centralizada)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";
import { ConfigService } from "./config-service.js"; // <--- IMPORTANTE

const auth = getAuth(app);
const db   = getFirestore(app);
let currentUser = null;

// ------------------------------------------------------------------
// CARGAR OFICINAS DESDE SERVICIO
// ------------------------------------------------------------------
async function cargarOficinasEnSelect() {
    const select = document.getElementById("miOficina");
    if (!select) return;
    select.innerHTML = `<option value="" selected disabled>Cargando oficinas...</option>`;

    try {
        const listaOficinas = await ConfigService.obtenerOficinas(); // [{nombre, usaEstacionalidad}]
        
        // Ordenar alfabéticamente por nombre
        listaOficinas.sort((a, b) => a.nombre.localeCompare(b.nombre));

        let opciones = `<option value="" selected disabled>Seleccioná tu oficina...</option>`;
        listaOficinas.forEach(of => {
            opciones += `<option value="${of.nombre}">${of.nombre}</option>`;
        });
        select.innerHTML = opciones;
    } catch (error) {
        console.error("Error cargando oficinas:", error);
        select.innerHTML = `<option value="" selected disabled>Error al cargar</option>`;
    }
}

// ------------------------------------------------------------------
// VALIDACIÓN
// ------------------------------------------------------------------
function validarPlanificacionCompleta() {
    const year = document.getElementById('selector-plan-anio').value;
    const nombre = document.getElementById('miNombre').value;
    const oficina = document.getElementById('miOficina').value;
    
    const gasto = parseFloat(document.querySelector('.gastoMensual').value) || 0;
    const condicion = parseFloat(document.querySelector('.condicionDeAgente').value) || 0;
    const objetivo = parseFloat(document.querySelector('.objetivoAnual').value) || 0;
    const ticket = parseFloat(document.querySelector('.ticketPromedio').value) || 0;

    const pre = document.querySelector('.preListingAcm').value;
    const acm = document.querySelector('.acmCaptacion').value;
    const capt = document.querySelector('.captacionVenta').value;
    const prop = document.querySelector('.listingPropio').value;
    const busq = document.querySelector('.busquedas').value;
    
    if (!year) { alert("Selecciona el Año."); return false; }
    if (!nombre.trim()) { alert("Ingresa tu Nombre."); return false; }
    if (!oficina) { alert("Selecciona tu Oficina."); return false; }

    if (gasto <= 0 || condicion <= 0 || objetivo <= 0 || ticket <= 0) {
        alert("Los valores financieros deben ser mayores a cero.");
        return false;
    }
    if (pre === '' || acm === '' || capt === '' || prop === '' || busq === '') {
        alert("Completa todas las efectividades (poné 0 si corresponde).");
        return false;
    }
    return true;
}

// ------------------------------------------------------------------
// SISTEMA DE SEGURIDAD Y CARGA
// ------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Conectado:", user.email);
        currentUser = user;
        
        const currentYear = new Date().getFullYear();
        const selectorAnio = document.getElementById('selector-plan-anio');
        if (selectorAnio) selectorAnio.value = currentYear;

        await cargarOficinasEnSelect();
        await cargarDatosGuardados(user.uid);

        if (selectorAnio) {
            selectorAnio.addEventListener('change', () => {
                cargarDatosGuardados(user.uid);
            });
        }
    } else {
        window.location.href = "login.html";
    }
});

// ------------------------------------------------------------------
// CALCULADORAS (Objetivo y Gestión)
// ------------------------------------------------------------------
const btnObjetivo = document.querySelector('.btnCalcularObjetivo');
if (btnObjetivo) {
    btnObjetivo.addEventListener('click', () => {
        const gasto = parseFloat(document.querySelector('.gastoMensual').value) || 0;
        const condicion = parseFloat(document.querySelector('.condicionDeAgente').value) || 0;
        const res = document.querySelector('.respuestaInputs');

        if (gasto > 0 && condicion > 0) {
            const anual = gasto * 12;
            const bruto = anual / (condicion / 100);
            const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(bruto);
            res.textContent = `Tu Objetivo Anual Bruto: ${fmt}`;
            res.className = "mb-0 fw-bold text-success respuestaInputs"; 
            document.querySelector('.objetivoAnual').value = bruto.toFixed(0);
        } else {
            res.textContent = "Por favor, completa ambos campos.";
            res.className = "mb-0 fw-bold text-danger respuestaInputs"; 
        }
    });
}

const btnGestion = document.querySelector('.btnCalcularGestion');
if (btnGestion) {
    btnGestion.addEventListener('click', realizarCalculosYMostrar);
}

function realizarCalculosYMostrar() {
    const datos = obtenerDatosFormulario();
    if (!datos) return; 

    const show = (v) => `${Math.ceil(v)} <br><span class="text-muted font-size-12">(${(v/12).toFixed(1)}/mes)</span>`;

    document.querySelector('.respuestaCantidadPreListing').innerHTML = show(datos.preListings);
    document.querySelector('.respuestaCantidadAcm').innerHTML = show(datos.acms);
    document.querySelector('.respuestaCantidadCaptaciones').innerHTML = show(datos.captaciones);
    document.querySelector('.respuestaCantidadVentas').innerHTML = show(datos.ventasTotales);
    document.querySelector('.respuestaCantidadVentasPropias').innerHTML = show(datos.ventasPropias);
    document.querySelector('.respuestaCantidadVentasBusquedas').innerHTML = show(datos.ventasBusq);

    const fmtCom = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(datos.comisionPromedio);
    document.querySelector('.respuestaComisionPromedio').textContent = `Promedio comisión (3%): ${fmtCom}`;
    return datos; 
}

function obtenerDatosFormulario() {
    const obj = parseFloat(document.querySelector('.objetivoAnual').value) || 0;
    const ticket = parseFloat(document.querySelector('.ticketPromedio').value) || 0;
    
    const rPre = parseFloat(document.querySelector('.preListingAcm').value) || 0;
    const rAcm = parseFloat(document.querySelector('.acmCaptacion').value) || 0;
    const rCapt = parseFloat(document.querySelector('.captacionVenta').value) || 0;
    const rProp = parseFloat(document.querySelector('.listingPropio').value) || 0;
    const rBusq = parseFloat(document.querySelector('.busquedas').value) || 0;

    const pre = rPre/100, acm = rAcm/100, capt = rCapt/100, prop = rProp/100, busq = rBusq/100;

    if (obj === 0 || ticket === 0) return null;

    const comisionPromedio = ticket * 0.03;
    // Validación simple para evitar Infinity
    const ventasTotales = comisionPromedio > 0 ? obj / comisionPromedio : 0;
    const ventasPropias = ventasTotales * prop;
    const ventasBusq    = ventasTotales * busq;

    let captaciones = (capt > 0) ? ventasPropias / capt : 0;
    let acms        = (acm > 0) ? captaciones / acm : 0;
    let preListings = (pre > 0) ? acms / pre : 0;

    return {
        objetivo: obj, ticket, comisionPromedio,
        rawPreListAcm: rPre, rawAcmCapt: rAcm, rawCaptVenta: rCapt, rawListPropio: rProp, rawBusquedas: rBusq,
        ventasTotales, ventasPropias, ventasBusq, captaciones, acms, preListings
    };
}

// ------------------------------------------------------------------
// GUARDAR EN FIRESTORE
// ------------------------------------------------------------------
const btnGuardar = document.getElementById('btnGuardarPlanificacion');
if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
        if (!currentUser) return;
        const txtOrig = btnGuardar.innerHTML;
        
        if (!validarPlanificacionCompleta()) return;
        
        btnGuardar.innerHTML = `<i class="bx bx-loader bx-spin font-size-16 align-middle me-2"></i> Guardando...`;

        try {
            const datosCalc = obtenerDatosFormulario();
            if (!datosCalc) { alert("Calculá primero."); return; }
            
            const oficina = document.getElementById('miOficina').value;
            const year = document.getElementById('selector-plan-anio').value;
            
            const data = {
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

            await setDoc(doc(db, "planificaciones", `${currentUser.uid}_${year}`), data);
            alert(`✅ Planificación ${year} guardada.`);

        } catch (error) {
            console.error("Error guardando:", error);
            alert("❌ Error al guardar.");
        } finally {
            btnGuardar.innerHTML = txtOrig;
        }
    });
}

// ------------------------------------------------------------------
// PDF
// ------------------------------------------------------------------
const btnPdf = document.getElementById('btnGenerarPdf');
if (btnPdf) {
    btnPdf.addEventListener('click', () => {
        if (!window.jspdf) { alert("Librería PDF no cargada."); return; }
        if (!validarPlanificacionCompleta()) return;

        const datos = obtenerDatosFormulario();
        if (!datos) { alert("Calculá primero."); return; }
        
        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF();
        
        // (Opcional) Imagen base64 si la tenés
        const bg = ""; 
        if (bg) docPdf.addImage(bg, 'PNG', 0, 0, 210, 297);

        const nombre = document.getElementById('miNombre').value || "Agente";
        const oficina = document.getElementById('miOficina').value || "";
        const year = document.getElementById('selector-plan-anio').value || new Date().getFullYear();
        const fecha = new Date().toLocaleDateString();
        
        let y = 70; const m = 20; const colV = 115;

        const title = (t) => { docPdf.setFontSize(14); docPdf.setTextColor(255,126,0); docPdf.setFont("helvetica","bold"); docPdf.text(t,m,y); y+=12; };
        const item = (lbl, val) => { docPdf.setFontSize(11); docPdf.setTextColor(50,50,50); docPdf.setFont("helvetica","bold"); docPdf.text(lbl,m,y); docPdf.setFont("helvetica","normal"); docPdf.text(String(val),colV,y); y+=8; };

        docPdf.setFontSize(12); docPdf.setTextColor(0,0,0); docPdf.setFont("helvetica","bold");
        docPdf.text(`Agente: ${nombre}`, m, 45);
        docPdf.text(`Oficina: ${oficina}`, m, 51);
        docPdf.text(`Planificación: ${year}`, m, 57);
        docPdf.text(`Fecha: ${fecha}`, 150, 45);

        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

        title("Mis Efectividades:");
        item("Objetivo anual:", fmt.format(datos.objetivo));
        item("Ticket Promedio:", fmt.format(datos.ticket));
        y+=5;
        item("% Prelisting a ACM:", datos.rawPreListAcm + "%");
        item("% ACM a Captación:", datos.rawAcmCapt + "%");
        item("% Captación a Venta:", datos.rawCaptVenta + "%");
        item("% Listing Propio:", datos.rawListPropio + "%");
        item("% Búsquedas:", datos.rawBusquedas + "%");

        y+=12;
        title("Gestión Necesaria:");
        const show = (v) => `${Math.ceil(v)} Anual / ${(v/12).toFixed(1)} Mensual`;
        
        item("Transacciones:", show(datos.ventasTotales));
        item("Ventas Propias:", show(datos.ventasPropias));
        item("Ventas Búsquedas:", show(datos.ventasBusq));
        y+=5;
        item("Captaciones:", show(datos.captaciones));
        item("ACM:", show(datos.acms));
        item("Prelisting:", show(datos.preListings));

        docPdf.save(`Planificacion_${nombre}_${year}.pdf`); 
    });
}

async function cargarDatosGuardados(uid) {
    try {
        const year = document.getElementById('selector-plan-anio').value;
        const docSnap = await getDoc(doc(db, "planificaciones", `${uid}_${year}`));
        
        // Limpiar campos
        ['.gastoMensual','.condicionDeAgente','.objetivoAnual','.ticketPromedio',
         '.preListingAcm','.acmCaptacion','.captacionVenta','.listingPropio','.busquedas']
         .forEach(s => document.querySelector(s).value = '');

        if (docSnap.exists()) {
            const d = docSnap.data();
            if (d.nombreAgente) document.getElementById('miNombre').value = d.nombreAgente;
            if (d.oficina) document.getElementById('miOficina').value = d.oficina;
            
            if (d.gastoMensual) document.querySelector('.gastoMensual').value = d.gastoMensual;
            if (d.condicionAgente) document.querySelector('.condicionDeAgente').value = d.condicionAgente;
            if (d.objetivoAnual) document.querySelector('.objetivoAnual').value = d.objetivoAnual;
            if (d.ticketPromedio) document.querySelector('.ticketPromedio').value = d.ticketPromedio;
            
            if (d.efectividades) {
                document.querySelector('.preListingAcm').value = d.efectividades.preListAcm || "";
                document.querySelector('.acmCaptacion').value = d.efectividades.acmCapt || "";
                document.querySelector('.captacionVenta').value = d.efectividades.captVenta || "";
                document.querySelector('.listingPropio').value = d.efectividades.listingPropio || "";
                document.querySelector('.busquedas').value = d.efectividades.busquedas || "";
            }
            
            if (d.objetivoAnual) {
                setTimeout(() => {
                    if (btnGestion) btnGestion.click();
                }, 100);
            }
        }
    } catch (error) {
        console.error("Error cargando:", error);
    }
}

