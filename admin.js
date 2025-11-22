import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "contacto@imala.com.ar"; 
const LISTA_BROKERS = {
    "broker.ejemplo@email.com": "RE/MAX BIG"
};

// --- PEGA AQUÍ EL CÓDIGO BASE64 DE TU IMAGEN (OPCIONAL PARA PDF) ---
const backgroundImageBase64 = "";

let currentUserRole = null; 
let currentBrokerOffice = null; 
let todosLosDatos = [];
let trackingGlobal = {}; 
let datosProcesadosGlobal = []; 

// === CONTROL DE ESTACIONALIDAD POR OFICINA ===
// TRUE: Aplica FACTORES de estacionalidad en la Facturación.
// FALSE: Facturación lineal (anual/12).
const CONFIG_OFICINAS = {
    "RE/MAX BIG": true,
    "RE/MAX FORUM": true,
    "RE/MAX FLOR": true,
    "RE/MAX ACUERDO": true,
    "CROAR PROPIEDADES": false
};

// 17% Q1, 23% Q2, 25% Q3, 35% Q4 (dividido en 3 meses cada trimestre)
const FACTORES = [
    0.17 / 3, 0.17 / 3, 0.17 / 3,   // Ene, Feb, Mar
    0.23 / 3, 0.23 / 3, 0.23 / 3,   // Abr, May, Jun
    0.25 / 3, 0.25 / 3, 0.25 / 3,   // Jul, Ago, Sep
    0.35 / 3, 0.35 / 3, 0.35 / 3    // Oct, Nov, Dic
];

// -------------------------------------------------------------------
// AUTENTICACIÓN
// -------------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.email === ADMIN_EMAIL) { 
            currentUserRole = "admin"; 
            cargarDatosCompletos(); 
        } else if (LISTA_BROKERS[user.email]) {
            currentUserRole = "broker";
            currentBrokerOffice = LISTA_BROKERS[user.email];
            const sel = document.getElementById("filtro-oficina");
            if (sel) {
                sel.value = currentBrokerOffice;
                sel.disabled = true;
            }
            cargarDatosCompletos();
        } else {
            window.location.href = "index.html";
        }
    } else {
        window.location.href = "login.html";
    }
});

// -------------------------------------------------------------------
// CARGA DE DATOS (PLANIFICACIONES + TRACKING)
// -------------------------------------------------------------------
async function cargarDatosCompletos() {
    try {
        // PLANIFICACIONES
        const snapPlan = await getDocs(collection(db, "planificaciones"));
        todosLosDatos = [];

        snapPlan.forEach(dSnap => {
            const d = dSnap.data();
            if (!d.nombreAgente) return;

            // Respetar el nuevo modelo: uid + anio dentro del doc
            let uid = d.uid;
            let anio = d.anio;

            if (!uid || !anio) {
                const partes = dSnap.id.split("_");
                uid = uid || partes[0];
                anio = anio || Number(partes[1]) || null;
            }

            const planId = dSnap.id;

            todosLosDatos.push({
                ...d,
                uid,      // UID real del usuario
                anio,     // año de la planificación
                planId    // id del doc en planificaciones (uid_año)
            });
        });

        // TRACKING
        const snapTrack = await getDocs(collection(db, "tracking"));
        trackingGlobal = {};

        snapTrack.forEach(dSnap => {
            const partes = dSnap.id.split('_'); // uid_anio
            if (partes.length === 2) {
                const uid = partes[0];
                const anio = partes[1];
                if (!trackingGlobal[uid]) trackingGlobal[uid] = {};
                trackingGlobal[uid][anio] = dSnap.data();
            }
        });

        aplicarFiltrosYRenderizar();
    } catch (error) {
        console.error("Error cargando datos:", error);
    }
}

// -------------------------------------------------------------------
// LISTENERS
// -------------------------------------------------------------------
const el = (id) => document.getElementById(id);

if (el("filtro-anio"))    el("filtro-anio").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-oficina")) el("filtro-oficina").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-periodo")) el("filtro-periodo").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-orden"))   el("filtro-orden").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("btn-actualizar")) el("btn-actualizar").addEventListener("click", aplicarFiltrosYRenderizar);
if (el("btn-guardar-cambios")) el("btn-guardar-cambios").addEventListener("click", guardarCambiosAgente);

// Exportación
if (el("btn-excel")) {
    el("btn-excel").addEventListener("click", (e) => {
        e.preventDefault();
        exportarExcel();
    });
}
if (el("btn-pdf")) {
    el("btn-pdf").addEventListener("click", (e) => {
        e.preventDefault();
        exportarPDF();
    });
}

// -------------------------------------------------------------------
// MODAL EDITAR
// -------------------------------------------------------------------
window.abrirModalEditar = function(planId) {
    const agente = todosLosDatos.find(a => a.planId === planId);
    if (!agente) return;

    // Usamos edit-uid como contenedor del planId (uid_año)
    el("edit-uid").value = planId;

    el("modal-nombre-agente").innerText = agente.nombreAgente;
    el("edit-oficina").value = agente.oficina;
    el("edit-objetivo").value = agente.objetivoAnual || 0;

    const ef = agente.efectividades || {};
    el("edit-efec-pre").value    = ef.preListAcm     || 0;
    el("edit-efec-acm").value    = ef.acmCapt        || 0;
    el("edit-efec-capt").value   = ef.captVenta      || 0;
    el("edit-efec-propio").value = ef.listingPropio  || 0;
    el("edit-efec-busq").value   = ef.busquedas      || 0;

    new bootstrap.Modal(el('modalEditar')).show();
};

async function guardarCambiosAgente() {
    // acá edit-uid guarda el planId (uid_año)
    const planId = el("edit-uid").value;
    const oficina = el("edit-oficina").value;
    const objetivo = el("edit-objetivo").value;

    const efectividades = {
        preListAcm:  el("edit-efec-pre").value,
        acmCapt:     el("edit-efec-acm").value,
        captVenta:   el("edit-efec-capt").value,
        listingPropio: el("edit-efec-propio").value,
        busquedas:   el("edit-efec-busq").value
    };

    try {
        await updateDoc(doc(db, "planificaciones", planId), {
            oficina,
            objetivoAnual: objetivo,
            efectividades
        });

        alert("Datos actualizados.");
        bootstrap.Modal.getInstance(el('modalEditar')).hide();
        cargarDatosCompletos();
    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar.");
    }
}

// -------------------------------------------------------------------
// LÓGICA CENTRAL
// -------------------------------------------------------------------
function aplicarFiltrosYRenderizar() {
    const anio = el("filtro-anio").value;
    let oficina = el("filtro-oficina").value;
    const periodo = el("filtro-periodo").value;
    const orden = el("filtro-orden").value;

    if (currentUserRole === "broker") {
        oficina = currentBrokerOffice;
    }

    // Filtramos primero por año
    let lista = todosLosDatos.filter(ag => String(ag.anio || "") === anio);

    // Luego por oficina (si no es "Todas")
    if (oficina !== "Todas") {
        lista = lista.filter(ag => ag.oficina === oficina);
    }

    datosProcesadosGlobal = procesarAgentes(lista, periodo, anio);
    
    datosProcesadosGlobal.sort((a,b) => {
        if (orden === "pct_fact_desc")  return b.pctFact  - a.pctFact;
        if (orden === "pct_capt_desc")  return b.pctCapt  - a.pctCapt;
        if (orden === "pct_trans_desc") return b.pctVentas- a.pctVentas;
        if (orden === "pct_acm_desc")   return b.pctAcm   - a.pctAcm;
        if (orden === "pct_pre_desc")   return b.pctPre   - a.pctPre;
        if (orden === "real_fact_desc") return b.R_Fact   - a.R_Fact;
        if (orden === "obj_fact_desc")  return b.O_Fact   - a.O_Fact;
        return 0;
    });

    renderizarKPIs(datosProcesadosGlobal);
    renderizarTabla(datosProcesadosGlobal);
    calcularTotalesOficina(lista, anio);
    renderizarRankings(datosProcesadosGlobal);
    renderizarSemaforo(datosProcesadosGlobal);
}

function procesarAgentes(lista, periodo, anio) {
    let meses = [];
    const mesActual = new Date().getMonth(); 

    if (periodo === "anual") {
        meses = [0,1,2,3,4,5,6,7,8,9,10,11];
    } else if (periodo === "acumulado") {
        for (let i=0; i<=mesActual; i++) meses.push(i);
    } else if (periodo.startsWith("S")) {
        meses = periodo === "S1" ? [0,1,2,3,4,5] : [6,7,8,9,10,11];
    } else if (periodo.startsWith("Q")) {
        if (periodo === "Q1") meses = [0,1,2];
        if (periodo === "Q2") meses = [3,4,5];
        if (periodo === "Q3") meses = [6,7,8];
        if (periodo === "Q4") meses = [9,10,11];
    } else if (periodo.startsWith("M")) {
        meses = [parseInt(periodo.replace("M","")) - 1];
    } else if (periodo === "mes_actual") {
        meses = [mesActual];
    }

    const factorObj_linear = meses.length / 12;

    return lista.map(ag => {
        const O_Fact_An = parseFloat(ag.objetivoAnual) || 0;
        const ticket     = parseFloat(ag.ticketPromedio) || 0;
        const com        = ticket * 0.03;

        const efec = ag.efectividades || {};
        const pctProp   = (parseFloat(efec.listingPropio) || 0) / 100;
        const pctBusq   = (parseFloat(efec.busquedas)     || 0) / 100;
        const captVenta = (parseFloat(efec.captVenta)     || 0) / 100;
        const acmCapt   = (parseFloat(efec.acmCapt)       || 0) / 100;
        const preAcm    = (parseFloat(efec.preListAcm)    || 0) / 100;

        const O_Ventas_An = com > 0 ? O_Fact_An / com : 0;
        const O_Prop_An   = O_Ventas_An * pctProp;
        let O_Capt_An = 0, O_Acm_An = 0, O_Pre_An = 0;

        if (captVenta > 0) O_Capt_An = O_Prop_An / captVenta;
        if (acmCapt   > 0) O_Acm_An  = O_Capt_An / acmCapt;
        if (preAcm    > 0) O_Pre_An  = O_Acm_An / preAcm;
        
        // FACTURACIÓN: respeta estacionalidad si corresponde
        const usaEst = CONFIG_OFICINAS[ag.oficina] === true;
        let O_Fact_periodo = 0;
        
        if (usaEst) {
            meses.forEach(m => {
                O_Fact_periodo += O_Fact_An * FACTORES[m];
            });
        } else {
            O_Fact_periodo = O_Fact_An * factorObj_linear;
        }
        const O_Fact = O_Fact_periodo;
        
        // RESTO DE OBJETIVOS: SIEMPRE LINEAL
        const O_Ventas = O_Ventas_An * factorObj_linear;
        const O_Prop   = O_Prop_An   * factorObj_linear;
        const O_Busq   = O_Ventas    * pctBusq * factorObj_linear;
        const O_Capt   = O_Capt_An   * factorObj_linear;
        const O_Acm    = O_Acm_An    * factorObj_linear;
        const O_Pre    = O_Pre_An    * factorObj_linear;

        // REALES DESDE TRACKING
        let R_Fact=0, R_Capt=0, R_Acm=0, R_Pre=0, R_Cara=0, R_Res=0, R_PreBuy=0;
        const tr = trackingGlobal[ag.uid] ? trackingGlobal[ag.uid][anio] : null;

        if (tr) {
            meses.forEach(m => {
                const d = tr[`mes_${m}`];
                if (d) {
                    R_Fact   += (d.facturacion?.total || 0);
                    R_Capt   += (d.captaciones?.total || 0);
                    R_Acm    += (d.acm?.total || 0);
                    R_Pre    += (d.prelisting?.total || 0);
                    R_Cara   += (d.caracara?.total || 0);
                    R_Res    += (d.reservas?.total || 0);
                    R_PreBuy += (d.prebuy?.total || 0);
                }
            });
        }

        const R_Ventas = com > 0 ? R_Fact / com : 0;
        const R_Prop   = R_Ventas * pctProp;
        const R_Busq   = R_Ventas * pctBusq;

        const pct = (r, o) => o > 0 ? (r / o) * 100 : 0;

        return {
            ...ag,
            O_Fact,  R_Fact,  pctFact:  pct(R_Fact,  O_Fact),
            O_Ventas,R_Ventas,pctVentas:pct(R_Ventas,O_Ventas),
            O_Prop,  R_Prop,  pctProp:  pct(R_Prop,  O_Prop),
            O_Busq,  R_Busq,  pctBusq:  pct(R_Busq,  O_Busq),
            O_Capt,  R_Capt,  pctCapt:  pct(R_Capt,  O_Capt),
            O_Acm,   R_Acm,   pctAcm:   pct(R_Acm,   O_Acm),
            O_Pre,   R_Pre,   pctPre:   pct(R_Pre,   O_Pre),
            R_Cara,  R_Res,   R_PreBuy
        };
    });
}

// -------------------------------------------------------------------
// RENDER KPIs
// -------------------------------------------------------------------
function renderizarKPIs(lista) {
    let tObjFact=0, tRealFact=0, tObjTrans=0, tRealTrans=0;
    let tObjCapt=0, tRealCapt=0, tObjAcm=0, tRealAcm=0, tObjPre=0, tRealPre=0;
    let tCara=0, tPreBuy=0, tRes=0;

    lista.forEach(ag => {
        tObjFact  += ag.O_Fact;  tRealFact  += ag.R_Fact;
        tObjTrans += ag.O_Ventas;tRealTrans += ag.R_Ventas;
        tObjCapt  += ag.O_Capt;  tRealCapt  += ag.R_Capt;
        tObjAcm   += ag.O_Acm;   tRealAcm   += ag.R_Acm;
        tObjPre   += ag.O_Pre;   tRealPre   += ag.R_Pre;
        tCara     += ag.R_Cara;  tPreBuy    += ag.R_PreBuy; tRes += ag.R_Res;
    });

    const calcKPI = (obj, real, esMoneda) => {
        const pct = obj>0 ? (real/obj)*100 : 0;
        let cl = "text-danger";
        if (pct>=50 && pct<100) cl = "text-warning";
        if (pct>=100) cl = "text-success";
        return { 
            obj:  esMoneda ? "$"+Math.round(obj).toLocaleString() : Math.round(obj),
            real: esMoneda ? "$"+Math.round(real).toLocaleString() : Math.round(real),
            pct:  Math.round(pct)+"%", color: cl 
        };
    };

    const kpiFact = calcKPI(tObjFact, tRealFact, true);
    const kpiTrans = calcKPI(tObjTrans, tRealTrans, false);
    const kpiCapt = calcKPI(tObjCapt, tRealCapt, false);
    const kpiAcm  = calcKPI(tObjAcm,  tRealAcm,  false);
    const kpiPre  = calcKPI(tObjPre,  tRealPre,  false);

    const card = (tit, d, ic) => `
        <div class="card border-0 shadow-sm h-100"><div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="text-muted mb-0 text-uppercase font-size-12">${tit}</h6>
                <i class="${ic} text-muted font-size-16"></i>
            </div>
            <div class="d-flex align-items-end justify-content-between">
                <div>
                    <h4 class="mb-1 mt-1 fw-bold text-dark">${d.real}</h4>
                    <div class="font-size-12 text-muted">Obj: ${d.obj}</div>
                </div>
                <div class="${d.color} fw-bold font-size-14 bg-light rounded px-2 py-1">${d.pct}</div>
            </div>
            <div class="progress mt-2" style="height: 4px;">
                <div class="progress-bar ${d.color.replace('text-','bg-')}" style="width: ${d.pct.replace('%','')}%"></div>
            </div>
        </div></div>`;

    const sCard = (tit, val, bg) => `
        <div class="card border-0 shadow-sm h-100">
            <div class="card-body p-3 d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="text-muted text-uppercase font-size-12 mb-1">${tit}</h6>
                    <h4 class="mb-0 fw-bold text-dark">${val}</h4>
                </div>
                <div class="avatar-sm">
                    <span class="avatar-title ${bg} rounded-circle font-size-16">
                        <i class="mdi mdi-chart-bar"></i>
                    </span>
                </div>
            </div>
        </div>`;

    const c = el("kpi-container");
    if (c) {
        c.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-lg-2 col-md-4">${card("Facturación",   kpiFact,  "mdi mdi-currency-usd")}</div>
                <div class="col-lg-2 col-md-4">${card("Transacciones", kpiTrans, "mdi mdi-handshake")}</div>
                <div class="col-lg-2 col-md-4">${card("Captaciones",   kpiCapt,  "mdi mdi-home-plus")}</div>
                <div class="col-lg-2 col-md-4">${card("ACMs",          kpiAcm,   "mdi mdi-file-document-edit")}</div>
                <div class="col-lg-2 col-md-4">${card("Pre-Listings",  kpiPre,   "mdi mdi-clipboard-list")}</div>
            </div>
            <div class="row g-3 mb-4">
                 <div class="col-lg-4 col-md-4">${sCard("Cara a Cara", tCara,   "bg-soft-primary text-primary")}</div>
                 <div class="col-lg-4 col-md-4">${sCard("Pre-Buy",    tPreBuy, "bg-soft-info text-info")}</div>
                 <div class="col-lg-4 col-md-4">${sCard("Reservas",   tRes,    "bg-soft-warning text-warning")}</div>
            </div>`;
    }
}

// -------------------------------------------------------------------
// GRAFICOS POR OFICINA
// -------------------------------------------------------------------
function calcularTotalesOficina(lista, anio) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    let sObjFact=Array(12).fill(0), sRealFact=Array(12).fill(0);
    let sObjCapt=Array(12).fill(0), sRealCapt=Array(12).fill(0);

    lista.forEach(ag => {
        const O_Fact_An = parseFloat(ag.objetivoAnual) || 0;
        const ticket    = parseFloat(ag.ticketPromedio) || 0;
        const com       = ticket * 0.03;

        const efec      = ag.efectividades || {};
        const pctProp   = (parseFloat(efec.listingPropio) || 0) / 100;
        const captVenta = (parseFloat(efec.captVenta)     || 0) / 100;

        const O_Ventas_An = com > 0 ? O_Fact_An / com : 0;
        const O_Prop_An   = O_Ventas_An * pctProp;
        const O_Capt_An   = captVenta > 0 ? O_Prop_An / captVenta : 0;
        
        const usaEst = CONFIG_OFICINAS[ag.oficina] === true;
        const tr = trackingGlobal[ag.uid] ? trackingGlobal[ag.uid][anio] : null;

        for (let i=0; i<12; i++) {
            // FACTURACIÓN: estacionalidad o lineal
            sObjFact[i] += usaEst ? O_Fact_An * FACTORES[i] : O_Fact_An / 12;
            // CAPTACIONES: siempre lineal
            sObjCapt[i] += O_Capt_An / 12;
            
            if (tr && tr[`mes_${i}`]) {
                sRealFact[i] += (tr[`mes_${i}`].facturacion?.total || 0);
                sRealCapt[i] += (tr[`mes_${i}`].captaciones?.total || 0);
            }
        }
    });

    dibujarGraficoMixto("chart-office-fact", "Facturación", sObjFact, sRealFact, meses, "$");
    dibujarGraficoMixto("chart-office-capt", "Captaciones", sObjCapt, sRealCapt, meses, "");
}

function dibujarGraficoMixto(id, nombre, obj, real, cats, prefijo) {
    const options = {
        series: [
            { name: 'Real',     type: 'column', data: real.map(n => Math.round(n)) },
            { name: 'Objetivo', type: 'line',   data: obj.map(n => Math.round(n)) }
        ],
        chart: { height: 350, type: 'line', toolbar: { show: false }, zoom: { enabled: false } },
        stroke: { width: [0, 4], curve: 'smooth' },
        plotOptions: { bar: { columnWidth: '50%', borderRadius: 4 } },
        dataLabels: { enabled: true, enabledOnSeries: [1], style: { fontSize: '10px', colors: ['#556ee6'] } },
        labels: cats,
        colors: ['#34c38f', '#556ee6'],
        yaxis: { labels: { formatter: y => prefijo + (y ? y.toLocaleString() : 0) } },
        tooltip: { shared: true, intersect: false, y: { formatter: y => prefijo + " " + (y ? y.toLocaleString() : 0) } },
        legend: { position: 'bottom' }
    };
    
    if (!window.charts) window.charts = {};
    if (window.charts[id]) { window.charts[id].destroy(); }
    if (document.querySelector(`#${id}`)) {
        window.charts[id] = new ApexCharts(document.querySelector(`#${id}`), options);
        window.charts[id].render();
    }
}

// -------------------------------------------------------------------
// TABLA PRINCIPAL
// -------------------------------------------------------------------
function renderizarTabla(lista) {
    const tbody = el("tabla-agentes-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    const fmtM = n => "$" + Math.round(n).toLocaleString();
    const fmtN = n => n.toFixed(1);
    const fmtP = n => n.toFixed(0) + "%";
    const fmtI = n => Math.round(n);
    const color = p => p>=100 ? "text-success" : (p>=50 ? "text-warning" : "text-danger");

    lista.forEach(ag => {
        tbody.innerHTML += `
            <tr class="text-center data-cell">
                <td class="sticky-col text-start">
                    <h6 class="mb-0 text-primary">${ag.nombreAgente}</h6>
                    <small class="text-muted">${ag.oficina}</small>
                </td>
                <td class="bg-soft-success fw-bold text-dark">
                    ${fmtM(ag.O_Fact)} | ${fmtM(ag.R_Fact)} | 
                    <span class="${color(ag.pctFact)}">${fmtP(ag.pctFact)}</span>
                </td>
                <td>
                    ${fmtN(ag.O_Ventas)} | <strong>${fmtN(ag.R_Ventas)}</strong> |
                    <span class="${color(ag.pctVentas)}">${fmtP(ag.pctVentas)}</span>
                </td>
                <td>${fmtN(ag.O_Prop)} | ${fmtN(ag.R_Prop)} | <small>${fmtP(ag.pctProp)}</small></td>
                <td>${fmtN(ag.O_Busq)} | ${fmtN(ag.R_Busq)} | <small>${fmtP(ag.pctBusq)}</small></td>

                <td>${fmtN(ag.O_Capt)}</td>
                <td><strong>${fmtI(ag.R_Capt)}</strong></td>
                <td><span class="badge badge-soft-info">${fmtP(ag.pctCapt)}</span></td>

                <td>${fmtN(ag.O_Acm)}</td>
                <td><strong>${fmtI(ag.R_Acm)}</strong></td>
                <td><span class="badge badge-soft-info">${fmtP(ag.pctAcm)}</span></td>

                <td>${fmtN(ag.O_Pre)}</td>
                <td><strong>${fmtI(ag.R_Pre)}</strong></td>
                <td><span class="badge badge-soft-info">${fmtP(ag.pctPre)}</span></td>

                <td class="bg-light fw-bold">${fmtI(ag.R_Cara)}</td>
                <td class="bg-light fw-bold">${fmtI(ag.R_PreBuy)}</td>
                <td class="bg-light fw-bold">${fmtI(ag.R_Res)}</td>

                <td class="sticky-col-right">
                    <button class="btn btn-sm btn-primary" onclick="abrirModalEditar('${ag.planId}')">
                        <i class="mdi mdi-pencil"></i>
                    </button>
                </td>
            </tr>`;
    });
}

// -------------------------------------------------------------------
// RANKINGS
// -------------------------------------------------------------------
function renderizarRankings(lista) {
    const topFact = [...lista].sort((a,b) => b.R_Fact - a.R_Fact).slice(0, 5);
    if (el("rank-fact-body")) {
        el("rank-fact-body").innerHTML = topFact.map((ag, i) => `
            <tr>
                <td class="text-center h5">
                    ${i<3?['🥇','🥈','🥉'][i]:'<span class="badge bg-light text-dark">#'+(i+1)+'</span>'}
                </td>
                <td>
                    <h6 class="mb-0">${ag.nombreAgente}</h6>
                    <small class="text-muted">${ag.oficina}</small>
                </td>
                <td class="text-end fw-bold text-success">
                    $${Math.round(ag.R_Fact).toLocaleString()}
                </td>
            </tr>`).join('');
    }

    const topCapt = [...lista].sort((a,b) => b.R_Capt - a.R_Capt).slice(0, 5);
    if (el("rank-capt-body")) {
        el("rank-capt-body").innerHTML = topCapt.map((ag, i) => `
            <tr>
                <td class="text-center h5">
                    ${i<3?['🥇','🥈','🥉'][i]:'<span class="badge bg-light text-dark">#'+(i+1)+'</span>'}
                </td>
                <td>
                    <h6 class="mb-0">${ag.nombreAgente}</h6>
                    <small class="text-muted">${ag.oficina}</small>
                </td>
                <td class="text-end fw-bold text-primary">
                    ${Math.round(ag.R_Capt)}
                </td>
            </tr>`).join('');
    }
}

// -------------------------------------------------------------------
// SEMÁFORO
// -------------------------------------------------------------------
function renderizarSemaforo(lista) {
    const container = el("semaforo-body");
    if (!container) return;
    
    container.innerHTML = lista.map(ag => {
        const f = ag.pctFact; 
        const c = ag.pctCapt;

        const isRed   = (p) => p < 50;
        const isGreen = (p) => p >= 100;

        let label = "", badgeClass = "";
        if (isRed(f) && isRed(c)) {
            label = "Negocio en Rojo";          badgeClass = "bg-danger";
        } else if (isRed(f) || isRed(c)) {
            label = "Negocio en Desequilibrio"; badgeClass = "bg-orange";
        } else if (isGreen(f) && isGreen(c)) {
            label = "Negocio Sustentable";      badgeClass = "bg-success";
        } else {
            label = "Negocio en Equilibrio";    badgeClass = "bg-warning text-dark";
        }

        return `
        <tr>
            <td>
                <h6 class="mb-0">${ag.nombreAgente}</h6>
                <small class="text-muted">${ag.oficina}</small>
            </td>
            <td class="text-center">${f.toFixed(0)}%</td>
            <td class="text-center">${c.toFixed(0)}%</td>
            <td class="text-center">
                <span class="badge ${badgeClass} font-size-12 p-2">${label}</span>
            </td>
        </tr>`;
    }).join('');
}

// -------------------------------------------------------------------
// EXPORTACIÓN EXCEL
// -------------------------------------------------------------------
function exportarExcel() {
    try {
        if (!window.XLSX) { alert("Librería Excel no cargada. Verificá tu conexión."); return; }
        if (!datosProcesadosGlobal || datosProcesadosGlobal.length === 0) { alert("No hay datos para exportar."); return; }

        const wb = XLSX.utils.book_new();
        
        const oficina = el("filtro-oficina").value;
        const anio = el("filtro-anio").value;
        const periodo = el("filtro-periodo").options[el("filtro-periodo").selectedIndex].text;
        const fechaGen = new Date().toLocaleDateString();

        const encabezado = [
            ["REPORTE DE GESTIÓN"],
            ["Oficina:", oficina],
            ["Periodo:", periodo + " " + anio],
            ["Fecha:", fechaGen],
            [""]
        ];

        const headersTabla = [
            "Agente","Oficina",
            "Obj Fact","Real Fact","% Fact",
            "Obj Trans","Real Trans","% Trans",
            "Obj Capt","Real Capt","% Capt",
            "Obj ACM","Real ACM","% ACM",
            "Obj Pre","Real Pre","% Pre",
            "Cara a Cara","Pre-Buy","Reservas",
            "Estado Salud"
        ];

        const dataTabla = datosProcesadosGlobal.map(ag => {
            let salud = "Equilibrio";
            if (ag.pctFact >= 100 && ag.pctCapt >= 100)      salud = "Sustentable";
            else if (ag.pctFact < 50 && ag.pctCapt < 50)     salud = "Rojo";
            else if (ag.pctFact < 50 || ag.pctCapt < 50)     salud = "Desequilibrio";
            
            return [
                ag.nombreAgente, ag.oficina,
                ag.O_Fact, ag.R_Fact, (ag.pctFact/100),
                ag.O_Ventas, ag.R_Ventas, (ag.pctVentas/100),
                ag.O_Capt, ag.R_Capt, (ag.pctCapt/100),
                ag.O_Acm, ag.R_Acm, (ag.pctAcm/100),
                ag.O_Pre, ag.R_Pre, (ag.pctPre/100),
                ag.R_Cara, ag.R_PreBuy, ag.R_Res,
                salud
            ];
        });

        const wsData = [...encabezado, headersTabla, ...dataTabla];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            {wch: 25}, {wch: 15},
            {wch: 12}, {wch: 12}, {wch: 10},
            {wch: 10}, {wch: 10}, {wch: 10},
            {wch: 10}, {wch: 10}, {wch: 10}
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Reporte");
        XLSX.writeFile(wb, `Reporte_${oficina}_${anio}.xlsx`);

    } catch (error) {
        console.error("Excel Error:", error);
        alert("Error al exportar Excel.");
    }
}

// -------------------------------------------------------------------
// EXPORTACIÓN PDF (con margen superior 60mm)
// -------------------------------------------------------------------
function exportarPDF() {
    try {
        if (!window.jspdf) { alert("Librería PDF no cargada."); return; }
        if (!datosProcesadosGlobal || datosProcesadosGlobal.length === 0) { alert("No hay datos."); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageHeight = doc.internal.pageSize.getHeight();

        // Fondo opcional
        if (backgroundImageBase64) {
            try { doc.addImage(backgroundImageBase64, 'PNG', 0, 0, 297, 210); } catch(e) {}
        }

        const oficina = el("filtro-oficina").value;
        const periodo = el("filtro-periodo").options[el("filtro-periodo").selectedIndex].text;
        const anio = el("filtro-anio").value;
        const fecha = new Date().toLocaleDateString();

        let y = 60; // margen superior para membrete

        // Título
        doc.setFontSize(16); doc.setTextColor(0, 51, 102);
        doc.text("Reporte de Gestión Comercial", 14, y);
        y += 8;
        doc.setFontSize(10); doc.setTextColor(80);
        doc.text(`Oficina: ${oficina} | ${periodo} ${anio} | ${fecha}`, 14, y);
        y += 10;

        // Resumen ejecutivo
        let tFact = 0, tCapt = 0, tTrans = 0;
        datosProcesadosGlobal.forEach(d => { 
            tFact += d.R_Fact; 
            tCapt += d.R_Capt; 
            tTrans += d.R_Ventas; 
        });
        doc.autoTable({
            head: [['Facturación Total', 'Captaciones Totales', 'Transacciones']],
            body: [[`$${Math.round(tFact).toLocaleString()}`, Math.round(tCapt).toString(), tTrans.toFixed(1)]],
            startY: y,
            theme: 'plain',
            styles: { halign: 'center', fontSize: 11, fontStyle: 'bold' }
        });
        y = doc.lastAutoTable.finalY + 10;

        // Tabla detallada
        const head = [[
            { content: 'Agente', rowSpan: 2 },
            { content: 'Facturación ($)', colSpan: 3 },
            { content: 'Captaciones', colSpan: 3 },
            { content: 'Otros', colSpan: 3 }
        ], [ 'Obj', 'Real', '%', 'Obj', 'Real', '%', 'Trans', 'ACM', 'Pre' ]];

        const rows = datosProcesadosGlobal.map(ag => [
            ag.nombreAgente,
            "$" + Math.round(ag.O_Fact).toLocaleString(),
            "$" + Math.round(ag.R_Fact).toLocaleString(),
            ag.pctFact.toFixed(0)+"%",
            Math.round(ag.O_Capt),
            Math.round(ag.R_Capt),
            ag.pctCapt.toFixed(0)+"%",
            ag.R_Ventas.toFixed(1),
            Math.round(ag.R_Acm),
            Math.round(ag.R_Pre)
        ]);

        doc.autoTable({
            head,
            body: rows,
            startY: y,
            theme: 'grid',
            styles: { fontSize: 8, halign: 'center' },
            columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 35 } },
            headStyles: { fillColor: [41, 58, 74], textColor: 255 },
            margin: { top: 60 }
        });
        
        let finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > pageHeight - 50) {
            doc.addPage();
            finalY = 60;
            if (backgroundImageBase64) { doc.addImage(backgroundImageBase64, 'PNG', 0, 0, 297, 210); }
        }
        
        doc.setFontSize(12); doc.setTextColor(0);
        doc.text("Top Performers (Facturación & Captación)", 14, finalY);
        
        const topFact = [...datosProcesadosGlobal].sort((a,b) => b.R_Fact - a.R_Fact).slice(0, 3);
        const topCapt = [...datosProcesadosGlobal].sort((a,b) => b.R_Capt - a.R_Capt).slice(0, 3);
        const rankBody = topFact.map((ag, i) => [
            `${i+1}. ${ag.nombreAgente}`, `$${Math.round(ag.R_Fact).toLocaleString()}`,
            topCapt[i] ? `${i+1}. ${topCapt[i].nombreAgente}` : "-",
            topCapt[i] ? Math.round(topCapt[i].R_Capt) : "-"
        ]);

        doc.autoTable({
            head: [['Ranking Facturación', 'Total', 'Ranking Captaciones', 'Total']],
            body: rankBody,
            startY: finalY + 5,
            theme: 'striped',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [255, 193, 7], textColor: [0,0,0] },
            margin: { top: 60 }
        });

        doc.save(`Reporte_${oficina}_${anio}.pdf`);
    } catch (error) {
        console.error("PDF Error:", error);
        alert("Error al generar PDF.");
    }
}
