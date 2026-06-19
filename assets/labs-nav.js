/* nav.js — 360labs · navigation (mega-menu click-toggle + mobile hamburger) */
(function(){
  function init(){
    var nav=document.querySelector('.nav'); if(!nav) return;
    if(nav.dataset.labsBound==='1') return; nav.dataset.labsBound='1';
    var toggle=nav.querySelector('.nav-toggle');
    var drops=[].slice.call(nav.querySelectorAll('.nav-drop'));
    function closeDrops(){ drops.forEach(function(x){ x.classList.remove('open'); var t=x.querySelector('.nav-drop-t'); if(t) t.setAttribute('aria-expanded','false'); }); }

    if(toggle){
      toggle.addEventListener('click',function(e){
        e.stopPropagation();
        nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true':'false');
        if(!nav.classList.contains('open')) closeDrops();
      });
    }

    drops.forEach(function(d){
      var t=d.querySelector('.nav-drop-t'); if(!t) return;
      t.addEventListener('click',function(e){
        e.stopPropagation();
        var was=d.classList.contains('open');
        closeDrops();
        if(!was){ d.classList.add('open'); t.setAttribute('aria-expanded','true'); }
      });
    });

    document.addEventListener('click',function(e){
      if(!e.target.closest('.nav-drop')) closeDrops();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'){ closeDrops(); nav.classList.remove('open'); if(toggle) toggle.setAttribute('aria-expanded','false'); }
    });
    window.addEventListener('resize',function(){
      if(window.innerWidth>980){ nav.classList.remove('open'); closeDrops(); }
    });
    nav.querySelectorAll('.nav-links a[href]').forEach(function(a){
      a.addEventListener('click',function(){ nav.classList.remove('open'); closeDrops(); });
    });
  }
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
