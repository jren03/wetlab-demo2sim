// Renders catalog.json: an asset gallery that filters tasks, a task grid with
// embodiment/skill chips, and a comparison dialog (human / MuJoCo overview /
// MuJoCo close-up / Genesis replay) with checks, adaptation, provenance and the
// sim-to-sim divergence table. No results are embedded in this file.
(async function () {
  const catalog = await (await fetch("catalog.json")).json();
  const tasks = catalog.tasks;
  const assets = catalog.assets;
  const $ = (id) => document.getElementById(id);
  let selectedTag = null;
  let selectedAsset = null;
  let selectedEmbodiment = null;

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v) => {
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
    if (Array.isArray(v) || (v && typeof v === "object")) return JSON.stringify(v);
    return String(v);
  };
  const mm = (m) => `${(m * 1000).toFixed(1)} mm`;

  const visible = () =>
    tasks.filter(
      (t) =>
        (!selectedTag || t.tags.includes(selectedTag)) &&
        (!selectedAsset || t.assets.includes(selectedAsset)) &&
        (!selectedEmbodiment || t.embodiment === selectedEmbodiment)
    );

  // ---- header summary -------------------------------------------------------
  const passed = tasks.filter((t) => t.success).length;
  const bimanual = tasks.filter((t) => t.arms === 2).length;
  const hands = tasks.filter((t) => t.end_effector !== "2f85").length;
  const hidden = catalog.attempted - tasks.length;
  $("summary").textContent =
    `${tasks.length} task episodes (${bimanual} bimanual, ${hands} with a dexterous hand) from ${new Set(tasks.map((t) => t.human.dataset)).size} human video sources; ` +
    `${passed} of ${tasks.length} shown pass every check` +
    (hidden > 0 ? `; ${hidden} further task/embodiment attempts did not pass and are not shown` : "") +
    `; ${assets.length} assets.`;

  // ---- assets ---------------------------------------------------------------
  function renderAssets() {
    $("asset-grid").innerHTML = assets
      .map((a) => {
        const n = tasks.filter((t) => t.assets.includes(a.id)).length;
        return `<button class="asset ${selectedAsset === a.id ? "active" : ""}" data-asset="${esc(a.id)}" type="button">
          <img src="${esc(a.image)}" alt="${esc(a.label)}" loading="lazy">
          <span class="label">${esc(a.label)}</span><span class="count">${n} task${n === 1 ? "" : "s"}</span></button>`;
      })
      .join("");
    $("asset-grid").querySelectorAll(".asset").forEach((b) =>
      b.addEventListener("click", () => {
        selectedAsset = selectedAsset === b.dataset.asset ? null : b.dataset.asset;
        renderAssets();
        renderFilters();
        renderGrid();
        if (selectedAsset) $("tasks").scrollIntoView({ behavior: "smooth" });
      })
    );
  }

  // ---- filters --------------------------------------------------------------
  function chip(label, active, cls, data) {
    return `<button type="button" class="chip ${cls} ${active ? "active" : ""}" ${data}>${esc(label)}</button>`;
  }
  function renderFilters() {
    const embodiments = [...new Set(tasks.map((t) => t.embodiment))].sort();
    const tagCounts = {};
    tasks.forEach((t) => t.tags.forEach((g) => (tagCounts[g] = (tagCounts[g] || 0) + 1)));
    const tagList = Object.keys(tagCounts).sort();
    const shown = visible().length;
    $("filters").innerHTML =
      `<span class="group">Embodiment</span>` +
      embodiments.map((e) => chip(e, selectedEmbodiment === e, "embodiment", `data-embodiment="${esc(e)}"`)).join("") +
      `<span class="group">Skill</span>` +
      tagList.map((g) => chip(`${g} (${tagCounts[g]})`, selectedTag === g, "tag", `data-tag="${esc(g)}"`)).join("") +
      (selectedAsset ? chip(`asset: ${assets.find((a) => a.id === selectedAsset).label}`, true, "asset-chip", `data-clear-asset="1"`) : "") +
      `<button type="button" class="chip reset" id="clear-filters">Clear</button>` +
      `<span class="showing">Showing ${shown} of ${tasks.length}</span>`;
    $("filters").querySelectorAll("[data-embodiment]").forEach((b) =>
      b.addEventListener("click", () => {
        selectedEmbodiment = selectedEmbodiment === b.dataset.embodiment ? null : b.dataset.embodiment;
        renderFilters(); renderGrid();
      })
    );
    $("filters").querySelectorAll("[data-tag]").forEach((b) =>
      b.addEventListener("click", () => {
        selectedTag = selectedTag === b.dataset.tag ? null : b.dataset.tag;
        renderFilters(); renderGrid();
      })
    );
    const clearAsset = $("filters").querySelector("[data-clear-asset]");
    if (clearAsset) clearAsset.addEventListener("click", () => { selectedAsset = null; renderAssets(); renderFilters(); renderGrid(); });
    $("clear-filters").addEventListener("click", () => {
      selectedTag = selectedAsset = selectedEmbodiment = null;
      renderAssets(); renderFilters(); renderGrid();
    });
  }

  // ---- grid -----------------------------------------------------------------
  function card(t) {
    return `<article class="card" data-id="${esc(t.key)}" tabindex="0">
      <div class="preview">
        <video src="${esc(t.robot_video)}" poster="${esc(t.robot_poster)}" muted playsinline loop preload="none"></video>
        <span class="badge ${t.success ? "ok" : "fail"}">${t.success ? "all checks pass" : "checks FAIL"}</span>
      </div>
      <h3>${esc(t.title)}</h3>
      <p class="tags">${esc(t.embodiment)}${t.tags.map((g) => ` · ${esc(g)}`).join("")}</p>
      <p class="source">Human: ${esc(t.human.source)} · ${esc(t.human.dataset)}</p>
    </article>`;
  }
  function renderGrid() {
    const list = visible();
    $("grid").innerHTML = list.length ? list.map(card).join("") : `<p class="empty">No task matches these filters.</p>`;
    $("grid").querySelectorAll(".card").forEach((el) => {
      const v = el.querySelector("video");
      el.addEventListener("mouseenter", () => { v.play().catch(() => {}); });
      el.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0; });
      el.addEventListener("click", () => openTask(el.dataset.id));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") openTask(el.dataset.id); });
    });
  }

  // ---- detail dialog ---------------------------------------------------------
  const dialog = $("detail");
  function videoPanel(title, src, note) {
    if (!src) return `<section class="panel missing"><h3>${esc(title)}</h3><p class="note">not available for this task</p></section>`;
    return `<section class="panel"><h3>${esc(title)}</h3><video src="${esc(src)}" controls muted playsinline preload="metadata"></video><p class="note">${esc(note)}</p></section>`;
  }
  function checksTable(t) {
    const rows = t.checks
      .map(
        (c) => `<tr><td class="status ${c.passed ? "ok" : "fail"}">${c.passed ? "pass" : "FAIL"}</td><td>${esc(c.name)}${c.privileged ? ' <span class="priv" title="computed from simulator state">privileged</span>' : ""}</td><td><code>${esc(fmt(c.measured))}</code></td><td><code>${esc(fmt(c.tolerance))}</code></td></tr>`
      )
      .join("");
    return `<table><thead><tr><th></th><th>check</th><th>measured</th><th>tolerance</th></tr></thead><tbody>${rows}</tbody></table>
      <dl class="kv"><dt>max end-effector tracking error</dt><dd>${mm(t.max_tcp_error_m)}</dd><dt>max interpenetration</dt><dd>${mm(t.max_penetration_m)}</dd><dt>episode</dt><dd>${t.sim_seconds.toFixed(1)} s, ${esc(t.mode)} mode</dd></dl>`;
  }
  function sim2simTable(t) {
    const s = t.sim2sim;
    if (!s) return "<p>No Genesis replay for this run.</p>";
    const rows = Object.keys(s.final_divergence_m)
      .map((b) => `<tr><td>${esc(b)}</td><td>${mm(s.final_divergence_m[b])}</td><td>${mm(s.max_divergence_m[b])}</td></tr>`)
      .join("");
    const emulated = (s.emulated_equalities || []).map((e) => e.name).join(", ");
    return `<p>${esc(s.simulator)} replayed ${(s.fraction_replayed * 100).toFixed(0)}% of the episode${emulated ? `; constraints emulated at run time: ${esc(emulated)}` : ""}. Genesis max interpenetration ${mm(s.max_penetration_m)}.</p>
      <table><thead><tr><th>tracked body</th><th>final divergence from MuJoCo</th><th>max divergence</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function openTask(id) {
    const t = tasks.find((x) => x.key === id);
    $("detail-title").textContent = t.title;
    $("detail-meta").textContent = `${t.embodiment} · ${t.tags.join(" · ")} · ${t.success ? "all checks pass" : "checks FAIL"}`;
    $("comparison").innerHTML =
      videoPanel("Human", t.human_video, `${t.human.source} (${t.human.license})`) +
      videoPanel("MuJoCo", t.robot_video, "scripted episode, overview camera") +
      videoPanel("MuJoCo close-up", t.closeup_video, "same episode, close-up camera") +
      videoPanel("Genesis replay", t.genesis_video, "same commands replayed in Genesis");
    const phases = t.human.phases_inferred_from_frames
      .map((p) => `<li>${p.t[0].toFixed(1)}–${p.t[1].toFixed(1)} s: ${esc(p.phase)}</li>`)
      .join("");
    $("detail-body").innerHTML = `
      <p><strong>Goal.</strong> ${esc(t.goal)}</p>
      <p><strong>Adaptation.</strong> ${esc(t.adaptation)}</p>
      <p><strong>Assets.</strong> ${t.assets.map((a) => esc(assets.find((x) => x.id === a).label)).join(", ")}</p>
      <details open><summary>Checks (${t.checks.filter((c) => c.passed).length}/${t.checks.length} passed)</summary>${checksTable(t)}</details>
      <details><summary>Sim-to-sim: Genesis replay</summary>${sim2simTable(t)}</details>
      <details><summary>Human clip phases and provenance</summary><ul>${phases}</ul>
        <dl class="kv"><dt>source</dt><dd>${esc(t.human.source)} (${esc(t.human.dataset)}, ${esc(t.human.license)})</dd><dt>url</dt><dd><code>${esc(t.human.url)}</code></dd><dt>revision</dt><dd><code>${esc(t.human.revision)}</code></dd><dt>sha256</dt><dd><code>${esc(t.human.sha256)}</code></dd><dt>camera</dt><dd>${esc(t.human.camera)}</dd><dt>notes</dt><dd>${esc(t.human.notes)}</dd></dl></details>
      ${t.review_sheet ? `<details><summary>Phase sheet: human phases vs simulation segments</summary><img src="${esc(t.review_sheet)}" alt="phase comparison sheet" loading="lazy"></details>` : ""}
      <details><summary>Run provenance</summary><dl class="kv"><dt>run id</dt><dd><code>${esc(t.run_id)}</code></dd><dt>code</dt><dd><code>${esc(fmt(t.code))}</code></dd><dt>robot</dt><dd>${esc(t.robot)}</dd></dl></details>`;
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    dialog.showModal();
    dialog.scrollTop = 0;
  }
  const vids = () => [...dialog.querySelectorAll("video")];
  $("play-all").addEventListener("click", () => vids().forEach((v) => v.play().catch(() => {})));
  $("pause-all").addEventListener("click", () => vids().forEach((v) => v.pause()));
  $("restart-all").addEventListener("click", () => vids().forEach((v) => { v.currentTime = 0; v.play().catch(() => {}); }));
  $("speed").addEventListener("change", (e) => vids().forEach((v) => (v.playbackRate = Number(e.target.value))));
  $("close-detail").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { vids().forEach((v) => v.pause()); history.replaceState(null, "", location.pathname); });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  renderAssets();
  renderFilters();
  renderGrid();
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (tasks.some((t) => t.key === wanted)) openTask(wanted);
})();
