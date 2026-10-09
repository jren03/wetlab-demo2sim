// Renders catalog.json: asset gallery (filters tasks), one row of category chips,
// a grid of task cards, and a comparison dialog (human / MuJoCo, two cameras).
(async function () {
  const catalog = await (await fetch("catalog.json")).json();
  const tasks = catalog.tasks;
  const assets = catalog.assets;
  const $ = (id) => document.getElementById(id);
  let selectedTag = null;
  let selectedAsset = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : typeof v === "object" ? JSON.stringify(v) : String(v));
  const mm = (m) => `${(m * 1000).toFixed(1)} mm`;
  const tagsOf = (t) => [t.embodiment, ...t.tags];
  const visible = () => tasks.filter((t) => (!selectedTag || tagsOf(t).includes(selectedTag)) && (!selectedAsset || t.assets.includes(selectedAsset)));

  function renderAssets() {
    $("asset-grid").innerHTML = assets.map((a) => {
      const n = tasks.filter((t) => t.assets.includes(a.id)).length;
      return `<button class="asset ${selectedAsset === a.id ? "active" : ""}" data-asset="${esc(a.id)}" type="button"><img src="${esc(a.image)}" alt="${esc(a.label)}" loading="lazy"><span>${esc(a.label)}</span><small>${n} task${n === 1 ? "" : "s"}</small></button>`;
    }).join("");
    $("asset-grid").querySelectorAll(".asset").forEach((b) => b.addEventListener("click", () => {
      selectedAsset = selectedAsset === b.dataset.asset ? null : b.dataset.asset;
      render();
      if (selectedAsset) $("tasks").scrollIntoView({ behavior: "smooth" });
    }));
  }

  function renderFilters() {
    const counts = {};
    tasks.forEach((t) => tagsOf(t).forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
    const chips = Object.keys(counts).sort().map((g) => `<button type="button" class="chip ${selectedTag === g ? "active" : ""}" data-tag="${esc(g)}">${esc(g)} <span>${counts[g]}</span></button>`).join("");
    const hidden = catalog.attempted - tasks.length;
    $("filters").innerHTML = chips + `<button type="button" class="chip reset" id="clear-filters">Clear</button><span class="showing">${visible().length} of ${tasks.length} tasks${hidden > 0 ? ` (${hidden} attempts not shown)` : ""}</span>`;
    $("filters").querySelectorAll("[data-tag]").forEach((b) => b.addEventListener("click", () => { selectedTag = selectedTag === b.dataset.tag ? null : b.dataset.tag; render(); }));
    $("clear-filters").addEventListener("click", () => { selectedTag = selectedAsset = null; render(); });
  }

  function renderGrid() {
    const list = visible();
    $("grid").innerHTML = list.length ? list.map((t) => `<article class="card" data-id="${esc(t.key)}" tabindex="0">
      <video src="${esc(t.robot_video)}" poster="${esc(t.robot_poster)}" muted playsinline loop preload="none"></video>
      <h3>${esc(t.title)}</h3><p>${esc(tagsOf(t).join(" · "))}</p></article>`).join("") : `<p class="hint">No task matches.</p>`;
    $("grid").querySelectorAll(".card").forEach((el) => {
      const v = el.querySelector("video");
      el.addEventListener("mouseenter", () => v.play().catch(() => {}));
      el.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0; });
      el.addEventListener("click", () => openTask(el.dataset.id));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") openTask(el.dataset.id); });
    });
  }

  function render() { renderAssets(); renderFilters(); renderGrid(); }

  const dialog = $("detail");
  const panel = (title, src, note) => src
    ? `<section><h3>${esc(title)}</h3><video src="${esc(src)}" controls muted playsinline preload="metadata"></video><p class="note">${esc(note)}</p></section>`
    : `<section class="missing"><h3>${esc(title)}</h3><p class="note">not available</p></section>`;
  function openTask(id) {
    const t = tasks.find((x) => x.key === id);
    $("detail-title").textContent = t.title;
    $("detail-desc").textContent = `${tagsOf(t).join(" · ")} · ${t.success ? "all checks pass" : "checks fail"}`;
    $("comparison").innerHTML = panel("Human", t.human_video, `${t.human.source} (${t.human.license})`) + panel("MuJoCo", t.robot_video, "scripted episode") + panel("MuJoCo close-up", t.closeup_video, "second camera");
    const checks = t.checks.map((c) => `<tr><td class="${c.passed ? "ok" : "fail"}">${c.passed ? "pass" : "fail"}</td><td>${esc(c.name)}</td><td><code>${esc(fmt(c.measured))}</code></td><td><code>${esc(fmt(c.tolerance))}</code></td></tr>`).join("");
    $("detail-body").innerHTML = `
      <p><strong>Goal.</strong> ${esc(t.goal)}</p>
      <p><strong>Adaptation.</strong> ${esc(t.adaptation)}</p>
      <p><strong>Human clip.</strong> ${esc(t.human.source)}, ${esc(t.human.dataset)} (${esc(t.human.license)}); ${t.human.phases_inferred_from_frames.map((p) => `${p.t[0].toFixed(1)}–${p.t[1].toFixed(1)} s ${esc(p.phase)}`).join("; ")}.</p>
      <table><thead><tr><th></th><th>check (from simulator state)</th><th>measured</th><th>tolerance</th></tr></thead><tbody>${checks}</tbody></table>
      <p>Max end-effector tracking error ${mm(t.max_tcp_error_m)}; max interpenetration ${mm(t.max_penetration_m)}; episode ${t.sim_seconds.toFixed(1)} s.</p>
      <p class="note">Run ${esc(t.run_id)} · ${esc(t.robot)}</p>`;
    $("detail-more").open = false;
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    dialog.showModal();
    dialog.scrollTop = 0;
  }
  const vids = () => [...dialog.querySelectorAll("video")];
  $("play-all").addEventListener("click", () => vids().forEach((v) => v.play().catch(() => {})));
  $("restart-all").addEventListener("click", () => vids().forEach((v) => { v.currentTime = 0; v.play().catch(() => {}); }));
  $("close-detail").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { vids().forEach((v) => v.pause()); history.replaceState(null, "", location.pathname); });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  render();
  const wanted = decodeURIComponent(location.hash.slice(1));
  if (tasks.some((t) => t.key === wanted)) openTask(wanted);
})();
