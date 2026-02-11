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

  function renderGenreBars(rows, topN = Infinity){
    const list = Array.isArray(rows) ? rows.slice(0, Number.isFinite(topN) ? topN : rows.length) : [];
    if (!list.length) return '<div class="muted">No genre data.</div>';
    const max = Math.max(1, ...list.map((r) => Number(r?.count || 0)));
    const body = list.map((r) => {
      const genre = String(r?.genre || '(Missing Genre)');
      const count = Number(r?.count || 0);
      const pct = Math.max(2, Math.round((count / max) * 100));
      return `
        <button type="button" class="gfQuickGenre" data-genre="${esc(genre)}" title="Open retag module for ${esc(genre)}" style="display:grid;grid-template-columns:minmax(180px,260px) 1fr auto;gap:8px;align-items:center;margin:6px 0;width:100%;background:transparent;border:1px solid transparent;border-radius:8px;padding:4px;cursor:pointer;color:inherit;text-align:left;">
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(genre)}">${esc(genre)}</div>
          <div style="height:12px;background:#0a1222;border:1px solid #334;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7dd3fc,#a78bfa);"></div>
          </div>
          <div style="font-variant-numeric:tabular-nums;min-width:52px;text-align:right;">${count.toLocaleString()}</div>
        </button>
      `;
    }).join('');
    return `<div>${body}</div>`;
  }

  function renderRatingBars(rows){
    const list = Array.isArray(rows) ? rows.slice() : [];
    if (!list.length) return '<div class="muted">No rating data.</div>';
    list.sort((a, b) => Number(a?.rating || 0) - Number(b?.rating || 0));
    const max = Math.max(1, ...list.map((r) => Number(r?.count || 0)));
    const body = list.map((r) => {
      const rating = Number(r?.rating || 0);
      const count = Number(r?.count || 0);
      const pct = Math.max(2, Math.round((count / max) * 100));
      const label = rating === 0 ? '0 (unrated)' : String(rating);
      return `
        <div style="display:grid;grid-template-columns:minmax(180px,260px) 1fr auto;gap:8px;align-items:center;margin:6px 0;">
          <div class="muted">${esc(label)}</div>
          <div style="height:12px;background:#0a1222;border:1px solid #334;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#86efac,#22c55e);"></div>
          </div>
          <div style="font-variant-numeric:tabular-nums;min-width:52px;text-align:right;">${count.toLocaleString()}</div>
        </div>
      `;
    }).join('');
    return `<div>${body}</div>`;
  }

  function renderGenreFolderPicker(rows){
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '<div class="muted">No folders for selected genre.</div>';
    const body = list.map((r, i) => `
      <tr>
        <td><input type="checkbox" class="gfFolderChk" data-idx="${i}"></td>
        <td>${esc(r.folder)} <span class="muted">(${esc(r.artist || 'Unknown Artist')})</span></td>
        <td>${Number(r.trackCount || 0).toLocaleString()}</td>
      </tr>
    `).join('');
    return `
      <div class="row" style="margin:6px 0 8px;">
        <label><input type="checkbox" id="gfAll"> Check/uncheck all folders</label>
      </div>
      <table>
        <thead><tr><th></th><th>Folder</th><th>Tracks</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function summarizeSkipDetails(details){
    const rows = Array.isArray(details) ? details : [];
    if (!rows.length) return '';
    const m = new Map();
    rows.forEach((r) => {
      const k = String(r?.reason || 'unknown');
      m.set(k, Number(m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).map(([k,v]) => `${k}: ${v}`).join(', ');
  }

  function folderOf(file){
    const f = String(file || '');
    const i = f.lastIndexOf('/');
    return i > 0 ? f.slice(0, i) : '(root)';
  }
  function leafName(p){
    const s = String(p || '');
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
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
            <td>${esc(r.artist)}</td><td>${esc(r.title)}</td><td>${esc(r.album)}</td><td>${esc(leafName(r.file))}</td>
          </tr>
        `).join('');
        const albumName = folder === '(root)' ? '(root)' : leafName(folder);
        const artistSet = new Set(items.map(({ r }) => String(r.artist || '').trim()).filter(Boolean));
        const artistLabel = artistSet.size === 1 ? Array.from(artistSet)[0] : (artistSet.size > 1 ? 'Various Artists' : 'Unknown Artist');
        return `
          <details style="margin:6px 0;">
            <summary><input type="checkbox" class="${prefix}FolderChk" data-folder="${token}"> ${esc(albumName)} — <span class="muted">${esc(artistLabel)}</span> <span class="muted">(${items.length})</span></summary>
            <div class="muted" style="margin:4px 0 6px 22px;">${esc(folder)}</div>
            <table>
              <thead><tr><th></th><th>Artist</th><th>Title</th><th>Album</th><th>Track File</th></tr></thead>
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
        ['Total Albums', s.totalAlbums],
        ['Unrated (0/missing)', s.unrated],
        ['Low Rated (=1)', s.lowRated1],
        ['Missing MBID', s.missingMbid],
        ['Missing Genre', s.missingGenre],
      ];
      cards.innerHTML = items.map(([k,v])=>`<div class="card"><div class="k">${esc(k)}</div><div class="v">${Number(v||0).toLocaleString()}</div></div>`).join('');

      const sampleMap = j.samples || {};
      let missingRows = sampleMap.missingGenre || [];
      let unratedRows = sampleMap.unrated || [];
      let missingRemaining = Number(s.missingGenre || 0);
      let unratedRemaining = Number(s.unrated || 0);

      sections.innerHTML = `
        <details id="mawModule">
          <summary>Missing artwork albums</summary>
          <div class="row" style="margin:8px 0;">
            <button id="mawSearch">Search for missing art</button>
            <span class="muted" id="mawStatus">Search is on-demand to keep initial load fast.</span>
          </div>
          <div id="mawListHost"></div>
        </details>

        <details id="aaModule">
          <summary>Update album art</summary>
          <div class="row" style="margin:8px 0;align-items:flex-end;">
            <label>Album
              <select id="aaAlbum" style="padding:6px 8px;border-radius:8px;background:#0a1222;color:#eef;border:1px solid #334;min-width:360px;max-width:520px;">
                <option value="">Select album…</option>
              </select>
            </label>
            <button id="aaLoad">Load art</button>
            <label>New image
              <input id="aaFile" type="file" accept="image/*" />
            </label>
            <label><input type="radio" name="aaMode" value="cover" /> Add cover.jpg</label>
            <label><input type="radio" name="aaMode" value="embed" /> Embed image</label>
            <label><input type="radio" name="aaMode" value="both" checked /> Both</label>
            <button id="aaApply">Apply art</button>
            <span class="muted" id="aaStatus"></span>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
            <img id="aaPreview" alt="Album art preview" style="width:180px;height:180px;object-fit:cover;border:1px solid #334;border-radius:10px;background:#0a1222;" />
            <div class="muted" id="aaMeta">Select an album and click “Load art”.</div>
          </div>
        </details>

        <details id="gfModule">
          <summary>Retag folders by genre</summary>
          <div class="row" style="margin:8px 0;">
            <label>Current genre
              <select id="gfSourceGenre" style="padding:6px 8px;border-radius:8px;background:#0a1222;color:#eef;border:1px solid #334;max-width:280px;">
                <option value="">Select…</option>
                ${(j.genreOptions || []).map((g) => `<option>${esc(g)}</option>`).join('')}
              </select>
            </label>
            <button id="gfLoad">Load folders</button>
            <label>New genre
              <select id="gfTargetGenre" style="padding:6px 8px;border-radius:8px;background:#0a1222;color:#eef;border:1px solid #334;max-width:280px;">
                <option value="">Select…</option>
                ${(j.genreOptions || []).map((g) => `<option>${esc(g)}</option>`).join('')}
              </select>
            </label>
            <button id="gfApply">Apply to checked folders</button>
            <span class="muted" id="gfStatus"></span>
          </div>
          <div id="gfListHost"><div class="muted">Pick a current genre, then click “Load folders”.</div></div>
        </details>

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
          <div id="urListHost">${renderFolderSelection('ur', unratedRows)}</div>
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
          <div id="mgListHost">${renderFolderSelection('mg', missingRows)}</div>
        </details>

        <details open>
          <summary>Ratings distribution</summary>
          ${renderRatingBars(j.ratingCounts || [])}
        </details>

        <details open>
          <summary>Genre counts (all ${Number((j.genreCounts || []).length || 0).toLocaleString()})</summary>
          ${renderGenreBars(j.genreCounts || [])}
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

            const appliedSet = new Set((jj.updatedFiles && jj.updatedFiles.length) ? jj.updatedFiles : files);
            unratedRows = unratedRows.filter((row) => !appliedSet.has(row.file));
            unratedRemaining = Math.max(0, unratedRemaining - Number(jj.updated || 0));
            setCardValue(/Unrated/i, unratedRemaining);

            const details = urApplyBtn.closest('details');
            if (details) {
              const summaryEl = details.querySelector('summary');
              if (summaryEl) summaryEl.textContent = `Unrated samples (${unratedRows.length})`;
              const listHost = details.querySelector('#urListHost');
              if (listHost) {
                listHost.innerHTML = renderFolderSelection('ur', unratedRows);
                initFolderSelectionHandlers('ur');
              }
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
            if (mgStatus) {
              const skipSummary = summarizeSkipDetails(jj.skippedDetails);
              mgStatus.textContent = `Updated ${jj.updated}/${jj.requested} (skipped ${jj.skipped})${skipSummary ? ` · ${skipSummary}` : ''}`;
            }

            const appliedSet = new Set((jj.updatedFiles && jj.updatedFiles.length) ? jj.updatedFiles : files);
            missingRows = missingRows.filter((row) => !appliedSet.has(row.file));
            missingRemaining = Math.max(0, missingRemaining - Number(jj.updated || 0));
            setCardValue(/Missing Genre/i, missingRemaining);

            const details = mgApplyBtn.closest('details');
            if (details) {
              const summaryEl = details.querySelector('summary');
              if (summaryEl) summaryEl.textContent = `Missing Genre samples (${missingRows.length})`;
              const listHost = details.querySelector('#mgListHost');
              if (listHost) {
                listHost.innerHTML = renderFolderSelection('mg', missingRows);
                initFolderSelectionHandlers('mg');
              }
            }
          } catch (e) {
            if (mgStatus) mgStatus.textContent = `Error: ${e?.message || e}`;
          }
        });
      }

      function renderMissingArtworkRows(rows){
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) return '<div class="muted">No missing artwork albums.</div>';
        const body = list.map((r, i) => `
          <tr>
            <td><button type="button" class="mawPick" data-idx="${i}" style="padding:4px 8px;border-radius:8px;border:1px solid #4b5;background:#17324f;color:#fff;cursor:pointer;">Open</button></td>
            <td>${esc(r.folder)} <span class="muted">(${esc(r.artist || 'Unknown Artist')})</span></td>
            <td>${esc(r.album || '')}</td>
            <td>${Number(r.trackCount || 0).toLocaleString()}</td>
          </tr>
        `).join('');
        return `<table><thead><tr><th></th><th>Folder</th><th>Album</th><th>Tracks</th></tr></thead><tbody>${body}</tbody></table>`;
      }

      // Album art module
      const aaAlbum = $('aaAlbum');
      const aaLoad = $('aaLoad');
      const aaApply = $('aaApply');
      const aaFile = $('aaFile');
      const aaStatus = $('aaStatus');
      const aaPreview = $('aaPreview');
      const aaMeta = $('aaMeta');

      async function loadAlbumOptions(){
        try {
          const r = await fetch(`${apiBase}/config/library-health/albums`, { headers: { 'x-track-key': key } });
          const jj = await r.json();
          if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
          const rows = Array.isArray(jj.albums) ? jj.albums : [];
          if (aaAlbum) aaAlbum.innerHTML = `<option value="">Select album…</option>${rows.map((a)=>`<option value="${esc(a.id)}">${esc(a.label)} (${Number(a.trackCount||0).toLocaleString()})</option>`).join('')}`;
        } catch (e) {
          if (aaStatus) aaStatus.textContent = `Albums error: ${e?.message || e}`;
        }
      }

      async function loadAlbumArt(folder){
        const f = String(folder || '').trim();
        if (!f) { if (aaStatus) aaStatus.textContent = 'Pick an album first.'; return; }
        if (aaPreview) aaPreview.removeAttribute('src');
        if (aaFile) aaFile.value = '';
        if (aaMeta) aaMeta.textContent = 'Loading selected album artwork…';
        if (aaStatus) aaStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Loading art…';
        try {
          const r = await fetch(`${apiBase}/config/library-health/album-art?folder=${encodeURIComponent(f)}`, { headers: { 'x-track-key': key } });
          const jj = await r.json();
          if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
          if (jj.hasCover && jj.dataBase64) {
            if (aaPreview) aaPreview.src = `data:${jj.mimeType || 'image/jpeg'};base64,${jj.dataBase64}`;
            if (aaMeta) aaMeta.textContent = `Loaded cover.jpg for ${f}`;
          } else {
            if (aaPreview) aaPreview.removeAttribute('src');
            if (aaMeta) aaMeta.textContent = `No cover.jpg found for ${f}`;
          }
          if (aaStatus) aaStatus.textContent = 'Ready.';
        } catch (e) {
          if (aaStatus) aaStatus.textContent = `Error: ${e?.message || e}`;
        }
      }

      if (aaLoad) aaLoad.addEventListener('click', async () => { await loadAlbumArt(aaAlbum?.value || ''); });
      if (aaAlbum) {
        aaAlbum.addEventListener('change', () => {
          if (aaPreview) aaPreview.removeAttribute('src');
          if (aaFile) aaFile.value = '';
          if (aaMeta) aaMeta.textContent = 'Album changed. Click “Load art”.';
        });
      }

      if (aaApply) {
        aaApply.addEventListener('click', async () => {
          const folder = String(aaAlbum?.value || '').trim();
          const file = aaFile?.files?.[0];
          if (!folder) { if (aaStatus) aaStatus.textContent = 'Pick an album first.'; return; }
          if (!file) { if (aaStatus) aaStatus.textContent = 'Choose an image file first.'; return; }
          const toBase64 = async (f) => {
            const ab = await f.arrayBuffer();
            const bytes = new Uint8Array(ab);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
          };
          if (aaStatus) aaStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Updating album art…';
          try {
            const b64 = await toBase64(file);
            const modeEl = document.querySelector('input[name="aaMode"]:checked');
            const mode = String(modeEl?.value || 'both');
            const r = await fetch(`${apiBase}/config/library-health/album-art`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-track-key': key },
              body: JSON.stringify({ folder, imageBase64: b64, mode }),
            });
            const raw = await r.text();
            let jj = null;
            try { jj = raw ? JSON.parse(raw) : null; } catch (_) {}
            if (!r.ok || !jj?.ok) {
              if (r.status === 413) throw new Error('Image is too large to upload (HTTP 413). Try a smaller JPEG.');
              throw new Error(jj?.error || `HTTP ${r.status}`);
            }
            if (aaPreview) aaPreview.src = URL.createObjectURL(file);
            if (aaMeta) {
              const coverState = jj.coverCreated ? 'created' : (jj.coverUpdated ? 'updated' : 'unchanged');
              aaMeta.textContent = `${folder} · mode: ${jj.mode || 'both'} · updated tracks: ${jj.updatedTracks}/${jj.totalFiles} · cover.jpg ${coverState}`;
            }
            if (aaStatus) aaStatus.textContent = 'Album art updated.';
          } catch (e) {
            if (aaStatus) aaStatus.textContent = `Error: ${e?.message || e}`;
          }
        });
      }

      let missingArtworkAlbums = [];
      const mawStatus = $('mawStatus');
      const mawListHost = $('mawListHost');

      async function loadMissingArtwork(){
        if (mawStatus) mawStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Full library scan for missing artwork…';
        try {
          const r = await fetch(`${apiBase}/config/library-health/missing-artwork`, { headers: { 'x-track-key': key } });
          const jj = await r.json();
          if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
          missingArtworkAlbums = Array.isArray(jj.albums) ? jj.albums : [];
          if (mawListHost) mawListHost.innerHTML = renderMissingArtworkRows(missingArtworkAlbums);
          if (mawStatus) mawStatus.textContent = `Loaded ${Number(jj.totalMissing || missingArtworkAlbums.length).toLocaleString()} albums missing artwork.`;
          document.querySelectorAll('.mawPick').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const idx = Number(btn.getAttribute('data-idx'));
              const row = missingArtworkAlbums[idx];
              if (!row) return;
              if (aaAlbum) aaAlbum.value = row.folder;
              const aaModule = $('aaModule');
              if (aaModule) aaModule.open = true;
              aaModule?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              await loadAlbumArt(row.folder);
            });
          });
        } catch (e) {
          if (mawStatus) mawStatus.textContent = `Error: ${e?.message || e}`;
        }
      }

      await loadAlbumOptions();

      const mawSearchBtn = $('mawSearch');
      if (mawSearchBtn) {
        mawSearchBtn.addEventListener('click', async () => {
          const ok = window.confirm('Note: A thorough search will be performed for all tracks; this could take several minutes.\n\nClick OK to continue, or Cancel to stop.');
          if (!ok) return;
          const mod = $('mawModule');
          if (mod) mod.open = true;
          await loadMissingArtwork();
        });
      }

      let gfFolders = [];
      const gfLoadBtn = $('gfLoad');
      const gfApplyBtn = $('gfApply');
      const gfStatus = $('gfStatus');
      const gfListHost = $('gfListHost');

      function bindGenreFolderChecks(){
        const all = $('gfAll');
        if (all) {
          all.addEventListener('change', () => {
            document.querySelectorAll('.gfFolderChk').forEach((el) => { el.checked = all.checked; });
          });
        }
      }

      async function loadGenreFolders(sourceGenre){
        const genre = String(sourceGenre || '').trim();
        if (!genre) { if (gfStatus) gfStatus.textContent = 'Pick a current genre first.'; return; }
        if (gfStatus) gfStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Loading folders…';
        try {
          const r = await fetch(`${apiBase}/config/library-health/genre-folders?genre=${encodeURIComponent(genre)}`, {
            headers: { 'x-track-key': key },
          });
          const jj = await r.json();
          if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);
          gfFolders = Array.isArray(jj.folders) ? jj.folders : [];
          if (gfListHost) gfListHost.innerHTML = renderGenreFolderPicker(gfFolders);
          bindGenreFolderChecks();
          if (gfStatus) gfStatus.textContent = `Loaded ${Number(jj.folderCount || gfFolders.length).toLocaleString()} folders.`;
        } catch (e) {
          if (gfStatus) gfStatus.textContent = `Error: ${e?.message || e}`;
        }
      }

      if (gfLoadBtn) {
        gfLoadBtn.addEventListener('click', async () => {
          const sourceGenre = ($('gfSourceGenre')?.value || '').trim();
          await loadGenreFolders(sourceGenre);
        });
      }

      document.querySelectorAll('.gfQuickGenre').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const genre = String(btn.getAttribute('data-genre') || '').trim();
          const sourceSel = $('gfSourceGenre');
          if (sourceSel) sourceSel.value = genre;
          const mod = $('gfModule');
          if (mod) mod.open = true;
          mod?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          await loadGenreFolders(genre);
        });
      });

      if (gfApplyBtn) {
        gfApplyBtn.addEventListener('click', async () => {
          const targetGenre = ($('gfTargetGenre')?.value || '').trim();
          if (!targetGenre) { if (gfStatus) gfStatus.textContent = 'Pick a new genre first.'; return; }

          const selectedIdx = Array.from(document.querySelectorAll('.gfFolderChk:checked')).map((el) => Number(el.getAttribute('data-idx'))).filter((n) => Number.isFinite(n));
          if (!selectedIdx.length) { if (gfStatus) gfStatus.textContent = 'No folders checked.'; return; }

          const fileSet = new Set();
          selectedIdx.forEach((idx) => {
            const row = gfFolders[idx];
            if (!row || !Array.isArray(row.files)) return;
            row.files.forEach((f) => { if (f) fileSet.add(f); });
          });
          const files = Array.from(fileSet);
          if (!files.length) { if (gfStatus) gfStatus.textContent = 'No track files found for selected folders.'; return; }

          if (gfStatus) gfStatus.innerHTML = '<span class="spin" aria-hidden="true"></span>Tagging, please wait…';
          try {
            const r = await fetch(`${apiBase}/config/library-health/genre-batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-track-key': key },
              body: JSON.stringify({ files, genre: targetGenre }),
            });
            const jj = await r.json();
            if (!r.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${r.status}`);

            const updatedSet = new Set(Array.isArray(jj.updatedFiles) ? jj.updatedFiles : []);
            const selectedSet = new Set(selectedIdx);
            let removedCount = 0;
            gfFolders = gfFolders.filter((row, i) => {
              if (!selectedSet.has(i)) return true;
              const filesInFolder = Array.isArray(row?.files) ? row.files : [];
              const allUpdated = filesInFolder.length > 0 && filesInFolder.every((f) => updatedSet.has(f));
              if (allUpdated) {
                removedCount += 1;
                return false;
              }
              return true;
            });
            if (gfListHost) gfListHost.innerHTML = renderGenreFolderPicker(gfFolders);
            bindGenreFolderChecks();
            if (gfStatus) {
              const base = `Updated ${jj.updated}/${jj.requested} (skipped ${jj.skipped}).`;
              const skipSummary = summarizeSkipDetails(jj.skippedDetails);
              if (Number(jj.updated || 0) <= 0) {
                gfStatus.textContent = `${base} No tracks were changed — folder(s) kept in view.${skipSummary ? ` Skip reasons: ${skipSummary}.` : ''}`;
              } else {
                gfStatus.textContent = `${base} Removed ${removedCount} fully-updated folders from view.${skipSummary ? ` Skip reasons: ${skipSummary}.` : ''}`;
              }
            }
          } catch (e) {
            if (gfStatus) gfStatus.textContent = `Error: ${e?.message || e}`;
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
