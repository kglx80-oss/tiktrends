/* labs-tools.js — 360labs · estimateur de valorisation de marque e-commerce */
(function () {
  function fmtEUR(n) {
    return Math.round(n).toLocaleString('fr-FR') + ' €';
  }

  function initValuation() {
    var root = document.querySelector('[data-valuation]');
    if (!root || root.getAttribute('data-val-init')) return;
    root.setAttribute('data-val-init', '1');

    var rev = root.querySelector('#valRev');
    var margin = root.querySelector('#valMargin');
    var marginOut = root.querySelector('#valMarginOut');
    var growth = root.querySelector('#valGrowth');
    var age = root.querySelector('#valAge');
    var low = root.querySelector('#valLow');
    var high = root.querySelector('#valHigh');
    var profitEl = root.querySelector('#valProfit');
    var multEl = root.querySelector('#valMult');
    if (!rev || !margin || !low) return;

    function compute() {
      var monthly = parseFloat(rev.value) || 0;
      var m = parseFloat(margin.value) || 0;
      if (marginOut) marginOut.textContent = Math.round(m) + ' %';

      var annualRev = monthly * 12;
      var profit = annualRev * (m / 100);

      // Multiple de base selon la croissance
      var g = growth ? growth.value : 'up';
      var mult = g === 'fast' ? 3.6 : (g === 'stable' ? 2.4 : 3.0);
      // Ajustement ancienneté
      var a = age ? age.value : 'mid';
      mult += a === 'old' ? 0.3 : (a === 'new' ? -0.3 : 0);
      // Ajustement marge
      if (m >= 25) mult += 0.3; else if (m < 12) mult -= 0.3;
      // Bornes
      mult = Math.max(1.8, Math.min(5, mult));

      var lowV = profit * (mult - 0.5);
      var highV = profit * (mult + 0.5);
      if (lowV < 0) lowV = 0;

      low.textContent = fmtEUR(lowV);
      high.textContent = fmtEUR(highV);
      if (profitEl) profitEl.textContent = fmtEUR(profit);
      if (multEl) multEl.textContent = '×' + (mult - 0.5).toFixed(1) + ' – ×' + (mult + 0.5).toFixed(1);
    }

    [rev, margin, growth, age].forEach(function (el) {
      if (el) { el.addEventListener('input', compute); el.addEventListener('change', compute); }
    });
    compute();
  }

  if (document.readyState !== 'loading') initValuation();
  else document.addEventListener('DOMContentLoaded', initValuation);
  document.addEventListener('shopify:section:load', function () {
    var r = document.querySelector('[data-valuation]');
    if (r) r.removeAttribute('data-val-init');
    initValuation();
  });
})();
