const CARD_W = 150;
const CARD_H = 190;
const H_GAP = 60;
const V_GAP = 60;

/* ✅ MEMBERS-ийг ЭНД зарлана (хамгийн дээр) */
let members = [];
let nextId = 1;
let pendingDeleteMember = null;
let pendingMediaDelete = null;
// { member, type: "image" | "video", index }
/* ✅ глобалд харагдуулна */
window.members = members;
window.getMembers = () => members;

let renderQueued = false;
let saveTimer = null;
let saving = false;
// ================== DATA MODEL ==================
class FamilyMember {
  constructor({
    id,
    name,
    age,
    sex,
    level,
    photoUrl,

    // NEW (optional)
    familyName,
    fatherName,
    birthDate,
    deathDate,
    birthPlace,
    major,
    education,
    position,
    achievements,
    images,
    videos,
  }) {
    this.id = id;
    this.name = name || "";
    this.age = age || "";
    this.sex = sex || "";
    this.level = level;

    this.x = 0;
    this.y = 0;

    this.parents = [];
    this.children = [];
    this.spouseId = null;

    this.photoUrl = photoUrl || "";

    // 👇 NEW FIELDS
    this.familyName = familyName || "";
    this.fatherName = fatherName || "";
    this.birthDate = birthDate || "";
    this.deathDate = deathDate || "";
    this.birthPlace = birthPlace || "";
    this.major = major || "";
    this.education = education || "";
    this.position = position || "";
    this.achievements = achievements || [];
    this.images = images || [];
    this.videos = videos || [];

    this.collapseUp = false;
  }
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;

  requestAnimationFrame(() => {
    renderQueued = false;
    layoutTree();
    renderTree();
  });
}

window.addEventListener("beforeunload", () => {
  // debounce амжихгүй байж магадгүй тул sync-ish trigger
  if (typeof window.saveTreeNow === "function") window.saveTreeNow();
});

async function saveTreeToDB() {
  const user = window.auth?.currentUser;
  if (!user) return;

  clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (saving) return;
    saving = true;

    try {
      // ✅ ЭНД token авна
      const token = await user.getIdToken();

      const res = await fetch("/api/tree/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({ members }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("SAVE FAILED:", text);
      }
    } catch (err) {
      console.error("SAVE ERROR:", err);
    } finally {
      saving = false;
    }
  }, 600);
}

async function saveTreeNow() {
  const user = window.auth?.currentUser;
  if (!user) return;

  try {
    const token = await user.getIdToken();

    const res = await fetch("/api/tree/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-uid": user.uid,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ members }),
    });

    if (!res.ok) {
      console.error("SAVE NOW FAILED:", await res.text());
    }
  } catch (err) {
    console.error("SAVE NOW ERROR:", err);
  }
}

// ✅ logout хийх үед auth.js-ээс дуудаж чаддаг болгоё
window.saveTreeNow = saveTreeNow;

let treeRoot, nodesLayer, svg;
let posMap = new Map(); // id -> {x,y}
// ================== ZOOM / PAN STATE ==================
const zoomState = {
  userScale: 1,   // гараар zoom (1 = default)
  panX: 0,        // screen-space pan
  panY: 0,
  min: 0.45,
  max: 2.8,
  step: 0.12
};

// Person modal state
let modalMode = null; // "add-father" | "add-mother" | "add-spouse" | "add-child" | "edit"
let modalTarget = null; // FamilyMember

// ============== INIT ==============
window.addEventListener("DOMContentLoaded", () => {
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  svg = document.getElementById("tree-lines-svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  setupPersonModal();
  setupThemeButton();
  setupTreeZoomAndPan();


  // 🔥 Auth state-г гаднаас hook хийнэ
  waitForAuthAndLoadTree();
});

function clearSVG() {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}
function drawSVGLine(x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "#8a6a4a");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);
}

function createDefaultRoot() {
  const me = new FamilyMember({
    id: nextId++,
    name: "Би",
    age: "",
    sex: "male", // ⭐ default male
    level: 0,
    photoUrl: defaultPhotoBySex("male"),
  });
  members.push(me);
}

// ================== HELPERS ==================
function showWarning(message) {
  const backdrop = document.getElementById("warn-backdrop");
  const modal = document.getElementById("warn-modal");
  const text = document.getElementById("warn-text");
  const ok = document.getElementById("warn-ok");

  if (!backdrop || !modal || !text || !ok) return;

  text.textContent = message;

  backdrop.hidden = false;
  modal.hidden = false;

  // яг logout / delete шиг force show
  backdrop.style.display = "block";
  modal.style.display = "flex";

  ok.onclick = () => {
    backdrop.hidden = true;
    modal.hidden = true;
    backdrop.style.display = "";
    modal.style.display = "";
  };
}
function hasActiveSearch() {
  return (
    searchState.name ||
    searchState.family ||
    searchState.clan ||
    searchState.education
  );
}
function defaultPhotoBySex(sex) {
  if (sex === "male") return "img/profileman.avif";
  if (sex === "female") return "img/profilewoman.jpg";
  return "img/profileson.jpg";
}

function getTreeBounds(visibleMembers) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  visibleMembers.forEach((m) => {
    minX = Math.min(minX, m.x - CARD_W / 2);
    maxX = Math.max(maxX, m.x + CARD_W / 2);
    minY = Math.min(minY, m.y - CARD_H / 2);
    maxY = Math.max(maxY, m.y + CARD_H / 2);
  });

  // ⭐ EXTRA PADDING for SVG lines & joints
  const PAD_X = 40;
  const PAD_Y = 40;

  return {
    minX: minX - PAD_X,
    minY: minY - PAD_Y,
    maxX: maxX + PAD_X,
    maxY: maxY + PAD_Y,
  };
}

function getParentBySex(child, sex) {
  return (
    (child.parents || [])
      .map((pid) => findMember(pid))
      .find((p) => p && p.sex === sex) || null
  );
}

function normalizeParents(child) {
  if (!Array.isArray(child.parents)) child.parents = [];

  // keep only existing unique ids (no null/undefined)
  const uniq = [];
  for (const pid of child.parents) {
    if (!pid) continue;
    if (!uniq.includes(pid)) uniq.push(pid);
  }

  // Try to identify father/mother by sex (preferred)
  let father = null;
  let mother = null;
  const unknown = [];

  for (const pid of uniq) {
    const p = findMember(pid);
    if (!p) continue;

    if (p.sex === "male" && !father) father = pid;
    else if (p.sex === "female" && !mother) mother = pid;
    else unknown.push(pid); // sex unknown or extra parents
  }

  // Fill missing slots with unknowns (DO NOT DROP LINKS)
  if (!father && unknown.length) father = unknown.shift();
  if (!mother && unknown.length) mother = unknown.shift();

  // canonical: [father, mother] but keep any extras appended (rare case)
  const next = [];
  if (father) next[0] = father;
  if (mother) next[1] = mother;

  // Keep remaining unknown refs (so no data loss)
  for (const pid of unknown) {
    if (!next.includes(pid)) next.push(pid);
  }

  child.parents = next;
}
function repairTreeData() {
  const byId = new Map(members.map((m) => [m.id, m]));

  // 1) parents -> children sync
  members.forEach((child) => {
    (child.parents || []).forEach((pid) => {
      const p = byId.get(pid);
      if (!p) return;
      if (!p.children) p.children = [];
      if (!p.children.includes(child.id)) {
        p.children.push(child.id);
      }
    });
  });

  // 2) spouse symmetry
  members.forEach((m) => {
    if (!m.spouseId) return;
    const s = byId.get(m.spouseId);
    if (!s) {
      m.spouseId = null;
      return;
    }
    if (s.spouseId !== m.id) {
      s.spouseId = m.id;
    }
  });

  // 3) recompute level from parents (safe, no force)
  members.forEach((m) => {
    const pids = (m.parents || []).filter((pid) => byId.has(pid));
    if (!pids.length) return;

    const parentLevels = pids
      .map((pid) => byId.get(pid).level)
      .filter((v) => typeof v === "number" && isFinite(v));

    if (!parentLevels.length) return;

    const target = Math.min(...parentLevels) + 1;
    if (m.level !== target) m.level = target;
  });

  // 4) canonicalize parents everywhere (Fix #1 logic)
  members.forEach((m) => normalizeParents(m));
}

let authListenerAttached = false;

function waitForAuthAndLoadTree() {
  const authWait = setInterval(() => {
    if (!window.auth || authListenerAttached) return;

    clearInterval(authWait);
    authListenerAttached = true;

    window.auth.onAuthStateChanged((user) => {
      members.length = 0;
      posMap.clear();
      nextId = 1;

      if (user) {
        loadTreeFromDB();
      } else {
        createDefaultRoot();
        scheduleRender();
      }
    });
  }, 50);
}

function familyCenterX(memberId) {
  const m = findMember(memberId);
  if (!m) return null;

  const r = cardRect(memberId);
  if (!r) return null;

  if (!m.spouseId) return r.cx;

  const sr = cardRect(m.spouseId);
  if (!sr) return r.cx;

  return (r.cx + sr.cx) / 2;
}

function cardRect(id) {
  const m = findMember(id);
  if (!m) return null;

  // m.x, m.y бол layoutTree() дээр тооцсон "tree space" координатууд
  const left = m.x - CARD_W / 2;
  const right = m.x + CARD_W / 2;
  const top = m.y - CARD_H / 2;
  const bottom = m.y + CARD_H / 2;

  return {
    cx: m.x,
    top,
    bottom,
    left,
    right,
  };
}

function findMember(id) {
  return members.find((m) => m.id === id);
}

// ---- ancestors hidden set (collapseUp) ----
function buildHiddenAncestorSet() {
  if (typeof hasActiveSearch === "function" && hasActiveSearch()) {
    return new Set(); // 🔓 nothing hidden
  }
  const hidden = new Set();
  const protectedSet = new Set();
  const byId = new Map(members.map(m => [m.id, m]));

  // 🔒 Protect: clicked node + descendants + spouses
  function protectDescendants(startId) {
    const q = [startId];
    while (q.length) {
      const id = q.shift();
      if (!id || protectedSet.has(id)) continue;
      protectedSet.add(id);

      const m = byId.get(id);
      if (!m) continue;

      if (m.spouseId) protectedSet.add(m.spouseId);
      (m.children || []).forEach(cid => q.push(cid));
    }
  }

  // ❌ Hide: whole subtree (except protected)
  function hideSubtree(startId) {
    const q = [startId];
    while (q.length) {
      const id = q.shift();
      if (!id || hidden.has(id) || protectedSet.has(id)) continue;

      hidden.add(id);
      const m = byId.get(id);
      if (!m) continue;

      if (m.spouseId && !protectedSet.has(m.spouseId)) {
        hidden.add(m.spouseId);
      }

      (m.children || []).forEach(cid => q.push(cid));
    }
  }

  // ================= MAIN =================
  members.forEach(m => {
    if (!m.collapseUp) return;

    // 1️⃣ protect self branch
    protectDescendants(m.id);
    protectedSet.add(m.id);
    if (m.spouseId) protectedSet.add(m.spouseId);

    // 2️⃣ walk ancestors recursively
    const stack = [...(m.parents || [])];

    while (stack.length) {
      const pid = stack.pop();
      const parent = byId.get(pid);
      if (!parent) continue;

      if (!protectedSet.has(parent.id)) {
        hidden.add(parent.id);
      }

      // hide siblings of this ancestor
      (parent.children || []).forEach(cid => {
        if (cid !== m.id) hideSubtree(cid);
      });

      // go up
      (parent.parents || []).forEach(ppid => {
        if (!protectedSet.has(ppid)) stack.push(ppid);
      });
    }
  });

  // 🛡 safety: never hide protected
  protectedSet.forEach(id => hidden.delete(id));

  return hidden;
}



// ================== LAYOUT ==================
function layoutTree() {
  if (!treeRoot) return;

  const hiddenAnc = buildHiddenAncestorSet();
  const visibleMembers = members.filter((m) => !hiddenAnc.has(m.id));
  if (!visibleMembers.length) return;

  /* =========================================================
     1) STABLE ROOT (order-independent)
  ========================================================= */
  const root =
    visibleMembers.find((m) => m.level === 0 && m.name === "Би") ||
    visibleMembers.find((m) => m.level === 0) ||
    visibleMembers.reduce((best, m) =>
      m.level < best.level ? m : best
    );

  /* =========================================================
     2) LINEAGE SIDE (father = left, mother = right)
  ========================================================= */
  const sideOf = new Map(); // id -> -1 | 0 | +1
  visibleMembers.forEach((m) => sideOf.set(m.id, 0));

  const rootFather = getParentBySex(root, "male");
  const rootMother = getParentBySex(root, "female");

  function markAncestors(startId, side) {
    const q = [startId];
    const seen = new Set();
    while (q.length) {
      const id = q.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      sideOf.set(id, side);
      const m = findMember(id);
      if (!m?.parents) continue;
      m.parents.forEach((pid) => pid && q.push(pid));
    }
  }

  if (rootFather) markAncestors(rootFather.id, -1);
  if (rootMother) markAncestors(rootMother.id, +1);

  /* =========================================================
     3) STABLE SORT HELPERS (NO insertion order)
  ========================================================= */
  function personKey(p) {
    const bd = (p.birthDate || "").trim();
    const nm = (p.name || "").trim().toLowerCase();
    const sx = (p.sex || "").trim();
    return `${bd}__${nm}__${sx}__${String(p.id).padStart(10, "0")}`;
  }

  function sharedParent(a, b) {
    if (!a?.parents?.length || !b?.parents?.length) return false;
    return a.parents.some((pid) => b.parents.includes(pid));
  }

  function coupleHasChild(a, b, nextRow) {
    return nextRow.some(
      (c) =>
        Array.isArray(c.parents) &&
        c.parents.includes(a.id) &&
        c.parents.includes(b.id)
    );
  }

  /* =========================================================
     4) GROUP BY LEVEL
  ========================================================= */
  const levelMap = new Map();
  visibleMembers.forEach((m) => {
    if (!levelMap.has(m.level)) levelMap.set(m.level, []);
    levelMap.get(m.level).push(m);
  });

  const levels = [...levelMap.keys()].sort((a, b) => a - b);

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;
  const newPosMap = new Map();

  levels.forEach((level, rowIndex) => {
    const row = (levelMap.get(level) || []).slice();
    const nextRow = levelMap.get(level + 1) || [];
    row.sort((a, b) => personKey(a).localeCompare(personKey(b)));

    const y = paddingTop + rowIndex * rowGap;

    const used = new Set();
    const units = [];

    /* =====================================================
       5) BUILD COUPLES (STRUCTURAL, ORDER-INDEPENDENT)
    ===================================================== */
    const couples = [];
    row.forEach((m) => {
      if (!m.spouseId) return;
      const s = findMember(m.spouseId);
      if (!s || s.level !== level) return;
      if (!row.some((x) => x.id === s.id)) return;

      const a = m.id < s.id ? m : s;
      const b = m.id < s.id ? s : m;
      const key = `${a.id}-${b.id}`;
      if (!couples.some((c) => c.key === key)) {
        couples.push({ key, a, b });
      }
    });

    couples.sort((c1, c2) => {
      const s1 = (sideOf.get(c1.a.id) || 0) + (sideOf.get(c1.b.id) || 0);
      const s2 = (sideOf.get(c2.a.id) || 0) + (sideOf.get(c2.b.id) || 0);
      if (s1 !== s2) return s1 - s2;
      return (
        personKey(c1.a) + personKey(c1.b)
      ).localeCompare(personKey(c2.a) + personKey(c2.b));
    });

    couples.forEach(({ a, b }) => {
      if (used.has(a.id) || used.has(b.id)) return;

      let husband = a.sex === "male" ? a : b.sex === "male" ? b : a;
      let wife = a.sex === "female" ? a : b.sex === "female" ? b : b;

      const confirmed = coupleHasChild(husband, wife, nextRow);

      used.add(husband.id);
      used.add(wife.id);

      const husbandSibs = [];
      const wifeSibs = [];

      if (confirmed) {
        row.forEach((x) => {
          if (used.has(x.id)) return;
          if (x.spouseId) return;
          if (sharedParent(x, husband)) {
            husbandSibs.push(x);
            used.add(x.id);
          }
        });

        row.forEach((x) => {
          if (used.has(x.id)) return;
          if (x.spouseId) return;
          if (sharedParent(x, wife)) {
            wifeSibs.push(x);
            used.add(x.id);
          }
        });
      }

      husbandSibs.sort((a, b) =>
        personKey(a).localeCompare(personKey(b))
      );
      wifeSibs.sort((a, b) =>
        personKey(a).localeCompare(personKey(b))
      );

      units.push({
        type: "family",
        husband,
        wife,
        husbandSibs,
        wifeSibs,
      });
    });

    /* =====================================================
       6) REMAINING SINGLES
    ===================================================== */
    row
      .filter((m) => !used.has(m.id))
      .sort((a, b) => {
        const sa = sideOf.get(a.id) || 0;
        const sb = sideOf.get(b.id) || 0;
        if (sa !== sb) return sa - sb;
        return personKey(a).localeCompare(personKey(b));
      })
      .forEach((m) => units.push({ type: "single", member: m }));

    /* =====================================================
       7) ORDER UNITS: LEFT → CENTER → RIGHT
    ===================================================== */
    function unitSide(u) {
      if (u.type === "single") return sideOf.get(u.member.id) || 0;
      return (
        (sideOf.get(u.husband.id) || 0) +
        (sideOf.get(u.wife.id) || 0)
      );
    }

    const left = [],
      center = [],
      right = [];
    units.forEach((u) => {
      const s = unitSide(u);
      if (s < 0) left.push(u);
      else if (s > 0) right.push(u);
      else center.push(u);
    });

    const orderedUnits = [...left, ...center, ...right];

    /* =====================================================
       8) PLACE UNITS (CENTERED ROW)
    ===================================================== */
    const GAP = CARD_W + H_GAP;
    const widths = orderedUnits.map((u) =>
      u.type === "single"
        ? GAP
        : (u.husbandSibs.length + u.wifeSibs.length + 2) * GAP
    );

    const totalW =
      widths.reduce((a, b) => a + b, 0) +
      (orderedUnits.length - 1) * H_GAP;

    let cursorX = -totalW / 2;

    orderedUnits.forEach((u) => {
      if (u.type === "single") {
        newPosMap.set(u.member.id, { x: cursorX + GAP / 2, y });
        cursorX += GAP + H_GAP;
        return;
      }

      let x = cursorX;

      u.husbandSibs.forEach((s) => {
        newPosMap.set(s.id, { x: x + GAP / 2, y });
        x += GAP;
      });

      newPosMap.set(u.husband.id, { x: x + GAP / 2, y });
      x += GAP;

      newPosMap.set(u.wife.id, { x: x + GAP / 2, y });
      x += GAP;

      u.wifeSibs.forEach((s) => {
        newPosMap.set(s.id, { x: x + GAP / 2, y });
        x += GAP;
      });

      cursorX +=
        (u.husbandSibs.length + u.wifeSibs.length + 2) * GAP +
        H_GAP;
    });
  });

  /* =====================================================
     9) APPLY
  ===================================================== */
  members.forEach((m) => {
    const p = newPosMap.get(m.id);
    if (p) {
      m.x = p.x;
      m.y = p.y;
    }
  });

  posMap = newPosMap;
}

// ================== RENDER ==================
function layoutVisibleMembers() {
  const hiddenAnc = buildHiddenAncestorSet();
  return members.filter((m) => !hiddenAnc.has(m.id));
}

function renderTree() {
  if (!nodesLayer || !treeRoot || !svg) return;

  const scaleBox = document.getElementById("tree-scale");

  if (!scaleBox) {
    console.error("#tree-scale element not found (renderTree)");
    return;
  }

  nodesLayer.innerHTML = "";
  const visibleMembers = layoutVisibleMembers();
  if (!visibleMembers.length) return;

  // 1) render cards in tree space
  visibleMembers.forEach((m) => {
    const card = createFamilyCard(m);
    card.style.left = m.x - CARD_W / 2 + "px";
    card.style.top = m.y - CARD_H / 2 + "px";
    nodesLayer.appendChild(card);
  });

  requestAnimationFrame(() => {
    const bounds = getTreeBounds(visibleMembers);

    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;

    const viewW = treeRoot.clientWidth;
    const viewH = treeRoot.clientHeight;

    if (treeW <= 0 || treeH <= 0) return;
    
    const fitScale = Math.min(viewW / treeW, viewH / treeH, 1);

    const finalScale = fitScale * zoomState.userScale;

    const offsetX = (viewW - treeW * finalScale) / 2;
    const offsetY = (viewH - treeH * finalScale) / 2;

    // ✅ user pan нь screen space дээр нэмэгдэнэ
    scaleBox.style.transform =
      `translate(${offsetX + zoomState.panX}px, ${
        offsetY + zoomState.panY
      }px) ` +
      `scale(${finalScale}) ` +
      `translate(${-bounds.minX}px, ${-bounds.minY}px)`;
    

    // 5) SVG must live in the SAME tree space as nodes (before transform)
    svg.setAttribute("width", treeW);
    svg.setAttribute("height", treeH);
    svg.setAttribute("viewBox", `0 0 ${treeW} ${treeH}`);

    // Place SVG at origin inside scaleBox coordinates
    svg.style.position = "absolute";
    svg.style.left = "0px";
    svg.style.top = "0px";

    drawLines(visibleMembers);
  });
}

// function resizeCanvas() {
//   const rect = treeRoot.getBoundingClientRect();
//   canvas.width = rect.width;
//   canvas.height = rect.height;
// }

// ================== CARD COMPONENT ==================
function createFamilyCard(member) {
  const card = document.createElement("div");
  card.className = "family-card";
  card.dataset.id = member.id;
  if (member.sex === "male") card.classList.add("male");
  else if (member.sex === "female") card.classList.add("female");
  if (member.collapseUp) card.classList.add("collapse-up");

  /* ================= BUTTONS ================= */

  // Collapse up
  const btnUp = document.createElement("button");
  btnUp.className = "node-btn node-btn-up";
  btnUp.setAttribute("aria-label", "Дээш талын мөчир нугалах");
  const tri = document.createElement("span");
  tri.className = "triangle-up";
  btnUp.appendChild(tri);

  // Add (+)
  const btnAdd = document.createElement("button");
  btnAdd.className = "node-btn node-btn-add";
  btnAdd.setAttribute("aria-label", "Шинэ хүн/харилцаа");

  /* ================= ADD MENU ================= */

  const menu = document.createElement("div");
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  menu.className = "add-menu hidden";

  const makeBtn = (text, cls = "add-pill") => {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = text;
    return b;
  };

  const btnFather = makeBtn("Эцэг нэмэх");
  const btnMother = makeBtn("Эх нэмэх");
  const btnSpouse = makeBtn("Хань нэмэх");
  const btnChild = makeBtn("Хүүхэд нэмэх");
  const btnDetail = makeBtn("Дэлгэрэнгүй мэдээлэл");
  const btnEdit = makeBtn("Мэдээлэл засах");
  const btnDelete = makeBtn("Устгах", "add-pill danger");

  menu.append(
    btnFather,
    btnMother,
    btnSpouse,
    btnChild,
    btnDetail,
    btnEdit,
    btnDelete
  );

  /* ================= AVATAR ================= */

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "card-avatar";

  const avatarCircle = document.createElement("div");
  avatarCircle.className = "avatar-circle";

  if (member.photoUrl) {
    const img = document.createElement("img");
    img.src = member.photoUrl;
    img.alt = member.name || "Профайл зураг";
    img.className = "avatar-img";
    avatarCircle.appendChild(img);
  } else {
    const icon = document.createElement("span");
    icon.className = "avatar-icon";
    avatarCircle.appendChild(icon);
  }

  avatarWrap.appendChild(avatarCircle);

  /* ================= NAME / AGE ================= */

  const nameBox = document.createElement("div");
  nameBox.className = "card-name";

  const full = document.createElement("div");
  full.className = "fullname";
  full.textContent = member.name || "Нэр тодорхойгүй";
  nameBox.appendChild(full);

  if (member.age) {
    const ageEl = document.createElement("div");
    ageEl.className = "card-age";
    ageEl.textContent = member.age + " настай";
    nameBox.appendChild(ageEl);
  }

  /* ================= COMPOSE ================= */

  card.append(btnUp, btnAdd, menu, avatarWrap, nameBox);

  /* ================= CLICK LOGIC ================= */

  let clickTimer = null;

  // SINGLE CLICK → edit (delay)
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      openPersonModal("edit", member);
      clickTimer = null;
    }, 280);
  });

  // DOUBLE CLICK → profile
  card.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    openProfileView(member);
  });

  // MOBILE DOUBLE TAP → profile
  let lastTap = 0;
  card.addEventListener("touchend", () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      openProfileView(member);
    }
    lastTap = now;
  });

  /* ================= MENU ACTIONS ================= */

  btnAdd.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menu, card);
  });

  btnFather.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-father", member, {
      sex: "male",
      name: "Эцэг",
      photoUrl: "img/profileman.avif",
    });
    closeAllMenus();
  };

  btnMother.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-mother", member, {
      sex: "female",
      name: "Эх",
      photoUrl: "img/profilewoman.jpg",
    });
    closeAllMenus();
  };

  btnSpouse.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-spouse", member, {
      name: "Хань",
      sex: "", // ❌ preset sex БАЙХГҮЙ
      photoUrl: "", // ❌ preset зураг БАЙХГҮЙ
    });
    closeAllMenus();
  };

  btnChild.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-child", member, {
      name: "Хүүхэд",
      photoUrl: "img/profileson.jpg",
    });
    closeAllMenus();
  };

  btnDetail.onclick = (e) => {
    e.stopPropagation();
    openProfileView(member);
    closeAllMenus();
  };

  btnEdit.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("edit", member);
    closeAllMenus();
  };

  btnDelete.onclick = (e) => {
    e.stopPropagation();
    openDeleteConfirm(member); // ⭐ modal нээнэ
    closeAllMenus();
  };

  /* ================= COLLAPSE ================= */

  btnUp.addEventListener("click", (e) => {
    e.stopPropagation();
    member.collapseUp = !member.collapseUp;
    scheduleRender();
    saveTreeToDB();
  });

  return card;
}


function openMediaDeleteConfirm({ member, type, index }) {
  pendingMediaDelete = { member, type, index };

  document.getElementById("media-delete-backdrop").hidden = false;
  document.getElementById("media-delete-modal").hidden = false;

  const text = type === "image"
    ? "Зургийг устгах уу?"
    : "Видеог устгах уу?";

  document.getElementById("media-delete-text").textContent = text;
}

function closeMediaDeleteConfirm() {
  pendingMediaDelete = null;
  document.getElementById("media-delete-backdrop").hidden = true;
  document.getElementById("media-delete-modal").hidden = true;
}
// ================== MENU HELPERS ==================
function toggleMenu(menu, card) {
  closeAllMenus();

  // body руу зөөнө
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }

  // эхлээд харагддаг болгоно
  menu.classList.remove("hidden");

  // 🔥 ДАРАА нь хэмжинэ
  const cardRect = card.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let top = cardRect.top - menuRect.height - 8;
  let left = cardRect.right - menuRect.width;

  // дээр багтахгүй бол доор
  if (top < 8) {
    top = cardRect.bottom + 8;
  }

  // дэлгэцээс гарахгүй
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function closeAllMenus() {
  document
    .querySelectorAll(".add-menu")
    .forEach((m) => m.classList.add("hidden"));
}

function setupPersonModal() {
  const backdrop = document.getElementById("person-backdrop");
  const modal = document.getElementById("person-modal");
  const form = document.getElementById("person-form");
  const btnCancel = document.getElementById("person-cancel");

  if (!backdrop || !modal || !form || !btnCancel) return;

  btnCancel.addEventListener("click", closePersonModal);
  backdrop.addEventListener("click", closePersonModal);

  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  // ⭐ SEX → PHOTO AUTO SYNC
  if (sexSelect && photoInput) {
    sexSelect.addEventListener("change", () => {
      const sex = normalizeSex(sexSelect.value);

      const isCustom =
        photoInput.value &&
        ![
          "img/profileman.avif",
          "img/profilewoman.jpg",
          "img/profileson.jpg",
          "img/profilespouse.jpg",
        ].includes(photoInput.value);

      if (!isCustom) {
        photoInput.value = defaultPhotoBySex(sex);
      }
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitPersonForm();
  });
}

function openPersonModal(mode, targetMember, preset = {}) {
  modalMode = mode;
  modalTarget = targetMember;

  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");
  const title = document.getElementById("person-modal-title");
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo"); // string URL гэж үзэж байгаа

  if (mode === "edit" && targetMember) {
    title.textContent = "Хүн засах";
    nameInput.value = targetMember.name || "";
    ageInput.value = targetMember.age || "";
    sexSelect.value = targetMember.sex || "";
    if (photoInput) {
      photoInput.value = targetMember.photoUrl || "";
    }
  } else {
    title.textContent = "Хүн нэмэх";
    nameInput.value = preset.name || "";
    ageInput.value = "";
    sexSelect.value = preset.sex || "";
    if (photoInput) {
      photoInput.value = preset.photoUrl || "";
    }
  }

  backdrop.hidden = false;
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.add("show");
  });
}

function closePersonModal() {
  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");

  modal.classList.remove("show");
  setTimeout(() => {
    modal.hidden = true;
    backdrop.hidden = true;
  }, 180);
}

function submitPersonForm() {
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  const data = {
    name: nameInput.value.trim(),
    age: ageInput.value.trim(),
    sex: sexSelect.value.trim(),
    photoUrl: photoInput ? photoInput.value.trim() : "",
  };

  let success = true; // ⭐ ADD

  switch (modalMode) {
    case "edit":
      if (modalTarget) editPersonWithData(modalTarget, data);
      break;

    case "add-father":
      if (modalTarget) {
        success = addFatherWithData(modalTarget, data) !== false;
      }
      break;

    case "add-mother":
      if (modalTarget) {
        success = addMotherWithData(modalTarget, data) !== false;
      }
      break;

    case "add-spouse":
      if (modalTarget) {
        success = addSpouseWithData(modalTarget, data) !== false;
      }
      break;

    case "add-child":
      if (modalTarget) addChildWithData(modalTarget, data);
      break;
  }

  if (!success) return; // ⭐ WARNING гарсан бол modal-ийг битгий хаа

  saveTreeToDB();
  closePersonModal();
  scheduleRender();
}

// ================== ADD / EDIT / DELETE ==================
function normalizeSex(str) {
  const s = (str || "").toLowerCase();
  if (s === "male" || s === "эр" || s === "эрэгтэй") return "male";
  if (s === "female" || s === "эм" || s === "эмэгтэй") return "female";
  return "";
}

function addFatherWithData(child, data) {
  const existingFather = getParentBySex(child, "male");
  if (existingFather) {
    showWarning("Эцэг аль хэдийн бүртгэлтэй байна.");
    return false;
  }

  const level = child.level - 1;

  const father = new FamilyMember({
    id: nextId++,
    name: data.name || "Эцэг",
    age: data.age,
    sex: "male",
    level,
    photoUrl: data.photoUrl || "img/profileman.avif",
  });

  father.children.push(child.id);
  child.parents.push(father.id);

  // эх байвал spouse болгоно
  const mother = getParentBySex(child, "female");
  if (mother) {
    father.spouseId = mother.id;
    mother.spouseId = father.id;
  }

  members.push(father);
  members.forEach((m) => normalizeParents(m));
}

function addMotherWithData(child, data) {
  const existingMother = getParentBySex(child, "female");
  if (existingMother) {
    showWarning("Эх аль хэдийн бүртгэлтэй байна.");
    return;
  }

  const level = child.level - 1;

  const mother = new FamilyMember({
    id: nextId++,
    name: data.name || "Эх",
    age: data.age,
    sex: "female",
    level,
    photoUrl: data.photoUrl || "img/profilewoman.jpg",
  });

  mother.children.push(child.id);
  child.parents.push(mother.id);

  // эцэг байвал spouse болгоно
  const father = getParentBySex(child, "male");
  if (father) {
    mother.spouseId = father.id;
    father.spouseId = mother.id;
  }

  members.push(mother);
  members.forEach((m) => normalizeParents(m));
}

function addSpouseWithData(person, data) {
  if (person.spouseId) {
    showWarning("Хань аль хэдийн бүртгэлтэй байна.");
    return;
  }

  // ⭐ ALWAYS opposite sex
  let spouseSex;
  if (person.sex === "male") spouseSex = "female";
  else if (person.sex === "female") spouseSex = "male";
  else spouseSex = normalizeSex(data.sex);

  const spouse = new FamilyMember({
    id: nextId++,
    name: data.name || "Хань",
    age: data.age,
    sex: spouseSex,
    level: person.level,
    // ⭐ PHOTO STRICTLY BY SEX unless user typed custom
    photoUrl:
      data.photoUrl && data.photoUrl.trim()
        ? data.photoUrl.trim()
        : defaultPhotoBySex(spouseSex),
  });

  spouse.spouseId = person.id;
  person.spouseId = spouse.id;

  // 🔗 хүүхдүүдийг sync
  person.children.forEach((cid) => {
    const child = findMember(cid);
    if (!child) return;

    if (!spouse.children.includes(child.id)) {
      spouse.children.push(child.id);
    }

    const hasMale = getParentBySex(child, "male");
    const hasFemale = getParentBySex(child, "female");

    if (spouseSex === "male" && !hasMale) {
      child.parents.push(spouse.id);
    }
    if (spouseSex === "female" && !hasFemale) {
      child.parents.push(spouse.id);
    }
  });

  members.push(spouse);
  members.forEach((m) => normalizeParents(m));
}

function addChildWithData(parent, data) {
  const sex = normalizeSex(data.sex);

  const child = new FamilyMember({
    id: nextId++,
    name: data.name || "Хүүхэд",
    age: data.age,
    sex,
    level: parent.level + 1,
    photoUrl:
      data.photoUrl && data.photoUrl.trim()
        ? data.photoUrl.trim()
        : "img/profileson.jpg",
  });

  /* ================= LINK PARENTS ================= */

  child.parents = [];
  child.parents.push(parent.id);

  if (!parent.children.includes(child.id)) {
    parent.children.push(child.id);
  }

  // auto-link spouse ONLY if same level
  if (parent.spouseId) {
    const spouse = findMember(parent.spouseId);
    if (spouse && spouse.level === parent.level) {
      if (!spouse.children.includes(child.id)) {
        spouse.children.push(child.id);
      }
      if (!child.parents.includes(spouse.id)) {
        child.parents.push(spouse.id);
      }
    }
  }

  /* =====================================================
     ⭐ CORRECT LINEAGE SIDE DETECTION
     Decide whose sibling this child is
  ===================================================== */

  child._lineageSide = null;

  // existing children of this parent (siblings group)
  const siblings = parent.children
    .map((cid) => findMember(cid))
    .filter((m) => m && m.id !== child.id);

  // check if this parent already has a husband / wife child
  const husbandSibling = siblings.find((s) => s.sex === "male" && s.spouseId);
  const wifeSibling = siblings.find((s) => s.sex === "female" && s.spouseId);

  if (husbandSibling) {
    // husband's parents adding child
    child._lineageSide = "left"; // FRONT
  } else if (wifeSibling) {
    // wife's parents adding child
    child._lineageSide = "right"; // BACK
  }

  members.push(child);
  members.forEach((m) => normalizeParents(m));
}

function editPersonWithData(member, data) {
  let sexChanged = false;

  if (data.name?.trim()) {
    member.name = data.name.trim();
  }

  if (typeof data.age === "string" && data.age.trim() !== "") {
    member.age = data.age.trim();
  }

  if (data.sex?.trim()) {
    const newSex = normalizeSex(data.sex);
    if (newSex && newSex !== member.sex) {
      member.sex = newSex;
      sexChanged = true;
    }
  }

  const hasCustomPhoto =
    member.photoUrl &&
    ![
      "img/profileman.avif",
      "img/profilewoman.jpg",
      "img/profileson.jpg",
      "img/profilespouse.jpg",
    ].includes(member.photoUrl);

  if (data.photoUrl?.trim()) {
    member.photoUrl = data.photoUrl.trim();
  } else if (sexChanged && !hasCustomPhoto) {
    member.photoUrl = defaultPhotoBySex(member.sex);
  }
}

function deletePerson(member) {
  if (member.level === 0 && members.length === 1) {
    alert("Үндсэн 'Би' node-ийг устгах боломжгүй.");
    return;
  }
  

  const id = member.id;

  // 1) Remove the member itself
  const idx = members.findIndex(m => m.id === id);
  if (idx !== -1) {
    members.splice(idx, 1);
  }

  // 2) Remove references + spouse links
  members.forEach((m) => {
    m.children = (m.children || []).filter((cid) => cid !== id);
    m.parents = (m.parents || []).filter((pid) => pid !== id);
    if (m.spouseId === id) m.spouseId = null;
  });

  // 3) Fix child levels when their parent was deleted
  //    For every remaining node, recompute level from any existing parent if possible.
  const byId = new Map(members.map((m) => [m.id, m]));

  members.forEach((child) => {
    const pids = (child.parents || []).filter((pid) => byId.has(pid));
    if (!pids.length) return; // no parent left → keep current level (no data loss)

    const parentLevels = pids
      .map((pid) => byId.get(pid).level)
      .filter((v) => typeof v === "number" && isFinite(v));

    if (!parentLevels.length) return;

    const targetLevel = Math.min(...parentLevels) + 1;
    if (child.level !== targetLevel) child.level = targetLevel;
  });

  // 4) Normalize parents everywhere (no data loss after Fix #1)
  members.forEach((m) => normalizeParents(m));

  saveTreeToDB();
  scheduleRender();
}
function openDeleteConfirm(member) {
  pendingDeleteMember = member;

  const backdrop = document.getElementById("delete-backdrop");
  const modal = document.getElementById("delete-modal");

  backdrop.hidden = false;
  modal.hidden = false;

  // 🔥 FORCE SHOW (CSS-ийг override хийнэ)
  backdrop.style.display = "block";
  modal.style.display = "flex";
}

function closeDeleteConfirm() {
  pendingDeleteMember = null;

  document.getElementById("delete-backdrop").hidden = true;
  document.getElementById("delete-modal").hidden = true;
}

// ================== THEME BUTTON ==================
function setupThemeButton() {
  const btnTheme = document.getElementById("btn-theme");
  if (!btnTheme) return;
  btnTheme.addEventListener("click", (e) => {
    e.stopPropagation();
    document.body.classList.toggle("dark");
  });
}

function getCardHalfHeight() {
  const card = document.querySelector(".family-card");
  if (!card) return CARD_H / 2;
  return card.offsetHeight / 2;
}
function safeLine(svg, x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every((v) => typeof v === "number" && isFinite(v))) {
    return;
  }

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "#8a6a4a");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);
}

function drawLines(visibleMembers) {
  if (!svg) return;
  svg.innerHTML = "";

  const visibleIds = new Set(visibleMembers.map((m) => m.id));
  const GAP = 18;

  /* ================= SPOUSE (HORIZONTAL) ================= */
  visibleMembers.forEach((m) => {
    if (!m.spouseId || !visibleIds.has(m.spouseId)) return;
    if (m.id > m.spouseId) return; // draw once

    const a = cardRect(m.id);
    const b = cardRect(m.spouseId);
    if (!a || !b) return;

    const y = (a.top + a.bottom) / 2;
    safeLine(svg, a.right, y, b.left, y);
  });

  /* ================= CHILD → PARENTS (CLEAN & BALANCED) ================= */
  visibleMembers.forEach((child) => {
    const parentRects = (child.parents || [])
      .map((pid) => findMember(pid))
      .filter((p) => p && visibleIds.has(p.id))
      .map((p) => cardRect(p.id))
      .filter(Boolean);

    if (!parentRects.length) return;

    const c = cardRect(child.id);
    if (!c) return;

    // parents center X
    const parentsCenterX =
      parentRects.reduce((s, p) => s + p.cx, 0) / parentRects.length;

    // lowest parent bottom
    const parentsBottomY = Math.max(...parentRects.map((p) => p.bottom));
    const midY = parentsBottomY + GAP;

    // 1) vertical from each parent to midY
    parentRects.forEach((p) => {
      safeLine(svg, p.cx, p.bottom, p.cx, midY);
    });

    // 2) horizontal bar if 2+ parents
    if (parentRects.length > 1) {
      const minX = Math.min(...parentRects.map((p) => p.cx));
      const maxX = Math.max(...parentRects.map((p) => p.cx));
      safeLine(svg, minX, midY, maxX, midY);
    }

    // 3) down from parentsCenter → child top
    const childTopY = c.top;
    const jointY = childTopY - 6;

    safeLine(svg, parentsCenterX, midY, parentsCenterX, jointY);
    safeLine(svg, parentsCenterX, jointY, c.cx, jointY);
    safeLine(svg, c.cx, jointY, c.cx, childTopY);
  });
}

// ================== PROFILE VIEW ==================

function openProfileView(member) {
  currentProfileMember = member;
  const backdrop = document.getElementById("profile-backdrop");
  const view = document.getElementById("profile-view");

  if (!view || !backdrop) {
    console.warn("Profile view elements not found");
    return;
  }

  // helper: хоосон string → —
  const v = (x) => (x && String(x).trim() ? x : "—");

  const imgEl = document.getElementById("profile-img");
  const nameEl = document.getElementById("profile-name");
  const familyEl = document.getElementById("profile-family");
  const sexEl = document.getElementById("profile-sex");
  const birthEl = document.getElementById("profile-birth");
  const deathEl = document.getElementById("profile-death");
  const placeEl = document.getElementById("profile-place");
  const eduEl = document.getElementById("profile-education");
  const posEl = document.getElementById("profile-position");
  const listEl = document.getElementById("profile-achievements");

  // image
  if (imgEl) {
    imgEl.src = member.photoUrl || "img/profileson.jpg";
    imgEl.alt = member.name || "Profile";
  }

  // name
  if (nameEl) {
    nameEl.textContent = member.name || "Нэргүй";
  }

  // family / father name
  if (familyEl) {
    const fam = [member.familyName, member.fatherName]
      .filter((x) => x && x.trim())
      .join(" ");
    familyEl.textContent = fam || "—";
  }

  // sex
  if (sexEl) {
    sexEl.textContent =
      "Хүйс: " +
      (member.sex === "male" ? "Эр" : member.sex === "female" ? "Эм" : "—");
  }

  // dates & place
  if (birthEl) birthEl.textContent = "Төрсөн: " + v(member.birthDate);
  if (deathEl) deathEl.textContent = "Нас барсан: " + v(member.deathDate);
  if (placeEl) placeEl.textContent = "Төрсөн газар: " + v(member.birthPlace);

  // education / position
  if (eduEl) eduEl.textContent = v(member.education);
  if (posEl) posEl.textContent = v(member.position);

  // achievements
  if (listEl) {
    listEl.innerHTML = "";
    if (Array.isArray(member.achievements) && member.achievements.length) {
      member.achievements.forEach((a) => {
        const li = document.createElement("li");
        li.textContent = a;
        listEl.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "—";
      listEl.appendChild(li);
    }
  }
  // ================== MEDIA (IMAGES & VIDEOS) ==================
  const mediaBox = document.getElementById("profile-media");
  if (mediaBox) {
    mediaBox.innerHTML = "";

    // Images
    if (Array.isArray(member.images)) {
      member.images.forEach((url, i) => {
        const wrap = document.createElement("div");
        wrap.className = "media-item";

        const img = document.createElement("img");
        img.src = url;
        img.style.width = "140px";
        img.style.borderRadius = "12px";
        img.style.cursor = "zoom-in";
        img.onclick = (e) => {
          e.stopPropagation();        // 🔥 ЭНЭ БАЙХ ЁСТОЙ
          openImageFullscreen(url);
        };

        const del = document.createElement("button");
        del.className = "media-delete";
        del.textContent = "✕";
        del.onclick = (e) => {
          e.stopPropagation();
          openMediaDeleteConfirm({
            member,
            type: "image",
            index: i,
          });
        };

        wrap.append(img, del);
        mediaBox.appendChild(wrap);
      });
    }

    // Videos
    // Videos
    if (Array.isArray(member.videos)) {
      member.videos.forEach((url, i) => {
        const wrap = document.createElement("div");
        wrap.className = "media-item";

        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.style.width = "220px";
        video.style.borderRadius = "12px";

        const del = document.createElement("button");
        del.className = "media-delete";
        del.textContent = "✕";
        del.onclick = (e) => {
          e.stopPropagation();
          openMediaDeleteConfirm({
            member,
            type: "video",
            index: i,
          });
        };

        wrap.append(video, del);
        mediaBox.appendChild(wrap);
      });
    }

    // Fallback
    if (
      (!member.images || member.images.length === 0) &&
      (!member.videos || member.videos.length === 0)
    ) {
      mediaBox.textContent = "—";
    }
  }

  // show
  backdrop.hidden = false;
  view.hidden = false;
}

function closeProfileView() {
  const view = document.getElementById("profile-view");
  const backdrop = document.getElementById("profile-backdrop");

  if (view) view.hidden = true;
  if (backdrop) backdrop.hidden = true;
}

// close handlers (safe)
document
  .getElementById("profile-close")
  ?.addEventListener("click", closeProfileView);

document
  .getElementById("profile-backdrop")
  ?.addEventListener("click", closeProfileView);
let currentProfileMember = null;


//  ЭНД 
let editImages = [];
let editVideos = [];
function closeProfileEdit() {
  const edit = document.getElementById("profile-edit");
  if (edit) edit.hidden = true;
}

document
  .getElementById("profile-edit-close")
  ?.addEventListener("click", closeProfileEdit);

document
  .getElementById("profile-edit-backdrop")
  ?.addEventListener("click", closeProfileEdit);

document.getElementById("profile-edit-save")?.addEventListener("click", () => {
  if (!currentProfileMember) return;
  const previewEl = document.getElementById("photo-preview");
  if (previewEl && !previewEl.hidden && previewEl.src) {
    currentProfileMember.photoUrl = previewEl.src;
  }
  currentProfileMember.familyName = document
    .getElementById("edit-familyName")
    .value.trim();

  currentProfileMember.fatherName = document
    .getElementById("edit-fatherName")
    .value.trim();

  currentProfileMember.birthDate =
    document.getElementById("edit-birthDate").value;

  currentProfileMember.deathDate =
    document.getElementById("edit-deathDate").value;

  currentProfileMember.education = document
    .getElementById("edit-education")
    .value.trim();

  currentProfileMember.position = document
    .getElementById("edit-position")
    .value.trim();

  currentProfileMember.achievements = document
    .getElementById("edit-achievements")
    .value.split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  // 🔽 🔽 🔽 ЭНД birthPlace LOGIC-ОО ОРУУЛНА 🔽 🔽 🔽
  const country = document.getElementById("edit-country")?.value;
  const province = document.getElementById("edit-province")?.value;
  const soum = document.getElementById("edit-soum")?.value;
  const foreign = document.getElementById("edit-foreign-place")?.value;

  if (country === "MN") {
    currentProfileMember.birthPlace = [province, soum]
      .filter(Boolean)
      .join(", ");
  } else if (country === "OTHER") {
    currentProfileMember.birthPlace = foreign?.trim() || "";
  }

  // 🔼 🔼 🔼 ЭНД ДУУСНА 🔼 🔼 🔼
  // ===== save media =====
  currentProfileMember.images = [...editImages];
  currentProfileMember.videos = [...editVideos];
  saveTreeToDB();
  openProfileView(currentProfileMember);
  closeProfileEdit();
});

// ================== PROFILE EDIT BUTTON ==================
document.getElementById("profile-edit-btn")?.addEventListener("click", () => {
  if (currentProfileMember) {
    openProfileEdit(currentProfileMember);
  }
});

// ================== BIRTH PLACE LOGIC (STEP 1) ==================

// ================== BIRTH PLACE DROPDOWN LOGIC ==================
const countrySelect = document.getElementById("edit-country");
const provinceSelect = document.getElementById("edit-province");
const soumSelect = document.getElementById("edit-soum");
const foreignInput = document.getElementById("edit-foreign-place");
const mongoliaBlock = document.getElementById("mongolia-fields");
const foreignBlock = document.getElementById("foreign-fields");

if (countrySelect) {
  countrySelect.addEventListener("change", () => {
    const val = countrySelect.value;

    // === Монгол ===
    if (val === "MN") {
      mongoliaBlock.hidden = false;
      foreignBlock.hidden = true;

      provinceSelect.disabled = false;
      soumSelect.disabled = false;

      // Аймгуудыг бөглөх
      provinceSelect.innerHTML =
        `<option value="">— Сонгох —</option>` +
        Object.keys(window.MONGOLIA)
          .map((p) => `<option value="${p}">${p}</option>`)
          .join("");

      soumSelect.innerHTML = `<option value="">— Сонгох —</option>`;
    }

    // === Гадаад улс ===
    else if (val === "OTHER") {
      mongoliaBlock.hidden = true;
      foreignBlock.hidden = false;

      provinceSelect.value = "";
      soumSelect.value = "";
    }

    // === Сонгоогүй ===
    else {
      mongoliaBlock.hidden = true;
      foreignBlock.hidden = true;
    }
  });
}

// Аймаг → Сум
provinceSelect?.addEventListener("change", () => {
  const province = provinceSelect.value;
  const soums = window.MONGOLIA[province] || [];

  soumSelect.innerHTML =
    `<option value="">— Сонгох —</option>` +
    soums.map((s) => `<option value="${s}">${s}</option>`).join("");
});

function syncBirthPlaceUI(member) {
  const countrySelect = document.getElementById("edit-country");
  const provinceSelect = document.getElementById("edit-province");
  const soumSelect = document.getElementById("edit-soum");
  const foreignInput = document.getElementById("edit-foreign-place");
  const mongoliaBlock = document.getElementById("mongolia-fields");
  const foreignBlock = document.getElementById("foreign-fields");

  if (!countrySelect) return;

  // RESET
  mongoliaBlock.hidden = true;
  foreignBlock.hidden = true;

  provinceSelect.disabled = true;
  soumSelect.disabled = true;

  // === Монгол ===
  if (member.birthPlace) {
    const parts = member.birthPlace.split(",").map((x) => x.trim());

    if (parts.length >= 1 && window.MONGOLIA[parts[0]]) {
      countrySelect.value = "MN";
      mongoliaBlock.hidden = false;

      provinceSelect.disabled = false;
      soumSelect.disabled = false;

      // Аймаг
      provinceSelect.innerHTML =
        `<option value="">— Сонгох —</option>` +
        Object.keys(window.MONGOLIA)
          .map((p) => `<option value="${p}">${p}</option>`)
          .join("");

      provinceSelect.value = parts[0];

      // 🔥 CHANGE EVENT ГАРГАХ
      provinceSelect.dispatchEvent(new Event("change"));

      // Сум
      if (parts[1]) {
        soumSelect.value = parts[1];
      }
      return;
    }
  }

  // === Гадаад ===
  if (member.birthPlace) {
    countrySelect.value = "OTHER";
    foreignBlock.hidden = false;
    foreignInput.value = member.birthPlace;
  }
}

function openProfileEdit(member) {
  currentProfileMember = member;

  // ===== preload media for edit =====
  editImages = [...(member.images || [])];
  editVideos = [...(member.videos || [])];

  renderEditMedia();
  document.getElementById("edit-familyName").value = member.familyName || "";
  document.getElementById("edit-fatherName").value = member.fatherName || "";
  document.getElementById("edit-birthDate").value = member.birthDate || "";
  document.getElementById("edit-deathDate").value = member.deathDate || "";
  document.getElementById("edit-education").value = member.education || "";
  document.getElementById("edit-position").value = member.position || "";
  document.getElementById("edit-achievements").value = (
    member.achievements || []
  ).join("\n");

  // ⭐ ТӨРСӨН ГАЗАР UI sync
  syncBirthPlaceUI(member);

  const el = document.getElementById("profile-edit-backdrop");
  if (el) el.hidden = true;
  document.getElementById("profile-edit").hidden = false;
  // preload profile photo
  // preload profile photo (SAFE)
  // preload profile photo (SAFE & LOCAL)
  const previewEl = document.getElementById("photo-preview");
  const placeholderEl = document.getElementById("photo-placeholder");
  const urlInputEl = document.getElementById("edit-photo-url");

  if (previewEl && placeholderEl && urlInputEl) {
    if (member.photoUrl) {
      previewEl.src = member.photoUrl;
      previewEl.hidden = false;
      placeholderEl.hidden = true;
      urlInputEl.value = member.photoUrl.startsWith("http")
        ? member.photoUrl
        : "";
    } else {
      previewEl.hidden = true;
      placeholderEl.hidden = false;
      urlInputEl.value = "";
    }
  }
}
function renderEditMedia() {
  const imgBox = document.getElementById("edit-images");
  const vidBox = document.getElementById("edit-videos");

  if (!imgBox || !vidBox) return;

  imgBox.innerHTML = "";
  vidBox.innerHTML = "";

  editImages.forEach((url, i) => {
    const img = document.createElement("img");
    img.src = url;
    img.style.width = "100px";
    img.style.margin = "4px";
    img.style.borderRadius = "8px";
    img.style.objectFit = "cover";
    img.title = "Дарж устгана";
    img.onclick = () => {
      editImages.splice(i, 1);
      renderEditMedia();
    };
    imgBox.appendChild(img);
  });

  editVideos.forEach((url, i) => {
    const v = document.createElement("video");
    v.src = url;
    v.controls = true;
    v.style.width = "140px";
    v.style.margin = "4px";
    v.title = "Дарж устгана";
    v.onclick = () => {
      editVideos.splice(i, 1);
      renderEditMedia();
    };
    vidBox.appendChild(v);
  });
}
document.getElementById("add-image")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const url = await uploadFileToR2(file); // ⭐ R2 upload
      editImages.push(url);                   // ⭐ URL хадгална
      renderEditMedia();
    } catch (err) {
      alert("Зураг upload амжилтгүй");
      console.error(err);
    }
  };

  input.click();
});
document.getElementById("add-video")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*";

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const url = await uploadFileToR2(file); // ⭐ R2 upload
      editVideos.push(url);                   // ⭐ URL хадгална
      renderEditMedia();
    } catch (err) {
      alert("Видео upload амжилтгүй");
      console.error(err);
    }
  };

  input.click();
});
// ================== PROFILE PHOTO LOGIC ==================
const drop = document.getElementById("photo-drop");
const fileInput = document.getElementById("photo-file");
const preview = document.getElementById("photo-preview");
const placeholder = document.getElementById("photo-placeholder");
const urlInput = document.getElementById("edit-photo-url");

if (drop) {
  // click → file chooser
  drop.addEventListener("click", () => fileInput.click());

  // drag over
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--brand)";
  });

  // drag leave
  drop.addEventListener("dragleave", () => {
    drop.style.borderColor = "var(--border)";
  });

  // drop file
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--border)";
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });
}

// file selected
fileInput?.addEventListener("change", () => {
  if (fileInput.files[0]) {
    loadImageFile(fileInput.files[0]);
  }
});

// URL input
urlInput?.addEventListener("input", () => {
  const url = urlInput.value.trim();
  if (url) {
    preview.src = url;
    preview.hidden = false;
    placeholder.hidden = true;
  }
});

async function loadImageFile(file) {
  try {
    const url = await uploadFileToR2(file);

    preview.src = url;
    preview.hidden = false;
    placeholder.hidden = true;

    urlInput.value = url; // ⭐ URL хадгална
  } catch (err) {
    alert("Зураг upload амжилтгүй");
    console.error(err);
  }
}

async function loadTreeFromDB() {
  const user = window.auth?.currentUser;
  if (!user) return;

  try {
    const token = await user.getIdToken(); // ✅ ЗААВАЛ ЭНД БАЙХ ЁСТОЙ

    const res = await fetch("/api/tree/load", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // ✅ зөв
      },
    });

    if (!res.ok) {
      console.error("LOAD FAILED:", res.status, await res.text());
      members.length = 0;     // ✅ KEEP REFERENCE

      createDefaultRoot();
      repairTreeData();
      nextId = members.reduce((mx, m) => Math.max(mx, m.id), 0) + 1;
      scheduleRender();
      return;
    }

    const data = await res.json();

    const rawMembers = Array.isArray(data?.members) ? data.members : [];
    // 🔥 KEEP SAME ARRAY REFERENCE
    members.length = 0;

    rawMembers.forEach((raw) => {
      const m = new FamilyMember(raw);
      m.parents = Array.isArray(raw.parents) ? raw.parents.slice() : [];
      m.children = Array.isArray(raw.children) ? raw.children.slice() : [];
      m.spouseId = raw.spouseId ?? null;
      m.collapseUp = !!raw.collapseUp;
      members.push(m);
    });

    if (!members.length) createDefaultRoot();

    repairTreeData();
    nextId = members.reduce((max, m) => (m.id > max ? m.id : max), 0) + 1;
    scheduleRender();
  } catch (err) {
    console.error("DB-ээс tree ачааллахад алдаа:", err);
    members.length = 0;     // ✅ KEEP REFERENCE

    createDefaultRoot();
    repairTreeData();
    nextId = members.reduce((mx, m) => Math.max(mx, m.id), 0) + 1;
    scheduleRender();
  }
}
// ================= SIMPLE SEARCH (LIST ONLY) =================

// ================= SEARCH STATE =================
const searchState = {
  name: "",
  family: "",
  clan: "",
  education: "",
};

// ================= SEARCH FILTER =================
function searchMembers(list) {
  return list.filter(m => {
    if (
      searchState.name &&
      !m.name?.toLowerCase().includes(searchState.name)
    ) return false;

    // Овог
    // ⭐ Овог = ЭЦГИЙН НЭР
    if (
      searchState.family &&
      !m.fatherName?.toLowerCase().includes(searchState.family)
    ) return false;

    // ⭐ Ургийн овог = ОВОГ
    if (
      searchState.clan &&
      !m.familyName?.toLowerCase().includes(searchState.clan)
    ) return false;

    // Боловсрол
    if (
      searchState.education &&
      m.education !== searchState.education
    ) return false;

    return true;
  });
}
function renderSearchList() {
  const ul = document.getElementById("search-result-list");
  if (!ul) return;

  ul.innerHTML = "";

  const hasFilter =
    searchState.name ||
    searchState.family ||
    searchState.clan ||
    searchState.education;

  if (!hasFilter) {
    applyTreeHighlight(); // reset
    return;
  }

  const results = searchMembers(members);

  results.forEach(m => {
    const li = document.createElement("li");

    li.innerHTML = `
      <div class="search-result-name">
        ${m.familyName || ""} ${m.name || ""}
      </div>
      <div class="search-result-meta">
        ${m.age ? m.age + " настай · " : ""}
        ${m.sex === "male" ? "Эр" : m.sex === "female" ? "Эм" : ""}
      </div>
    `;

    li.addEventListener("click", () => {
      openProfileView(m); // дэлгэрэнгүй
    });

    ul.appendChild(li);
  });

  applyTreeHighlight(); // ⭐ ЭНД
}
function applyTreeHighlight() {
  // 1) Одоогийн filter-т таарах хүмүүс
  const matched = searchMembers(members);
  const matchedIds = new Set(matched.map(m => m.id));

  // 2) filter огт байхгүй бол → бүх highlight-ыг арилгана
  const hasFilter =
    searchState.name ||
    searchState.family ||
    searchState.clan ||
    searchState.education;

  document.querySelectorAll(".family-card").forEach(card => {
    const id = Number(card.dataset.id);

    card.classList.remove("search-hit", "search-dim");

    if (!hasFilter) return;

    if (matchedIds.has(id)) {
      card.classList.add("search-hit");
    } else {
      card.classList.add("search-dim");
    }
  });
}

document.getElementById("search-name")?.addEventListener("input", e => {
  searchState.name = e.target.value.trim().toLowerCase();
  renderSearchList();
});

document.getElementById("search-family")?.addEventListener("input", e => {
  searchState.family = e.target.value.trim().toLowerCase();
  renderSearchList();
});

document.getElementById("search-clan")?.addEventListener("input", e => {
  searchState.clan = e.target.value.trim().toLowerCase();
  renderSearchList();
});

document.getElementById("search-education")?.addEventListener("change", e => {
  searchState.education = e.target.value;
  renderSearchList();
});
document.addEventListener("click", () => {
  const deleteModal = document.getElementById("delete-modal");
  if (!deleteModal || deleteModal.hidden) {
    closeAllMenus();
  }
});

async function uploadFileToR2(file) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const data = await res.json();
  return data.url; // ⭐ PUBLIC URL
}
// ===== Fullscreen Image Viewer (FINAL & CLEAN) =====
let imageViewer = null;
let imageViewerImg = null;

window.addEventListener("DOMContentLoaded", () => {
  imageViewer = document.getElementById("image-viewer");
  imageViewerImg = document.getElementById("image-viewer-img");

  document.getElementById("image-close")?.addEventListener("click", closeImageFullscreen);

  imageViewer?.addEventListener("click", (e) => {
    if (e.target === imageViewer) {
      closeImageFullscreen();
    }
  });
});

function openImageFullscreen(src) {
  if (!imageViewer || !imageViewerImg) return;

  // profile modal-ыг түр нуух
  const profileView = document.getElementById("profile-view");
  const profileBackdrop = document.getElementById("profile-backdrop");

  if (profileView) profileView.style.display = "none";
  if (profileBackdrop) profileBackdrop.style.display = "none";

  imageViewerImg.src = src;
  imageViewer.classList.remove("hidden");
}

function closeImageFullscreen() {
  if (!imageViewer || !imageViewerImg) return;

  imageViewer.classList.add("hidden");
  imageViewerImg.src = "";

  // profile modal-ыг буцааж харуулах
  const profileView = document.getElementById("profile-view");
  const profileBackdrop = document.getElementById("profile-backdrop");

  if (profileView) profileView.style.display = "";
  if (profileBackdrop) profileBackdrop.style.display = "";
}
// ================== DELETE CONFIRM LOGIC ==================
document.getElementById("delete-cancel")?.addEventListener("click", () => {
  closeDeleteConfirm();
});

document.getElementById("delete-backdrop")?.addEventListener("click", () => {
  closeDeleteConfirm();
});

document.getElementById("delete-confirm")?.addEventListener("click", () => {
  if (!pendingDeleteMember) return;

  deletePerson(pendingDeleteMember);
  pendingDeleteMember = null;
  closeDeleteConfirm();
});
document.getElementById("media-delete-cancel")
  ?.addEventListener("click", closeMediaDeleteConfirm);

document.getElementById("media-delete-backdrop")
  ?.addEventListener("click", closeMediaDeleteConfirm);

document.getElementById("media-delete-confirm")
  ?.addEventListener("click", () => {
    if (!pendingMediaDelete) return;

    const { member, type, index } = pendingMediaDelete;

    if (type === "image") {
      member.images.splice(index, 1);
    } else if (type === "video") {
      member.videos.splice(index, 1);
    }

    saveTreeToDB();
    openProfileView(member);
    closeMediaDeleteConfirm();
  });

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function setupTreeZoomAndPan() {
  const scaleBox = document.getElementById("tree-scale");
  if (!treeRoot || !scaleBox) return;

  const btnIn = document.getElementById("btn-zoom-in");
  const btnOut = document.getElementById("btn-zoom-out");
  const btnReset = document.getElementById("btn-zoom-reset");

  const apply = () => {
    // layoutTree хийхгүйгээр зөвхөн харагдац шинэчилнэ
    renderTree();
  };

  btnIn?.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomState.userScale = clamp(zoomState.userScale + zoomState.step, zoomState.min, zoomState.max);
    apply();
  });

  btnOut?.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomState.userScale = clamp(zoomState.userScale - zoomState.step, zoomState.min, zoomState.max);
    apply();
  });

  btnReset?.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomState.userScale = 1;
    zoomState.panX = 0;
    zoomState.panY = 0;
    apply();
  });

  // ================== DRAG PAN ==================
  let dragging = false;
  let startX = 0, startY = 0;
  let basePanX = 0, basePanY = 0;

  treeRoot.addEventListener("pointerdown", (e) => {
    // карт, товч, input дээр бол pan эхлүүлэхгүй
    if (e.target.closest(".family-card") || e.target.closest(".tree-zoom") || e.target.closest("button") || e.target.closest("input") || e.target.closest("select") || e.target.closest("textarea")) {
      return;
    }
    dragging = true;
    treeRoot.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    basePanX = zoomState.panX;
    basePanY = zoomState.panY;
  });

  treeRoot.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    zoomState.panX = basePanX + dx;
    zoomState.panY = basePanY + dy;
    renderTree();
  });

  treeRoot.addEventListener("pointerup", (e) => {
    dragging = false;
    try { treeRoot.releasePointerCapture(e.pointerId); } catch {}
  });

  treeRoot.addEventListener("pointercancel", () => {
    dragging = false;
  });
}
