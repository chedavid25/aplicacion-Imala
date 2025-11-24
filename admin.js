// admin.js - Versión actualizada: Diseño Expandido + Default Oficina Modelo

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore, collection, getDocs, doc, updateDoc, getDoc, setDoc, query, where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";
import { ConfigService } from "./config-service.js";

const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "contacto@imala.com.ar";
const OFICINA_DEFAULT_DEMO = "A. Oficina Modelo"; // <--- NOMBRE EXACTO DE TU OFICINA MODELO

let currentUserRole = null;
let currentBrokerOffice = null;
let todosLosDatos = [];
let trackingGlobal = {};
let datosProcesadosGlobal = [];

let FACTORES_GLOBAL = [];
let CONFIG_OFICINAS = {};
let OFICINAS_NOMBRES = [];

// --- Inicialización ---
async function inicializarSistema() {
    const config = await ConfigService.obtenerConfiguracionCompleta();
    FACTORES_GLOBAL = config.factores;
    CONFIG_OFICINAS = {}; OFICINAS_NOMBRES = [];
    
    config.oficinas.forEach(of => {
        OFICINAS_NOMBRES.push(of.nombre);
        CONFIG_OFICINAS[of.nombre] = of.usaEstacionalidad;
    });
    
    OFICINAS_NOMBRES.sort();
    poblarFiltroOficinas();
    poblarOficinasModal();
}

// --- CAMBIO AQUÍ: Lógica para seleccionar A. Oficina Modelo por defecto ---
function poblarFiltroOficinas() {
    const sel = document.getElementById("filtro-oficina");
    if (!sel) return;
    
    // Guardamos si el usuario ya había seleccionado algo manualmente
    const valorPrevio = sel.value; 
    
    sel.innerHTML = `<option value="Todas">Todas las oficinas</option>`;
    
    let existeModelo = false;
    OFICINAS_NOMBRES.forEach(nombre => {
        sel.innerHTML += `<option value="${nombre}">${nombre}</option>`;
        if (nombre === OFICINA_DEFAULT_DEMO) existeModelo = true;
    });

    // ✅ LÓGICA DE PRIORIDAD CON FALLBACK SEGURO:
    // 1. Si es Broker, su oficina se fuerza más abajo (ignorar este default)
    // 2. Si es Admin:
    if (currentUserRole === "admin") {
        // Si ya había elegido una oficina específica, la respetamos
        if (valorPrevio && valorPrevio !== "Todas" && OFICINAS_NOMBRES.includes(valorPrevio)) {
            sel.value = valorPrevio;
        } 
        // Si existe la Oficina Modelo, la ponemos por defecto
        else if (existeModelo) {
            sel.value = OFICINA_DEFAULT_DEMO;
        } 
        // ✅ FALLBACK: Si no existe la Modelo, usar "Todas"
        else {
            sel.value = "Todas";
            console.warn(`⚠️ La oficina "${OFICINA_DEFAULT_DEMO}" no existe. Usando "Todas" por defecto.`);
        }
    }
}


function poblarOficinasModal() {
    const sel = document.getElementById("edit-oficina");
    if (!sel) return;
    sel.innerHTML = "";
    OFICINAS_NOMBRES.forEach(nombre => {
        sel.innerHTML += `<option value="${nombre}">${nombre}</option>`;
    });
}

// --- Auth ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    try {
        await inicializarSistema();
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        let rol = "agente", oficina = "";
        
        if (snap.exists()) { const d = snap.data(); rol = d.rol || "agente"; oficina = d.oficina || ""; }
        else {
            rol = (user.email === ADMIN_EMAIL) ? "admin" : "agente";
            await setDoc(doc(db,"usuarios",user.uid), { nombre: user.displayName||"", emailAuth: user.email, rol, oficina: "", creadoEn: new Date().toISOString() }, {merge:true});
        }
        
        if (user.email === ADMIN_EMAIL && rol !== "admin") { rol = "admin"; await updateDoc(doc(db,"usuarios",user.uid), { rol: "admin" }); }

        if (rol === "admin") {
            currentUserRole = "admin";
            document.getElementById("filtro-anio").value = new Date().getFullYear();
            
            // Si poblarFiltroOficinas ya puso la "Oficina Modelo", cargarDatosCompletos respetará ese filtro visualmente
            cargarDatosCompletos();

        } else if (rol === "broker") {
            if (!oficina) { alert("Broker sin oficina."); window.location.href = "index.html"; return; }
            currentUserRole = "broker"; currentBrokerOffice = oficina;
            
            const sel = document.getElementById("filtro-oficina");
            if(sel) { 
                sel.value = oficina; // El broker SIEMPRE ve su oficina, pisa cualquier default
                sel.disabled = true; 
            }
            document.getElementById("filtro-anio").value = new Date().getFullYear();
            cargarDatosCompletos();
        } else { window.location.href = "index.html"; }

    } catch (err) { console.error(err); }
});

// --- Carga de Datos ---
async function cargarDatosCompletos() {
    try {
        const anio = parseInt(document.getElementById("filtro-anio").value) || new Date().getFullYear();
        
        // Planificaciones
        const qPlan = query(collection(db, "planificaciones"), where("anio", "==", anio));
        const snapPlan = await getDocs(qPlan);
        todosLosDatos = [];
        snapPlan.forEach(d => todosLosDatos.push({ ...d.data(), uid: d.id }));

        // Tracking
        const qTrack = query(collection(db, "tracking"), where("anio", "==", anio));
        const snapTrack = await getDocs(qTrack);
        trackingGlobal = {};
        snapTrack.forEach(d => {
            const partes = d.id.split('_');
            const uid = partes.slice(0, -1).join('_'); 
            if (!trackingGlobal[uid]) trackingGlobal[uid] = {};
            trackingGlobal[uid][anio] = d.data();
        });

        aplicarFiltrosYRenderizar();
    } catch (e) { console.error("Error cargar:", e); }
}

// Listeners
const el = (id) => document.getElementById(id);
if (el("filtro-anio")) el("filtro-anio").addEventListener("change", cargarDatosCompletos);
if (el("filtro-oficina")) el("filtro-oficina").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-periodo")) el("filtro-periodo").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-orden")) el("filtro-orden").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("btn-guardar-cambios")) el("btn-guardar-cambios").addEventListener("click", guardarCambiosAgente);
if (el("btn-excel")) el("btn-excel").addEventListener("click", e => { e.preventDefault(); exportarExcel(); });
if (el("btn-pdf")) el("btn-pdf").addEventListener("click", e => { e.preventDefault(); exportarPDF(); });

// --- Modal Editar ---
window.abrirModalEditar = function(uid) {
    const ag = todosLosDatos.find(a => a.uid === uid);
    if(!ag) return;
    el("edit-uid").value = uid;
    el("modal-nombre-agente").innerText = ag.nombreAgente;
    el("edit-oficina").value = ag.oficina;
    el("edit-objetivo").value = ag.objetivoAnual;
    const e = ag.efectividades || {};
    el("edit-efec-pre").value = e.preListAcm||0; el("edit-efec-acm").value = e.acmCapt||0;
    el("edit-efec-capt").value = e.captVenta||0; el("edit-efec-propio").value = e.listingPropio||0;
    el("edit-efec-busq").value = e.busquedas||0;
    new bootstrap.Modal(el('modalEditar')).show();
}

async function guardarCambiosAgente() {
    try {
        await updateDoc(doc(db, "planificaciones", el("edit-uid").value), {
            oficina: el("edit-oficina").value,
            objetivoAnual: el("edit-objetivo").value,
            efectividades: {
                preListAcm: el("edit-efec-pre").value, acmCapt: el("edit-efec-acm").value,
                captVenta: el("edit-efec-capt").value, listingPropio: el("edit-efec-propio").value, busquedas: el("edit-efec-busq").value
            }
        });
        bootstrap.Modal.getInstance(el('modalEditar')).hide();
        cargarDatosCompletos();
    } catch(e) { alert("Error al guardar"); }
}

// --- Procesamiento ---
function aplicarFiltrosYRenderizar() {
    const anio = el("filtro-anio").value;
    let oficina = el("filtro-oficina").value; // Aquí toma el valor (que ahora por defecto será Oficina Modelo)
    const periodo = el("filtro-periodo").value;
    const orden = el("filtro-orden").value;

    if (currentUserRole === "broker") oficina = currentBrokerOffice;

    let lista = todosLosDatos;
    if (oficina !== "Todas") lista = lista.filter(ag => ag.oficina === oficina);

    datosProcesadosGlobal = procesarAgentes(lista, periodo, anio);

    // Ordenar
    datosProcesadosGlobal.sort((a, b) => {
        if (orden === "pct_fact_desc") return b.pctFact - a.pctFact;
        if (orden === "real_fact_desc") return b.R_Fact - a.R_Fact;
        if (orden === "pct_trans_desc") return b.pctVentas - a.pctVentas;
        if (orden === "pct_capt_desc") return b.pctCapt - a.pctCapt;
        if (orden === "pct_acm_desc") return b.pctAcm - a.pctAcm;
        if (orden === "pct_pre_desc") return b.pctPre - a.pctPre;
        if (orden === "obj_fact_desc") return b.O_Fact - a.O_Fact;
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
    
    // Definir meses según periodo
    if (periodo === "anual") meses = [0,1,2,3,4,5,6,7,8,9,10,11];
    else if (periodo === "acumulado") for(let i=0; i<=mesActual; i++) meses.push(i);
    else if (periodo.startsWith("Q")) { const q = parseInt(periodo[1]); meses = [(q-1)*3, (q-1)*3+1, (q-1)*3+2]; }
    else if (periodo.startsWith("M")) meses = [parseInt(periodo.replace("M",""))-1];
    else if (periodo === "mes_actual") meses = [mesActual];

    const factorLineal = meses.length / 12;

    return lista.map(ag => {
        const idDoc = ag.uid;
        const partes = idDoc.split('_');
        const uidUsuario = partes.slice(0, -1).join('_');

        const O_Fact_An = parseFloat(ag.objetivoAnual) || 0;
        const ticket = parseFloat(ag.ticketPromedio) || 0;
        const com = ticket * 0.03;
        
        const ef = ag.efectividades || {};
        const pctProp = (parseFloat(ef.listingPropio)||0)/100;
        const pctBusq = (parseFloat(ef.busquedas)||0)/100;
        const captVenta = (parseFloat(ef.captVenta)||0)/100;
        const acmCapt = (parseFloat(ef.acmCapt)||0)/100;
        const preAcm = (parseFloat(ef.preListAcm)||0)/100;

        // Objetivos Anuales Operativos
        const O_Ventas_An = com>0 ? O_Fact_An/com : 0;
        const O_Prop_An = O_Ventas_An * pctProp;
        const O_Busq_An = O_Ventas_An * pctBusq;
        const O_Capt_An = captVenta>0 ? O_Prop_An/captVenta : 0;
        const O_Acm_An = acmCapt>0 ? O_Capt_An/acmCapt : 0;
        const O_Pre_An = preAcm>0 ? O_Acm_An/preAcm : 0;

        // Objetivos del Periodo
        let O_Fact = 0;
        const usaEst = CONFIG_OFICINAS[ag.oficina] === true;
        if (usaEst && FACTORES_GLOBAL.length === 12) {
            meses.forEach(m => { O_Fact += O_Fact_An * FACTORES_GLOBAL[m]; });
        } else {
            O_Fact = O_Fact_An * factorLineal;
        }
        
        const O_Ventas = O_Ventas_An * factorLineal;
        const O_Prop = O_Prop_An * factorLineal;
        const O_Busq = O_Busq_An * factorLineal; 
        const O_Capt = O_Capt_An * factorLineal;
        const O_Acm = O_Acm_An * factorLineal;
        const O_Pre = O_Pre_An * factorLineal;

        // RESULTADOS REALES (Sumando del tracking)
        let R_Fact=0, R_Capt=0, R_Acm=0, R_Pre=0, R_Prop=0, R_Busq=0, R_Cara=0, R_Res=0, R_PreBuy=0;
        
        const tr = trackingGlobal[uidUsuario] ? trackingGlobal[uidUsuario][anio] : null;
        if (tr) {
            meses.forEach(m => {
                const d = tr[`mes_${m}`];
                if(d) {
                    R_Fact += (d.facturacion?.total || 0);
                    R_Prop += (d.ventas_propio?.total || 0);   
                    R_Busq += (d.ventas_busqueda?.total || 0); 
                    R_Capt += (d.captaciones?.total || 0);
                    R_Acm += (d.acm?.total || 0);
                    R_Pre += (d.prelisting?.total || 0);
                    R_Cara += (d.caracara?.total || 0);
                    R_Res += (d.reservas?.total || 0);
                    R_PreBuy += (d.prebuy?.total || 0);
                }
            });
        }

        // R_Ventas Total Real es la suma de Propio + Búsqueda
        const R_Ventas = R_Prop + R_Busq;

        const pct = (r, o) => o > 0 ? (r / o) * 100 : 0;

        return {
            ...ag,
            O_Fact, R_Fact, pctFact: pct(R_Fact, O_Fact),
            O_Ventas, R_Ventas, pctVentas: pct(R_Ventas, O_Ventas),
            O_Prop, R_Prop, pctProp: pct(R_Prop, O_Prop),
            O_Busq, R_Busq, pctBusq: pct(R_Busq, O_Busq),
            O_Capt, R_Capt, pctCapt: pct(R_Capt, O_Capt),
            O_Acm, R_Acm, pctAcm: pct(R_Acm, O_Acm),
            O_Pre, R_Pre, pctPre: pct(R_Pre, O_Pre),
            R_Cara, R_Res, R_PreBuy
        };
    });
}

// --- Renderizado (KPIs, Gráficos, Tabla) ---
function renderizarKPIs(lista) {
    let tFact=0, tTrans=0, tCapt=0, tAcm=0, tPre=0;
    let rFact=0, rTrans=0, rCapt=0, rAcm=0, rPre=0;
    let tCara=0, tRes=0, tPreBuy=0;

    lista.forEach(ag => {
        tFact+=ag.O_Fact; rFact+=ag.R_Fact;
        tTrans+=ag.O_Ventas; rTrans+=ag.R_Ventas;
        tCapt+=ag.O_Capt; rCapt+=ag.R_Capt;
        tAcm+=ag.O_Acm; rAcm+=ag.R_Acm;
        tPre+=ag.O_Pre; rPre+=ag.R_Pre;
        tCara+=ag.R_Cara; tRes+=ag.R_Res; tPreBuy+=ag.R_PreBuy;
    });

    const kpi = (obj, real, money) => {
        const p = obj>0 ? (real/obj)*100 : 0;
        let c = "text-danger"; if(p>=50)c="text-warning"; if(p>=100)c="text-success";
        const fmt = n => money ? "$"+Math.round(n).toLocaleString() : Math.round(n);
        return { obj: fmt(obj), real: fmt(real), pct: Math.round(p)+"%", color: c };
    };

    const kFact = kpi(tFact, rFact, true);
    const kTrans = kpi(tTrans, rTrans, false);
    const kCapt = kpi(tCapt, rCapt, false);
    const kAcm = kpi(tAcm, rAcm, false);
    const kPre = kpi(tPre, rPre, false);

    const card = (t, d, i) => `
    <div class="card border-0 shadow-sm h-100"><div class="card-body p-3">
        <div class="d-flex justify-content-between mb-2"><h6 class="text-muted text-uppercase font-size-12">${t}</h6><i class="${i} text-muted font-size-16"></i></div>
        <div class="d-flex justify-content-between align-items-end">
            <div><h4 class="mb-1 fw-bold text-dark">${d.real}</h4><div class="font-size-12 text-muted">Obj: ${d.obj}</div></div>
            <div class="${d.color} fw-bold bg-light rounded px-2 py-1">${d.pct}</div>
        </div>
        <div class="progress mt-2" style="height:4px"><div class="progress-bar ${d.color.replace('text-','bg-')}" style="width:${d.pct.replace('%','')}%"></div></div>
    </div></div>`;
    
    const sCard = (t, v, c) => `<div class="card border-0 shadow-sm h-100"><div class="card-body p-3 d-flex justify-content-between align-items-center"><div><h6 class="text-muted text-uppercase font-size-12 mb-1">${t}</h6><h4 class="mb-0 fw-bold text-dark">${Math.round(v)}</h4></div><div class="avatar-sm"><span class="avatar-title ${c} rounded-circle font-size-16"><i class="mdi mdi-chart-bar"></i></span></div></div></div>`;

    const c = el("kpi-container");
    if(c) {
        c.innerHTML = `
        <div class="row g-3 mb-3">
            <div class="col-lg-2 col-md-4">${card("Facturación", kFact, "mdi mdi-currency-usd")}</div>
            <div class="col-lg-2 col-md-4">${card("Transacciones", kTrans, "mdi mdi-handshake")}</div>
            <div class="col-lg-2 col-md-4">${card("Captaciones", kCapt, "mdi mdi-home-plus")}</div>
            <div class="col-lg-2 col-md-4">${card("ACMs", kAcm, "mdi mdi-file-document-edit")}</div>
            <div class="col-lg-2 col-md-4">${card("Pre-Listings", kPre, "mdi mdi-clipboard-list")}</div>
        </div>
        <div class="row g-3 mb-4">
             <div class="col-lg-4 col-md-4">${sCard("Cara a Cara", tCara, "bg-soft-primary text-primary")}</div>
             <div class="col-lg-4 col-md-4">${sCard("Pre-Buy", tPreBuy, "bg-soft-info text-info")}</div>
             <div class="col-lg-4 col-md-4">${sCard("Reservas", tRes, "bg-soft-warning text-warning")}</div>
        </div>`;
    }
}

function calcularTotalesOficina(lista, anio) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    let sObj = Array(12).fill(0), sReal = Array(12).fill(0);
    let sObjC = Array(12).fill(0), sRealC = Array(12).fill(0);

    lista.forEach(ag => {
        const idDoc = ag.uid;
        const partes = idDoc.split('_');
        const uidUsuario = partes.slice(0, -1).join('_');

        const O_Fact_An = parseFloat(ag.objetivoAnual)||0;
        const com = (parseFloat(ag.ticketPromedio)||0)*0.03;
        
        const ef = ag.efectividades||{};
        const pctProp = (parseFloat(ef.listingPropio)||0)/100;
        const captVenta = (parseFloat(ef.captVenta)||0)/100;
        
        const O_Ventas_An = com>0 ? O_Fact_An/com : 0;
        const O_Prop_An = O_Ventas_An * pctProp;
        const O_Capt_An = captVenta>0 ? O_Prop_An/captVenta : 0;

        const usaEst = CONFIG_OFICINAS[ag.oficina] === true;
        const tr = trackingGlobal[uidUsuario] ? trackingGlobal[uidUsuario][anio] : null;

        for(let i=0; i<12; i++) {
            if (usaEst && FACTORES_GLOBAL.length === 12) sObj[i] += O_Fact_An * FACTORES_GLOBAL[i];
            else sObj[i] += O_Fact_An/12;
            
            sObjC[i] += O_Capt_An/12;

            if(tr && tr[`mes_${i}`]) {
                sReal[i] += (tr[`mes_${i}`].facturacion?.total||0);
                sRealC[i] += (tr[`mes_${i}`].captaciones?.total||0);
            }
        }
    });
    
    dibujarGraficoMixto("chart-office-fact", "Facturación", sObj, sReal, meses, "$");
    dibujarGraficoMixto("chart-office-capt", "Captaciones", sObjC, sRealC, meses, "");
}

function dibujarGraficoMixto(id, nombre, obj, real, cats, prefijo) {
    const options = {
        series: [
            { name: 'Real', type: 'column', data: real.map(n => Math.round(n)) },
            { name: 'Objetivo', type: 'line', data: obj.map(n => Math.round(n)) }
        ],
        chart: { height: 350, type: 'line', toolbar: { show: false }, zoom: { enabled: false } },
        stroke: { width: [0, 4], curve: 'smooth' },
        plotOptions: { bar: { columnWidth: '50%', borderRadius: 4 } },
        dataLabels: { enabled: true, enabledOnSeries: [1], style: { fontSize: '10px', colors: ['#556ee6'] } },
        labels: cats,
        colors: ['#34c38f', '#556ee6'],
        yaxis: { labels: { formatter: y => prefijo + (y?y.toLocaleString():0) } },
        tooltip: { shared: true, intersect: false, y: { formatter: y => prefijo + " " + (y?y.toLocaleString():0) } },
        legend: { position: 'bottom' }
    };
    
    if(!window.charts) window.charts = {};
    if(window.charts[id]) { window.charts[id].destroy(); }
    if(document.querySelector(`#${id}`)) {
        window.charts[id] = new ApexCharts(document.querySelector(`#${id}`), options);
        window.charts[id].render();
    }
}

function renderizarTabla(lista) {
    const tbody = el("tabla-agentes-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    // Formateadores auxiliares
    const fmtM = n => "$" + Math.round(n).toLocaleString();
    const fmtN = n => n.toFixed(1);
    const fmtP = n => n.toFixed(0) + "%";
    const color = p => p >= 100 ? "text-success" : (p >= 50 ? "text-warning" : "text-danger");

    lista.forEach(ag => {
        tbody.innerHTML += `
            <tr class="text-center data-cell">
                <td class="sticky-col text-start">
                    <h6 class="mb-0 text-primary">${ag.nombreAgente}</h6>
                    <small class="text-muted">${ag.oficina}</small>
                </td>
                
                <td class="bg-soft-success fw-bold text-dark">
                    ${fmtM(ag.O_Fact)} | ${fmtM(ag.R_Fact)} | <span class="${color(ag.pctFact)}">${fmtP(ag.pctFact)}</span>
                </td>
                
                <td>${fmtN(ag.O_Ventas)} | <strong>${fmtN(ag.R_Ventas)}</strong> | <span class="${color(ag.pctVentas)}">${fmtP(ag.pctVentas)}</span></td>
                <td>${fmtN(ag.O_Prop)} | ${fmtN(ag.R_Prop)} | <small>${fmtP(ag.pctProp)}</small></td>
                <td>${fmtN(ag.O_Busq)} | ${fmtN(ag.R_Busq)} | <small>${fmtP(ag.pctBusq)}</small></td>
                
                <td class="bg-soft-primary">${fmtN(ag.O_Capt)}</td>
                <td class="bg-soft-primary fw-bold text-dark">${Math.round(ag.R_Capt)}</td>
                <td class="bg-soft-primary"><span class="badge ${ag.pctCapt >= 100 ? 'bg-success' : 'bg-secondary'}">${fmtP(ag.pctCapt)}</span></td>
                
                <td>${fmtN(ag.O_Acm)}</td>
                <td class="fw-bold">${Math.round(ag.R_Acm)}</td>
                <td><small class="${color(ag.pctAcm)}">${fmtP(ag.pctAcm)}</small></td>

                <td>${fmtN(ag.O_Pre)}</td>
                <td class="fw-bold">${Math.round(ag.R_Pre)}</td>
                <td><small class="${color(ag.pctPre)}">${fmtP(ag.pctPre)}</small></td>
                
                <td class="bg-light fw-bold">${Math.round(ag.R_Cara)}</td>
                <td class="bg-light fw-bold text-info">${Math.round(ag.R_PreBuy)}</td>
                <td class="bg-light fw-bold text-warning">${Math.round(ag.R_Res)}</td>
                
                <td class="sticky-col-right">
                    <button class="btn btn-sm btn-primary" onclick="abrirModalEditar('${ag.uid}')">
                        <i class="mdi mdi-pencil"></i>
                    </button>
                </td>
            </tr>`;
    });
}

function renderizarRankings(lista) {
    const topFact = [...lista].sort((a,b) => b.R_Fact - a.R_Fact).slice(0, 5);
    if (el("rank-fact-body")) {
        el("rank-fact-body").innerHTML = topFact.map((ag, i) => `
            <tr><td class="text-center h5">${i<3?['🥇','🥈','🥉'][i]:'<span class="badge bg-light text-dark">#'+(i+1)+'</span>'}</td>
            <td><h6 class="mb-0">${ag.nombreAgente}</h6><small class="text-muted">${ag.oficina}</small></td>
            <td class="text-end fw-bold text-success">$${Math.round(ag.R_Fact).toLocaleString()}</td></tr>`).join('');
    }
    const topCapt = [...lista].sort((a,b) => b.R_Capt - a.R_Capt).slice(0, 5);
    if (el("rank-capt-body")) {
        el("rank-capt-body").innerHTML = topCapt.map((ag, i) => `
            <tr><td class="text-center h5">${i<3?['🥇','🥈','🥉'][i]:'<span class="badge bg-light text-dark">#'+(i+1)+'</span>'}</td>
            <td><h6 class="mb-0">${ag.nombreAgente}</h6><small class="text-muted">${ag.oficina}</small></td>
            <td class="text-end fw-bold text-primary">${Math.round(ag.R_Capt)}</td></tr>`).join('');
    }
}

function renderizarSemaforo(lista) {
    const c = el("semaforo-body");
    if(!c) return;
    c.innerHTML = lista.map(ag => {
        const f = ag.pctFact; const cap = ag.pctCapt;
        let l = "Equilibrio", cl = "bg-warning text-dark";
        if (f<50 && cap<50) { l="Rojo"; cl="bg-danger"; }
        else if (f<50 || cap<50) { l="Desequilibrio"; cl="bg-orange"; }
        else if (f>=100 && cap>=100) { l="Sustentable"; cl="bg-success"; }
        return `<tr><td><h6 class="mb-0">${ag.nombreAgente}</h6></td><td class="text-center">${f.toFixed(0)}%</td><td class="text-center">${cap.toFixed(0)}%</td><td class="text-center"><span class="badge ${cl} p-2">${l}</span></td></tr>`;
    }).join('');
}

function exportarExcel() {
    if(!window.XLSX || !datosProcesadosGlobal.length) return alert("No data");
    const wb = XLSX.utils.book_new();
    const data = datosProcesadosGlobal.map(ag => [
        ag.nombreAgente, ag.oficina,
        ag.O_Fact, ag.R_Fact, ag.pctFact/100,
        ag.O_Ventas, ag.R_Ventas, ag.pctVentas/100,
        ag.O_Prop, ag.R_Prop, ag.pctProp/100, 
        ag.O_Busq, ag.R_Busq, ag.pctBusq/100, 
        ag.O_Capt, ag.R_Capt, ag.pctCapt/100
    ]);
    const ws = XLSX.utils.aoa_to_sheet([["Agente","Oficina","Obj Fact","Real Fact","% Fact","Obj Tot","Real Tot","% Tot","Obj Prop","Real Prop","% Prop","Obj Busq","Real Busq","% Busq","Obj Capt","Real Capt","% Capt"], ...data]);
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, "Reporte.xlsx");
}

function exportarPDF() {
    if(!window.jspdf || !datosProcesadosGlobal.length) return alert("No data");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    let y=20;
    doc.text("Reporte Detallado", 14, y); y+=10;
    
    const body = datosProcesadosGlobal.map(ag => [
        ag.nombreAgente,
        `$${Math.round(ag.R_Fact).toLocaleString()}`,
        ag.R_Ventas.toFixed(1),
        ag.R_Prop.toFixed(1),
        ag.R_Busq.toFixed(1),
        Math.round(ag.R_Capt)
    ]);
    
    doc.autoTable({
        head: [['Agente','Facturación','Ventas Tot','V. Propio','V. Búsq','Captaciones']],
        body: body,
        startY: y
    });
    doc.save("Reporte.pdf");
}