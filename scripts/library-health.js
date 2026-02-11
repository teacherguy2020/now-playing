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

  function folderOf(file){
    const f = String(file || '');
    const i = f.lastIndexOf('/');
    return i > 0 ? f.slice(0, i) : '(root)';
  }

  function renderFolderSelection(prefix, rows){
    if(!rows?.length) return '<div class="muted">No samples.</div>';
    const groups = new Map();
    rows.forEach((r, i) => {
      const folder = folderOf(r.file);
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder).push({ r, i });
    });

    const foldersHtml = Array.from(groups.entries())
      .sort((a,b)=>a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
      .map(([folder, items]) => {
        const token = encodeURIComponent(folder);
        const body = items.map(({ r, i }) => `
          <tr>
            <td><input type="checkbox" class="${prefix}TrackChk" data-idx="${i}" data-folder="${token}"></td>
            <td>${esc(r.artist)}</td><td>${esc(r.title)}</td><td>${esc(r.album)}</td><td>${esc(r.file)}</td>
          </tr>
        `).join('');
        return `
          <details style="margin:6px 0;">
            <summary><input type="checkbox" class="${prefix}FolderChk" data-folder="${token}"> ${esc(folder)} <span class="muted">(${items.length})</span></summary>
            <table>
              <thead><tr><th></th><th>Artist</th><th>Title</th><th>Album</th><th>File</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </details>
        `;
      }).join('');

    return `
      <div class="row" style="margin:6px 0 8px;">
        <label><input type="checkbox" id="${prefix}All"> Check/uncheck all folders + tracks</label>
      </div>
      ${foldersHtml}
    `;
  }

  function initFolderSelectionHandlers(prefix){
    const allBox = $(`${prefix}All`);
    if (allBox) {
      allBox.addEventListener('change', () => {
        document.querySelectorAll(`.${prefix}FolderChk,.${prefix}TrackChk`).forEach((el) => { el.checked = allBox.checked; });
      });
    }
    document.querySelectorAll(`.${prefix}FolderChk`).forEach((fcb) => {
      fcb.addEventListener('change', () => {
        const token = fcb.getAttribute('data-folder');
        document.querySelectorAll(`.${prefix}TrackChk[data-folder="${token}"]`).forEach((t) => { t.checked = fcb.checked; });
      });
    });
  }

  function collectSelectedFiles(prefix, rows){
    const fileSet = new Set();
    Array.from(document.querySelectorAll(`.${prefix}TrackChk:checked`)).forEach((el) => {
      const row = rows[Number(el.getAttribute('data-idx'))];
      if (row?.file) fileSet.add(row.file);
    });
    Array.from(document.querySelectorAll(`.${prefix}FolderChk:checked`)).forEach((el) => {
      const token = el.getAttribute('data-folder');
      Array.from(document.querySelectorAll(`.${prefix}TrackChk[data-folder="${token}"]`)).forEach((trackEl) => {
        const row = rows[Number(trackEl.getAttribute('data-idx'))];
        if (row?.file) fileSet.add(row.file);
      });
    });
    return Array.from(fileSet);
  }

  function setCardValue(labelRe, value){
    document.querySelectorAll('.card').forEach((card) => {
      const k = card.querySelector('.k');
      const v = card.querySelector('.v');
      if (k && v && labelRe.test(k.textContent || '')) v.textContent = Number(value || 0).toLocaleString();
    });
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
      let unratedRows = sampleMap.unrated || [];
      let missingRemaining = Number(s.missingGenre || 0);
      let unratedRemaining = Number(s.unrated || 0);

      sections.innerHTML = `
        <details open>
          <summary>Unrated samples (${unratedRows.length})</summary>
          <div class="row" style="margin:8px 0;">
            <label>Assign rating
              <select id="urRating" style="padding:6px 8px;border-radius:8px;background:#0a1222;color:#eef;border:1px solid #334;max-width:160px;">
                <option value="2" selected>2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <button id="urApply">Apply to checked</button>
            <span class="muted" id="urStatus"></span>
          </div>
          ${renderFolderSelection('ur', unratedRows)}
        </details>

        <details>
          <summary>Low-rated=1 samples (${(sampleMap.lowRated1||[]).length})</summary>
          ${renderTable(sampleMap.lowRated1||[])}
        </details>

        <details>
          <summary>Missing MBID samples (${(sampleMap.missingMbid||[]).length})</summary>
          ${renderTable(sampleMap.missingMbid||[])}
        </details>

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
          ${renderFolderSelection('mg', missingRows)}
        </details>
      `;

      initFolderSelectionHandlers('ur');
      initFolderSelectionHandlers('mg');

      const urApplyBtn = $('urApply');
      if (urApplyBtn) {
        urApplyBtn.addEventListener('click', async () => {
          const rating = Number(($('urRating')?.value || '2').trim());
          const urStatus = $('urStatus');
          const files = collectSelectedFiles('ur', unratedRows);
          if (!files.length) { if (urStatus) urStatus.textContent = 'No folders/tracks checked.'; return; }

          if (urStatus) urStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Tagging, please wait…';
          try {
            const r = await fetch(`${apiBase}/config/library-health/rating-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-track-key': key },
              body: JSON.stringify({ files, rating }),
            });
            const jj = await r.json();
            if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
            if (urStatus) urStatus.textContent = `Updated ${jj.updated}/${jj.requested} (skipped ${jj.skipped})`;

            const appliedSet = new Set(files);
            unratedRows = unratedRows.filter((row) => !appliedSet.has(row.file));
            unratedRemaining = Math.max(0, unratedRemaining - Number(jj.updated || 0));
            setCardValue(/Unrated/i, unratedRemaining);

            const details = urApplyBtn.closest('details');
            if (details) {
              const summaryEl = details.querySelector('summary');
              if (summaryEl) summaryEl.textContent = `Unrated samples (${unratedRows.length})`;
              Array.from(details.querySelectorAll('table,.muted,.row')).forEach((el, idx) => { if (idx >= 1) el.remove(); });
              details.insertAdjacentHTML('beforeend', renderFolderSelection('ur', unratedRows));
              initFolderSelectionHandlers('ur');
            }
          } catch (e) {
            if (urStatus) urStatus.textContent = `Error: ${e?.message || e}`;
          }
        });
      }

      const mgApplyBtn = $('mgApply');
      if (mgApplyBtn) {
        mgApplyBtn.addEventListener('click', async () => {
          const genre = ($('mgGenre')?.value || '').trim();
          const mgStatus = $('mgStatus');
          if (!genre) { if (mgStatus) mgStatus.textContent = 'Pick a genre first.'; return; }

          const files = collectSelectedFiles('mg', missingRows);
          if (!files.length) { if (mgStatus) mgStatus.textContent = 'No folders/tracks checked.'; return; }

          if (mgStatus) mgStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Tagging, please wait…';
          try {
            const r = await fetch(`${apiBase}/config/library-health/genre-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-track-key': key },
              body: JSON.stringify({ files, genre }),
            });
            const jj = await r.json();
            if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
            if (mgStatus) mgStatus.textContent = `Updated ${jj.updated}/${jj.requested} (skipped ${jj.skipped})`;

            const appliedSet = new Set(files);
            missingRows = missingRows.filter((row) => !appliedSet.has(row.file));
            missingRemaining = Math.max(0, missingRemaining - Number(jj.updated || 0));
            setCardValue(/Missing Genre/i, missingRemaining);

            const details = mgApplyBtn.closest('details');
            if (details) {
              const summaryEl = details.querySelector('summary');
              if (summaryEl) summaryEl.textContent = `Missing Genre samples (${missingRows.length})`;
              Array.from(details.querySelectorAll('table,.muted,.row')).forEach((el, idx) => { if (idx >= 1) el.remove(); });
              details.insertAdjacentHTML('beforeend', renderFolderSelection('mg', missingRows));
              initFolderSelectionHandlers('mg');
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
