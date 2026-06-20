/* labs-hub.js — 360labs · hub écosystème interactif + reveal on scroll
   Chaque .ecoH lit sa config depuis un <script type="application/json"> enfant,
   ce qui permet de tout piloter depuis l'éditeur de thème Shopify.
   Chaque catégorie fait orbiter SES marques dans le cercle. */
(function(){
  var ICON={
    grid:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'
  };
  var arrow='<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var rmq=window.matchMedia('(prefers-reduced-motion: reduce)');

  function parseConfig(ecoH){
    var tag=ecoH.querySelector('script[type="application/json"]');
    if(!tag) return null;
    try{ return JSON.parse(tag.textContent); }catch(e){ return null; }
  }

  function build(ecoH){
    var list=ecoH.querySelector('.ecoH-list'),
        nodes=ecoH.querySelector('.ecoH-nodes'),
        core=ecoH.querySelector('.ecoH-core'),
        detail=ecoH.querySelector('.ecoH-detail');
    if(!list||!nodes||!core||!detail) return;
    var THEMES=parseConfig(ecoH);
    if(!THEMES||!THEMES.length) return;
    // remplace les éventuels marqueurs d'icône texte par le vrai SVG
    THEMES.forEach(function(t){
      (t.marks||[]).forEach(function(mk){
        if(mk.icon==='grid') mk.icon=ICON.grid;
      });
    });

    var cur=-1, N=THEMES.length, R=150, nodeEls=[], baseAng=[], spin=0;

    list.innerHTML='';
    THEMES.forEach(function(t,i){
      var r=document.createElement('button'); r.className='ecoH-row'; r.type='button';
      r.innerHTML='<span class="ecoH-prog"></span><span class="e2idx">0'+(i+1)+'</span>'+
        '<span class="ecoH-rtxt"><b>'+t.title+'</b><span>'+t.cat+'</span></span>'+
        '<span class="ecoH-count">'+t.count+'</span>';
      r.addEventListener('click',function(){select(i);});
      list.appendChild(r);
    });

    function buildNodes(t){
      nodes.innerHTML=''; nodeEls=[]; baseAng=[];
      var m=t.marks||[], n=m.length||1, ph=(typeof t.phase==='number'?t.phase:-90);
      m.forEach(function(mk,j){
        var el=document.createElement('div'); el.className='ecoH-node'+(mk.soft?' soft':'');
        var inner = mk.logo ? '<img src="'+mk.logo+'" alt="'+(mk.t||'')+'" onerror="this.replaceWith(document.createTextNode(\''+(mk.l||'')+'\'))">'
                            : (mk.icon||mk.l||'');
        el.innerHTML='<div class="ndi">'+inner+'</div>'+(mk.t?'<span class="ndlbl">'+mk.t+'</span>':'');
        nodes.appendChild(el); nodeEls.push(el);
        baseAng.push(ph + j*(360/n));
        place(el, baseAng[j]);
        el.style.setProperty('--o','1');
      });
    }
    function place(el,deg){
      var rad=deg*Math.PI/180;
      el.style.setProperty('--bx',(Math.cos(rad)*R).toFixed(1)+'px');
      el.style.setProperty('--by',(Math.sin(rad)*R).toFixed(1)+'px');
    }
    function render(t){
      var chips=(t.chips||[]).map(function(c){return '<span class="ecoH-chip">'+c+'</span>';}).join('');
      var cta=t.cta&&t.cta.href ? '<a class="ecoH-link" href="'+t.cta.href+'">'+(t.cta.label||'')+' '+arrow+'</a>' : '';
      detail.innerHTML='<div class="ecoH-kicker">'+t.kicker+'</div><div class="ecoH-title">'+t.title+'</div>'+
        '<p class="ecoH-desc">'+t.desc+'</p><div class="ecoH-chips">'+chips+'</div>'+cta;
    }
    function select(i){
      if(i===cur) return;
      var prev=cur; cur=i; var t=THEMES[i];
      [].forEach.call(list.children,function(b,j){b.classList.toggle('on',j===i);});
      core.style.setProperty('--ap',((t.arc||60)/100*360)+'deg');
      buildNodes(t);
      if(prev<0){ render(t); }
      else { detail.classList.add('swap'); setTimeout(function(){ render(t); detail.classList.remove('swap'); },240); }
    }

    select(0);
    if(!rmq.matches){
      var last=performance.now();
      (function tick(now){
        var dt=now-last; last=now;
        spin=(spin + dt*0.0042)%360;
        for(var k=0;k<nodeEls.length;k++){ place(nodeEls[k], baseAng[k]+spin); }
        requestAnimationFrame(tick);
      })(last);
    }
  }

  function reveal(){
    var rev=[].slice.call(document.querySelectorAll('.reveal:not(.in)'));
    if(!rev.length) return;
    function showAll(){ rev.forEach(function(el){el.classList.add('in');}); }
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(ents){ents.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });},{threshold:0,rootMargin:'0px 0px -8% 0px'});
      rev.forEach(function(el){io.observe(el);});
      setTimeout(showAll,1600);
    } else { showAll(); }
  }

  function countUp(){
    var els=[].slice.call(document.querySelectorAll('[data-countup]:not(.cu-done)'));
    if(!els.length) return;
    function fmt(el,n){
      var v=Math.round(n),
          loc=el.getAttribute('data-locale')||'en-US',
          s=(el.getAttribute('data-sep')==='1') ? v.toLocaleString(loc) : String(v);
      return (el.getAttribute('data-prefix')||'') + s + (el.getAttribute('data-suffix')||'');
    }
    function run(el){
      el.classList.add('cu-done');
      var to=parseFloat((el.getAttribute('data-to')||'0').replace(/[^0-9.]/g,''))||0;
      if(rmq.matches){ el.textContent=fmt(el,to); return; }
      var dur=1400, t0=performance.now();
      (function step(now){
        var p=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-p,3);
        el.textContent=fmt(el,to*e);
        if(p<1) requestAnimationFrame(step);
      })(t0);
    }
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(ents){ents.forEach(function(en){ if(en.isIntersecting){ run(en.target); io.unobserve(en.target); } });},{threshold:.25});
      els.forEach(function(el){io.observe(el);});
      setTimeout(function(){ els.forEach(function(el){ if(!el.classList.contains('cu-done')) run(el); }); },2200);
    } else { els.forEach(run); }
  }

  function init(){ [].forEach.call(document.querySelectorAll('.ecoH'), build); reveal(); countUp(); }

  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
  // Re-init dans l'éditeur de thème Shopify lors d'un rechargement de section
  document.addEventListener('shopify:section:load', function(){ init(); });
})();
