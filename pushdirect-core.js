/* PushDirect core — attribution, funnel analytics, A/B harness, iOS install flow.
   Loaded with defer on every page. Safe to run alongside existing inline scripts. */
(function(){
'use strict';

/* ─── 1. FIRST-TOUCH UTM / SOURCE ATTRIBUTION ─────────────────────────── */
var ATTR_KEY='pd_attr';
function getAttr(){
  try{return JSON.parse(localStorage.getItem(ATTR_KEY)||'null');}catch(e){return null;}
}
function captureAttr(){
  if(getAttr())return; // first-touch only
  var q=new URLSearchParams(location.search);
  var a={
    src:q.get('utm_source')||(document.referrer?(new URL(document.referrer)).hostname:'direct'),
    med:q.get('utm_medium')||'',
    cmp:q.get('utm_campaign')||'',
    lp:location.pathname,
    ts:Date.now()
  };
  try{localStorage.setItem(ATTR_KEY,JSON.stringify(a));}catch(e){}
}
captureAttr();

/* ─── 2. A/B VARIANT (compat + multi-test harness) ────────────────────── */
if(typeof window.PD_VARIANT==='undefined'){
  try{
    var v=sessionStorage.getItem('pd_ab');
    if(!v){v=Math.random()<0.5?'A':'B';sessionStorage.setItem('pd_ab',v);}
    window.PD_VARIANT=v;
  }catch(e){window.PD_VARIANT='A';}
}
window.pdVariant=function(test,variants){
  var key='pd_ab_'+test,v=null;
  try{v=localStorage.getItem(key);}catch(e){}
  if(!v||variants.indexOf(v)===-1){
    v=variants[Math.floor(Math.random()*variants.length)];
    try{localStorage.setItem(key,v);}catch(e){}
    pdTrack('ab_assign',{test_name:test,variant:v});
  }
  return v;
};

/* ─── 3. UNIFIED EVENT TRACKER ────────────────────────────────────────── */
function pdTrack(ev,p){
  p=p||{};
  var a=getAttr()||{};
  var payload={
    page_path:location.pathname,
    pd_variant:window.PD_VARIANT,
    utm_source:a.src||'direct',
    utm_medium:a.med||'',
    utm_campaign:a.cmp||'',
    landing_page:a.lp||''
  };
  for(var k in p)payload[k]=p[k];
  if(typeof gtag!=='undefined')gtag('event',ev,payload);
  if(window.console&&console.log)console.log('[PD-core]',ev,payload);
}
window.pdTrack=pdTrack;
// Provide track() on pages that don't define their own
if(typeof window.track==='undefined')window.track=pdTrack;

/* ─── 4. PERMISSION STATE OBSERVER (granted / denied, any trigger) ────── */
(function(){
  if(!('Notification' in window))return;
  // Daily state snapshot for cohorting
  var day=new Date().toISOString().slice(0,10);
  try{
    if(localStorage.getItem('pd_perm_day')!==day){
      localStorage.setItem('pd_perm_day',day);
      pdTrack('prompt_state',{state:Notification.permission});
    }
  }catch(e){}
  if(navigator.permissions&&navigator.permissions.query){
    navigator.permissions.query({name:'notifications'}).then(function(st){
      st.onchange=function(){
        if(st.state==='granted'){
          pdTrack('prompt_granted',{});
          try{localStorage.setItem('pd_subscribed','1');}catch(e){}
        }else if(st.state==='denied'){
          pdTrack('prompt_denied',{});
        }
      };
    }).catch(function(){});
  }
})();

/* ─── 5. EMAIL SIGNUP + OUTBOUND / AFFILIATE CLICK TRACKING ───────────── */
document.addEventListener('submit',function(e){
  var f=e.target;
  if(f&&f.action&&f.action.indexOf('web3forms')>-1){
    pdTrack('email_signup',{form_id:f.id||'unknown'});
  }
},true);
document.addEventListener('click',function(e){
  var el=e.target&&e.target.closest?e.target.closest('a[href]'):null;
  if(!el)return;
  var href=el.getAttribute('href')||'';
  if(/^https?:\/\//.test(href)&&href.indexOf(location.hostname)===-1){
    pdTrack('outbound_click',{link_url:href.slice(0,120)});
  }
},true);

/* ─── 6. iOS ADD-TO-HOME-SCREEN SOFT PROMPT ───────────────────────────── */
var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
var isStandalone=!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
function a2hsDismissed(){
  try{var t=+localStorage.getItem('pd_a2hs_dismiss')||0;return Date.now()-t<7*864e5;}catch(e){return false;}
}
window.pdShowA2HS=function(){
  if(document.getElementById('pdA2HS'))return;
  var d=document.createElement('div');
  d.id='pdA2HS';
  d.setAttribute('role','dialog');
  d.style.cssText='position:fixed;left:12px;right:12px;bottom:14px;z-index:99998;background:#1a1814;border:1px solid rgba(232,213,176,.25);border-radius:16px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:inherit;color:#f0e8d8';
  d.innerHTML='<div style="font-weight:700;font-size:15px;margin-bottom:6px">📲 Get alerts on this iPhone</div>'+
    '<div style="font-size:13px;line-height:1.55;color:#b8ac96">Install PushDirect to receive deal alerts: tap the <strong>Share</strong> button <span style="display:inline-block;border:1px solid #b8ac96;border-radius:4px;padding:0 5px;font-size:11px">&#x2191;</span> then <strong>“Add to Home Screen”</strong>, and open the app once.</div>'+
    '<button id="pdA2HSx" style="margin-top:12px;background:none;border:1px solid rgba(232,213,176,.3);color:#b8ac96;border-radius:10px;padding:7px 14px;font-size:13px;cursor:pointer">Got it</button>';
  document.body.appendChild(d);
  pdTrack('ios_a2hs_shown',{});
  document.getElementById('pdA2HSx').onclick=function(){
    try{localStorage.setItem('pd_a2hs_dismiss',Date.now());}catch(e){}
    d.remove();
    pdTrack('ios_a2hs_dismissed',{});
  };
};
// Auto-show on pages opting in via <body data-pd-a2hs="auto">
if(isIOS&&!isStandalone&&!a2hsDismissed()&&('Notification' in window?Notification.permission!=='granted':true)){
  document.addEventListener('DOMContentLoaded',function(){
    if(document.body&&document.body.getAttribute('data-pd-a2hs')==='auto'){
      setTimeout(window.pdShowA2HS,9000);
    }
  });
}

/* ─── 7. LIVE CRYPTO TICKER (renders only if #pdTicker exists) ────────── */
document.addEventListener('DOMContentLoaded',function(){
  var t=document.getElementById('pdTicker');
  if(!t)return;
  function load(){
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true')
      .then(function(r){return r.json();})
      .then(function(d){
        function f(o,sym){
          if(!o)return'';
          var ch=o.usd_24h_change||0;
          var c=ch>=0?'#7ec77e':'#d77d7d';
          return'<span style="margin-right:18px;white-space:nowrap">'+sym+' <strong>$'+Math.round(o.usd).toLocaleString()+'</strong> <span style="color:'+c+'">'+(ch>=0?'▲':'▼')+Math.abs(ch).toFixed(1)+'%</span></span>';
        }
        t.innerHTML=f(d.bitcoin,'BTC')+f(d.ethereum,'ETH')+f(d.solana,'SOL')+
          '<a href="/crypto-alerts" style="color:inherit;text-decoration:underline;white-space:nowrap">Get crypto alerts →</a>';
      }).catch(function(){t.style.display='none';});
  }
  load();setInterval(load,60000);
});


/* ── Auto-fire push opt-in on first user gesture ───────────────────────────
   Cold arbitrage traffic rarely clicks the CTA, so the RollerAds prompt never
   loaded. RollerAds must load inside a user gesture, so we trigger on the first
   tap / click / keypress anywhere — not only the CTA button. iOS & Mac-Safari
   excluded (Monetag in-page push handles those). Only acts where pdLoadRA exists. */
(function(){
  if(!('Notification' in window)) return;
  var ua=navigator.userAgent;
  var isIOS=/iPad|iPhone|iPod/.test(ua)&&!window.MSStream;
  var isMacSafari=/Macintosh/.test(ua)&&/Safari/.test(ua)&&!/Chrome|Firefox|Edg/.test(ua);
  if(isIOS||isMacSafari) return;
  if(Notification.permission!=='default') return;
  var fired=false, evs=['pointerdown','touchstart','click','keydown'];
  function fire(){
    if(fired) return; fired=true;
    evs.forEach(function(ev){window.removeEventListener(ev,fire,true);});
    if(typeof window.pdLoadRA==='function'){ try{pdTrack('auto_prompt_fired',{});}catch(e){} window.pdLoadRA(); }
  }
  evs.forEach(function(ev){window.addEventListener(ev,fire,true);});
})();

/* ─── 9. SITE-WIDE AFFILIATE STRIP (double monetization: push + affiliate) ──
   Injects a compact offer strip pulled live from offers-data.json into every
   page that includes this script and doesn't already render its own offer
   grid (skips /offers, which has a full grid). Self-contained CSS, placed
   just before <footer>. Pages without this script (admin, fallback) are
   untouched. */
document.addEventListener('DOMContentLoaded',function(){
  if(document.getElementById('featuredBannerGrid'))return;
  if(document.getElementById('pdAffiliateStrip'))return;
  var footer=document.querySelector('footer');

  var css='#pdAffiliateStrip{padding:44px 0 8px}'+
    '#pdAffiliateStrip .pd-as-wrap{max-width:1100px;margin:0 auto;padding:0 32px}'+
    '#pdAffiliateStrip .pd-as-label{font-family:var(--fm,Inter,sans-serif);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text3,#9a8f7e);font-weight:600;margin-bottom:8px}'+
    '#pdAffiliateStrip .pd-as-h{font-family:var(--fd,Poppins,sans-serif);font-size:clamp(20px,3vw,26px);font-weight:800;color:var(--text1,#1a1916);margin:0 0 16px}'+
    '#pdAffiliateStrip .pd-as-row{display:flex;gap:14px;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin}'+
    '#pdAffiliateStrip .pd-as-card{flex:0 0 auto;width:220px;height:117px;border-radius:12px;overflow:hidden;border:1px solid var(--border-s,rgba(26,25,22,.2));background:var(--bg2,#faf9f7);transition:border-color .2s,transform .2s}'+
    '#pdAffiliateStrip .pd-as-card:hover{border-color:rgba(201,170,130,.5);transform:translateY(-2px)}'+
    '#pdAffiliateStrip .pd-as-card img{width:100%;height:100%;object-fit:cover;display:block}'+
    '[data-theme="dark"] #pdAffiliateStrip .pd-as-card{background:var(--surface,rgba(232,213,176,.05));border-color:var(--border-s,rgba(232,213,176,.18))}'+
    '@media(max-width:520px){#pdAffiliateStrip .pd-as-card{width:180px;height:96px}}';
  var styleEl=document.createElement('style');
  styleEl.id='pdAffiliateStripStyle';
  styleEl.textContent=css;
  document.head.appendChild(styleEl);

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function render(offers){
    if(!offers||!offers.length)return;
    var sec=document.createElement('section');
    sec.id='pdAffiliateStrip';
    var cards=offers.slice(0,8).map(function(o){
      var safeLabel=esc(o.label).replace(/'/g,'');
      return '<a class="pd-as-card" href="'+esc(o.url)+'" target="_blank" rel="noopener sponsored" aria-label="'+esc(o.label)+'" onclick="try{pdTrack(\'affiliate_strip_click\',{offer:\''+safeLabel+'\'})}catch(e){}">'+
        '<img src="'+esc(o.image)+'" alt="'+esc(o.label)+'" loading="lazy">'+
        '</a>';
    }).join('');
    sec.innerHTML='<div class="pd-as-wrap"><div class="pd-as-label">Partner offers</div><h2 class="pd-as-h">Deals worth a look</h2><div class="pd-as-row">'+cards+'</div></div>';
    if(footer&&footer.parentNode){footer.parentNode.insertBefore(sec,footer);}else{document.body.appendChild(sec);}
    try{pdTrack('affiliate_strip_shown',{offer_count:offers.length});}catch(e){}
  }

  fetch('/offers-data.json?_='+Date.now()).then(function(r){return r.json();}).then(function(data){
    var pool=[];
    (data.featuredBanners||[]).forEach(function(b){if(b&&b.image&&b.url)pool.push(b);});
    if(pool.length<4){
      (data.verticals||[]).forEach(function(v){
        if(v.adult)return;
        (v.offers||[]).forEach(function(o){if(o&&o.image&&o.url)pool.push(o);});
      });
    }
    var seen={},uniq=[];
    pool.forEach(function(o){if(!seen[o.url]){seen[o.url]=1;uniq.push(o);}});
    render(uniq);
  }).catch(function(){});
});

})();
