/* PushDirect core v2 — attribution, funnel analytics, A/B harness, iOS install flow,
   BeMob postback, sitewide affiliate strip, denial/success offers.
   Loaded with defer on every page. Safe to run alongside existing inline scripts.
   Debug logging: add ?pd_debug=1 to any URL (persists in localStorage) — production is silent. */
(function(){
'use strict';

/* ─── 0. LOAD GUARD + DEBUG FLAG ──────────────────────────────────────── */
if(window.__pdCore)return;               // duplicate <script> include is a no-op
window.__pdCore='2';
var DEBUG=false;
try{
  if(/[?&]pd_debug=1(&|$)/.test(location.search))localStorage.setItem('pd_debug','1');
  if(/[?&]pd_debug=0(&|$)/.test(location.search))localStorage.removeItem('pd_debug');
  DEBUG=localStorage.getItem('pd_debug')==='1';
}catch(e){}
function log(){if(DEBUG&&window.console&&console.log)console.log.apply(console,['[PD-core]'].concat([].slice.call(arguments)));}

/* ─── 1. ATTRIBUTION: first-touch UTM + click/source IDs on every page ─── */
var ATTR_KEY='pd_attr', IDS_KEY='pd_ids';
var Q=new URLSearchParams(location.search);
function getAttr(){
  try{return JSON.parse(localStorage.getItem(ATTR_KEY)||'null');}catch(e){return null;}
}
function captureAttr(){
  if(getAttr())return; // first-touch only
  var a={
    src:Q.get('utm_source')||(document.referrer?(new URL(document.referrer)).hostname:'direct'),
    med:Q.get('utm_medium')||'',
    cmp:Q.get('utm_campaign')||'',
    lp:location.pathname,
    ts:Date.now()
  };
  try{localStorage.setItem(ATTR_KEY,JSON.stringify(a));}catch(e){}
}
captureAttr();
/* Tracker IDs. BeMob lander URL passes click_id={clickId} & source_id={trafficSourceId}.
   Previously only 3 pages persisted click_id, so index/offers/blog landings lost it on
   the next page. Now: session-scoped (this visit) + first-touch (cohorting), every page. */
function captureIds(){
  var cid=Q.get('click_id')||Q.get('clickid')||Q.get('cid')||'';
  var sid=Q.get('source_id')||Q.get('sourceid')||Q.get('sub_id')||Q.get('subid')||'';
  var cmp=Q.get('campaign_id')||Q.get('campaignid')||'';
  try{
    if(cid)sessionStorage.setItem('pd_click_id',cid);
    if(sid)sessionStorage.setItem('pd_source_id',sid);
    if(cmp)sessionStorage.setItem('pd_campaign_id',cmp);
    if((cid||sid||cmp)&&!localStorage.getItem(IDS_KEY)){
      localStorage.setItem(IDS_KEY,JSON.stringify({cid:cid,sid:sid,cmp:cmp,ts:Date.now()}));
    }
  }catch(e){}
}
captureIds();
function firstIds(){try{return JSON.parse(localStorage.getItem(IDS_KEY)||'null')||{};}catch(e){return {};}}
function getClickId(){try{return sessionStorage.getItem('pd_click_id')||firstIds().cid||'';}catch(e){return '';}}
function getSourceId(){try{return sessionStorage.getItem('pd_source_id')||firstIds().sid||'';}catch(e){return '';}}
window.pdGetClickId=getClickId;
window.pdGetSourceId=getSourceId;

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
    landing_page:a.lp||'',
    source_id:getSourceId()||'',
    click_id:getClickId()||''
  };
  for(var k in p)payload[k]=p[k];
  if(typeof gtag!=='undefined')gtag('event',ev,payload);
  log(ev,payload);
}
window.pdTrack=pdTrack;
// Provide track() on pages that don't define their own
if(typeof window.track==='undefined')window.track=pdTrack;

/* ─── 4. BEMOB POSTBACK (client-side, deduped per click id) ──────────────
   Fires once per click id on any permission grant, on every page. Pages with
   their own fireBeMob() delegate here so a grant is never double-counted.
   NOTE: true S2S = RollerAds zone postback → BeMob (dashboard setting); once
   that is live and verified, set window.PD_BEMOB_PIXEL=false in the page or
   remove this block to avoid double counting. */
var BEMOB_POSTBACK='https://udlch.bemobtrcks.com/postback?cid=';
window.pdFireBeMob=function(){
  if(window.PD_BEMOB_PIXEL===false)return false;
  try{
    var c=getClickId();
    if(!c)return false;
    var k='pd_bemob_'+c;
    if(localStorage.getItem(k))return false;
    localStorage.setItem(k,String(Date.now()));
    var px=new Image();
    px.src=BEMOB_POSTBACK+encodeURIComponent(c);
    pdTrack('bemob_postback_fired',{});
    return true;
  }catch(e){return false;}
};

/* ─── 5. PERMISSION STATE OBSERVER (granted / denied, any trigger) ────── */
function onGranted(){
  try{localStorage.setItem('pd_subscribed','1');}catch(e){}
  // exactly one prompt_granted per grant, whichever path observed it first
  try{if(!sessionStorage.getItem('pd_granted_ev')){sessionStorage.setItem('pd_granted_ev','1');pdTrack('prompt_granted',{});}}catch(e){pdTrack('prompt_granted',{});}
  window.pdFireBeMob();
  try{
    var sb=document.getElementById('pdStickyBar');if(sb)sb.classList.remove('visible');
    // Fresh grant re-uses the "already subscribed" overlay on most pages: fix its copy.
    var t=document.getElementById('pdAlreadyTitle');
    if(t&&!t.dataset.pdGranted){
      t.dataset.pdGranted='1';
      t.textContent='You\u2019re in. \uD83C\uDF89';
      var p=t.parentNode&&t.parentNode.querySelector('.ov-p');
      if(p)p.textContent='PushDirect alerts are live on this device. Your first one lands the moment something worth acting on drops.';
    }
    fillOfferSlot('pdSuccessOfferSlot','success_offer','Start with today\u2019s top offer \u2192','While your first alert loads');
  }catch(e){}
}
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
          onGranted();
        }else if(st.state==='denied'){
          pdTrack('prompt_denied',{});
        }
      };
    }).catch(function(){});
  }
})();

/* ─── 6. ROLLERADS LOADER HOOK ────────────────────────────────────────────
   Wraps pdLoadRA()/loadRollerAds() defined inline on each page so that:
   (a) extClickID / subID1 fall back to the persisted ids when the current URL
       has none (visitor navigated after landing) — RollerAds subID1 reports
       are the per-source push-yield side of the CPA<LTV equation;
   (b) onPermissionGranted always fires the BeMob postback + success offer. */
function hookRA(name){
  var orig=window[name];
  if(typeof orig!=='function'||orig.__pdWrapped)return;
  var w=function(){
    var r=orig.apply(this,arguments);
    try{
      var ro=window.raOptions;
      if(ro){
        if(!ro.extClickID)ro.extClickID=getClickId();
        if(!ro.subID1)ro.subID1=getSourceId();
        var acts=ro.actions;
        if(acts&&!acts.__pdHooked){
          acts.__pdHooked=true;
          var og=acts.onPermissionGranted;
          acts.onPermissionGranted=function(){
            try{onGranted();}catch(e){}
            if(typeof og==='function')return og.apply(this,arguments);
          };
        }
      }
    }catch(e){}
    return r;
  };
  w.__pdWrapped=true;
  window[name]=w;
}
hookRA('pdLoadRA');
hookRA('loadRollerAds');

/* ─── 7. EMAIL SIGNUP + OUTBOUND / AFFILIATE CLICK TRACKING ───────────── */
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

/* ─── 8. {clickId} TOKEN FILL ─────────────────────────────────────────────
   Static HTML can't be macro-expanded by BeMob; links like
   ...?s1={clickId} were sending the literal token. Fill from persisted id. */
document.addEventListener('DOMContentLoaded',function(){
  var c=encodeURIComponent(getClickId()||'');
  var links=document.querySelectorAll('a[href*="{clickId}"],a[href*="%7BclickId%7D"]');
  for(var i=0;i<links.length;i++){
    var h=links[i].getAttribute('href');
    links[i].setAttribute('href',h.replace(/\{clickId\}|%7BclickId%7D/g,c));
  }
  if(links.length)log('clickId filled',links.length,c);
});

/* ─── 9. iOS ADD-TO-HOME-SCREEN SOFT PROMPT ───────────────────────────── */
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

/* ─── 10. LIVE CRYPTO TICKER (renders only if #pdTicker exists) ───────── */
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

/* ─── 11. AUTO-FIRE PUSH OPT-IN ON FIRST USER GESTURE ───────────────────
   Cold arbitrage traffic rarely clicks the CTA, so the RollerAds prompt never
   loaded. RollerAds must load inside a user gesture, so we trigger on the first
   tap / click / keypress anywhere — not only the CTA button. iOS & Mac-Safari
   excluded (Monetag in-page push handles those). Only acts where pdLoadRA exists. */
(function(){
  if(!('Notification' in window)) return;
  var ua=navigator.userAgent;
  var iOS=/iPad|iPhone|iPod/.test(ua)&&!window.MSStream;
  var isMacSafari=/Macintosh/.test(ua)&&/Safari/.test(ua)&&!/Chrome|Firefox|Edg/.test(ua);
  if(iOS||isMacSafari) return;
  if(Notification.permission!=='default') return;
  var fired=false, evs=['pointerdown','touchstart','click','keydown'];
  function fire(){
    if(fired) return; fired=true;
    evs.forEach(function(ev){window.removeEventListener(ev,fire,true);});
    if(typeof window.pdLoadRA==='function'){ try{pdTrack('auto_prompt_fired',{});}catch(e){} window.pdLoadRA(); }
  }
  evs.forEach(function(ev){window.addEventListener(ev,fire,true);});
})();

/* ─── 12. SHARED OFFER POOL (one fetch per page, reused by strip + slots) ─ */
var _offersP=null;
function loadOffers(){
  if(!_offersP){
    // minute-bucket buster: fresh after admin edits, without one cache entry per pageview
    _offersP=fetch('/offers-data.json?_='+Math.floor(Date.now()/60000))
      .then(function(r){return r.json();}).catch(function(){return null;});
  }
  return _offersP;
}
function offerPool(data,minFeatured){
  var pool=[];
  if(!data)return pool;
  (data.featuredBanners||[]).forEach(function(b){if(b&&b.image&&b.url)pool.push(b);});
  if(pool.length<minFeatured){
    (data.verticals||[]).forEach(function(v){
      if(v.adult)return;
      (v.offers||[]).forEach(function(o){if(o&&o.image&&o.url)pool.push(o);});
    });
  }
  var seen={},uniq=[];
  pool.forEach(function(o){if(!seen[o.url]){seen[o.url]=1;uniq.push(o);}});
  return uniq;
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function safeLabel(s){return String(s||'').replace(/[<>"']/g,'');}

/* ─── 13. SITE-WIDE AFFILIATE STRIP (double monetization: push + affiliate) ─
   Injects a compact offer strip pulled live from offers-data.json into every
   page that includes this script and doesn't already render its own offer
   grid (skips /offers, which has a full grid). Self-contained CSS, placed
   just before <footer>. Pages without this script (admin, fallback) are
   untouched. */
document.addEventListener('DOMContentLoaded',function(){
  if(document.getElementById('featuredBannerGrid'))return;
  if(document.getElementById('pdAffiliateStrip'))return;
  var noStripPages=['/contact','/privacy','/terms'];
  var path=location.pathname.replace(/\/$/,'')||'/';
  if(noStripPages.indexOf(path)>-1)return;
  var footer=document.querySelector('footer');

  var css='#pdAffiliateStrip{padding:44px 0 8px}'+
    '#pdAffiliateStrip .pd-as-wrap{max-width:1100px;margin:0 auto;padding:0 32px}'+
    '#pdAffiliateStrip .pd-as-label{font-family:var(--fm,Inter,sans-serif);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text3,#9a8f7e);font-weight:600;margin-bottom:8px}'+
    '#pdAffiliateStrip .pd-as-h{font-family:var(--fd,Poppins,sans-serif);font-size:clamp(20px,3vw,26px);font-weight:800;color:var(--text1,#1a1916);margin:0 0 16px}'+
    '#pdAffiliateStrip .pd-as-row{display:flex;flex-wrap:wrap;gap:14px}'+
    '#pdAffiliateStrip .pd-as-card{flex:0 0 auto;width:220px;height:117px;border-radius:12px;overflow:hidden;border:1px solid var(--border-s,rgba(26,25,22,.2));background:var(--bg2,#faf9f7);transition:border-color .2s,transform .2s}'+
    '#pdAffiliateStrip .pd-as-card:hover{border-color:rgba(201,170,130,.5);transform:translateY(-2px)}'+
    '#pdAffiliateStrip .pd-as-card img{width:100%;height:100%;object-fit:cover;display:block}'+
    '[data-theme="dark"] #pdAffiliateStrip .pd-as-card{background:var(--surface,rgba(232,213,176,.05));border-color:var(--border-s,rgba(232,213,176,.18))}'+
    '@media(max-width:640px){#pdAffiliateStrip .pd-as-card{width:calc(50% - 7px);height:auto;aspect-ratio:220/117}}';
  if(!document.getElementById('pdAffiliateStripStyle')){
    var styleEl=document.createElement('style');
    styleEl.id='pdAffiliateStripStyle';
    styleEl.textContent=css;
    document.head.appendChild(styleEl);
  }

  function render(offers){
    if(!offers||!offers.length)return;
    if(document.getElementById('pdAffiliateStrip'))return; // async guard: never render twice
    var sec=document.createElement('section');
    sec.id='pdAffiliateStrip';
    var cards=offers.slice(0,8).map(function(o){
      var lbl=safeLabel(o.label);
      return '<a class="pd-as-card" href="'+esc(o.url)+'" target="_blank" rel="noopener sponsored" aria-label="'+esc(o.label)+'" onclick="try{pdTrack(\'affiliate_strip_click\',{offer:\''+lbl+'\'})}catch(e){}">'+
        '<img src="'+esc(o.image)+'" alt="'+esc(o.label)+'" loading="lazy">'+
        '</a>';
    }).join('');
    sec.innerHTML='<div class="pd-as-wrap"><div class="pd-as-label">🔥 Hot Right Now</div><h2 class="pd-as-h">Grab These Before You Go</h2><div class="pd-as-row">'+cards+'</div></div>';
    if(footer&&footer.parentNode){footer.parentNode.insertBefore(sec,footer);}else{document.body.appendChild(sec);}
    try{pdTrack('affiliate_strip_shown',{offer_count:offers.length});}catch(e){}
  }

  loadOffers().then(function(data){render(offerPool(data,4));});
});

/* ─── 14. DENIAL-PATH + SUCCESS-PATH OFFERS (near-zero-effort additive yield)
   Denial: the modal already has an email fallback; one affiliate offer makes a
   decline not a dead end (slot: #pdDeniedOfferSlot / #deniedOfferSlot).
   Success: a fresh grant on index-style pages opens #pdAlreadyBg, which used
   to end at "Got it" — now it carries one offer (slot: #pdSuccessOfferSlot).
   Both pull from offers-data.json, never hardcoded. */
function ensureOfferCss(){
  if(document.getElementById('pdDenialOfferStyle'))return;
  var css2 = '.pd-denial-offer{margin-top:14px;padding-top:14px;border-top:1px solid var(--border,rgba(26,25,22,.1))}'+
    '.pd-denial-offer .pd-do-label{font-family:var(--fm,Inter,sans-serif);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3,#9a8f7e);font-weight:600;margin-bottom:8px}'+
    '.pd-do-link{display:flex;align-items:center;gap:10px;text-decoration:none;border:1px solid var(--border-s,rgba(26,25,22,.2));border-radius:14px;padding:8px;transition:border-color .2s}'+
    '.pd-do-link:hover{border-color:rgba(249,115,22,.4)}'+
    '.pd-do-link img{width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0}'+
    '.pd-do-link span{font-family:var(--fd,Poppins,sans-serif);font-weight:700;font-size:13px;color:var(--text1,#1a1916)}';
  var st2=document.createElement('style');st2.id='pdDenialOfferStyle';st2.textContent=css2;
  document.head.appendChild(st2);
}
function fillOfferSlot(slotId,evPrefix,cta,label){
  var slot=document.getElementById(slotId);
  if(!slot||slot.dataset.pdFilled)return;
  slot.dataset.pdFilled='1';
  ensureOfferCss();
  loadOffers().then(function(data){
    var pool2=offerPool(data,1);
    if(!pool2.length)return;
    var o2=pool2[Math.floor(Math.random()*pool2.length)];
    var lbl=safeLabel(o2.label);
    slot.innerHTML='<div class="pd-denial-offer"><div class="pd-do-label">'+esc(label)+'</div>'+
      '<a class="pd-do-link" href="'+esc(o2.url)+'" target="_blank" rel="noopener sponsored" onclick="try{pdTrack(\''+evPrefix+'_click\',{offer:\''+lbl+'\'})}catch(e){}">'+
      '<img src="'+esc(o2.image)+'" alt="'+esc(lbl)+'" loading="lazy">'+
      '<span>'+esc(cta)+'</span></a></div>';
    // count as shown only if the slot is actually visible (overlay open)
    try{if(slot.getClientRects().length)pdTrack(evPrefix+'_shown',{offer:lbl});}catch(e){}
  });
}
window.pdFillOfferSlot=fillOfferSlot;
document.addEventListener('DOMContentLoaded', function(){
  var id=document.getElementById('pdDeniedOfferSlot')?'pdDeniedOfferSlot':(document.getElementById('deniedOfferSlot')?'deniedOfferSlot':null);
  if(id)fillOfferSlot(id,'denial_offer','Grab today\u2019s top offer \u2192','While you\u2019re here');
  // Already-subscribed visitors opening the overlay also get the success offer
  if('Notification' in window&&Notification.permission==='granted')fillOfferSlot('pdSuccessOfferSlot','success_offer','Start with today\u2019s top offer \u2192','Picked for you');
});

})();
