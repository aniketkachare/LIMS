/* ============================================================
   LISM — Main JavaScript
   ============================================================ */

// ---- Date in Topbar ----
(function () {
  const el = document.getElementById('currentDate');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
})();

// ---- Sidebar Toggle (mobile) ----
(function () {
  const btn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  btn.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !btn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
})();

// ---- Alert auto-dismiss ----
document.querySelectorAll('.alert[data-auto-dismiss]').forEach(el => {
  setTimeout(() => el.style.opacity = '0', 3500);
  setTimeout(() => el.remove(), 3800);
  el.style.transition = 'opacity 300ms ease';
});

// ---- Autocomplete Helper ----
window.initAutocomplete = function ({ inputEl, dropdownEl, fetchFn, onSelect }) {
  let debounceTimer;
  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = inputEl.value.trim();
    if (q.length < 1) { dropdownEl.classList.remove('open'); return; }
    debounceTimer = setTimeout(async () => {
      const items = await fetchFn(q);
      dropdownEl.innerHTML = '';
      if (!items.length) { dropdownEl.classList.remove('open'); return; }
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.innerHTML = item.html;
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onSelect(item);
          dropdownEl.classList.remove('open');
        });
        dropdownEl.appendChild(div);
      });
      dropdownEl.classList.add('open');
    }, 250);
  });
  inputEl.addEventListener('blur', () => {
    setTimeout(() => dropdownEl.classList.remove('open'), 150);
  });
};

// ---- Modal helper ----
window.openModal = function (id) {
  document.getElementById(id)?.classList.add('open');
};
window.closeModal = function (id) {
  document.getElementById(id)?.classList.remove('open');
};
document.querySelectorAll('[data-modal-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.modal-backdrop')?.classList.remove('open');
  });
});
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });
});

// ---- Table search filter ----
window.initTableSearch = function (inputId, tableId) {
  const input = document.getElementById(inputId);
  const table = document.getElementById(tableId);
  if (!input || !table) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
};

// ---- Format currency (INR) ----
window.formatINR = function (val) {
  return '₹ ' + parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ---- Date input formatter (DD-MM-YYYY) ----
window.formatDateInput = function (input) {
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '');
    if (v.length > 2) v = v.slice(0, 2) + '-' + v.slice(2);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5, 9);
    this.value = v;
  });
};

// ---- Toast notifications ----
window.showToast = function (msg, type = 'info') {
  const container = document.getElementById('toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(c);
    return c;
  })();

  const colors = { success: '#16a34a', error: '#dc2626', info: '#2563eb', warning: '#d97706' };
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };

  const toast = document.createElement('div');
  toast.style.cssText = `
    display:flex;align-items:center;gap:10px;padding:12px 16px;
    background:#fff;border:1px solid #e2e8f0;border-left:3px solid ${colors[type]};
    border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.1);
    font-size:0.845rem;font-family:var(--font-sans,sans-serif);color:#334155;
    max-width:320px;animation:toastIn 200ms ease both;
  `;
  toast.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]};flex-shrink:0;"></i><span>${msg}</span>`;

  const style = document.createElement('style');
  style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 300ms'; }, 3000);
  setTimeout(() => toast.remove(), 3400);
};

// ---- Reusable Date Picker ----
window.initDatePicker = function(inputId, options) {
  var input = document.getElementById(inputId);
  if (!input) return;
  options = options || {};
  var pickerId = inputId + '_picker';
  var cal = document.createElement('div');
  cal.id  = pickerId;
  cal.style.cssText = 'display:none;position:absolute;z-index:9999;background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.12);width:290px;padding:14px;margin-top:4px;';
  cal.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><button type="button" onclick="window._dpPrev(\''+inputId+'\')" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:#64748b;padding:4px 8px;">&#8249;</button><div style="display:flex;align-items:center;gap:6px;"><select id="'+inputId+'_month" onchange="window._dpRender(\''+inputId+'\')" style="border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:0.8rem;cursor:pointer;outline:none;"><option value="0">January</option><option value="1">February</option><option value="2">March</option><option value="3">April</option><option value="4">May</option><option value="5">June</option><option value="6">July</option><option value="7">August</option><option value="8">September</option><option value="9">October</option><option value="10">November</option><option value="11">December</option></select><input type="number" id="'+inputId+'_year" onchange="window._dpRender(\''+inputId+'\')" oninput="window._dpRender(\''+inputId+'\')" min="1900" max="2100" style="border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:0.8rem;width:68px;outline:none;font-weight:700;"></div><button type="button" onclick="window._dpNext(\''+inputId+'\')" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:#64748b;padding:4px 8px;">&#8250;</button></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;" id="'+inputId+'_heads"></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;" id="'+inputId+'_days"></div><div style="margin-top:10px;display:flex;justify-content:space-between;"><button type="button" onclick="window._dpToday(\''+inputId+'\')" style="font-size:0.75rem;color:#2563eb;background:none;border:none;cursor:pointer;font-weight:600;">Today</button><button type="button" onclick="window._dpClear(\''+inputId+'\')" style="font-size:0.75rem;color:#94a3b8;background:none;border:none;cursor:pointer;">Clear</button></div>';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(cal);
  input.style.paddingRight = '32px';
  input.style.cursor = 'pointer';
  input.readOnly = true;
  var icon = document.createElement('i');
  icon.className = 'fas fa-calendar-alt';
  icon.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none;font-size:0.85rem;';
  input.parentNode.appendChild(icon);
  var heads = document.getElementById(inputId + '_heads');
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(function(d) {
    var div = document.createElement('div');
    div.style.cssText = 'text-align:center;font-size:0.65rem;font-weight:700;color:#94a3b8;padding:3px 0;';
    div.textContent = d;
    heads.appendChild(div);
  });
  var now = new Date();
  window['_dpState_'+inputId] = { year: now.getFullYear(), month: now.getMonth(), selected: null, options: options };
  input.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = cal.style.display !== 'none';
    document.querySelectorAll('[id$="_picker"]').forEach(function(c){ c.style.display='none'; });
    if (!isOpen) {
      var s = window['_dpState_'+inputId];
      document.getElementById(inputId+'_month').value = s.month;
      document.getElementById(inputId+'_year').value  = s.year;
      window._dpRender(inputId);
      cal.style.display = 'block';
    }
  });
  document.addEventListener('click', function(e) {
    if (!cal.contains(e.target) && e.target !== input) cal.style.display = 'none';
  });
};

window._dpRender = function(inputId) {
  var s = window['_dpState_'+inputId];
  if (!s) return;
  s.month = parseInt(document.getElementById(inputId+'_month').value);
  var yr = parseInt(document.getElementById(inputId+'_year').value);
  if (!isNaN(yr) && yr>=1900 && yr<=2100) s.year = yr;
  var firstDay = new Date(s.year,s.month,1).getDay();
  var dim = new Date(s.year,s.month+1,0).getDate();
  var today = new Date();
  var daysEl = document.getElementById(inputId+'_days');
  daysEl.innerHTML = '';
  for (var i=0;i<firstDay;i++) daysEl.appendChild(document.createElement('div'));
  for (var d=1;d<=dim;d++) {
    var isToday=(d===today.getDate()&&s.month===today.getMonth()&&s.year===today.getFullYear());
    var isSel=s.selected&&(d===s.selected.d&&s.month===s.selected.m&&s.year===s.selected.y);
    var div=document.createElement('div');
    div.textContent=d;
    div.style.cssText='text-align:center;padding:6px 2px;border-radius:6px;font-size:0.8rem;cursor:pointer;'+(isSel?'background:#2563eb;color:white;font-weight:700;':isToday?'background:#eff6ff;color:#1d4ed8;font-weight:700;':'color:#334155;');
    div.onmouseover=function(){if(!this.style.background||this.style.background==='rgba(0, 0, 0, 0)')this.style.background='#f1f5f9';};
    div.onmouseout=function(){window._dpRender(inputId);};
    (function(day){div.onclick=function(){window._dpSelect(inputId,day);};})(d);
    daysEl.appendChild(div);
  }
};

window._dpSelect = function(inputId,d) {
  var s=window['_dpState_'+inputId];
  s.selected={d:d,m:s.month,y:s.year};
  var dd=String(d).padStart(2,'0'),mm=String(s.month+1).padStart(2,'0');
  var formatted=dd+'-'+mm+'-'+s.year;
  document.getElementById(inputId).value=formatted;
  document.getElementById(inputId+'_picker').style.display='none';
  window._dpRender(inputId);
  if(s.options.onSelect) s.options.onSelect(dd,mm,s.year,formatted);
};

window._dpPrev = function(inputId) {
  var s=window['_dpState_'+inputId];
  s.month--; if(s.month<0){s.month=11;s.year--;}
  document.getElementById(inputId+'_month').value=s.month;
  document.getElementById(inputId+'_year').value=s.year;
  window._dpRender(inputId);
};

window._dpNext = function(inputId) {
  var s=window['_dpState_'+inputId];
  s.month++; if(s.month>11){s.month=0;s.year++;}
  document.getElementById(inputId+'_month').value=s.month;
  document.getElementById(inputId+'_year').value=s.year;
  window._dpRender(inputId);
};

window._dpToday = function(inputId) {
  var t=new Date(),s=window['_dpState_'+inputId];
  s.year=t.getFullYear();s.month=t.getMonth();
  document.getElementById(inputId+'_month').value=s.month;
  document.getElementById(inputId+'_year').value=s.year;
  window._dpSelect(inputId,t.getDate());
};

window._dpClear = function(inputId) {
  var s=window['_dpState_'+inputId];
  s.selected=null;
  document.getElementById(inputId).value='';
  document.getElementById(inputId+'_picker').style.display='none';
  if(s.options.onClear) s.options.onClear();
};