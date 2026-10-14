// Conciliación bancaria: se carga el extracto del banco (CSV o ZIP), el
// sistema contabiliza solo los gastos financieros (4x1000, comisiones, IVA de
// comisiones, intereses) y cruza cada movimiento con los recibos, ventas de
// contado y egresos registrados contra la cuenta. Lo que no cruza se resuelve
// aquí: cruzar con un documento, cobrar una factura, pagar una compra o
// contabilizar contra otra cuenta.
import { api, catalogo } from '../api.js';
import { html, esc, cop, dia, toast, opciones, tabla, badge, descargarExcel } from '../ui.js';

const ESTADOS = { pendiente: ['Pendiente', 'warn'], conciliado: ['Conciliado', 'ok'], contabilizado: ['Contabilizado', 'ok'] };
const ORIGEN = {
  recibo_caja: 'Recibo de caja', pago_proveedor: 'Egreso', nomina: 'Nómina', manual: 'Asiento manual',
  factura_venta: 'Factura', compra: 'Compra', traslado: 'Traslado', nota_credito: 'Nota crédito',
};

const leerBase64 = (archivo) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => mal(new Error('No se pudo leer el archivo'));
  r.readAsDataURL(archivo);
});

export async function vistaBancos(root) {
  const [empresas, cuentasTodas, clientes, proveedores] = await Promise.all([
    catalogo('empresas'), api('/cuentas-pago'), catalogo('clientes'), catalogo('proveedores'),
  ]);
  const bancos = cuentasTodas.filter((c) => c.tipo === 'banco');
  const nombreEmpresa = (id) => empresas.find((e) => e.id === id)?.nombre || '';
  let guardada = null;
  try { guardada = localStorage.getItem('banco_actual'); } catch { /* sin storage */ }

  root.innerHTML = html`
    <div class="page-head">
      <h1>Conciliación bancaria</h1>
      <span class="hint">Carga el extracto del banco (CSV o el ZIP que descargas de la sucursal virtual). El 4x1000, las comisiones, el IVA de comisiones y los intereses se contabilizan solos, y cada pago o consignación se cruza con los recibos, ventas de contado y egresos registrados.</span>
    </div>
    ${bancos.length ? '' : '<div class="card"><p class="error">No hay cuentas bancarias creadas. Créalas en <a href="#configuracion">Configuración → Cajas y cuentas bancarias</a> (con el número de la cuenta) y vuelve aquí.</p></div>'}
    <div class="grid">
      <div class="card">
        <h2>Cargar extracto</h2>
        <form id="form-extracto">
          <label><span>Cuenta bancaria</span>
            <select id="b-cuenta" required>${opciones(bancos, { grupo: (c) => nombreEmpresa(c.empresa_id), texto: (c) => `${c.nombre}${c.numero ? ` · ${c.numero}` : ''}`, seleccionado: guardada })}</select></label>
          <label><span>Archivo del extracto (.csv o .zip)</span><input type="file" id="b-archivo" accept=".csv,.zip,.txt" required /></label>
          <label><span>Saldo final según el extracto (opcional)</span><input type="number" step="0.01" id="b-saldo" placeholder="Para comprobar la diferencia" /></label>
          <button type="submit" class="btn-primary">Cargar y conciliar</button>
        </form>
        <div id="b-resultado"></div>
      </div>
      <div class="card">
        <h2>Periodo</h2>
        <div class="row">
          <label><span>Desde</span><input type="date" id="b-desde" /></label>
          <label><span>Hasta</span><input type="date" id="b-hasta" /></label>
        </div>
        <div class="row" style="gap:8px">
          <button type="button" class="btn-secondary" id="b-ver">Ver conciliación</button>
          <button type="button" class="btn-secondary" id="b-reconciliar">Volver a conciliar</button>
          <button type="button" class="btn-secondary" id="b-excel">Exportar a Excel</button>
        </div>
        <div id="b-extractos" style="margin-top:12px"></div>
      </div>
    </div>
    <div class="card" id="b-informe"><p class="muted">Elige la cuenta bancaria.</p></div>`;

  const q = (s) => root.querySelector(s);
  let datos = null;
  let filtro = 'pendiente';

  async function cargarExtractos() {
    if (!q('#b-cuenta').value) return;
    const ex = await api(`/bancos/extractos?cuenta_pago_id=${q('#b-cuenta').value}`);
    q('#b-extractos').innerHTML = ex.length ? tabla({
      columnas: [
        { titulo: 'Extracto', render: (x) => `${esc(dia(String(x.desde).slice(0, 10)))} a ${esc(dia(String(x.hasta).slice(0, 10)))}` },
        { titulo: 'Movs.', num: true, render: (x) => `${x.movimientos}${x.nuevos < x.movimientos ? ` <span class="muted">(${x.nuevos} nuevos)</span>` : ''}` },
        { titulo: 'Pendientes', num: true, render: (x) => (x.pendientes ? badge(String(x.pendientes), 'warn') : badge('0', 'ok')) },
        { titulo: '', render: (x) => `<button type="button" class="btn-link" data-borrar-extracto="${x.id}">Borrar</button>` },
      ],
      filas: ex,
    }) : '<p class="muted">Todavía no has cargado extractos de esta cuenta.</p>';
  }

  async function cargar() {
    const cuenta = q('#b-cuenta').value;
    if (!cuenta) return;
    try { localStorage.setItem('banco_actual', cuenta); } catch { /* sin storage */ }
    const p = new URLSearchParams({ cuenta_pago_id: cuenta });
    if (q('#b-desde').value) p.set('desde', q('#b-desde').value);
    if (q('#b-hasta').value) p.set('hasta', q('#b-hasta').value);
    datos = await api(`/bancos/conciliacion?${p}`);
    q('#b-desde').value = datos.desde; q('#b-hasta').value = datos.hasta;
    pintar();
  }

  function detalle(m) {
    if (m.estado === 'conciliado') {
      return `${esc(ORIGEN[m.libro_origen] || m.libro_origen)} <span class="mono">${esc(m.libro_documento || '')}</span>${m.automatico ? ' <span class="muted">· automático</span>' : ''}${m.nota ? `<br><span class="muted">${esc(m.nota)}</span>` : ''}`;
    }
    if (m.estado === 'contabilizado') {
      return `<span class="mono">${esc(m.contrapartida)}</span> ${esc(m.contrapartida_nombre || '')}${m.automatico ? ' <span class="muted">· automático</span>' : ''}${m.nota ? `<br><span class="muted">${esc(m.nota)}</span>` : ''}`;
    }
    return '<span class="muted">Sin documento en los libros</span>';
  }

  function pintar() {
    const r = datos.resumen;
    const movs = datos.movimientos.filter((m) => filtro === 'todos' || m.estado === filtro);
    q('#b-informe').innerHTML = html`
      <h2>${esc(datos.cuenta.nombre)} · ${esc(dia(datos.desde))} a ${esc(dia(datos.hasta))}</h2>
      <div class="kpis">
        <div><span>Movimientos del banco</span><b>${r.movimientos}</b></div>
        <div><span>Conciliados con documentos</span><b>${r.conciliados}</b></div>
        <div><span>Contabilizados desde el extracto</span><b>${r.contabilizados}</b></div>
        <div><span>Pendientes</span><b style="color:${r.pendientes ? 'var(--warn, #b45309)' : 'inherit'}">${r.pendientes}</b></div>
        <div><span>Entradas al banco</span><b>${cop(r.ingresos_banco)}</b></div>
        <div><span>Salidas del banco</span><b>${cop(-r.egresos_banco)}</b></div>
        <div><span>Gastos financieros contabilizados</span><b>${cop(-r.gastos_financieros)}</b></div>
        <div><span>Intereses recibidos</span><b>${cop(r.ingresos_financieros)}</b></div>
      </div>
      <table class="informe" style="max-width:640px">
        <tr><td>Saldo en libros (cuenta ${esc(datos.cuenta.cuenta_contable)}) al ${esc(dia(datos.hasta))}</td><td class="v">${cop(r.saldo_libros)}</td></tr>
        <tr><td>+ Movimientos del banco que no están en los libros (pendientes)</td><td class="v">${cop(r.pendientes_banco)}</td></tr>
        <tr><td>− Movimientos de los libros que no están en el banco</td><td class="v">${cop(r.pendientes_libros)}</td></tr>
        <tr class="tot"><td>= Saldo que debe mostrar el extracto</td><td class="v">${cop(r.saldo_extracto_calculado)}</td></tr>
        ${r.saldo_extracto != null ? `<tr><td>Saldo final según el extracto</td><td class="v">${cop(r.saldo_extracto)}</td></tr>
        <tr class="tot"><td>Diferencia</td><td class="v${Math.abs(r.diferencia) > 0.5 ? ' neg' : ''}">${cop(r.diferencia)}</td></tr>` : ''}
      </table>
      <p class="muted">Mientras queden pendientes, el saldo en libros no coincide con el banco. Resuélvelos abajo: cada uno queda cruzado con un documento o contabilizado.</p>
      <div class="tabs" id="b-filtros">
        ${[['pendiente', `Pendientes (${r.pendientes})`], ['conciliado', `Conciliados (${r.conciliados})`], ['contabilizado', `Contabilizados (${r.contabilizados})`], ['todos', 'Todos']]
          .map(([k, t]) => `<button type="button" data-filtro="${k}" class="${filtro === k ? 'active' : ''}">${t}</button>`).join('')}
      </div>
      ${filtro === 'pendiente' && r.pendientes ? `<div class="row" id="b-lote" style="align-items:end;gap:8px;margin-bottom:8px">
        <label class="chk" style="align-self:center"><input type="checkbox" id="b-todos" /> Seleccionar todos</label>
        <label><span>Con los seleccionados de entrada: contabilizar contra</span><select id="b-lote-in">${datos.contrapartidas.ingreso.map((c) => `<option value="${c.cuenta}">${esc(c.nombre)} (${c.cuenta})</option>`).join('')}</select></label>
        <label><span>Con los seleccionados de salida</span><select id="b-lote-out">${datos.contrapartidas.egreso.map((c) => `<option value="${c.cuenta}">${esc(c.nombre)} (${c.cuenta})</option>`).join('')}</select></label>
        <label><span>Nota</span><input id="b-lote-nota" placeholder="Opcional" /></label>
        <button type="button" class="btn-secondary" id="b-lote-ok">Contabilizar seleccionados</button>
      </div>` : ''}
      ${tabla({
        columnas: [
          ...(filtro === 'pendiente' ? [{ titulo: '', render: (m) => `<input type="checkbox" data-sel="${m.id}" data-signo="${m.valor > 0 ? 1 : -1}" style="width:auto" />` }] : []),
          { titulo: 'Fecha', render: (m) => esc(dia(m.fecha)) },
          { titulo: 'Descripción del banco', render: (m) => `${esc(m.descripcion)}${m.codigo ? ` <span class="muted">(${esc(m.codigo)})</span>` : ''}` },
          { titulo: 'Valor', num: true, render: (m) => `<span class="${m.valor < 0 ? 'neg' : ''}">${cop(m.valor)}</span>` },
          { titulo: 'Estado', render: (m) => badge(...ESTADOS[m.estado]) },
          { titulo: 'Detalle', render: detalle },
          { titulo: '', render: (m) => (m.estado === 'pendiente' ? `<button type="button" class="btn-link" data-resolver="${m.id}">Resolver</button>` : `<button type="button" class="btn-link" data-deshacer="${m.id}">Deshacer</button>`) },
        ],
        filas: movs,
        filaAttrs: (m) => `id="mov-${m.id}"`,
        vacio: filtro === 'pendiente' ? '¡Todo conciliado! No hay movimientos pendientes.' : 'No hay movimientos.',
      })}
      <h2 style="margin-top:18px">En los libros y no en el banco</h2>
      <p class="muted" style="margin-top:0">Recibos, egresos u otros documentos registrados contra esta cuenta en el periodo que el banco todavía no muestra (o que se registraron en la cuenta equivocada).</p>
      ${tabla({
        columnas: [
          { titulo: 'Fecha', render: (l) => esc(dia(l.fecha)) },
          { titulo: 'Documento', render: (l) => `${esc(ORIGEN[l.origen] || l.origen)} <span class="mono">${esc(l.documento || '')}</span>` },
          { titulo: 'Descripción', render: (l) => esc(l.descripcion || '') },
          { titulo: 'Valor', num: true, render: (l) => cop(l.valor) },
        ],
        filas: datos.libros_pendientes,
        vacio: 'Nada: todo lo registrado en los libros aparece en el banco.',
      })}`;
  }

  // ------------------------------------------------------------ resolver
  async function resolver(id) {
    const tr = q(`#mov-${id}`);
    const sig = tr.nextElementSibling;
    if (sig?.classList.contains('resolver')) { sig.remove(); return; }
    const s = await api(`/bancos/movimientos/${id}/sugerencias`);
    const m = s.movimiento;
    const entra = m.valor > 0;
    const terceros = entra ? clientes : proveedores;
    const fila = document.createElement('tr');
    fila.className = 'resolver';
    fila.innerHTML = `<td colspan="${tr.children.length}"><div class="pago-box" style="display:grid;gap:12px">
      <div><b>1. Cruzar con un documento ya registrado</b>
        ${s.libros.length ? `<div class="table-wrap"><table><tbody>${s.libros.map((l) => `<tr>
          <td>${esc(dia(l.fecha))}</td><td>${esc(ORIGEN[l.origen] || l.origen)} <span class="mono">${esc(l.documento || '')}</span> <span class="muted">${esc(l.descripcion || '')}</span></td>
          <td class="num">${cop(l.valor)}${l.diferencia ? ` <span class="muted">(dif. ${cop(l.diferencia)})</span>` : ''}</td>
          <td><button type="button" class="btn-secondary" data-cruzar="${esc(l.origen)}|${esc(l.origen_id)}">Cruzar</button></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="muted" style="margin:4px 0">No hay documentos sin conciliar que muevan esta cuenta en ese sentido.</p>'}
      </div>
      <div><b>2. ${entra ? 'Es el pago de una factura de venta: registrar el recibo de caja' : 'Es el pago de una compra o gasto: registrar el egreso'}</b>
        ${s.documentos.length ? `<div class="table-wrap"><table><tbody>${s.documentos.map((d) => `<tr>
          <td>${esc(dia(String(d.fecha).slice(0, 10)))}</td><td><span class="mono">${esc(d.numero || '')}</span> · ${esc(d.tercero || '')}</td>
          <td class="num">saldo ${cop(d.saldo)}</td>
          <td><button type="button" class="btn-secondary" data-documento="${d.id}" data-tercero="${d.tercero_id || ''}" data-saldo="${d.saldo}">${entra ? 'Cobrar' : 'Pagar'}</button></td></tr>`).join('')}</tbody></table></div>`
          : `<p class="muted" style="margin:4px 0">No hay ${entra ? 'facturas' : 'compras'} con saldo pendiente.</p>`}
      </div>
      <div><b>3. No tiene documento: contabilizar contra</b>
        <div class="row" style="align-items:end">
          <label><span>Contrapartida</span><select data-k="cuenta">${s.contrapartidas.map((c) => `<option value="${c.cuenta}" data-tercero="${c.tercero ? 1 : ''}">${esc(c.nombre)} (${c.cuenta})</option>`).join('')}</select></label>
          <label><span>Tercero</span><select data-k="tercero">${opciones(terceros, { vacio: '— el banco —' })}</select></label>
          <label><span>Nota</span><input data-k="nota" placeholder="Opcional" /></label>
          <button type="button" class="btn-primary" data-contabilizar>Contabilizar</button>
        </div>
      </div></div></td>`;
    tr.after(fila);

    fila.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      b.disabled = true;
      try {
        if (b.dataset.cruzar) {
          const [origen, origen_id] = b.dataset.cruzar.split('|');
          await api(`/bancos/movimientos/${id}/conciliar`, { method: 'POST', body: { origen, origen_id } });
          toast('Movimiento conciliado', 'ok');
        } else if (b.dataset.documento) {
          const valor = Math.min(Math.abs(m.valor), Number(b.dataset.saldo));
          const comun = { empresa_id: m.empresa_id, tercero_id: b.dataset.tercero || null, fecha: m.fecha, medio_pago: 'transferencia', cuenta_pago_id: m.cuenta_pago_id, referencia: m.descripcion.slice(0, 60), notas: 'Registrado desde la conciliación bancaria' };
          const r = entra
            ? await api('/cartera/recibos', { method: 'POST', body: { ...comun, aplicaciones: [{ factura_venta_id: b.dataset.documento, valor }] } })
            : await api('/cartera/pagos', { method: 'POST', body: { ...comun, aplicaciones: [{ compra_id: b.dataset.documento, valor }] } });
          await api(`/bancos/movimientos/${id}/conciliar`, { method: 'POST', body: { origen: entra ? 'recibo_caja' : 'pago_proveedor', origen_id: r.id } });
          toast(`${entra ? 'Recibo de caja' : 'Comprobante de egreso'} ${r.consecutivo} registrado y conciliado${valor < Math.abs(m.valor) ? ` (el saldo era ${cop(valor)}; queda una diferencia)` : ''}`, 'ok');
        } else if (b.hasAttribute('data-contabilizar')) {
          const val = (k) => fila.querySelector(`[data-k=${k}]`).value;
          await api(`/bancos/movimientos/${id}/contabilizar`, { method: 'POST', body: { cuenta: val('cuenta'), tercero_id: val('tercero') || null, nota: val('nota') || null } });
          toast('Movimiento contabilizado', 'ok');
        } else { b.disabled = false; return; }
        await cargar();
      } catch (err) {
        toast(err.message, 'error');
        b.disabled = false;
      }
    });
  }

  // ------------------------------------------------------------ eventos
  q('#form-extracto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const archivo = q('#b-archivo').files[0];
    if (!archivo) return toast('Elige el archivo del extracto', 'error');
    btn.disabled = true;
    try {
      const r = await api('/bancos/extractos', { method: 'POST', body: { cuenta_pago_id: q('#b-cuenta').value, archivo: archivo.name, contenido_base64: await leerBase64(archivo), saldo_final: q('#b-saldo').value } });
      q('#b-resultado').innerHTML = `<p class="ok" style="margin:10px 0 0">Extracto del ${esc(dia(r.desde))} al ${esc(dia(r.hasta))}: ${r.movimientos} movimientos${r.repetidos ? ` (${r.repetidos} ya estaban cargados)` : ''}.
        ${r.contabilizados} gastos/ingresos financieros contabilizados, ${r.conciliados} conciliados con documentos, ${r.pendientes} pendientes.</p>`;
      q('#form-extracto').reset();
      q('#b-desde').value = r.desde; q('#b-hasta').value = r.hasta;
      filtro = 'pendiente';
      await Promise.all([cargar(), cargarExtractos()]);
    } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
  });
  q('#b-cuenta').addEventListener('change', () => { q('#b-desde').value = ''; q('#b-hasta').value = ''; cargar().catch((err) => toast(err.message, 'error')); cargarExtractos(); });
  q('#b-ver').addEventListener('click', () => cargar().catch((err) => toast(err.message, 'error')));
  q('#b-reconciliar').addEventListener('click', async () => {
    try {
      const r = await api('/bancos/conciliar', { method: 'POST', body: { cuenta_pago_id: q('#b-cuenta').value } });
      toast(`${r.conciliados} conciliados y ${r.contabilizados} contabilizados en esta pasada; ${r.pendientes} pendientes`, 'ok');
      await cargar();
    } catch (err) { toast(err.message, 'error'); }
  });
  q('#b-excel').addEventListener('click', () => {
    if (!datos) return;
    const filas = [
      ...datos.movimientos.map((m) => ({ ...m, origen: 'Banco', est: ESTADOS[m.estado][0], det: m.estado === 'conciliado' ? `${ORIGEN[m.libro_origen] || m.libro_origen} ${m.libro_documento || ''}` : (m.contrapartida ? `${m.contrapartida} ${m.contrapartida_nombre || ''}` : '') })),
      ...datos.libros_pendientes.map((l) => ({ fecha: l.fecha, descripcion: `${ORIGEN[l.origen] || l.origen} ${l.documento || ''} ${l.descripcion || ''}`, valor: l.valor, origen: 'Libros', est: 'En libros, no en el banco', det: '' })),
    ];
    descargarExcel({
      nombreArchivo: `Conciliación ${datos.cuenta.nombre} ${datos.desde} a ${datos.hasta}.xlsx`, hoja: 'Conciliación',
      columnas: [
        { titulo: 'Fecha', campo: 'fecha', ancho: 11 }, { titulo: 'Origen', campo: 'origen', ancho: 8 }, { titulo: 'Descripción', campo: 'descripcion', ancho: 40 },
        { titulo: 'Código', campo: 'codigo', ancho: 7 }, { titulo: 'Valor', valor: (f) => Number(f.valor), ancho: 14 }, { titulo: 'Estado', campo: 'est', ancho: 22 }, { titulo: 'Documento / cuenta', campo: 'det', ancho: 36 },
      ],
      filas,
    });
  });
  q('#b-informe').addEventListener('change', (ev) => {
    if (ev.target.id === 'b-todos') root.querySelectorAll('[data-sel]').forEach((c) => { c.checked = ev.target.checked; });
  });
  q('#b-informe').addEventListener('click', async (ev) => {
    if (ev.target.id === 'b-lote-ok') {
      const sel = [...root.querySelectorAll('[data-sel]:checked')];
      if (!sel.length) return toast('Marca los movimientos que quieres contabilizar', 'error');
      ev.target.disabled = true;
      let hechos = 0;
      try {
        for (const c of sel) {
          const cuenta = c.dataset.signo === '1' ? q('#b-lote-in').value : q('#b-lote-out').value;
          await api(`/bancos/movimientos/${c.dataset.sel}/contabilizar`, { method: 'POST', body: { cuenta, nota: q('#b-lote-nota').value || null } });
          hechos++;
        }
        toast(`${hechos} movimientos contabilizados`, 'ok');
      } catch (err) { toast(`${hechos} contabilizados; luego falló: ${err.message}`, 'error'); }
      await cargar();
      return;
    }
    const f = ev.target.closest('[data-filtro]');
    const r = ev.target.closest('[data-resolver]');
    const d = ev.target.closest('[data-deshacer]');
    if (f) { filtro = f.dataset.filtro; pintar(); }
    if (r) resolver(r.dataset.resolver).catch((err) => toast(err.message, 'error'));
    if (d) {
      try {
        await api(`/bancos/movimientos/${d.dataset.deshacer}/deshacer`, { method: 'POST' });
        toast('El movimiento volvió a pendiente', 'ok');
        await cargar();
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  q('#b-extractos').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-borrar-extracto]');
    if (!b) return;
    if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Clic otra vez'; return; }
    try {
      await api(`/bancos/extractos/${b.dataset.borrarExtracto}`, { method: 'DELETE' });
      toast('Extracto borrado', 'ok');
      await Promise.all([cargar(), cargarExtractos()]);
    } catch (err) { toast(err.message, 'error'); }
  });

  if (bancos.length) await Promise.all([cargar(), cargarExtractos()]);
}
