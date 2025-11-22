// charts.js - VERSIÓN FINAL: FILTRO DE AÑO Y CORRECCIÓN DE MESES

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

let planAnual = null;
let trackingData = null;
let charts = {}; 

// CONFIG ESTACIONAL
const CONFIG_OFICINAS = {
    "RE/MAX BIG": true, "RE/MAX FORUM": true, "RE/MAX FLOR": true, "RE/MAX ACUERDO": true, "CROAR PROPIEDADES": false
};
const FACTORES_ESTACIONALES = [ 
    0.17/3, 0.17/3, 0.17/3, 
    0.23/3, 0.23/3, 0.23/3, 
    0.25/3, 0.25/3, 0.25/3, 
    0.35/3, 0.35/3, 0.35/3
];

// 1. INICIO
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Al iniciar, leemos el año por defecto y cargamos datos
        await cargarTodo(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

// Función para manejar el cambio de filtro (Año o Período)
function manejarCambioFiltro() {
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    if (uid) {
        // Siempre recargamos la data de Firebase al cambiar el filtro de año
        cargarTodo(uid); 
    }
}

// AÑADIR ESCUCHA AL CAMBIO DE FILTROS
document.getElementById("filtro-periodo").addEventListener("change", actualizarDashboard);
document.getElementById("filtro-anio").addEventListener("change", manejarCambioFiltro);


// --- FUNCIÓN DE FETCH DE DATOS (MODIFICADA para usar el filtro de año) ---
async function cargarTodo(uid) {
    try {
        // Lee el año seleccionado por el usuario desde el nuevo filtro
        const year = document.getElementById("filtro-anio").value; 
        
        // 1. Fetch Plan Individual y Tracking Individual
        const docPlan = await getDoc(doc(db, "planificaciones", `${uid}_${year}`));

        if (docPlan.exists()) planAnual = docPlan.data();

        // Consulta de Tracking usando el año seleccionado
        const docTrack = await getDoc(doc(db, "tracking", `${uid}_${year}`)); 
        if (docTrack.exists()) trackingData = docTrack.data();
        else trackingData = null; // Limpiar datos si no existe el tracking para ese año

        // Llama a la función de renderizado una vez que los datos para el año están cargados.
        // Aquí no se llama a manejarCambioFiltro para evitar bucles.
        actualizarDashboard();

    } catch (error) {
        console.error("Error cargando datos:", error);
    }
}

// --- FUNCIÓN DE RENDERIZADO PRINCIPAL (MODIFICADA para funcionar solo con los datos cargados) ---
function actualizarDashboard() {
    if (!planAnual) return;
    
    // El periodo debe ser recalculado basado en el filtro de periodo
    const periodo = document.getElementById("filtro-periodo").value;
    const datos = procesarDatos(periodo); // Calcula los KPI y métricas solo con la data de trackingData

    // A. KPIs
    renderKPI("facturacion", datos.O_Fact, datos.R_Fact, true);
    renderKPI("ventas", datos.O_Ventas, datos.R_Ventas);
    renderKPI("propias", datos.O_Prop, datos.R_Prop);
    renderKPI("busquedas", datos.O_Busq, datos.R_Busq);
    renderKPI("capt", datos.O_Capt, datos.R_Capt);
    renderKPI("acm", datos.O_Acm, datos.R_Acm);
    renderKPI("prelist", datos.O_Pre, datos.R_Pre);
    
    document.getElementById("kpi-reservas").innerText = Math.round(datos.R_Res);
    document.getElementById("kpi-prebuy").innerText = Math.round(datos.R_PreBuy);

    // B. GRÁFICOS DE AGUJA
    dibujarGauge("gauge-fact", datos.R_Fact, datos.O_Fact);
    dibujarGauge("gauge-ventas", datos.R_Ventas, datos.O_Ventas);
    dibujarGauge("gauge-capt", datos.R_Capt, datos.O_Capt);
    dibujarGauge("gauge-acm", datos.R_Acm, datos.O_Acm);
    dibujarGauge("gauge-pre", datos.R_Pre, datos.O_Pre);

    // C. GRÁFICOS DE LÍNEAS
    dibujarLineaTiempo();
    dibujarLineaCaptaciones();

    // D. OTROS
    dibujarEmbudo(datos);
    dibujarCaraCara(datos);
    dibujarMix(datos);
}


// --- FUNCIÓN DE CÁLCULO PRINCIPAL (Añadida corrección para meses individuales 'Mxx') ---
function procesarDatos(periodo) {
    let meses = [];
    const hoy = new Date();
    const mesActual = hoy.getMonth(); 

    if (periodo === "anual") meses = [0,1,2,3,4,5,6,7,8,9,10,11];
    else if (periodo === "acumulado") { for(let i=0; i<=mesActual; i++) meses.push(i); }
    else if (periodo.startsWith("S")) meses = periodo==="S1" ? [0,1,2,3,4,5] : [6,7,8,9,10,11];
    else if (periodo.startsWith("Q")) {
        if(periodo==="Q1") meses=[0,1,2]; if(periodo==="Q2") meses=[3,4,5];
        if(periodo==="Q3") meses=[6,7,8]; if(periodo==="Q4") meses=[9,10,11];
    }
    else if (periodo === "mes_actual") meses = [mesActual];
    // CORRECCIÓN: Manejar los meses individuales con el formato 'Mxx'
    else if (periodo.startsWith("M")) {
        const mesIndex = parseInt(periodo.substring(1));
        if (!isNaN(mesIndex) && mesIndex >= 0 && mesIndex <= 11) {
            meses.push(mesIndex);
        }
    }
    // FIN CORRECCIÓN MESES

    // Factor de Tiempo para objetivos lineales
    const factor_linear = meses.length / 12;

    // Sumar Reales
    let R_Fact=0, R_Capt=0, R_Acm=0, R_Pre=0, R_Cara=0, R_Res=0, R_PreBuy=0;
    
    // Usa la data ya cargada en la variable global trackingData
    if (trackingData) { 
        meses.forEach(m => {
            const dm = trackingData[`mes_${m}`];
            if (dm) {
                R_Fact += (dm.facturacion?.total || 0);
                R_Capt += (dm.captaciones?.total || 0);
                R_Acm += (dm.acm?.total || 0);
                R_Pre += (dm.prelisting?.total || 0);
                R_Cara += (dm.caracara?.total || 0);
                R_Res += (dm.reservas?.total || 0);
                R_PreBuy += (dm.prebuy?.total || 0);
            }
        });
    }

    // Objetivos Base
    const p = planAnual || {};
    const O_Fact_Anual = parseFloat(p.objetivoAnual) || 0;
    const ticket = parseFloat(p.ticketPromedio) || 0;
    const comision = ticket * 0.03;
    const efec = p.efectividades || {};
    
    // --- Objetivo Facturación (RESPETA ESTACIONALIDAD) ---
    let factorObj = 0;
    const oficina = p.oficina;
    const usaEstacionalidad = CONFIG_OFICINAS[oficina] === true;

    if (usaEstacionalidad) {
        meses.forEach(m => { factorObj += FACTORES_ESTACIONALES[m]; });
    } else {
        factorObj = factor_linear;
    }

    const O_Fact = O_Fact_Anual * factorObj;
    const R_Ventas = comision > 0 ? R_Fact / comision : 0;
    const O_Ventas = comision > 0 ? O_Fact / comision : 0;

    const pctPropio = (parseFloat(efec.listingPropio) || 0) / 100;
    const pctBusq = (parseFloat(efec.busquedas) || 0) / 100;
    const O_Prop = O_Ventas * pctPropio;
    const O_Busq = O_Ventas * pctBusq;
    const R_Prop = R_Ventas * pctPropio;
    const R_Busq = R_Ventas * pctBusq;

    const captVenta = (parseFloat(efec.captVenta) || 0) / 100;
    const acmCapt = (parseFloat(efec.acmCapt) || 0) / 100;
    const preListAcm = (parseFloat(efec.preListAcm) || 0) / 100;

    // Objetivos Operativos (SIEMPRE LINEALES)
    const O_Prop_Anual = comision > 0 ? (O_Fact_Anual/comision) * pctPropio : 0;
    
    let O_Capt = 0, O_Acm = 0, O_Pre = 0;
    if(captVenta>0) O_Capt = (O_Prop_Anual / captVenta) * factor_linear;
    if(acmCapt>0) O_Acm = ( (O_Prop_Anual/captVenta) / acmCapt ) * factor_linear;
    if(preListAcm>0) O_Pre = ( ((O_Prop_Anual/captVenta)/acmCapt) / preListAcm ) * factor_linear;

    const O_Cara = meses.length * 10;

    return { 
        O_Fact, R_Fact, O_Ventas, R_Ventas, R_Prop, R_Busq, O_Prop, O_Busq,
        O_Capt, R_Capt, O_Acm, R_Acm, O_Pre, R_Pre, O_Cara, R_Cara, R_Res, R_PreBuy
    };
}


// --- Resto de las funciones (renderKPI, dibujarGauge, etc.) sin cambios ---

function renderKPI(id, obj, real, esDinero = false) {
    const pct = obj > 0 ? (real / obj) * 100 : 0;
    const elReal = document.getElementById(`kpi-${id}-real`);
    const elObj = document.getElementById(`kpi-${id}-obj`);
    const elBadge = document.getElementById(`badge-${id}`);
    const elCard = document.getElementById(`card-${id}`); 

    if (!elReal) return;

    if (esDinero) {
        elReal.innerText = "$" + Math.round(real).toLocaleString();
        elObj.innerText = "$" + Math.round(obj).toLocaleString();
    } else {
        elReal.innerText = real.toFixed(1);
        elObj.innerText = Math.round(obj);
    }
    
    elBadge.innerText = pct.toFixed(0) + "%";

    // Semáforo KPI
    let colorClass = "bg-danger";
    let borderClass = "border-danger";
    
    if (pct >= 100) { colorClass = "bg-success"; borderClass = "border-success"; }
    else if (pct >= 50) { colorClass = "bg-warning text-dark"; borderClass = "border-warning"; }

    elBadge.className = `badge rounded-pill p-2 ${colorClass}`;
    elCard.className = `card kpi-card-modern card-h-100 border-bottom border-4 shadow-sm ${borderClass}`;
}

function dibujarGauge(id, real, objetivo) {
    let rawPct = objetivo > 0 ? (real / objetivo) * 100 : 0;
    let color = "#f46a6a";
    if (rawPct >= 100) color = "#34c38f";
    else if (rawPct >= 50) color = "#f1b44c";
    const chartPct = Math.min(rawPct, 100);

    const options = {
        series: [chartPct],
        chart: { type: 'radialBar', height: 160, sparkline: { enabled: true } },
        plotOptions: {
            radialBar: {
                startAngle: -90, endAngle: 90,
                hollow: { size: '60%' },
                track: { background: "#e7e7e7", strokeWidth: '97%' },
                dataLabels: {
                    name: { show: false },
                    value: { 
                        offsetY: -2, fontSize: '18px', fontWeight: 'bold',
                        formatter: function() { return rawPct.toFixed(0) + "%"; }
                    }
                }
            }
        },
        fill: { colors: [color] }, labels: ['Progreso']
    };

    if(charts[id]) charts[id].destroy();
    charts[id] = new ApexCharts(document.querySelector(`#${id}`), options);
    charts[id].render();
}

function dibujarLineaTiempo() {
    const seriesReal = [];
    const seriesObj = [];
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    
    const p = planAnual || {};
    const objAnual = parseFloat(p.objetivoAnual) || 0;
    const oficina = p.oficina;
    const usaEst = CONFIG_OFICINAS[oficina] === true;

    for(let i=0; i<12; i++) {
        let objMes = 0;
        if (usaEst) objMes = objAnual * FACTORES_ESTACIONALES[i];
        else objMes = objAnual / 12;
        seriesObj.push(Math.round(objMes));

        let realMes = 0;
        if (trackingData && trackingData[`mes_${i}`]) {
            realMes = trackingData[`mes_${i}`].facturacion?.total || 0;
        }
        seriesReal.push(Math.round(realMes));
    }

    const options = {
        series: [{ name: 'Objetivo', type: 'line', data: seriesObj }, { name: 'Real', type: 'column', data: seriesReal }],
        chart: { height: 350, type: 'line', toolbar: {show: false} },
        stroke: { width: [3, 0], curve: 'smooth' },
        plotOptions: { bar: { columnWidth: '40%', borderRadius: 4 } },
        xaxis: { categories: meses },
        colors: ['#556ee6', '#34c38f'],
        tooltip: { y: { formatter: (val) => "$" + val.toLocaleString() } },
        title: { text: 'Facturación vs Objetivo', align: 'left', style: { fontSize: '14px' } }
    };

    if(charts.lineaFact) charts.lineaFact.destroy();
    charts.lineaFact = new ApexCharts(document.querySelector("#chart-linea-tiempo"), options);
    charts.lineaFact.render();
}

function dibujarLineaCaptaciones() {
    const seriesReal = [];
    const seriesObj = [];
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    
    const p = planAnual || {};
    const objAnual = parseFloat(p.objetivoAnual) || 0;
    const ticket = parseFloat(p.ticketPromedio) || 0;
    const comision = ticket * 0.03;
    const efec = p.efectividades || {};
    
    const transacciones = comision > 0 ? objAnual / comision : 0;
    const pctPropio = (parseFloat(efec.listingPropio) || 0) / 100;
    const ventasPropias = transacciones * pctPropio;
    const captVenta = (parseFloat(efec.captVenta) || 0) / 100;
    const objCaptAnual = captVenta > 0 ? ventasPropias / captVenta : 0;
    
    const objMes = objCaptAnual / 12;

    for(let i=0; i<12; i++) {
        seriesObj.push(Math.ceil(objMes));
        let realMes = 0;
        if (trackingData && trackingData[`mes_${i}`]) {
            realMes = trackingData[`mes_${i}`].captaciones?.total || 0;
        }
        seriesReal.push(realMes);
    }

    const options = {
        series: [{ name: 'Objetivo', type: 'line', data: seriesObj }, { name: 'Real', type: 'column', data: seriesReal }],
        chart: { height: 350, type: 'line', toolbar: {show: false} },
        stroke: { width: [3, 0], curve: 'smooth' },
        plotOptions: { bar: { columnWidth: '40%', borderRadius: 4 } },
        xaxis: { categories: meses },
        colors: ['#f1b44c', '#34c38f'],
        title: { text: 'Captaciones vs Objetivo', align: 'left', style: { fontSize: '14px' } }
    };

    if(charts.lineaCapt) charts.lineaCapt.destroy();
    charts.lineaCapt = new ApexCharts(document.querySelector("#chart-linea-captaciones"), options);
    charts.lineaCapt.render();
}

function dibujarEmbudo(d) {
    const efecPreACM = d.R_Pre > 0 ? (d.R_Acm / d.R_Pre) * 100 : 0;
    const efecACMCapt = d.R_Acm > 0 ? (d.R_Capt / d.R_Acm) * 100 : 0;
    const efecCaptVenta = d.R_Capt > 0 ? (d.R_Prop / d.R_Capt) * 100 : 0;

    const options = {
        series: [{
            name: "Real",
            data: [Math.round(d.R_Pre), Math.round(d.R_Acm), Math.round(d.R_Capt), Math.round(d.R_Prop)]
        }],
        chart: { type: 'bar', height: 300, toolbar: {show: false} },
        plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 0 } },
        dataLabels: { enabled: true, formatter: (val) => Math.round(val) },
        xaxis: { 
            categories: [
                `Pre-List (${Math.round(efecPreACM)}% a ACM)`, 
                `ACM (${Math.round(efecACMCapt)}% a Capt)`, 
                `Capt (${Math.round(efecCaptVenta)}% a Venta)`, 
                'Ventas Propias'
            ] 
        },
        colors: ['#5156be']
    };

    if(charts.funnel) charts.funnel.destroy();
    charts.funnel = new ApexCharts(document.querySelector("#chart-funnel"), options);
    charts.funnel.render();
}

function dibujarCaraCara(d) {
    let pct = d.O_Cara > 0 ? (d.R_Cara / d.O_Cara) * 100 : 0;
    const color = pct >= 100 ? "#34c38f" : (pct >= 50 ? "#f1b44c" : "#f46a6a");

    const options = {
        series: [Math.min(pct, 100)],
        chart: { type: 'radialBar', height: 300 },
        plotOptions: {
            radialBar: {
                hollow: { size: '70%' },
                dataLabels: {
                    name: { show: true, fontSize: '16px', color: '#888', offsetY: -10 },
                    value: { show: true, fontSize: '24px', offsetY: 5, formatter: () => d.R_Cara + " / " + d.O_Cara }
                }
            }
        },
        labels: ['Reuniones'],
        colors: [color]
    };
    document.getElementById("meta-caracara-text").innerText = d.O_Cara;
    if(charts.caracara) charts.caracara.destroy();
    charts.caracara = new ApexCharts(document.querySelector("#chart-caracara"), options);
    charts.caracara.render();
}

function dibujarMix(d) {
    const options = {
        series: [parseFloat(d.R_Prop.toFixed(1)), parseFloat(d.R_Busq.toFixed(1))],
        chart: { type: 'donut', height: 280 },
        labels: ['Propio', 'Búsquedas'],
        colors: ['#556ee6', '#34c38f'],
        legend: { position: 'bottom' }
    };
    if(charts.mix) charts.mix.destroy();
    charts.mix = new ApexCharts(document.querySelector("#chart-mix"), options);
    charts.mix.render();
}