(() => {
  const $ = (id) => document.getElementById(id);
  const cards = $('cards');
  const sections = $('sections');
  const status = $('status');

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}

  function renderTable(rows){
    if(!rows?.length) return '<div class="muted">No samples.</div>';
    const body = rows.map(r=>`<tr><td>${esc(r.artist)}</td><td>${esc(r.title)}</td><td>${esc(r.album)}</td><td>${esc(r.file)}</td></tr>`).join('');
    return `<table><thead><tr><th>Artist</th><th>Title</th><th>Album</th><th>File</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function defaultApiBase(){
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const host = location.hostname || '10.0.0.233';
      return `${location.protocol}//${host}:3101`;
    }
    return 'http://10.0.0.233:3101';
  }

  async function run(){
    const key = $('key').value.trim();
    const sample = 100;
    const apiBase = ($('apiBase').value || defaultApiBase()).trim().replace(/\/$/, '');
    status.textContent = 'Scanning…';
    cards.innerHTML = '';
    sections.innerHTML = '';

    try {
      const url = `${apiBase}/config/library-health?sampleLimit=${encodeURIComponent(sample)}`;
      const res = await fetch(url, { headers: { 'x-track-key': key } });
      const j = await res.json();
      if(!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      const s = j.summary || {};
      const items = [
        ['Total Audio Tracks Scanned', s.totalTracks],
        ['Unrated (0/missing)', s.unrated],
        ['Low Rated (=1)', s.lowRated1],
        ['Missing MBID', s.missingMbid],
        ['Missing Genre', s.missingGenre],
        ['Christmas Genre', s.christmasGenre],
        ['Podcast Genre', s.podcastGenre],
      ];
      cards.innerHTML = items.map(([k,v])=>`<div class="card"><div class="k">${esc(k)}</div><div class="v">${Number(v||0).toLocaleString()}</div></div>`).join('');

      const sampleMap = j.samples || {};
      const sectionsDef = [
        ['Unrated samples', sampleMap.unrated],
        ['Low-rated=1 samples', sampleMap.lowRated1],
        ['Missing MBID samples', sampleMap.missingMbid],
        ['Missing Genre samples', sampleMap.missingGenre],
      ];
      sections.innerHTML = sectionsDef.map(([title, rows]) => `
        <details>
          <summary>${esc(title)} (${(rows||[]).length})</summary>
          ${renderTable(rows||[])}
        </details>
      `).join('');

      status.textContent = `Done in ${j.elapsedMs} ms · scanned ${j.scannedTracks || s.totalTracks || 0} tracks · ${j.generatedAt}`;
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    }
  }

  $('apiBase').value = defaultApiBase();
  $('run').addEventListener('click', run);
  run();
})();
