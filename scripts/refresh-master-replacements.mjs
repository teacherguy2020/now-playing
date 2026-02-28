import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const APP='http://10.0.0.233:8101/app.html?page=';
const API='http://10.0.0.233:3101';
const KEY='1029384756';
const ROOT=path.resolve('docs/images/review-efficient-flow-20260227');
const MASTER=path.resolve('docs/images/master-best-20260227');
const themes=['Abyss Graphite','Blue Neon','Chill Blue','Matrix','Monotone Gray','Muted Merlot','Red Neon','Slate Medium','Warm Parchment'];
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

async function jfetch(url, opts={}){const r=await fetch(url,opts);const t=await r.text();if(!r.ok) throw new Error(`${r.status} ${t.slice(0,180)}`);try{return JSON.parse(t)}catch{return t}}
async function playLocal(){
  await jfetch(`${API}/mpd/play-artist`,{method:'POST',headers:{'content-type':'application/json','x-track-key':KEY},body:JSON.stringify({artist:'Diana Krall'})});
  await jfetch(`${API}/config/diagnostics/playback`,{method:'POST',headers:{'content-type':'application/json','x-track-key':KEY},body:JSON.stringify({action:'play'})});
}
async function playRadio(){
  const p=await jfetch(`${API}/config/queue-wizard/radio-preview`,{method:'POST',headers:{'content-type':'application/json','x-track-key':KEY},body:JSON.stringify({favoritesOnly:true,maxStations:500})});
  const tr=(p?.tracks||[]).find(t=>/jazz24|iheart\s*vinyl\s*jazz/i.test(String(t.stationName||t.artist||'')))||(p?.tracks||[])[0];
  if(!tr?.file) throw new Error('no radio track');
  await jfetch(`${API}/mpd/play-file`,{method:'POST',headers:{'content-type':'application/json','x-track-key':KEY},body:JSON.stringify({file:tr.file})});
  await jfetch(`${API}/config/diagnostics/playback`,{method:'POST',headers:{'content-type':'application/json','x-track-key':KEY},body:JSON.stringify({action:'play'})});
}

async function setTheme(page,theme){
  await page.evaluate((th)=>{
    const sel=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>(o.textContent||'').trim()===th));
    if(!sel) throw new Error('theme select not found');
    const opt=[...sel.options].find(o=>(o.textContent||'').trim()===th);
    sel.value=opt.value; sel.dispatchEvent(new Event('input',{bubbles:true})); sel.dispatchEvent(new Event('change',{bubbles:true}));
  },theme);
}
async function settle(page, openFav=false){
  await page.evaluate((openFav)=>{
    const fav=[...document.querySelectorAll('button')].find(b=>/favorites/i.test(b.textContent||''));
    const drawer=document.querySelector('[role="complementary"]');
    if(fav){ if(openFav && !drawer) fav.click(); if(!openFav && drawer) fav.click(); }
    const q=[...document.querySelectorAll('button')].find(b=>/expand|collapse/i.test((b.textContent||'').trim()));
    if(q && /collapse/i.test(q.textContent||'')) q.click();
    window.scrollTo(0,0);
  },openFav);
  await page.waitForTimeout(1200);
}

const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1200}});
const page=await ctx.newPage();

// library + queue with local track
await playLocal(); await page.waitForTimeout(5000);
for(const th of themes){
  const t=slug(th);
  await page.goto(APP+encodeURIComponent('library-health.html'),{waitUntil:'domcontentloaded'});
  await setTheme(page,th); await settle(page,false);
  await page.screenshot({path:path.join(ROOT,t,'04-library-health.jpg'),type:'jpeg',quality:90});

  await page.goto(APP+encodeURIComponent('queue-wizard.html'),{waitUntil:'domcontentloaded'});
  await setTheme(page,th); await settle(page,false);
  await page.screenshot({path:path.join(ROOT,t,'05-queue-wizard.jpg'),type:'jpeg',quality:90});
}

// radio with stream + favorites open
await playRadio(); await page.waitForTimeout(5000);
for(const th of themes){
  const t=slug(th);
  await page.goto(APP+encodeURIComponent('radio.html'),{waitUntil:'domcontentloaded'});
  await setTheme(page,th); await settle(page,true);
  await page.screenshot({path:path.join(ROOT,t,'06-radio.jpg'),type:'jpeg',quality:90});
}

// sync to master
await fs.cp(ROOT, MASTER, { recursive: true, force: true });

await ctx.close(); await browser.close();
console.log('refreshed');
