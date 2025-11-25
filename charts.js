// charts.js - VERSIÓN FINAL INTEGRADA

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);
let planAnual = null;
let trackingData = null;
let charts = {};

// CONFIG ESTACIONAL
const CONFIG_OFICINAS = {
  "RE/MAX BIG": true, 
  "RE/MAX FORUM": true, 
  "RE/MAX FLOR": true, 
  "RE/MAX ACUERDO": true, 
  "CROAR PROPIEDADES": false
};

const FACTORES_ESTACIONALES = [
  0.17/3, 0.17/3, 0.17/3,
  0.23/3, 0.23/3, 0.23/3,
  0.25/3, 0.25/3, 0.25/3,
  0.35/3, 0.35/3, 0.35/3
];

// ========================================
// INICIO
// ========================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await cargarTodo(user.uid);
  } else {
    window.location.href = "login.html";
  }
});

// ========================================
// CARGAR DATOS
// ========================================
async function cargarTodo(uid) {
  const anio = parseInt(document.getElementById("filtro-anio").value) || new Date().getFullYear();
  
  try {
    const docPlan = await getDoc(doc(db, "planificaciones", `${uid}_${anio}`));
    const docTrack = await getDoc(doc(db, "tracking", `${uid}_${anio}`));

    planAnual = docPlan.exists() ? docPlan.data() : null;
    trackingData = docTrack.exists() ? docTrack.data() : null;

    if (!planAnual) {
      alert("No hay planificación para este año. Creala en 'Mi Planificador'.");
      return;
    }

    if (!trackingData) {
      alert("No hay datos de tracking para este año. Cargá tus primeros resultados en 'Tracking Mensual'.");
      return;
    }

    renderizarTodo();
  } catch (error) {
    console.error("Error cargando datos:", error);
    alert("Error al cargar datos: " + error.message);
  }
}

// ========================================
// FILTROS
// ========================================
document.getElementById("filtro-anio").addEventListener("change", () => {
  const user = auth.currentUser;
  if (user) cargarTodo(user.uid);
});

document.getElementById("filtro-periodo").addEventListener("change", () => {
  renderizarTodo();
});

// ========================================
// RENDERIZAR TODO
// ========================================
function renderizarTodo() {
  if (!planAnual || !trackingData) return;

  const periodo = document.getElementById("filtro-periodo").value;
  const meses = obtenerMesesPeriodo(periodo);

  renderizarKPIs(meses);
  renderizarVelocimetro(meses);
  renderizarComparacionMes(meses);
  renderizarLineaTiempo(meses);
  renderizarLineaCaptaciones(meses);
  renderizarEmbudoConversion(meses);
  renderizarCaraCara(meses);
  renderizarMixVentas(meses);
}

// ========================================
// OBTENER MESES DEL PERÍODO
// ========================================
function obtenerMesesPeriodo(periodo) {
  const hoy = new Date();
  const mesActual = hoy.getMonth();

  if (periodo === "anual") return [0,1,2,3,4,5,6,7,8,9,10,11];
  if (periodo === "acumulado") return Array.from({length: mesActual+1}, (_,i) => i);
  if (periodo === "Q1") return [0,1,2];
  if (periodo === "Q2") return [3,4,5];
  if (periodo === "Q3") return [6,7,8];
  if (periodo === "Q4") return [9,10,11];
  if (periodo === "S1") return [0,1,2,3,4,5];
  if (periodo === "S2") return [6,7,8,9,10,11];
  if (periodo === "mes_actual") return [mesActual];
  
  // Meses individuales
  if (periodo.startsWith("mes_")) {
    const numMes = parseInt(periodo.split("_")[1]);
    return [numMes];
  }
  
  return [0,1,2,3,4,5,6,7,8,9,10,11];
}

// ========================================
// RENDERIZAR KPIs CON COLORES DINÁMICOS
// ========================================
function renderizarKPIs(meses) {
  let sumFact = 0, sumVentas = 0, sumPropias = 0, sumBusq = 0;
  let sumCapt = 0, sumAcm = 0, sumPre = 0, sumRes = 0, sumPreBuy = 0;

  meses.forEach(m => {
    const mes = trackingData[`mes_${m}`];
    if (mes) {
      sumFact += mes.facturacion?.total || 0;
      sumPropias += mes.ventas_propio?.total || 0;
      sumBusq += mes.ventas_busqueda?.total || 0;
      sumCapt += mes.captaciones?.total || 0;
      sumAcm += mes.acm?.total || 0;
      sumPre += mes.prelisting?.total || 0;
      sumRes += mes.reservas?.total || 0;
      sumPreBuy += mes.prebuy?.total || 0;
    }
  });

  sumVentas = sumPropias + sumBusq;

  const objAnual = planAnual.objetivoAnual || 0;
  const ticket = planAnual.ticketPromedio || 0;
  const comProm = ticket * 0.03;
  const ventasNec = comProm > 0 ? objAnual / comProm : 0;

  const ef = planAnual.efectividades || {};
  const pre = (ef.preListAcm || 0) / 100;
  const acm = (ef.acmCapt || 0) / 100;
  const capt = (ef.captVenta || 0) / 100;
  const prop = (ef.listingPropio || 0) / 100;
  const busq = (ef.busquedas || 0) / 100;

  const ventasPropNec = ventasNec * prop;
  const ventasBusqNec = ventasNec * busq;
  const captNec = capt > 0 ? ventasPropNec / capt : 0;
  const acmNec = acm > 0 ? captNec / acm : 0;
  const preNec = pre > 0 ? acmNec / pre : 0;

  const esEstacional = CONFIG_OFICINAS[planAnual.oficina];
  let factorPeriodo = 1;

  if (esEstacional) {
    factorPeriodo = meses.reduce((sum, m) => sum + FACTORES_ESTACIONALES[m], 0);
  } else {
    factorPeriodo = meses.length / 12;
  }

  const objPeriodo = objAnual * factorPeriodo;
  const ventasPeriodo = ventasNec * factorPeriodo;
  const propiasPeriodo = ventasPropNec * factorPeriodo;
  const busqPeriodo = ventasBusqNec * factorPeriodo;
  const captPeriodo = captNec * factorPeriodo;
  const acmPeriodo = acmNec * factorPeriodo;
  const prePeriodo = preNec * factorPeriodo;

  const fmt = (v) => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(v);
  const pct = (r, o) => o > 0 ? Math.round((r/o)*100) : 0;

  document.getElementById("kpi-facturacion-real").textContent = fmt(sumFact);
  document.getElementById("kpi-facturacion-obj").textContent = fmt(objPeriodo);
  document.getElementById("badge-facturacion").textContent = pct(sumFact, objPeriodo) + "%";

  document.getElementById("kpi-ventas-real").textContent = Math.round(sumVentas);
  document.getElementById("kpi-ventas-obj").textContent = Math.round(ventasPeriodo);
  document.getElementById("badge-ventas").textContent = pct(sumVentas, ventasPeriodo) + "%";

  document.getElementById("kpi-propias-real").textContent = Math.round(sumPropias);
  document.getElementById("kpi-propias-obj").textContent = Math.round(propiasPeriodo);
  document.getElementById("badge-propias").textContent = pct(sumPropias, propiasPeriodo) + "%";

  document.getElementById("kpi-busquedas-real").textContent = Math.round(sumBusq);
  document.getElementById("kpi-busquedas-obj").textContent = Math.round(busqPeriodo);
  document.getElementById("badge-busquedas").textContent = pct(sumBusq, busqPeriodo) + "%";

  document.getElementById("kpi-capt-real").textContent = Math.round(sumCapt);
  document.getElementById("kpi-capt-obj").textContent = Math.round(captPeriodo);
  document.getElementById("badge-capt").textContent = pct(sumCapt, captPeriodo) + "%";

  document.getElementById("kpi-acm-real").textContent = Math.round(sumAcm);
  document.getElementById("kpi-acm-obj").textContent = Math.round(acmPeriodo);
  document.getElementById("badge-acm").textContent = pct(sumAcm, acmPeriodo) + "%";

  document.getElementById("kpi-prelist-real").textContent = Math.round(sumPre);
  document.getElementById("kpi-prelist-obj").textContent = Math.round(prePeriodo);
  document.getElementById("badge-prelist").textContent = pct(sumPre, prePeriodo) + "%";

  document.getElementById("kpi-reservas").textContent = Math.round(sumRes);
  document.getElementById("kpi-prebuy").textContent = Math.round(sumPreBuy);

  // Aplicar colores dinámicos
  aplicarColorDinamico("card-facturacion", "badge-facturacion", pct(sumFact, objPeriodo));
  aplicarColorDinamico("card-ventas", "badge-ventas", pct(sumVentas, ventasPeriodo));
  aplicarColorDinamico("card-propias", "badge-propias", pct(sumPropias, propiasPeriodo));
  aplicarColorDinamico("card-busquedas", "badge-busquedas", pct(sumBusq, busqPeriodo));
  aplicarColorDinamico("card-capt", "badge-capt", pct(sumCapt, captPeriodo));
  aplicarColorDinamico("card-acm", "badge-acm", pct(sumAcm, acmPeriodo));
  aplicarColorDinamico("card-prelist", "badge-prelist", pct(sumPre, prePeriodo));
}

// ========================================
// FUNCIÓN: APLICAR COLOR DINÁMICO
// ========================================
function aplicarColorDinamico(cardId, badgeId, porcentaje) {
  const card = document.getElementById(cardId);
  const badge = document.getElementById(badgeId);
  
  // Limpiar clases anteriores
  card.classList.remove('border-success-dynamic', 'border-warning-dynamic', 'border-danger-dynamic');
  badge.className = 'badge badge-cumplimiento';
  
  // ✅ Aplicar según porcentaje: Rojo < 50%, Amarillo 50-99%, Verde >= 100%
  if (porcentaje >= 100) {
    card.classList.add('border-success-dynamic');
    badge.classList.add('bg-success');
  } else if (porcentaje >= 50) {
    card.classList.add('border-warning-dynamic');
    badge.classList.add('bg-warning', 'text-dark');
  } else {
    card.classList.add('border-danger-dynamic');
    badge.classList.add('bg-danger');
  }
}

// ========================================
// VELOCÍMETRO - MEJORA SEGÚN % ACUMULADO REAL/SUPUESTO
// ========================================
function renderizarVelocimetro(meses) {
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const totalObjetivo = planAnual.objetivoAnual || 1;

  // Estacionalidad esperada al mes actual
  let porcAcumuladoEsperado = 0;
  for (let i = 0; i <= mesActual; i++) {
    porcAcumuladoEsperado += FACTORES_ESTACIONALES[i] || (1 / 12);
  }
  let objetivoEsperado = totalObjetivo * porcAcumuladoEsperado;

  // Avance real acumulado
  let avanceReal = 0;
  for (let i = 0; i <= mesActual; i++) {
    const mes = trackingData[`mes_${i}`];
    if (mes) avanceReal += mes.facturacion?.total ?? 0;
  }

  let porcentaje = objetivoEsperado > 0 ? (avanceReal / objetivoEsperado) * 100 : 0;
  porcentaje = Math.round(porcentaje);

  // Color/mensaje
  let color, mensaje;
  if (porcentaje >= 100) {
    color = "#34c38f";
    mensaje = "¡Vas excelente!";
  } else if (porcentaje >= 80) {
    color = "#f1b44c";
    mensaje = "Atento: aceptable pero debajo de lo esperado.";
  } else {
    color = "#f46a6a";
    mensaje = "Precaución: por debajo del ritmo necesario.";
  }

  // ApexCharts
  if (charts.velocimetro) charts.velocimetro.destroy();
  charts.velocimetro = new ApexCharts(document.querySelector("#chart-velocimetro"), {
    chart: { height: 260, type: "radialBar", sparkline: { enabled: true } },
    series: [Math.min(porcentaje, 160)],
    plotOptions: {
      radialBar: {
        hollow: { size: "70%" },
        track: { background: "#eee" },
        dataLabels: {
          show: true,
          name: { show: false },
          value: { fontSize: "32px", color: color, show: true, offsetY: 10, formatter: val => `${val}%` }
        }
      }
    },
    colors: [color],
    labels: [""],
    tooltip: { enabled: false }
  });
  charts.velocimetro.render();

  // Badge fijo UI
  let badge = document.getElementById("badge-proyeccion");
  if (badge) {
    badge.style.position = "absolute";
    badge.style.top = "12px";
    badge.style.left = "14px";
    badge.style.zIndex = "3";
    badge.style.pointerEvents = "none";
    badge.innerText = porcentaje >= 95 ? "Proyección confiable" : (porcentaje >= 80 ? "Dato preliminar" : "Advertencia");
    badge.className = "badge confiabilidad-badge " + (porcentaje >= 100 ? "badge-success" : porcentaje >= 80 ? "badge-warning" : "badge-danger");
  }

  let mensajeBox = document.getElementById("mensaje-velocimetro");
  if (mensajeBox) mensajeBox.textContent = mensaje;
}

// ========================================
// MES ACTUAL VS PROMEDIO - MEJORA (PORCENTAJE PROPIO Y TOOLTIP)
// ========================================
function renderizarComparacionMes(meses) {
  const labels = ["Facturación", "Transacciones", "Captaciones", "Pre-Listings"];
  const indices = ["facturacion", "transacciones", "captaciones", "prelisting"];
  const mesActual = (new Date()).getMonth();

  let valoresMes = [], promedios = [], porcentajes = [];
  indices.forEach((k, idx) => {
    let valorMes = 0, valoresArray = [], label = k;
    meses.forEach(m => {
      const mes = trackingData[`mes_${m}`];
      if (mes) {
        if (k === "facturacion") valorMes = mesActual === m ? mes.facturacion?.total || 0 : valorMes;
        else if (k === "transacciones") valorMes = mesActual === m ? (mes.ventas_propio?.total || 0) + (mes.ventas_busqueda?.total || 0) : valorMes;
        else if (k === "captaciones") valorMes = mesActual === m ? mes.captaciones?.total || 0 : valorMes;
        else if (k === "prelisting") valorMes = mesActual === m ? mes.prelisting?.total || 0 : valorMes;

        // Suma para promedio
        if (k === "facturacion") valoresArray.push(mes.facturacion?.total || 0);
        else if (k === "transacciones") valoresArray.push((mes.ventas_propio?.total || 0) + (mes.ventas_busqueda?.total || 0));
        else if (k === "captaciones") valoresArray.push(mes.captaciones?.total || 0);
        else if (k === "prelisting") valoresArray.push(mes.prelisting?.total || 0);
      }
    });
    let promedio = valoresArray.length > 0 ? valoresArray.reduce((a,b)=>a+b,0) / valoresArray.length : 1;
    if (!isFinite(promedio) || promedio === 0) promedio = 1;
    valoresMes.push(valorMes);
    promedios.push(promedio);
    porcentajes.push(Math.round((valorMes/promedio)*100));
  });

  if (charts.comparacionMes) charts.comparacionMes.destroy();
  charts.comparacionMes = new ApexCharts(document.querySelector("#chart-comparacion-mes"), {
    chart: { height: 260, type: "bar", toolbar: { show: false } },
    series: [{
      name: "Mes Actual vs Promedio",
      data: porcentajes
    }],
    plotOptions: {
      bar: { columnWidth: "35%", distributed: true }
    },
    colors: ["#34c38f", "#f1b44c", "#556ee6", "#f46a6a"],
    dataLabels: { enabled: true, formatter: v => v + "%", style: { fontSize: "14px" } },
    xaxis: {
      categories: labels,
      labels: { style: { fontSize: "14px" } }
    },
    tooltip: {
      y: {
        formatter: (val, opts) => {
          const idx = opts.dataPointIndex;
          return `Este mes: ${valoresMes[idx]}\nPromedio anual: ${promedios[idx].toFixed(2)}\nPct: ${porcentajes[idx]}%`;
        }
      }
    }
  });
  charts.comparacionMes.render();
}

// ========================================
// LÍNEA FACTURACIÓN (CON ESTACIONALIDAD)
// ========================================
function renderizarLineaTiempo(meses) {
  const labels = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const real = [], obj = [];

  const objAnual = planAnual.objetivoAnual || 0;
  const esEstacional = CONFIG_OFICINAS[planAnual.oficina];

  for (let i = 0; i < 12; i++) {
    const mes = trackingData[`mes_${i}`];
    real.push(mes?.facturacion?.total || 0);
    
    if (esEstacional) {
      obj.push(objAnual * FACTORES_ESTACIONALES[i]);
    } else {
      obj.push(objAnual / 12);
    }
  }

  const options = {
    series: [
      { name: 'Facturación Real', data: real },
      { name: 'Objetivo Mes', data: obj }
    ],
    chart: { type: 'line', height: 340, toolbar: { show: false } },
    stroke: { width: [3, 2], dashArray: [0, 5], curve: 'smooth' },
    colors: ['#34c38f', '#556ee6'],
    xaxis: { categories: labels },
    yaxis: { 
      labels: { 
        formatter: (v) => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(v)
      }
    },
    tooltip: {
      y: {
        formatter: (v) => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(v)
      }
    },
    legend: { position: 'top' },
    markers: { size: 5 }
  };

  if (charts.linea) charts.linea.destroy();
  charts.linea = new ApexCharts(document.querySelector("#chart-linea-tiempo"), options);
  charts.linea.render();
}

// ========================================
// LÍNEA CAPTACIONES
// ========================================
function renderizarLineaCaptaciones(meses) {
  const labels = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const real = [], obj = [];

  const ef = planAnual.efectividades || {};
  const ticket = planAnual.ticketPromedio || 0;
  const objAnual = planAnual.objetivoAnual || 0;
  const comProm = ticket * 0.03;
  const ventasNec = comProm > 0 ? objAnual / comProm : 0;
  const prop = (ef.listingPropio || 0) / 100;
  const capt = (ef.captVenta || 0) / 100;
  const ventasPropias = ventasNec * prop;
  const captNec = capt > 0 ? ventasPropias / capt : 0;

  const esEstacional = CONFIG_OFICINAS[planAnual.oficina];

  for (let i = 0; i < 12; i++) {
    const mes = trackingData[`mes_${i}`];
    real.push(mes?.captaciones?.total || 0);
    
    if (esEstacional) {
      obj.push(captNec * FACTORES_ESTACIONALES[i]);
    } else {
      obj.push(captNec / 12);
    }
  }

  const options = {
    series: [
      { name: 'Captaciones Reales', data: real },
      { name: 'Objetivo Mes', data: obj }
    ],
    chart: { type: 'line', height: 340, toolbar: { show: false } },
    stroke: { width: [3, 2], dashArray: [0, 5], curve: 'smooth' },
    colors: ['#f1b44c', '#556ee6'],
    xaxis: { categories: labels },
    yaxis: { labels: { formatter: (v) => Math.round(v) } },
    legend: { position: 'top' },
    markers: { size: 5 }
  };

  if (charts.captaciones) charts.captaciones.destroy();
  charts.captaciones = new ApexCharts(document.querySelector("#chart-linea-captaciones"), options);
  charts.captaciones.render();
}

// ========================================
// EMBUDO DE CONVERSIÓN
// ========================================
function renderizarEmbudoConversion(meses) {
  let totalPre = 0, totalAcm = 0, totalCapt = 0, totalVentas = 0;

  meses.forEach(m => {
    const mes = trackingData[`mes_${m}`];
    if (mes) {
      totalPre += mes.prelisting?.total || 0;
      totalAcm += mes.acm?.total || 0;
      totalCapt += mes.captaciones?.total || 0;
      totalVentas += (mes.ventas_propio?.total || 0) + (mes.ventas_busqueda?.total || 0);
    }
  });

  const convPreAcm = totalPre > 0 ? ((totalAcm / totalPre) * 100).toFixed(1) : 0;
  const convAcmCapt = totalAcm > 0 ? ((totalCapt / totalAcm) * 100).toFixed(1) : 0;
  const convCaptVenta = totalCapt > 0 ? ((totalVentas / totalCapt) * 100).toFixed(1) : 0;
  const convTotal = totalPre > 0 ? ((totalVentas / totalPre) * 100).toFixed(1) : 0;

  const ef = planAnual.efectividades || {};
  const planPreAcm = ef.preListAcm || 0;
  const planAcmCapt = ef.acmCapt || 0;
  const planCaptVenta = ef.captVenta || 0;

  document.getElementById("conv-pre-acm").textContent = convPreAcm + "%";
  document.getElementById("conv-acm-capt").textContent = convAcmCapt + "%";
  document.getElementById("conv-capt-venta").textContent = convCaptVenta + "%";
  document.getElementById("conv-total").textContent = convTotal + "%";

  document.getElementById("plan-pre-acm").textContent = planPreAcm + "%";
  document.getElementById("plan-acm-capt").textContent = planAcmCapt + "%";
  document.getElementById("plan-capt-venta").textContent = planCaptVenta + "%";

  colorearConversion("conv-pre-acm", convPreAcm, planPreAcm);
  colorearConversion("conv-acm-capt", convAcmCapt, planAcmCapt);
  colorearConversion("conv-capt-venta", convCaptVenta, planCaptVenta);

  const options = {
    series: [{
      name: 'Cantidad',
      data: [
        Math.round(totalPre),
        Math.round(totalAcm),
        Math.round(totalCapt),
        Math.round(totalVentas)
      ]
    }],
    chart: { type: 'bar', height: 360, toolbar: { show: false } },
    plotOptions: {
      bar: {
        horizontal: true,
        distributed: true,
        barHeight: '70%',
        dataLabels: { position: 'center' }
      }
    },
    dataLabels: {
      enabled: true,
      formatter: (val, opts) => {
        const conversions = ['100%', convPreAcm + '%', convAcmCapt + '%', convCaptVenta + '%'];
        return Math.round(val) + ' (' + conversions[opts.dataPointIndex] + ')';
      },
      offsetX: 0,
      style: { 
        fontSize: '13px', 
        fontWeight: 'bold', 
        colors: ['#fff'] 
      }
    },
    colors: ['#556ee6', '#34c38f', '#f1b44c', '#50a5f1'],
    xaxis: {
      categories: ['Pre-Listings', 'ACMs', 'Captaciones', 'Ventas'],
      labels: { style: { fontSize: '12px', fontWeight: 600 } }
    },
    yaxis: { labels: { style: { fontSize: '13px', fontWeight: 600 } } },
    grid: { borderColor: '#f1f1f1' },
    legend: { show: false }
  };

  if (charts.funnel) charts.funnel.destroy();
  charts.funnel = new ApexCharts(document.querySelector("#chart-funnel"), options);
  charts.funnel.render();
}

function colorearConversion(id, real, plan) {
  const elem = document.getElementById(id);
  const card = elem.closest('.funnel-card');
  
  if (plan > 0) {
    const performance = (parseFloat(real) / parseFloat(plan)) * 100;
    
    if (performance >= 100) {
      elem.style.color = '#34c38f';
      card.style.borderColor = '#34c38f';
      card.style.background = 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)';
    } else if (performance >= 70) {
      elem.style.color = '#f1b44c';
      card.style.borderColor = '#f1b44c';
      card.style.background = 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)';
    } else {
      elem.style.color = '#f46a6a';
      card.style.borderColor = '#f46a6a';
      card.style.background = 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)';
    }
  }
}

// ========================================
// CARA A CARA (META: 10 por SEMANA)
// ========================================
function renderizarCaraCara(meses) {
  let totalRealizado = 0;

  meses.forEach(m => {
    const mes = trackingData[`mes_${m}`];
    if (mes) totalRealizado += mes.caracara?.total || 0;
  });

  // META: 10 reuniones por SEMANA
  const semanasDelPeriodo = calcularSemanasPeriodo(meses);
  const metaPeriodo = 10 * semanasDelPeriodo;
  const faltante = metaPeriodo > totalRealizado ? metaPeriodo - totalRealizado : 0;

  const options = {
    series: [totalRealizado, faltante],
    chart: { type: 'donut', height: 320 },
    labels: ['Realizadas', 'Faltantes'],
    colors: ['#50a5f1', '#e9ecef'],
    legend: { position: 'bottom' },
    dataLabels: {
      enabled: true,
      formatter: (val, opts) => {
        const valor = opts.w.config.series[opts.seriesIndex];
        return valor + " (" + val.toFixed(1) + "%)";
      }
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: { show: true, fontSize: '16px' },
            value: {
              show: true,
              fontSize: '24px',
              fontWeight: 700,
              formatter: (val) => Math.round(val)
            },
            total: {
              show: true,
              label: 'Meta del Período',
              fontSize: '14px',
              fontWeight: 600,
              formatter: () => metaPeriodo + ' reuniones (' + semanasDelPeriodo + ' sem.)'
            }
          }
        }
      }
    },
    tooltip: {
      y: {
        formatter: (val) => Math.round(val) + ' reuniones'
      }
    }
  };

  if (charts.caracara) charts.caracara.destroy();
  charts.caracara = new ApexCharts(document.querySelector("#chart-caracara"), options);
  charts.caracara.render();
}

// ✅ Calcular semanas del período
function calcularSemanasPeriodo(meses) {
  const diasPorMes = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const anio = parseInt(document.getElementById("filtro-anio").value) || new Date().getFullYear();
  
  const esBisiesto = (anio % 4 === 0 && anio % 100 !== 0) || (anio % 400 === 0);
  if (esBisiesto) diasPorMes[1] = 29;
  
  let totalDias = 0;
  meses.forEach(m => {
    totalDias += diasPorMes[m];
  });
  
  return Math.round(totalDias / 7);
}

// ========================================
// MIX VENTAS
// ========================================
function renderizarMixVentas(meses) {
  let sumPropias = 0, sumBusq = 0;

  meses.forEach(m => {
    const mes = trackingData[`mes_${m}`];
    if (mes) {
      sumPropias += mes.ventas_propio?.total || 0;
      sumBusq += mes.ventas_busqueda?.total || 0;
    }
  });

  const options = {
    series: [sumPropias, sumBusq],
    chart: { type: 'donut', height: 320 },
    labels: ['Ventas Propias', 'Ventas Búsquedas'],
    colors: ['#34c38f', '#f1b44c'],
    legend: { position: 'bottom' },
    dataLabels: {
      enabled: true,
      formatter: (val, opts) => {
        const valor = opts.w.config.series[opts.seriesIndex];
        return valor + " (" + val.toFixed(1) + "%)";
      }
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: { show: true, fontSize: '16px' },
            value: {
              show: true,
              fontSize: '24px',
              fontWeight: 700,
              formatter: (val) => Math.round(val)
            },
            total: {
              show: true,
              label: 'Total Ventas',
              fontSize: '14px',
              fontWeight: 600,
              formatter: () => Math.round(sumPropias + sumBusq)
            }
          }
        }
      }
    }
  };

  if (charts.mix) charts.mix.destroy();
  charts.mix = new ApexCharts(document.querySelector("#chart-mix"), options);
  charts.mix.render();
}
