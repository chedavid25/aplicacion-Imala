// admin.js - Panel Admin / Broker (Refactorizado Paso 1: Config Centralizada)

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    updateDoc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";
import { ConfigService } from "./config-service.js"; // <--- IMPORTANTE

const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "contacto@imala.com.ar";
const backgroundImageBase64 = "";

let currentUserRole = null;
let currentBrokerOffice = null;
let todosLosDatos = [];
let trackingGlobal = {};
let datosProcesadosGlobal = [];

// Variables globales de configuración (se llenan vía servicio)
let FACTORES_GLOBAL = [];
let CONFIG_OFICINAS = {}; // mapa nombre -> usaEstacionalidad
let OFICINAS_NOMBRES = [];

// ------------------------------------------------------------------
// INICIALIZACIÓN Y CARGA DE CONFIG
// ------------------------------------------------------------------
async function inicializarSistema() {
    // 1. Cargar configuración centralizada
    const config = await ConfigService.obtenerConfiguracionCompleta();
    FACTORES_GLOBAL = config.factores;
    
    // Transformar array de oficinas a objeto y lista de nombres
    CONFIG_OFICINAS = {};
    OFICINAS_NOMBRES = [];
    
    config.oficinas.forEach(of => {
        OFICINAS_NOMBRES.push(of.nombre);
        CONFIG_OFICINAS[of.nombre] = of.usaEstacionalidad;
    });

    // Ordenar nombres alfabéticamente
    OFICINAS_NOMBRES.sort();

    // 2. Poblar select de oficinas
    const sel = document.getElementById("filtro-oficina");
    if (sel) {
        const valorActual = sel.value;
        sel.innerHTML = "";
        
        const optTodas = document.createElement("option");
        optTodas.value = "Todas";
        optTodas.textContent = "Todas las oficinas";
        sel.appendChild(optTodas);

        OFICINAS_NOMBRES.forEach(nombre => {
            const opt = document.createElement("option");
            opt.value = nombre;
            opt.textContent = nombre;
            sel.appendChild(opt);
        });

        if (valorActual && OFICINAS_NOMBRES.includes(valorActual)) {
            sel.value = valorActual;
        }
    }
}

// ------------------------------------------------------------------
// AUTENTICACIÓN + ROLES
// ------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Primero inicializamos configs (oficinas, factores)
        await inicializarSistema();

        const ref = doc(db, "usuarios", user.uid);
        const snap = await getDoc(ref);

        let rol = "agente";
        let oficina = "";

        if (snap.exists()) {
            const data = snap.data();
            if (data.rol) rol = data.rol;
            if (data.oficina) oficina = data.oficina;
        } else {
            rol = (user.email === ADMIN_EMAIL) ? "admin" : "agente";
            await setDoc(ref, {
                nombre: user.displayName || (user.email ? user.email.split("@")[0] : ""),
                emailAuth: user.email || "",
                rol,
                oficina: "",
                creadoEn: new Date().toISOString()
            }, { merge: true });
        }

        if (user.email === ADMIN_EMAIL && rol !== "admin") {
            rol = "admin";
            await setDoc(ref, { rol: "admin" }, { merge: true });
        }

        if (rol === "admin") {
            currentUserRole = "admin";
            currentBrokerOffice = null;
            cargarDatosCompletos();
        } else if (rol === "broker") {
            if (!oficina) {
                alert("Usuario broker sin oficina asignada.");
                window.location.href = "index.html";
                return;
            }
            currentUserRole = "broker";
            currentBrokerOffice = oficina;

            // Verificar si la oficina del broker está en la lista cargada
            if (!OFICINAS_NOMBRES.includes(oficina)) {
                // Si no está, la agregamos temporalmente al combo y config
                OFICINAS_NOMBRES.push(oficina);
                CONFIG_OFICINAS[oficina] = false;
                
                const sel = document.getElementById("filtro-oficina");
                if(sel) {
                    const opt = document.createElement("option");
                    opt.value = oficina;
                    opt.textContent = oficina;
                    sel.appendChild(opt);
                }
            }

            const sel = document.getElementById("filtro-oficina");
            if (sel) {
                sel.value = currentBrokerOffice;
                sel.disabled = true;
            }
            cargarDatosCompletos();
        } else {
            window.location.href = "index.html";
        }

    } catch (err) {
        console.error("Error cargando rol de usuario:", err);
        window.location.href = "login.html";
    }
});

// ------------------------------------------------------------------
// CARGA DE DATOS
// ------------------------------------------------------------------
async function cargarDatosCompletos() {
    try {
        // NOTA: En el Paso 4 optimizaremos estas queries. Por ahora se mantiene la lógica original.
        const snapPlan = await getDocs(collection(db, "planificaciones"));
        todosLosDatos = [];

        snapPlan.forEach(dSnap => {
            const d = dSnap.data();
            if (!d.nombreAgente) return;
            todosLosDatos.push({ ...d, uid: dSnap.id });
        });

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

// ------------------------------------------------------------------
// LISTENERS
// ------------------------------------------------------------------
const el = (id) => document.getElementById(id);

if (el("filtro-anio"))    el("filtro-anio").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-oficina")) el("filtro-oficina").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-periodo")) el("filtro-periodo").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("filtro-orden"))   el("filtro-orden").addEventListener("change", aplicarFiltrosYRenderizar);
if (el("btn-actualizar")) el("btn-actualizar").addEventListener("click", aplicarFiltrosYRenderizar);
if (el("btn-guardar-cambios")) el("btn-guardar-cambios").addEventListener("click", guardarCambiosAgente);

if (el("btn-excel")) {
    el("btn-excel").addEventListener("click", (e) => { e.preventDefault(); exportarExcel(); });
}
if (el("btn-pdf")) {
    el("btn-pdf").addEventListener("click", (e) => { e.preventDefault(); exportarPDF(); });
}

// ------------------------------------------------------------------
// FUNCIONES DE LOGICA
// ------------------------------------------------------------------
window.abrirModalEditar = function(uid) {
    const agente = todosLosDatos.find(a => a.uid === uid);
    if (!agente) return;
    el("edit-uid").value = uid;
    el("modal-nombre-agente").innerText = agente.nombreAgente;
    el("edit-oficina").value = agente.oficina;
    el("edit-objetivo").value = agente.objetivoAnual || 0;
    const ef = agente.efectividades || {};
    el("edit-efec-pre").value = ef.preListAcm || 0;
    el("edit-efec-acm").value = ef.acmCapt || 0;
    el("edit-efec-capt").value = ef.captVenta || 0;
    el("edit-efec-propio").value = ef.listingPropio || 0;
    el("edit-efec-busq").value = ef.busquedas || 0;
    new bootstrap.Modal(el('modalEditar')).show();
};

async function guardarCambiosAgente() {
    const uid = el("edit-uid").value;
    try {
        await updateDoc(doc(db, "planificaciones", uid), {
            oficina: el("edit-oficina").value,
            objetivoAnual: el("edit-objetivo").value,
            efectividades: {
                preListAcm: el("edit-efec-pre").value,
                acmCapt: el("edit-efec-acm").value,
                captVenta: el("edit-efec-capt").value,
                listingPropio: el("edit-efec-propio").value,
                busquedas: el("edit-efec-busq").value
            }
        });
        alert("Datos actualizados.");
        bootstrap.Modal.getInstance(el('modalEditar')).hide();
        cargarDatosCompletos();
    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar.");
    }
}

function aplicarFiltrosYRenderizar() {
    const anio = el("filtro-anio").value;
    let oficina = el("filtro-oficina").value;
    const periodo = el("filtro-periodo").value;
    const orden = el("filtro-orden").value;

    if (currentUserRole === "broker") {
        oficina = currentBrokerOffice;
    }

    let lista = todosLosDatos;
    if (oficina !== "Todas") {
        lista = lista.filter(ag => ag.oficina === oficina);
    }

    datosProcesadosGlobal = procesarAgentes(lista, periodo, anio);

    datosProcesadosGlobal.sort((a, b) => {
        if (orden === "pct_fact_desc") return b.pctFact - a.pctFact;
        if (orden === "pct_capt_desc") return b.pctCapt - a.pctCapt;
        if (orden === "pct_trans_desc") return b.pctVentas - a.pctVentas;
        if (orden === "pct_acm_desc") return b.pctAcm - a.pctAcm;
        if (orden === "pct_pre_desc") return b.pctPre - a.pctPre;
        if (orden === "real_fact_desc") return b.R_Fact - a.R_Fact;
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

    if (periodo === "anual") meses = [0,1,2,3,4,5,6,7,8,9,10,11];
    else if (periodo === "acumulado") for(let i=0; i<=mesActual; i++) meses.push(i);
    else if (periodo === "S1") meses = [0,1,2,3,4,5];
    else if (periodo === "S2") meses = [6,7,8,9,10,11];
    else if (periodo.startsWith("Q")) {
        const q = parseInt(periodo[1]);
        meses = [(q-1)*3, (q-1)*3+1, (q-1)*3+2];
    } else if (periodo.startsWith("M")) meses = [parseInt(periodo.replace("M",""))-1];
    else if (periodo === "mes_actual") meses = [mesActual];

    const factorObj_linear = meses.length / 12;

    return lista.map(ag => {
        const O_Fact_An = parseFloat(ag.objetivoAnual) || 0;
        const ticket = parseFloat(ag.ticketPromedio) || 0;
        const com = ticket * 0.03;
        const efec = ag.efectividades || {};

        const pctProp = (parseFloat(efec.listingPropio)||0)/100;
        const pctBusq = (parseFloat(efec.busquedas)||0)/100;
        const captVenta = (parseFloat(efec.captVenta)||0)/100;
        const acmCapt = (parseFloat(efec.acmCapt)||0)/100;
        const preAcm = (parseFloat(efec.preListAcm)||0)/100;

        const O_Ventas_An = com>0 ? O_Fact_An/com : 0;
        const O_Prop_An = O_Ventas_An * pctProp;
        let O_Capt_An = (captVenta>0) ? O_Prop_An/captVenta : 0;
        let O_Acm_An = (acmCapt>0) ? O_Capt_An/acmCapt : 0;
        let O_Pre_An = (preAcm>0) ? O_Acm_An/preAcm : 0;

        // --- Facturación con estacionalidad CENTRALIZADA ---
        const usaEst = CONFIG_OFICINAS[ag.oficina] === true;
        let O_Fact_periodo = 0;

        if (usaEst && FACTORES_GLOBAL.length === 12) {
            meses.forEach(m => {
                O_Fact_periodo += O_Fact_An * FACTORES_GLOBAL[m];
            });
        } else {
            O_Fact_periodo = O_Fact_An * factorObj_linear;
        }

        // Otros objetivos (Lineales)
        const O_Fact = O_Fact_periodo;
        const O_Ventas = O_Ventas_An * factorObj_linear;
        const O_Prop = O_Prop_An * factorObj_linear;
        const O_Busq = O_Ventas * pctBusq * factorObj_linear;
        const O_Capt = O_Capt_An * factorObj_linear;
        const O_Acm = O_Acm_An * factorObj_linear;
        const O_Pre = O_Pre_An * factorObj_linear;

        let R_Fact=0, R_Capt=0, R_Acm=0, R_Pre=0, R_Cara=0, R_Res=0, R_PreBuy=0;
        const tr = trackingGlobal[ag.uid] ? trackingGlobal[ag.uid][anio] : null;

        if (tr) {
            meses.forEach(m => {
                const d = tr[`mes_${m}`];
                if(d) {
                    R_Fact += (d.facturacion?.total||0);
                    R_Capt += (d.captaciones?.total||0);
                    R_Acm += (d.acm?.total||0);
                    R_Pre += (d.prelisting?.total||0);
                    R_Cara += (d.caracara?.total||0);
                    R_Res += (d.reservas?.total||0);
                    R_PreBuy += (d.prebuy?.total||0);
                }
            });
        }

        const R_Ventas = com>0 ? R_Fact/com : 0;
        const R_Prop = R_Ventas * pctProp;
        const R_Busq = R_Ventas * pctBusq;

        const pct = (r,o) => o>0 ? (r/o)*100 : 0;

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

// Renderizado (igual que antes)
function renderizarKPIs(lista) {
    let tObjFact=0, tRealFact=0, tObjTrans=0, tRealTrans=0;
    let tObjCapt=0, tRealCapt=0, tObjAcm=0, tRealAcm=0, tObjPre=0, tRealPre=0;
    let tCara=0, tPreBuy=0, tRes=0;

    lista.forEach(ag => {
        tObjFact += ag.O_Fact; tRealFact += ag.R_Fact;
        tObjTrans += ag.O_Ventas; tRealTrans += ag.R_Ventas;
        tObjCapt += ag.O_Capt; tRealCapt += ag.R_Capt;
        tObjAcm += ag.O_Acm; tRealAcm += ag.R_Acm;
        tObjPre += ag.O_Pre; tRealPre += ag.R_Pre;
        tCara += ag.R_Cara; tPreBuy += ag.R_PreBuy; tRes += ag.R_Res;
    });

    const calcKPI = (obj, real, esMoneda) => {
        const pct = obj>0 ? (real/obj)*100 : 0;
        let cl = "text-danger";
        if(pct>=50 && pct<100) cl = "text-warning";
        if(pct>=100) cl = "text-success";
        return {
            obj: esMoneda ? "$" + Math.round(obj).toLocaleString() : Math.round(obj),
            real: esMoneda ? "$" + Math.round(real).toLocaleString() : Math.round(real),
            pct: Math.round(pct)+"%", color: cl
        };
    };

    const kpiFact = calcKPI(tObjFact, tRealFact, true);
    const kpiTrans = calcKPI(tObjTrans, tRealTrans, false);
    const kpiCapt = calcKPI(tObjCapt, tRealCapt, false);
    const kpiAcm = calcKPI(tObjAcm, tRealAcm, false);
    const kpiPre = calcKPI(tObjPre, tRealPre, false);

    const card = (tit, d, ic) => `
        <div class="card border-0 shadow-sm h-100"><div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-center mb-2"><h6 class="text-muted mb-0 text-uppercase font-size-12">${tit}</h6><i class="${ic} text-muted font-size-16"></i></div>
            <div class="d-flex align-items-end justify-content-between">
                <div><h4 class="mb-1 mt-1 fw-bold text-dark">${d.real}</h4><div class="font-size-12 text-muted">Obj: ${d.obj}</div></div>
                <div class="${d.color} fw-bold font-size-14 bg-light rounded px-2 py-1">${d.pct}</div>
            </div>
            <div class="progress mt-2" style="height: 4px;"><div class="progress-bar ${d.color.replace('text-','bg-')}" style="width: ${d.pct.replace('%','')}%"></div></div>
        </div></div>`;
    
    const sCard = (tit, val, bg) => `<div class="card border-0 shadow-sm h-100"><div class="card-body p-3 d-flex justify-content-between align-items-center"><div><h6 class="text-muted text-uppercase font-size-12 mb-1">${tit}</h6><h4 class="mb-0 fw-bold text-dark">${val}</h4></div><div class="avatar-sm"><span class="avatar-title ${bg} rounded-circle font-size-16"><i class="mdi mdi-chart-bar"></i></span></div></div></div>`;

    const c = el("kpi-container");
    if (c) {
        c.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-lg-2 col-md-4">${card("Facturación", kpiFact, "mdi mdi-currency-usd")}</div>
                <div class="col-lg-2 col-md-4">${card("Transacciones", kpiTrans, "mdi mdi-handshake")}</div>
                <div class="col-lg-2 col-md-4">${card("Captaciones", kpiCapt, "mdi mdi-home-plus")}</div>
                <div class="col-lg-2 col-md-4">${card("ACMs", kpiAcm, "mdi mdi-file-document-edit")}</div>
                <div class="col-lg-2 col-md-4">${card("Pre-Listings", kpiPre, "mdi mdi-clipboard-list")}</div>
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
    let sObjFact = Array(12).fill(0), sRealFact = Array(12).fill(0);
    let sObjCapt = Array(12).fill(0), sRealCapt = Array(12).fill(0);

    lista.forEach(ag => {
        const O_Fact_An = parseFloat(ag.objetivoAnual)||0;
        const ticket = parseFloat(ag.ticketPromedio)||0;
        const com = ticket*0.03;
        const efec = ag.efectividades||{};
        const pctProp = (parseFloat(efec.listingPropio)||0)/100;
        const captVenta = (parseFloat(efec.captVenta)||0)/100;
        const O_Ventas_An = com>0 ? O_Fact_An/com : 0;
        const O_Prop_An = O_Ventas_An*pctProp;
        const O_Capt_An = captVenta>0 ? O_Prop_An/captVenta : 0;
        
        const usaEst = CONFIG_OFICINAS[ag.oficina] === true;
        const tr = trackingGlobal[ag.uid] ? trackingGlobal[ag.uid][anio] : null;

        for(let i=0; i<12; i++) {
            if (usaEst && FACTORES_GLOBAL.length === 12) {
                sObjFact[i] += O_Fact_An * FACTORES_GLOBAL[i];
            } else {
                sObjFact[i] += O_Fact_An / 12;
            }
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
    const fmtM = n => "$" + Math.round(n).toLocaleString();
    const fmtN = n => n.toFixed(1);
    const fmtP = n => n.toFixed(0) + "%";
    const fmtI = n => Math.round(n);
    const color = p => p>=100 ? "text-success" : (p>=50 ? "text-warning" : "text-danger");

    lista.forEach(ag => {
        tbody.innerHTML += `
            <tr class="text-center data-cell">
                <td class="sticky-col text-start"><h6 class="mb-0 text-primary">${ag.nombreAgente}</h6><small class="text-muted">${ag.oficina}</small></td>
                <td class="bg-soft-success fw-bold text-dark">${fmtM(ag.O_Fact)} | ${fmtM(ag.R_Fact)} | <span class="${color(ag.pctFact)}">${fmtP(ag.pctFact)}</span></td>
                <td>${fmtN(ag.O_Ventas)} | <strong>${fmtN(ag.R_Ventas)}</strong> | <span class="${color(ag.pctVentas)}">${fmtP(ag.pctVentas)}</span></td>
                <td>${fmtN(ag.O_Prop)} | ${fmtN(ag.R_Prop)} | <small>${fmtP(ag.pctProp)}</small></td>
                <td>${fmtN(ag.O_Busq)} | ${fmtN(ag.R_Busq)} | <small>${fmtP(ag.pctBusq)}</small></td>
                <td>${fmtN(ag.O_Capt)}</td> <td><strong>${fmtI(ag.R_Capt)}</strong></td> <td><span class="badge badge-soft-info">${fmtP(ag.pctCapt)}</span></td>
                <td>${fmtN(ag.O_Acm)}</td> <td><strong>${fmtI(ag.R_Acm)}</strong></td> <td><span class="badge badge-soft-info">${fmtP(ag.pctAcm)}</span></td>
                <td>${fmtN(ag.O_Pre)}</td> <td><strong>${fmtI(ag.R_Pre)}</strong></td> <td><span class="badge badge-soft-info">${fmtP(ag.pctPre)}</span></td>
                <td class="bg-light fw-bold">${fmtI(ag.R_Cara)}</td> <td class="bg-light fw-bold">${fmtI(ag.R_PreBuy)}</td> <td class="bg-light fw-bold">${fmtI(ag.R_Res)}</td>
                <td class="sticky-col-right"><button class="btn btn-sm btn-primary" onclick="abrirModalEditar('${ag.uid}')"><i class="mdi mdi-pencil"></i></button></td>
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
    const container = el("semaforo-body");
    if(!container) return;
    container.innerHTML = lista.map(ag => {
        const f = ag.pctFact; 
        const c = ag.pctCapt;
        const isRed = (p) => p < 50;
        const isGreen = (p) => p >= 100;
        let label = "", badgeClass = "";
        if (isRed(f) && isRed(c)) { label = "Negocio en Rojo"; badgeClass = "bg-danger"; } 
        else if (isRed(f) || isRed(c)) { label = "Negocio en Desequilibrio"; badgeClass = "bg-orange"; } 
        else if (isGreen(f) && isGreen(c)) { label = "Negocio Sustentable"; badgeClass = "bg-success"; } 
        else { label = "Negocio en Equilibrio"; badgeClass = "bg-warning text-dark"; }
        return `
        <tr>
            <td><h6 class="mb-0">${ag.nombreAgente}</h6><small class="text-muted">${ag.oficina}</small></td>
            <td class="text-center">${f.toFixed(0)}%</td>
            <td class="text-center">${c.toFixed(0)}%</td>
            <td class="text-center"><span class="badge ${badgeClass} font-size-12 p-2">${label}</span></td>
        </tr>`;
    }).join('');
}

function exportarExcel() {
    try {
        if (!window.XLSX) { alert("Librería Excel no cargada."); return; }
        if (!datosProcesadosGlobal.length) { alert("No hay datos."); return; }
        const wb = XLSX.utils.book_new();
        const oficina = el("filtro-oficina").value;
        const anio = el("filtro-anio").value;
        const periodo = el("filtro-periodo").options[el("filtro-periodo").selectedIndex].text;
        
        const encabezado = [["REPORTE"], ["Oficina:", oficina], ["Periodo:", periodo + " " + anio], [""]];
        const headers = ["Agente","Oficina","Obj Fact","Real Fact","% Fact","Obj Trans","Real Trans","% Trans","Obj Capt","Real Capt","% Capt","Obj ACM","Real ACM","% ACM","Obj Pre","Real Pre","% Pre","Cara a Cara","Pre-Buy","Reservas"];
        
        const data = datosProcesadosGlobal.map(ag => [
            ag.nombreAgente, ag.oficina,
            ag.O_Fact, ag.R_Fact, ag.pctFact/100,
            ag.O_Ventas, ag.R_Ventas, ag.pctVentas/100,
            ag.O_Capt, ag.R_Capt, ag.pctCapt/100,
            ag.O_Acm, ag.R_Acm, ag.pctAcm/100,
            ag.O_Pre, ag.R_Pre, ag.pctPre/100,
            ag.R_Cara, ag.R_PreBuy, ag.R_Res
        ]);
        const ws = XLSX.utils.aoa_to_sheet([...encabezado, headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, "Reporte");
        XLSX.writeFile(wb, `Reporte_${oficina}_${anio}.xlsx`);
    } catch (e) { console.error(e); alert("Error al exportar."); }
}

function exportarPDF() {
    try {
        if (!window.jspdf) { alert("Librería PDF no cargada."); return; }
        if (!datosProcesadosGlobal.length) { alert("No hay datos."); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        if (backgroundImageBase64) { try { doc.addImage(backgroundImageBase64, 'PNG', 0, 0, 297, 210); } catch(e){} }

        const oficina = el("filtro-oficina").value;
        const periodo = el("filtro-periodo").options[el("filtro-periodo").selectedIndex].text;
        const anio = el("filtro-anio").value;

        let y=60;
        doc.setFontSize(16); doc.setTextColor(0, 51, 102); doc.text("Reporte de Gestión", 14, y);
        y+=8; doc.setFontSize(10); doc.setTextColor(80); doc.text(`Oficina: ${oficina} | ${periodo} ${anio}`, 14, y);
        y+=10;

        let tFact=0, tCapt=0, tTrans=0;
        datosProcesadosGlobal.forEach(d=>{ tFact+=d.R_Fact; tCapt+=d.R_Capt; tTrans+=d.R_Ventas; });
        
        doc.autoTable({
            head: [['Facturación Total', 'Captaciones Totales', 'Transacciones']],
            body: [[`$${Math.round(tFact).toLocaleString()}`, Math.round(tCapt).toString(), tTrans.toFixed(1)]],
            startY: y, theme: 'plain'
        });
        y = doc.lastAutoTable.finalY + 10;

        const head = [[{content:'Agente',rowSpan:2}, {content:'Facturación',colSpan:3}, {content:'Captaciones',colSpan:3}], ['Obj','Real','%','Obj','Real','%']];
        const body = datosProcesadosGlobal.map(ag => [
            ag.nombreAgente, 
            `$${Math.round(ag.O_Fact).toLocaleString()}`, `$${Math.round(ag.R_Fact).toLocaleString()}`, ag.pctFact.toFixed(0)+"%",
            Math.round(ag.O_Capt), Math.round(ag.R_Capt), ag.pctCapt.toFixed(0)+"%"
        ]);

        doc.autoTable({
            head: head, body: body, startY: y, theme: 'grid',
            headStyles: { fillColor: [41, 58, 74] },
            margin: { top: 60 }
        });
        doc.save(`Reporte_${oficina}_${anio}.pdf`);
    } catch (e) { console.error(e); alert("Error al generar PDF."); }
}
