/* labs-tools.js — 360labs · calculateurs (valorisation, multiple, revente/ROI, éligibilité) */
(function () {
  function fmtEUR(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; }
  function val(el, d) { var v = parseFloat(el && el.value); return isNaN(v) ? d : v; }
  function sel(el) { return el ? el.value : ''; }

  /* 1 — Estimateur de valorisation */
  function initValuation() {
    var root = document.querySelector('[data-valuation]');
    if (!root || root.getAttribute('data-init')) return; root.setAttribute('data-init', '1');
    var rev = root.querySelector('#valRev'), margin = root.querySelector('#valMargin'), marginOut = root.querySelector('#valMarginOut');
    var growth = root.querySelector('#valGrowth'), age = root.querySelector('#valAge');
    var low = root.querySelector('#valLow'), high = root.querySelector('#valHigh'), profitEl = root.querySelector('#valProfit'), multEl = root.querySelector('#valMult');
    if (!rev) return;
    function compute() {
      var m = val(margin, 20); if (marginOut) marginOut.textContent = Math.round(m) + ' %';
      var profit = val(rev, 0) * 12 * (m / 100);
      var g = sel(growth), mult = g === 'fast' ? 3.6 : (g === 'stable' ? 2.4 : 3.0);
      var a = sel(age); mult += a === 'old' ? 0.3 : (a === 'new' ? -0.3 : 0);
      if (m >= 25) mult += 0.3; else if (m < 12) mult -= 0.3;
      mult = Math.max(1.8, Math.min(5, mult));
      low.textContent = fmtEUR(Math.max(0, profit * (mult - 0.5)));
      high.textContent = fmtEUR(profit * (mult + 0.5));
      if (profitEl) profitEl.textContent = fmtEUR(profit);
      if (multEl) multEl.textContent = '×' + (mult - 0.5).toFixed(1) + ' – ×' + (mult + 0.5).toFixed(1);
    }
    [rev, margin, growth, age].forEach(function (e) { if (e) { e.addEventListener('input', compute); e.addEventListener('change', compute); } });
    compute();
  }

  /* 2 — Calculateur de multiple (EBITDA/SDE) */
  function initMultiple() {
    var root = document.querySelector('[data-multiple]');
    if (!root || root.getAttribute('data-init')) return; root.setAttribute('data-init', '1');
    var profit = root.querySelector('#mProfit'), gr = root.querySelector('#mGrowth'), ch = root.querySelector('#mChannels'), fo = root.querySelector('#mFounder'), re = root.querySelector('#mRecurring');
    var multEl = root.querySelector('#mMult'), valEl = root.querySelector('#mVal'), rangeEl = root.querySelector('#mRange');
    if (!profit) return;
    function compute() {
      var mult = 3.0;
      var g = sel(gr); mult += g === 'fast' ? 1.0 : g === 'up' ? 0.4 : g === 'decline' ? -1.0 : -0.3;
      var c = sel(ch); mult += c === 'diversified' ? 0.5 : c === 'multi' ? 0.2 : -0.4;
      var f = sel(fo); mult += f === 'low' ? 0.4 : f === 'high' ? -0.6 : 0;
      var r = sel(re); mult += r === 'high' ? 0.7 : r === 'some' ? 0.3 : 0;
      mult = Math.max(1.5, Math.min(6, mult));
      var p = val(profit, 0);
      if (multEl) multEl.textContent = '×' + mult.toFixed(1);
      if (valEl) valEl.textContent = fmtEUR(p * mult);
      if (rangeEl) rangeEl.textContent = fmtEUR(p * (mult - 0.4)) + ' – ' + fmtEUR(p * (mult + 0.4));
    }
    [profit, gr, ch, fo, re].forEach(function (e) { if (e) { e.addEventListener('input', compute); e.addEventListener('change', compute); } });
    compute();
  }

  /* 3 — Simulateur de revente / ROI */
  function initResale() {
    var root = document.querySelector('[data-resale]');
    if (!root || root.getAttribute('data-init')) return; root.setAttribute('data-init', '1');
    var price = root.querySelector('#rPrice'), profit = root.querySelector('#rProfit'), gro = root.querySelector('#rGrowth'), groOut = root.querySelector('#rGrowthOut'),
      months = root.querySelector('#rMonths'), monthsOut = root.querySelector('#rMonthsOut'), mult = root.querySelector('#rMult'), multOut = root.querySelector('#rMultOut');
    var exitEl = root.querySelector('#rExit'), gainEl = root.querySelector('#rGain'), roiEl = root.querySelector('#rRoi'), projEl = root.querySelector('#rProj');
    if (!price) return;
    function compute() {
      var g = val(gro, 5), n = val(months, 18), mu = val(mult, 3);
      if (groOut) groOut.textContent = g.toFixed(1) + ' %/mois';
      if (monthsOut) monthsOut.textContent = Math.round(n) + ' mois';
      if (multOut) multOut.textContent = '×' + mu.toFixed(1);
      var p0 = val(profit, 0), buy = val(price, 0);
      var projProfit = p0 * Math.pow(1 + g / 100, n);
      var exit = projProfit * mu;
      var gain = exit - buy;
      var roi = buy > 0 ? (gain / buy) * 100 : 0;
      if (projEl) projEl.textContent = fmtEUR(projProfit);
      if (exitEl) exitEl.textContent = fmtEUR(exit);
      if (gainEl) { gainEl.textContent = (gain >= 0 ? '+' : '') + fmtEUR(gain); gainEl.classList.toggle('neg', gain < 0); }
      if (roiEl) { roiEl.textContent = (roi >= 0 ? '+' : '') + Math.round(roi) + ' %'; roiEl.classList.toggle('neg', roi < 0); }
    }
    [price, profit, gro, months, mult].forEach(function (e) { if (e) { e.addEventListener('input', compute); e.addEventListener('change', compute); } });
    compute();
  }

  /* 4 — Score d'éligibilité au rachat */
  function initEligibility() {
    var root = document.querySelector('[data-eligibility]');
    if (!root || root.getAttribute('data-init')) return; root.setAttribute('data-init', '1');
    var selects = root.querySelectorAll('select[data-elig]');
    var scoreEl = root.querySelector('#eScore'), gauge = root.querySelector('#eGauge'), verdictEl = root.querySelector('#eVerdict');
    if (!selects.length) return;
    function compute() {
      var total = 0;
      selects.forEach(function (s) { var o = s.options[s.selectedIndex]; total += parseInt(o && o.getAttribute('data-score') || 0, 10); });
      total = Math.max(0, Math.min(100, total));
      if (scoreEl) scoreEl.textContent = total;
      if (gauge) gauge.style.width = total + '%';
      var v, cls;
      if (total >= 70) { v = 'Marque éligible : elle correspond à notre thèse d’acquisition. Parlons-en.'; cls = 'ok'; }
      else if (total >= 45) { v = 'Bon potentiel : quelques leviers à activer avant une cession optimale.'; cls = 'mid'; }
      else { v = 'Encore tôt : construisez la traction, puis revenez estimer votre marque.'; cls = 'low'; }
      if (verdictEl) { verdictEl.textContent = v; verdictEl.className = 'elig-verdict ' + cls; }
    }
    selects.forEach(function (s) { s.addEventListener('change', compute); });
    compute();
  }

  function initAll() { initValuation(); initMultiple(); initResale(); initEligibility(); }
  if (document.readyState !== 'loading') initAll();
  else document.addEventListener('DOMContentLoaded', initAll);
  document.addEventListener('shopify:section:load', function () {
    ['[data-valuation]', '[data-multiple]', '[data-resale]', '[data-eligibility]'].forEach(function (s) {
      var el = document.querySelector(s); if (el) el.removeAttribute('data-init');
    });
    initAll();
  });
})();
