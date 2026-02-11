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

  function renderMissingGenreTable(rows){
    if(!rows?.length) return '<div class="muted">No samples.</div>';
    const body = rows.map((r, i)=>`<tr><td><input type="checkbox" class="mgChk" data-idx="${i}"></td><td>${esc(r.artist)}</td><td>${esc(r.title)}</td><td>${esc(r.album)}</td><td>${esc(r.file)}</td></tr>`).join('');
    return `<table><thead><tr><th><input type="checkbox" id="mgAll"></th><th>Artist</th><th>Title</th><th>Album</th><th>File</th></tr></thead><tbody>${body}</tbody></table>`;
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
    const runBtn = $('run');
    runBtn.disabled = true;
    status.innerHTML = '<span class="spin" aria-hidden="true"></span>Scanning, please wait';
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
      let missingRows = sampleMap.missingGenre || [];
      let missingRemaining = Number(s.missingGenre || 0);
      const sectionsDef = [
        ['Unrated samples', sampleMap.unrated],
        ['Low-rated=1 samples', sampleMap.lowRated1],
        ['Missing MBID samples', sampleMap.missingMbid],
      ];
      sections.innerHTML = sectionsDef.map(([title, rows]) => `
        <details>
          <summary>${esc(title)} (${(rows||[]).length})</summary>
          ${renderTable(rows||[])}
        </details>
      `).join('') + `
        <details open>
          <summary>Missing Genre samples (${missingRows.length})</summary>
          <div class="row" style="margin:8px 0;">
            <label>Assign genre
              <select id="mgGenre" style="padding:6px 8px;border-radius:8px;background:#0a1222;color:#eef;border:1px solid #334;max-width:280px;">
                <option value="">Select…</option>
                ${(j.genreOptions || []).map((g) => `<option>${esc(g)}</option>`).join('')}
              </select>
            </label>
            <button id="mgApply">Apply to checked</button>
            <span class="muted" id="mgStatus"></span>
          </div>
          ${renderMissingGenreTable(missingRows)}
        </details>
      `;

      const allBox = $('mgAll');
      if (allBox) {
        allBox.addEventListener('change', () => {
          document.querySelectorAll('.mgChk').forEach((el) => { el.checked = allBox.checked; });
        });
      }

      const applyBtn = $('mgApply');
      if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
          const genre = ($('mgGenre')?.value || '').trim();
          const mgStatus = $('mgStatus');
          if (!genre) { if (mgStatus) mgStatus.textContent = 'Pick a genre first.'; return; }

          const checked = Array.from(document.querySelectorAll('.mgChk:checked'));
          const files = checked.map((el) => missingRows[Number(el.getAttribute('data-idx'))]).filter(Boolean).map((r) => r.file);
          if (!files.length) { if (mgStatus) mgStatus.textContent = 'No rows checked.'; return; }

          if (mgStatus) mgStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Applying…';
          try {
            const r = await fetch(`${apiBase}/config/library-health/genre-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-track-key': key },
              body: JSON.stringify({ files, genre }),
            });
            const jj = await r.json();
            if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
            if (mgStatus) mgStatus.textContent = `Updated ${jj.updated}/${jj.requested} (skipped ${jj.skipped})`;

            // Fast UI update: remove successful rows without full re-scan.
            const appliedSet = new Set(files);
            missingRows = missingRows.filter((row) => !appliedSet.has(row.file));
            missingRemaining = Math.max(0, missingRemaining - Number(jj.updated || 0));

            // Update Missing Genre metric card value.
            document.querySelectorAll('.card').forEach((card) => {
              const k = card.querySelector('.k');
              const v = card.querySelector('.v');
              if (k && v && /Missing Genre/i.test(k.textContent || '')) {
                v.textContent = Number(missingRemaining).toLocaleString();
              }
            });

            // Re-render only the missing-genre section.
            const details = applyBtn.closest('details');
            if (details) {
              const summaryEl = details.querySelector('summary');
              if (summaryEl) summaryEl.textContent = `Missing Genre samples (${missingRows.length})`;
              const oldTable = details.querySelector('table');
              if (oldTable) oldTable.remove();
              const oldEmpty = details.querySelector('.muted');
              if (oldEmpty) oldEmpty.remove();
              details.insertAdjacentHTML('beforeend', renderMissingGenreTable(missingRows));

              const newAll = $('mgAll');
              if (newAll) {
                newAll.addEventListener('change', () => {
                  document.querySelectorAll('.mgChk').forEach((el) => { el.checked = newAll.checked; });
                });
              }
            }
          } catch (e) {
            if (mgStatus) mgStatus.textContent = `Error: ${e?.message || e}`;
          }
        });
      }

      status.textContent = `Done in ${j.elapsedMs} ms · scanned ${j.scannedTracks || s.totalTracks || 0} tracks · ${j.generatedAt}`;
    } catch (e) {
      status.textContent = `Error: ${e?.message || e}`;
    } finally {
      $('run').disabled = false;
    }
  }

  $('apiBase').value = defaultApiBase();
  $('run').addEventListener('click', run);
  run();
})();
