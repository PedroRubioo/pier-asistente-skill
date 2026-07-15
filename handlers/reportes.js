// =====================================================================
// HANDLERS DE REPORTES DEL NEGOCIO — con jerarquía de roles:
//   empleado (nivel 1) < gerencia (nivel 2) < direccion_general (nivel 3)
//
// GERENCIA y DIRECCIÓN:
//   - Números históricos del negocio (KPIs)
//   - Productos más vendidos (ranking real de ventas)
//   - Ventas de la semana (últimos 7 días vs 7 anteriores)
//   - Equipo y clientes registrados
// SOLO DIRECCIÓN GENERAL:
//   - Resumen ejecutivo del mes (vs mes anterior)
//   - Auditoría del sistema (bitácora de movimientos)
// Un rol menor recibe un rechazo amable que explica de quién es el dato.
// =====================================================================
const Alexa = require('ask-sdk-core');
const { fetchPierAuth } = require('../lib/api');
const { obtenerToken } = require('../lib/auth');
const { ahoraEnMexico } = require('../lib/horario');
const { responder, responderVincular } = require('../lib/respuesta');
const { buildHeadline, buildImageList } = require('../lib/apl');

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

const NIVEL_ROL = { empleado: 1, gerencia: 2, direccion_general: 3 };

// Valida el nivel jerárquico. Si el rol es menor, rechaza explicando
// de quién es la información (control de acceso audible en la demo).
function accesoNivel(h, nivelMinimo, dueniosDelDato) {
  const token = obtenerToken(h);
  const attrs = h.attributesManager.getSessionAttributes();
  const rol = attrs.usuarioAutenticado?.rol;
  if (!token) {
    return { rechazo: responderVincular(h, `Esa información es de ${dueniosDelDato}. Vincula tu cuenta con el código de tu panel web.`) };
  }
  if (rol && (NIVEL_ROL[rol] || 0) < nivelMinimo) {
    return { rechazo: responder(h, `Esa información es solo de ${dueniosDelDato}. ¿Te ayudo con otra cosa?`) };
  }
  return { token };
}

function esError403(e) {
  return /-> 403/.test(String(e.message));
}

function pesos(n) {
  return Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

// Fecha (YYYY-MM-DD) de un timestamp, en huso de Huejutla (UTC-6)
function diaMx(fecha) {
  const t = new Date(new Date(fecha).getTime() - 6 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// =====================================================================
// GERENCIA+ · KPIs históricos del negocio
// =====================================================================
const KpisNegocioIntentHandler = {
  canHandle(h) { return esIntent(h, 'KpisNegocioIntent'); },
  async handle(h) {
    const acceso = accesoNivel(h, 2, 'gerencia y dirección');
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/reportes/kpis', acceso.token);
      const k = data.kpis;
      return responder(
        h,
        `Los números históricos del negocio: ${pesos(k.ingresos_total)} pesos en ingresos pagados, ${k.pedidos_total} pedidos, ${k.clientes_activos} clientes activos y ${k.productos_activos} productos en catálogo.`,
        buildHeadline({
          subtituloHeader: 'Números del negocio',
          primario: `$${pesos(k.ingresos_total)} MXN`,
          secundario: `${k.pedidos_total} pedidos · ${k.clientes_activos} clientes · ${k.productos_activos} productos`,
          hint: 'Histórico total de la plataforma',
        }),
        'kpisToken'
      );
    } catch (e) {
      if (esError403(e)) return responder(h, 'Esa información es solo de gerencia y dirección.');
      console.error('KpisNegocio error:', e);
      return responder(h, 'No pude consultar los números del negocio en este momento.');
    }
  },
};

// =====================================================================
// GERENCIA+ · Productos más vendidos (ranking real)
// =====================================================================
const ProductosTopIntentHandler = {
  canHandle(h) { return esIntent(h, 'ProductosTopIntent'); },
  async handle(h) {
    const acceso = accesoNivel(h, 2, 'gerencia y dirección');
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/simulador/productos-ranking', acceso.token);
      const top = (data.productos || []).filter(p => Number(p.total_vendido) > 0).slice(0, 5);
      if (top.length === 0) {
        return responder(h, 'Todavía no hay ventas registradas para armar el ranking.');
      }
      const habla = top.slice(0, 3).map((p, i) =>
        `${i + 1}: ${p.nombre} con ${p.total_vendido} vendidos por ${pesos(p.ingresos_totales)} pesos`
      ).join('; ');
      const items = top.map((p, i) => ({
        primario: `${i + 1}. ${p.nombre}`,
        secundario: `${p.total_vendido} vendidos`,
        terciario: `$${pesos(p.ingresos_totales)}`,
        imagen: p.imagen_url || '',
        id: p.id,
      }));
      return responder(
        h,
        `El top de ventas: ${habla}. El análisis completo está en Predicción, en tu panel.`,
        buildImageList('Productos más vendidos', items, 'Ranking histórico por unidades'),
        'rankingToken'
      );
    } catch (e) {
      if (esError403(e)) return responder(h, 'Esa información es solo de gerencia y dirección.');
      console.error('ProductosTop error:', e);
      return responder(h, 'No pude consultar el ranking en este momento.');
    }
  },
};

// =====================================================================
// GERENCIA+ · Ventas de la semana (últimos 7 días vs los 7 anteriores)
// =====================================================================
const VentasSemanaIntentHandler = {
  canHandle(h) { return esIntent(h, 'VentasSemanaIntent'); },
  async handle(h) {
    const acceso = accesoNivel(h, 2, 'gerencia y dirección');
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/pedidos?limite=200', acceso.token);
      const pedidos = (data.pedidos || []).filter(p => p.estado !== 'cancelado' && p.created_at);
      const hoy = diaMx(ahoraEnMexico().getTime() + 6 * 60 * 60 * 1000);
      const diaDe = (offsetDias) => {
        const d = new Date();
        d.setDate(d.getDate() - offsetDias);
        return diaMx(d);
      };
      const hace7 = diaDe(6);
      const hace14 = diaDe(13);
      const semana = pedidos.filter(p => diaMx(p.created_at) >= hace7 && diaMx(p.created_at) <= hoy);
      const previa = pedidos.filter(p => diaMx(p.created_at) >= hace14 && diaMx(p.created_at) < hace7);
      const suma = (arr) => arr.reduce((s, p) => s + (Number(p.total) || 0), 0);
      const totalSemana = suma(semana);
      const totalPrevia = suma(previa);
      const cambio = totalPrevia > 0 ? Math.round(((totalSemana - totalPrevia) / totalPrevia) * 100) : null;
      const cambioTxt = cambio === null
        ? ''
        : cambio >= 0
          ? ` Eso es ${cambio} por ciento arriba de la semana anterior.`
          : ` Eso es ${Math.abs(cambio)} por ciento abajo de la semana anterior.`;
      return responder(
        h,
        `En los últimos siete días van ${semana.length} pedidos por ${pesos(totalSemana)} pesos.${cambioTxt}`,
        buildHeadline({
          subtituloHeader: 'Ventas de la semana',
          primario: `$${pesos(totalSemana)} MXN`,
          secundario: `${semana.length} pedidos en 7 días${cambio !== null ? ` · ${cambio >= 0 ? '▲' : '▼'} ${Math.abs(cambio)}% vs semana previa` : ''}`,
          hint: 'Sin contar pedidos cancelados',
        }),
        'ventasSemanaToken'
      );
    } catch (e) {
      if (esError403(e)) return responder(h, 'Esa información es solo de gerencia y dirección.');
      console.error('VentasSemana error:', e);
      return responder(h, 'No pude calcular las ventas de la semana en este momento.');
    }
  },
};

// =====================================================================
// GERENCIA+ · Equipo y clientes registrados
// =====================================================================
const EquipoIntentHandler = {
  canHandle(h) { return esIntent(h, 'EquipoIntent'); },
  async handle(h) {
    const acceso = accesoNivel(h, 2, 'gerencia y dirección');
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/usuarios', acceso.token);
      const usuarios = data.usuarios || [];
      const activos = usuarios.filter(u => u.activo);
      const conteo = (rol) => activos.filter(u => u.rol === rol).length;
      const empleados = activos.filter(u => u.rol === 'empleado');
      const nombres = empleados.slice(0, 4).map(u => u.nombre).join(', ');
      const items = [
        { primario: 'Clientes', secundario: `${conteo('cliente')} activos` },
        { primario: 'Empleados', secundario: `${conteo('empleado')} activos`, terciario: nombres },
        { primario: 'Repartidores', secundario: `${conteo('repartidor')} activos` },
        { primario: 'Gerencia y dirección', secundario: `${conteo('gerencia') + conteo('direccion_general')} cuentas` },
      ];
      return responder(
        h,
        `El equipo: ${conteo('empleado')} ${conteo('empleado') === 1 ? 'empleado' : 'empleados'}${nombres ? ` (${nombres})` : ''}, ${conteo('repartidor')} ${conteo('repartidor') === 1 ? 'repartidor' : 'repartidores'}, y tenemos ${conteo('cliente')} clientes activos registrados.`,
        buildImageList('Equipo y clientes', items, 'Gestión completa en Usuarios, en tu panel'),
        'equipoToken'
      );
    } catch (e) {
      if (esError403(e)) return responder(h, 'Esa información es solo de gerencia y dirección.');
      console.error('Equipo error:', e);
      return responder(h, 'No pude consultar el equipo en este momento.');
    }
  },
};

// =====================================================================
// SOLO DIRECCIÓN · Resumen ejecutivo del mes (vs mes anterior)
// =====================================================================
const ResumenMesIntentHandler = {
  canHandle(h) { return esIntent(h, 'ResumenMesIntent'); },
  async handle(h) {
    const acceso = accesoNivel(h, 3, 'dirección general');
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/pedidos?limite=200', acceso.token);
      const pedidos = (data.pedidos || []).filter(p => p.estado !== 'cancelado' && p.created_at);
      const ahora = ahoraEnMexico();
      const mesActual = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
      const previo = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1));
      const mesPrevio = `${previo.getUTCFullYear()}-${String(previo.getUTCMonth() + 1).padStart(2, '0')}`;
      const delMes = (mes) => pedidos.filter(p => diaMx(p.created_at).startsWith(mes));
      const actual = delMes(mesActual);
      const anterior = delMes(mesPrevio);
      const suma = (arr) => arr.reduce((s, p) => s + (Number(p.total) || 0), 0);
      const totalActual = suma(actual);
      const totalAnterior = suma(anterior);
      const ticket = actual.length > 0 ? Math.round(totalActual / actual.length) : 0;
      const comparacion = totalAnterior > 0
        ? ` El mes pasado cerró en ${pesos(totalAnterior)} pesos con ${anterior.length} pedidos.`
        : '';
      return responder(
        h,
        `Resumen del mes: van ${pesos(totalActual)} pesos en ${actual.length} pedidos, con ticket promedio de ${pesos(ticket)} pesos.${comparacion}`,
        buildHeadline({
          subtituloHeader: 'Resumen ejecutivo del mes',
          primario: `$${pesos(totalActual)} MXN`,
          secundario: `${actual.length} pedidos · Ticket promedio $${pesos(ticket)}${totalAnterior > 0 ? ` · Mes anterior $${pesos(totalAnterior)}` : ''}`,
          hint: 'Sin contar pedidos cancelados',
        }),
        'resumenMesToken'
      );
    } catch (e) {
      if (esError403(e)) return responder(h, 'Esa información es solo de dirección general.');
      console.error('ResumenMes error:', e);
      return responder(h, 'No pude armar el resumen del mes en este momento.');
    }
  },
};

// =====================================================================
// SOLO DIRECCIÓN · Auditoría del sistema (bitácora)
// =====================================================================
const AuditoriaIntentHandler = {
  canHandle(h) { return esIntent(h, 'AuditoriaIntent'); },
  async handle(h) {
    const acceso = accesoNivel(h, 3, 'dirección general');
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/reportes/auditoria?limite=50', acceso.token);
      const registros = data.auditoria || [];
      if (registros.length === 0) {
        return responder(h, 'La bitácora del sistema está vacía por ahora.');
      }
      const hoy = diaMx(new Date());
      const deHoy = registros.filter(r => r.created_at && diaMx(r.created_at) === hoy);
      const recientes = registros.slice(0, 3).map(r =>
        `${r.accion}${r.usuario_nombre ? ` por ${r.usuario_nombre}` : ''}`
      ).join('; ');
      const items = registros.slice(0, 6).map(r => ({
        primario: r.accion || 'Movimiento',
        secundario: `${r.usuario_nombre || 'Sistema'} ${r.usuario_apellido || ''}`.trim(),
        terciario: r.created_at ? new Date(r.created_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
      }));
      return responder(
        h,
        `${deHoy.length === 0 ? 'Hoy no hay movimientos en la bitácora' : `Hoy hay ${deHoy.length} ${deHoy.length === 1 ? 'movimiento' : 'movimientos'} en la bitácora`}. Los más recientes: ${recientes}.`,
        buildImageList('Auditoría del sistema', items, 'Bitácora completa en Reportes y Auditoría'),
        'auditoriaToken'
      );
    } catch (e) {
      if (esError403(e)) return responder(h, 'Esa información es solo de dirección general.');
      console.error('Auditoria error:', e);
      return responder(h, 'No pude consultar la auditoría en este momento.');
    }
  },
};

module.exports = {
  KpisNegocioIntentHandler,
  ProductosTopIntentHandler,
  VentasSemanaIntentHandler,
  EquipoIntentHandler,
  ResumenMesIntentHandler,
  AuditoriaIntentHandler,
};
