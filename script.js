// manifest (inline) so the page is installable where the host allows it
try {
  const ic = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="#22261F"/><path d="M48 60h96M48 96h96M48 132h60" stroke="#EDEFEA" stroke-width="12"/></svg>');
  const m = {
    name: "Procurement log",
    short_name: "Procurement",
    display: "standalone",
    background_color: "#EDEFEA",
    theme_color: "#EDEFEA",
    start_url: ".",
    icons: [{ src: ic, sizes: "192x192", type: "image/svg+xml", purpose: "any" }]
  };
  const l = document.createElement("link");
  l.rel = "manifest";
  l.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: "application/manifest+json" }));
  document.head.appendChild(l);
} catch (e) {}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => Number(n).toLocaleString("en-MY", { maximumFractionDigits: 2 });

let orders = [], view = "dash", q = "", flt = "all", fType = "all", fSup = "all", fMonth = "all", sortDir = "desc", rng = 6, editId = null, db = null;

// IndexedDB layer (falls back to memory if unavailable)
const idb = {
  open() {
    return new Promise(res => {
      try {
        const r = indexedDB.open("procurement", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("orders", { keyPath: "id" });
        r.onsuccess = () => { db = r.result; res(); };
        r.onerror = () => res();
      } catch (e) {
        res();
      }
    });
  },
  all() {
    return new Promise(res => {
      if (!db) return res(null);
      try {
        const r = db.transaction("orders").objectStore("orders").getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) {
        res(null);
      }
    });
  },
  put(o) {
    if (!db) return;
    try {
      db.transaction("orders", "readwrite").objectStore("orders").put(o);
    } catch (e) {}
  },
  del(id) {
    if (!db) return;
    try {
      db.transaction("orders", "readwrite").objectStore("orders").delete(id);
    } catch (e) {}
  },
  clear() {
    if (!db) return;
    try {
      db.transaction("orders", "readwrite").objectStore("orders").clear();
    } catch (e) {}
  }
};

const toast = t => {
  const e = $("#toast");
  e.textContent = t;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 1800);
};

function ask(msg, ok = "Confirm") {
  return new Promise(res => {
    const d = $("#cfm");
    $("#cm").textContent = msg;
    $("#cy").textContent = ok;
    let v = false;
    $("#cy").onclick = () => { v = true; d.close(); };
    $("#cn").onclick = () => d.close();
    d.onclose = () => res(v);
    d.showModal();
  });
}

const IC = {
  arr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  can: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>'
};

const EMPTY = '<div class="empty">No orders yet.<br><br><button class="btn fill" data-demo>Load demo data</button><button class="btn" data-new>New order</button></div>';

const acts = o => `<button class="ib ok" data-arr="${o.id}" title="All arrived (${o.units}/${o.units})" aria-label="Mark all arrived">${IC.arr}</button><button class="ib stop" data-cmp="${o.id}" title="Complete order at ${o.got}/${o.units}" aria-label="Complete order at current arrived">${IC.cmp}</button><button class="ib no" data-can="${o.id}" title="Cancel order" aria-label="Cancel order">${IC.can}</button>`;

const loc = t => new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const today = () => loc(new Date());
const fd = d => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const mk = d => (d || "").slice(0, 7);
const ml = k => new Date(k + "-01T00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });

function stats(list = orders, incl = false) {
  const act = incl ? list : list.filter(o => o.status !== "cancelled");
  const p = act.filter(o => o.status === "pending");
  const a = act.filter(o => o.status === "arrived" || o.status === "completed");
  const sum = (l, k) => l.reduce((s, o) => s + Number(o[k]), 0);
  return { act, p, a, total: act.length, value: sum(act, "cost"), uP: sum(p, "units") - sum(p, "got"), uA: sum(act, "got") };
}

function statGrid(s) {
  return `<div class="stats">
    <div class="stat"><b class="mono">${s.total}</b><span>Incoming orders</span></div>
    <div class="stat"><b class="mono warn">${s.p.length}</b><span>Awaiting arrival</span></div>
    <div class="stat"><b class="mono ok">${s.a.length}</b><span>Fulfilled</span></div>
    <div class="stat"><b class="mono">${fmt(s.value)}</b><span>Total value, myr</span></div>
  </div>`;
}

function dash() {
  const s = stats(), tu = s.uA + s.uP, pct = tu ? Math.round(s.uA / tu * 100) : 0;
  const sup = {};
  
  s.p.forEach(o => {
    sup[o.supplier] ??= { n: 0, u: 0, c: 0 };
    sup[o.supplier].n++;
    sup[o.supplier].u += o.units - o.got;
    sup[o.supplier].c += +o.cost;
  });
  
  const supRows = Object.entries(sup)
    .sort((a, b) => b[1].c - a[1].c)
    .map(([k, v]) => `<div class="row"><span>${esc(k)}<small>${v.n} order${v.n > 1 ? "s" : ""} · ${v.u} units left</small></span><span class="mono">${fmt(v.c)}</span></div>`)
    .join("") || '<div class="empty">Nothing pending</div>';
    
  const up = s.p.slice()
    .sort((a, b) => (a.eta || "9").localeCompare(b.eta || "9"))
    .slice(0, 5)
    .map(o => {
      const late = o.eta && o.eta < today();
      return `<div class="row" data-id="${o.id}" style="cursor:pointer">
        <span><span class="mono">${esc(o.po)}</span> · ${esc(o.supplier)}
        <small class="${late ? "warn" : ""}"><span class="mono">${o.got}/${o.units}</span> arrived · ${o.eta ? (late ? "overdue " : "due ") + o.eta : "no date"}</small></span>
        <span class="r">${acts(o)}</span></div>`;
    }).join("") || '<div class="empty">No pending orders</div>';

  if (!orders.length) return statGrid(s) + EMPTY;

  return statGrid(s) + `
    <div class="sec">
      <h2>Arrival progress · units</h2>
      <div class="bar"><i style="width:${pct}%"></i><u></u></div>
      <div class="legend"><span class="ok mono">${s.uA} arrived (${pct}%)</span><span class="warn mono">${s.uP} still pending</span></div>
    </div>
    <div class="sec two">
      <div><h2>Pending by supplier</h2>${supRows}</div>
      <div><h2>Next to arrive</h2>${up}</div>
    </div>`;
}

function sups() {
  if (!orders.length) return EMPTY;
  
  const keys = [], now = new Date();
  for (let i = rng - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  
  const act = orders.filter(o => o.status !== "cancelled");
  const inR = act.filter(o => keys.includes(mk(o.date)));
  const tot = {};
  
  inR.forEach(o => tot[o.supplier] = (tot[o.supplier] || 0) + 1);
  
  const rank = Object.keys(tot).sort((a, b) => tot[b] - tot[a] || a.localeCompare(b)), top = rank.slice(0, 5);
  const col = n => { const i = top.indexOf(n); return `var(--c${i < 0 ? 6 : i + 1})`; };
  const sumv = m => Object.values(m).reduce((a, b) => a + b, 0);
  
  const by = keys.map(k => {
    const m = {};
    inR.filter(o => mk(o.date) === k).forEach(o => {
      const n = top.includes(o.supplier) ? o.supplier : "Others";
      m[n] = (m[n] || 0) + 1;
    });
    return m;
  });
  
  const mx = Math.max(1, ...by.map(sumv)), names = [...top, "Others"];
  
  const cols = keys.map((k, i) => {
    const m = by[i], t = sumv(m);
    return `<div class="col">
      <div class="bw">
        <div class="stack" style="height:${t / mx * 100}%">
          ${t ? `<span class="ct mono">${t}</span>` : ""}
          ${names.filter(n => m[n]).map(n => `<i style="flex:${m[n]};background:${col(n)}" title="${esc(n)}:${m[n]}"></i>`).join("")}
        </div>
      </div>
      <span class="cl">${new Date(k + "-01T00:00").toLocaleDateString("en-GB", { month: "short" })}</span>
    </div>`;
  }).join("");

  const leg = (rank.length ? [...top, ...(rank.length > 5 ? ["Others"] : [])] : []).map(n => {
    const c = n === "Others" ? rank.slice(5).reduce((a, x) => a + tot[x], 0) : tot[n];
    return `<div class="row">
      <span><i class="sw" style="background:${col(n)}"></i>${esc(n)}${n === top[0] ? ' <span class="tag arrived" style="width:auto;padding:2px 6px">most orders</span>' : ""}</span>
      <span class="mono">${c}</span>
    </div>`;
  }).join("") || '<div class="empty">No orders in this period</div>';
  
  const g = {};
  orders.forEach(o => {
    const x = g[o.supplier] ??= { name: o.supplier, n: 0, can: 0, pend: 0, units: 0, got: 0, val: 0, last: "", types: new Set() };
    if (o.status === "cancelled") { x.can++; return; }
    x.n++;
    x.units += o.units;
    x.got += o.got;
    x.val += o.cost;
    if (o.status === "pending") x.pend++;
    x.types.add(o.type);
    if ((o.date || "") > x.last) x.last = o.date;
  });
  
  const cards = Object.values(g).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map(x => {
    const pct = x.units ? Math.round(x.got / x.units * 100) : 0;
    return `<div class="card" data-sup="${esc(x.name)}">
      <div class="ch">
        <span class="av mono">${esc((x.name.trim()[0] || "?").toUpperCase())}</span>
        <div><b>${esc(x.name)}</b><small>${[...x.types].map(esc).join(" · ") || "—"}</small></div>
      </div>
      <div class="big"><b class="mono">${x.n}</b><span>orders made${x.can ? ` · ${x.can} cancelled` : ""}</span></div>
      <div class="bar"><i style="width:${pct}%"></i><u></u></div>
      <div class="legend"><span class="mono ok">${x.got}/${x.units} units</span><span class="mono">${pct}% arrived</span></div>
      <div class="row"><span>Pending orders</span><span class="mono ${x.pend ? "warn" : ""}">${x.pend}</span></div>
      <div class="row"><span>Total value, myr</span><span class="mono">${fmt(x.val)}</span></div>
      <div class="row"><span>Last order</span><span class="mono">${fd(x.last)}</span></div>
    </div>`;
  }).join("");

  return `
    <div class="sec">
      <div class="shead">
        <h2>Orders per month by supplier</h2>
        <select id="rng">
          ${[3, 6, 12].map(n => `<option value="${n}" ${n === rng ? "selected" : ""}>Last ${n} months</option>`).join("")}
        </select>
      </div>
      <div class="two">
        <div class="chart">${cols}</div>
        <div>${leg}</div>
      </div>
    </div>
    <div class="sec">
      <div class="shead">
        <h2>Supplier gallery</h2>
        <span class="sub">tap a card to view its orders</span>
      </div>
      <div class="gal">${cards}</div>
    </div>`;
}

function list() {
  const u = k => [...new Set(orders.map(o => o[k]).filter(Boolean))].sort();
  const types = u("type"), sups = u("supplier"), months = [...new Set(orders.map(o => mk(o.date)).filter(Boolean))].sort().reverse();
  
  if (fType !== "all" && !types.includes(fType)) fType = "all";
  if (fSup !== "all" && !sups.includes(fSup)) fSup = "all";
  if (fMonth !== "all" && !months.includes(fMonth)) fMonth = "all";
  
  const ful = o => o.status === "arrived" || o.status === "completed", dir = sortDir === "asc" ? 1 : -1;
  
  const rows = orders.filter(o => 
    (flt === "all" || (flt === "fulfilled" ? ful(o) : o.status === flt)) &&
    (fType === "all" || o.type === fType) &&
    (fSup === "all" || o.supplier === fSup) &&
    (fMonth === "all" || mk(o.date) === fMonth) &&
    (!q || (o.po + o.supplier + o.type + (o.note || "")).toLowerCase().includes(q))
  ).sort((a, b) => dir * ((a.date || "").localeCompare(b.date || "") || a.po.localeCompare(b.po, undefined, { numeric: true })));
  
  const opt = (arr, cur, all, lab = v => v) => `<option value="all">${all}</option>` + arr.map(v => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(lab(v))}</option>`).join("");
  const on = flt !== "all" || fType !== "all" || fSup !== "all" || fMonth !== "all" || q;

  return statGrid(stats(rows, flt === "cancelled")) + `
    <div class="tools">
      <input id="q" placeholder="Search order, type or supplier" value="${esc(q)}">
      <select id="flt">
        ${[["all", "All status"], ["pending", "Pending"], ["fulfilled", "Fulfilled"], ["cancelled", "Cancelled"]].map(([v, l]) => `<option value="${v}" ${v === flt ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <select id="ftype">${opt(types, fType, "All types")}</select>
      <select id="fsup">${opt(sups, fSup, "All suppliers")}</select>
      <select id="fmonth">${opt(months, fMonth, "All months", ml)}</select>
      <select id="fsort">
        <option value="desc" ${dir < 0 ? "selected" : ""}>Date: newest first</option>
        <option value="asc" ${dir > 0 ? "selected" : ""}>Date: oldest first</option>
      </select>
    </div>
    <div class="meta">
      <span>${rows.length} of ${orders.length} orders${on ? " · filtered" : ""}</span>
      ${on ? '<button class="btn" id="rst">Reset filters</button>' : ""}
    </div>
    <div class="head">
      <span>Order</span><span>Date</span><span>Type</span><span>Supplier</span>
      <span>Arrived</span><span>Cost</span><span>Status</span><span class="r">Actions</span>
    </div>` + 
    (rows.map(o => `
    <div class="o" data-id="${o.id}">
      <span class="mono">${esc(o.po)}</span>
      <span class="mono">${fd(o.date)}</span>
      <span>${esc(o.type)}</span>
      <span>${esc(o.supplier)}</span>
      <span class="mono">${o.got}/${o.units}</span>
      <span class="mono">${fmt(o.cost)}</span>
      <span><span class="tag ${o.status}">${o.status}</span></span>
      <span class="r">${o.status === "pending" ? acts(o) : ""}</span>
    </div>`).join("") || (orders.length ? '<div class="empty">No orders match</div>' : EMPTY));
}

function render() {
  const s = stats();
  $("#sub").textContent = `${s.total} orders · ${s.p.length} pending · offline copy`;
  $("#main").innerHTML = view === "dash" ? dash() : view === "sup" ? sups() : list();
  
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.v === view));
  
  const qi = $("#q");
  if (qi) {
    qi.oninput = e => {
      q = e.target.value.toLowerCase();
      const p = e.target.selectionStart;
      render();
      const n = $("#q");
      n.focus();
      n.setSelectionRange(p, p);
    };
  }
  
  for (const [id, set] of [
    ["flt", v => flt = v],
    ["ftype", v => fType = v],
    ["fsup", v => fSup = v],
    ["fmonth", v => fMonth = v],
    ["fsort", v => sortDir = v]
  ]) {
    if ($("#" + id)) $("#" + id).onchange = e => { set(e.target.value); render(); };
  }
  
  const r = $("#rst");
  if (r) {
    r.onclick = () => {
      q = ""; flt = fType = fSup = fMonth = "all"; render();
    };
  }
  
  const rg = $("#rng");
  if (rg) {
    rg.onchange = e => { rng = +e.target.value; render(); };
  }
}

function save(o) {
  const i = orders.findIndex(x => x.id === o.id);
  i < 0 ? orders.push(o) : orders[i] = o;
  idb.put(o);
}

function nextPo() {
  const n = orders.map(o => parseInt(String(o.po).replace(/\D/g, "")) || 0);
  return "po-" + (Math.max(1041, ...n) + 1);
}

function openForm(id) {
  editId = id;
  const o = orders.find(x => x.id === id), f = $("#frm");
  $("#dt").textContent = o ? "Edit order" : "New order";
  $("#del").hidden = !o;
  
  const v = o || { po: nextPo(), date: today(), supplier: "", type: "", units: "", got: 0, cost: "", status: "pending", eta: "", note: "" };
  $("#cmp").hidden = !(o && o.status === "pending");
  
  for (const k of ["po", "date", "supplier", "type", "units", "got", "cost", "status", "eta", "note"]) {
    f.elements[k].value = v[k] ?? "";
  }
  
  $("#dlg").showModal();
}

$("#new").onclick = () => openForm(null);
$("#cx").onclick = () => $("#dlg").close();

$("#frm").onsubmit = e => {
  e.preventDefault();
  const f = e.target.elements, id = editId || crypto.randomUUID();
  const units = +f.units.value;
  let st = f.status.value, got = Math.min(Math.max(0, +f.got.value || 0), units);
  
  if (st === "arrived") got = units;
  else if (st === "pending" && got >= units) st = "arrived";
  
  save({
    id,
    po: f.po.value.trim(),
    date: f.date.value || today(),
    supplier: f.supplier.value.trim(),
    type: f.type.value.trim() || "Other",
    units,
    got,
    cost: +f.cost.value,
    status: st,
    eta: f.eta.value,
    note: f.note.value.trim(),
    updated: Date.now()
  });
  
  render();
  $("#dlg").close();
  toast(editId ? "Order updated" : "Order added");
};

async function complete(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  
  if (o.got >= o.units) {
    o.status = "arrived";
  } else {
    if (!await ask(`Close ${o.po} at ${o.got}/${o.units}? The remaining ${o.units - o.got} units will no longer be expected.`, "Complete order")) return;
    o.status = "completed";
  }
  
  save(o);
  if ($("#dlg").open) $("#dlg").close();
  render();
  toast(o.po + " completed at " + o.got + "/" + o.units);
}

$("#cmp").onclick = () => complete(editId);

$("#del").onclick = async () => {
  if (await ask("Delete this order?", "Delete")) {
    orders = orders.filter(o => o.id !== editId);
    idb.del(editId);
    $("#dlg").close();
    render();
    toast("Order deleted");
  }
};

$("#exp").onclick = async () => {
  const csv = ["order,date,type,supplier,arrived,ordered,cost_myr,status,eta,note", ...orders.map(o => [o.po, o.date, o.type, o.supplier, o.got, o.units, o.cost, o.status, o.eta, o.note].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  try {
    await navigator.clipboard.writeText(csv);
    toast("CSV copied to clipboard");
  } catch (e) {
    toast("Clipboard blocked by browser");
  }
};

document.querySelectorAll(".tab").forEach(t => t.onclick = () => { view = t.dataset.v; render(); });

function demo() {
  const d = n => { const t = new Date(); t.setDate(t.getDate() + n); return loc(t); };
  let n = parseInt(nextPo().replace(/\D/g, ""));
  const L = [
    ["Nexus Trading", "Raw materials", 45, 1150, "pending", 20, 3, 4],
    ["Global Parts Co", "Raw materials", 300, 9400, "pending", 150, -2, 9],
    ["Bright Packaging", "Packaging", 500, 2750, "pending", 0, 7, 2],
    ["Orion Chemicals", "Raw materials", 80, 6400, "pending", 30, 5, 6],
    ["TechNova Systems", "Equipment", 6, 21600, "pending", 0, 14, 1],
    ["Sunrise Stationery", "Office", 200, 860, "pending", 120, -4, 11],
    ["Acme Supplies", "Office", 120, 3200, "arrived", 120, -5, 12],
    ["Kinabalu Steel Works", "Raw materials", 25, 15750, "pending", 10, 10, 15],
    ["GreenLeaf Cleaning", "Services", 12, 1800, "arrived", 12, -20, 26],
    ["Delta Equipment", "Equipment", 4, 18500, "completed", 3, -10, 30],
    ["Metro Office Mart", "Office", 60, 980, "cancelled", 0, -1, 40],
    ["Prime Logistics", "Services", 10, 2400, "arrived", 10, -8, 45],
    ["Orion Chemicals", "Raw materials", 100, 8000, "arrived", 100, -30, 52],
    ["Acme Supplies", "Office", 90, 2400, "completed", 70, -20, 55],
    ["Nexus Trading", "Raw materials", 70, 2100, "arrived", 70, -38, 58],
    ["Acme Supplies", "Office", 80, 2100, "arrived", 80, -40, 62],
    ["Nexus Trading", "Raw materials", 60, 1800, "arrived", 60, -55, 75],
    ["Kinabalu Steel Works", "Raw materials", 40, 25200, "arrived", 40, -60, 80],
    ["TechNova Systems", "Equipment", 3, 10800, "cancelled", 0, -70, 88],
    ["Global Parts Co", "Raw materials", 200, 6100, "arrived", 200, -70, 95],
    ["Prime Logistics", "Services", 8, 1900, "arrived", 8, -85, 100],
    ["Nexus Trading", "Raw materials", 30, 900, "arrived", 30, -100, 105],
    ["Bright Packaging", "Packaging", 350, 1950, "arrived", 350, -95, 110],
    ["Acme Supplies", "Office", 150, 3900, "arrived", 150, -95, 118],
    ["Global Parts Co", "Raw materials", 250, 7800, "arrived", 250, -110, 135],
    ["Bright Packaging", "Packaging", 400, 2200, "arrived", 400, -120, 150],
    ["Delta Equipment", "Equipment", 2, 9200, "arrived", 2, -130, 160],
    ["Sunrise Stationery", "Office", 300, 1290, "arrived", 300, -150, 170],
    ["GreenLeaf Cleaning", "Services", 6, 900, "completed", 5, -160, 178],
    ["Orion Chemicals", "Raw materials", 120, 9600, "arrived", 120, -170, 190],
    ["Metro Office Mart", "Office", 150, 2250, "arrived", 150, -200, 215],
    ["Kinabalu Steel Works", "Raw materials", 30, 18900, "arrived", 30, -230, 245],
    ["Global Parts Co", "Raw materials", 500, 15500, "arrived", 500, -250, 265],
    ["Acme Supplies", "Office", 60, 1600, "arrived", 60, -280, 290],
    ["Nexus Trading", "Raw materials", 90, 2700, "arrived", 90, -300, 310],
    ["TechNova Systems", "Equipment", 5, 17500, "arrived", 5, -320, 335]
  ];
  
  L.forEach(([supplier, type, units, cost, status, got, eta, ago]) => save({
    id: crypto.randomUUID(), po: "po-" + (n++), date: d(-ago), supplier, type, units, got, cost, status, eta: d(eta), note: "Demo data", updated: Date.now()
  }));
  
  render();
  toast(L.length + " demo orders added");
}

const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>';
const rootEl = document.documentElement;
const isDark = () => rootEl.dataset.theme ? rootEl.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;

function paintTheme() {
  const d = isDark();
  $("#th").innerHTML = d ? SUN : MOON;
  $("#th").title = d ? "Switch to light" : "Switch to dark";
  document.querySelector('meta[name="theme-color"]').content = d ? "#1A1D17" : "#EDEFEA";
}

$("#th").onclick = () => {
  const t = isDark() ? "light" : "dark";
  rootEl.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) {}
  paintTheme();
};

paintTheme();
$("#demo").onclick = demo;

$("#rs").onclick = async () => {
  if (!orders.length) {
    toast("Nothing to reset");
    return;
  }
  if (await ask(`Delete all ${orders.length} orders from this device? This cannot be undone.`, "Reset all")) {
    orders = []; q = ""; flt = fType = fSup = fMonth = "all";
    idb.clear();
    render();
    toast("All orders cleared");
  }
};

$("#main").onclick = async e => {
  if (e.target.closest("[data-demo]")) { demo(); return; }
  if (e.target.closest("[data-new]")) { openForm(null); return; }
  
  const sp = e.target.closest("[data-sup]");
  if (sp) {
    fSup = sp.dataset.sup; flt = fType = fMonth = "all"; q = ""; view = "list";
    render(); window.scrollTo(0, 0); return;
  }
  
  const a = e.target.closest("[data-arr]");
  if (a) {
    const o = orders.find(x => x.id === a.dataset.arr);
    o.status = "arrived"; o.got = o.units; save(o);
    render(); toast(o.po + " marked arrived"); return;
  }
  
  const c = e.target.closest("[data-cmp]");
  if (c) { complete(c.dataset.cmp); return; }
  
  const n = e.target.closest("[data-can]");
  if (n) {
    const o = orders.find(x => x.id === n.dataset.can);
    if (o && await ask(`Cancel ${o.po}? It will be excluded from totals.`, "Cancel order")) {
      o.status = "cancelled"; save(o); render(); toast(o.po + " cancelled");
    }
    return;
  }
  
  const r = e.target.closest("[data-id]");
  if (r) openForm(r.dataset.id);
};

(async () => {
  await idb.open();
  let d = await idb.all();
  orders = (d || []).map(o => {
    if (o.got == null || o.type == null || o.date == null) {
      o = {
        ...o,
        got: o.got ?? (o.status === "arrived" ? o.units : 0),
        type: o.type || "Other",
        date: o.date ?? loc(new Date(o.updated || Date.now()))
      };
      idb.put(o);
    }
    return o;
  });
  render();
  try {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http") && false) {
      navigator.serviceWorker.register("sw.js");
    }
  } catch (e) {}
})();
