const CARD_W = 150;
const CARD_H = 190;
const H_GAP = 60;
const V_GAP = 60;

// ================== DATA MODEL ==================
class FamilyMember {
  constructor({ 
    id, name, age, sex, level, photoUrl,

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
    videos
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

let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;

  requestAnimationFrame(() => {
    renderQueued = false;
    layoutTree();
    renderTree();
  });
}

let saveTimer = null;

let saving = false;

function saveTreeToDB() {
  const user = window.auth?.currentUser;
  if (!user) return;

  clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (saving) return;
    saving = true;

    try {
      const res = await fetch("/api/tree/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-uid": user.uid,
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
  }, 600); // ⏱ илүү safe
}




let members = [];
let nextId = 1;

let treeRoot, nodesLayer, svg;
let posMap = new Map(); // id -> {x,y}


// Person modal state
let modalMode = null;   // "add-father" | "add-mother" | "add-spouse" | "add-child" | "edit"
let modalTarget = null; // FamilyMember

// ============== INIT ==============
window.addEventListener("DOMContentLoaded", () => {
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  svg = document.getElementById("tree-lines-svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  setupPersonModal();
  setupThemeButton();

  // 🔥 Auth state-г гаднаас hook хийнэ
  waitForAuthAndLoadTree();
});

function clearSVG() {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}
function drawSVGLine(x1, y1, x2, y2) {
  const line = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line"
  );
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
    sex: "",
    level: 0,
    photoUrl: "img/profileson.jpg",
  });
  members.push(me);
}






// ================== HELPERS ==================
function getTreeBounds(visibleMembers) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  visibleMembers.forEach(m => {
    minX = Math.min(minX, m.x - CARD_W / 2);
    maxX = Math.max(maxX, m.x + CARD_W / 2);
    minY = Math.min(minY, m.y - CARD_H / 2);
    maxY = Math.max(maxY, m.y + CARD_H / 2);
  });

  return { minX, minY, maxX, maxY };
}


function getParentBySex(child, sex) {
  return (child.parents || [])
    .map(pid => findMember(pid))
    .find(p => p && p.sex === sex) || null;
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
  const byId = new Map(members.map(m => [m.id, m]));

  // 1) parents -> children sync
  members.forEach(child => {
    (child.parents || []).forEach(pid => {
      const p = byId.get(pid);
      if (!p) return;
      if (!p.children) p.children = [];
      if (!p.children.includes(child.id)) {
        p.children.push(child.id);
      }
    });
  });

  // 2) spouse symmetry
  members.forEach(m => {
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
  members.forEach(m => {
    const pids = (m.parents || []).filter(pid => byId.has(pid));
    if (!pids.length) return;

    const parentLevels = pids
      .map(pid => byId.get(pid).level)
      .filter(v => typeof v === "number" && isFinite(v));

    if (!parentLevels.length) return;

    const target = Math.min(...parentLevels) + 1;
    if (m.level !== target) m.level = target;
  });

  // 4) canonicalize parents everywhere (Fix #1 logic)
  members.forEach(m => normalizeParents(m));
}


let authListenerAttached = false;

function waitForAuthAndLoadTree() {
  const authWait = setInterval(() => {
    if (!window.auth || authListenerAttached) return;

    clearInterval(authWait);
    authListenerAttached = true;

    window.auth.onAuthStateChanged((user) => {
      members = [];
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
  const left   = m.x - CARD_W / 2;
  const right  = m.x + CARD_W / 2;
  const top    = m.y - CARD_H / 2;
  const bottom = m.y + CARD_H / 2;

  return {
    cx: m.x,
    top,
    bottom,
    left,
    right
  };
}

function findMember(id) {
  return members.find((m) => m.id === id);
}

// ---- ancestors hidden set (collapseUp) ----
function buildHiddenAncestorSet() {
  const hidden = new Set();
  const visited = new Set();

  function dfs(id) {
    if (visited.has(id)) return;
    visited.add(id);

    const m = findMember(id);
    if (!m || !m.parents) return;

    m.parents.forEach(pid => {
      if (!hidden.has(pid)) {
        hidden.add(pid);
        dfs(pid);
      }
    });
  }

  members.forEach(m => {
    if (m.collapseUp) {
      dfs(m.id);
    }
  });

  return hidden;
}


// ================== LAYOUT ==================
function layoutTree() {
  if (!treeRoot) return;

  const hiddenAnc = buildHiddenAncestorSet();
  const visibleMembers = members.filter(m => !hiddenAnc.has(m.id));
  if (!visibleMembers.length) return;

  const levelMap = new Map();
  visibleMembers.forEach(m => {
    if (!levelMap.has(m.level)) levelMap.set(m.level, []);
    levelMap.get(m.level).push(m);
  });

  const levels = [...levelMap.keys()].sort((a, b) => a - b);

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;

  const newPosMap = new Map();

  levels.forEach((levelValue, rowIndex) => {
    const row = levelMap.get(levelValue);
    const y = paddingTop + rowIndex * rowGap;

    // ===== group couples / singles =====
    const units = [];
    const used = new Set();

    row.forEach(m => {
      if (used.has(m.id)) return;

      if (m.spouseId) {
        const s = findMember(m.spouseId);
        if (s && s.level === levelValue && !used.has(s.id)) {
          units.push([m.id, s.id]);
          used.add(m.id);
          used.add(s.id);
          return;
        }
      }
      units.push([m.id]);
      used.add(m.id);
    });

    // ===== total row width =====
    const UNIT_W = CARD_W * 2.2;
    const totalWidth =
      units.length * UNIT_W + (units.length - 1) * H_GAP;

    // ⭐ CENTER THIS ROW AROUND 0 ⭐
    let cursorX = -totalWidth / 2 + UNIT_W / 2;

    units.forEach(u => {
      const cx = cursorX;

      if (u.length === 1) {
        newPosMap.set(u[0], { x: cx, y });
      } else {
        const off = CARD_W * 0.55;
        newPosMap.set(u[0], { x: cx - off, y });
        newPosMap.set(u[1], { x: cx + off, y });
      }

      cursorX += UNIT_W + H_GAP;
    });
  });

  members.forEach(m => {
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

  nodesLayer.innerHTML = "";
  const visibleMembers = layoutVisibleMembers();
  if (!visibleMembers.length) return;

  // 1) render cards in tree space
  visibleMembers.forEach(m => {
    const card = createFamilyCard(m);
    card.style.left = (m.x - CARD_W / 2) + "px";
    card.style.top  = (m.y - CARD_H / 2) + "px";
    nodesLayer.appendChild(card);
  });

  requestAnimationFrame(() => {
    const bounds = getTreeBounds(visibleMembers);

    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;

    const viewW = treeRoot.clientWidth;
    const viewH = treeRoot.clientHeight;

    if (treeW <= 0 || treeH <= 0) return;

    // 2) scale to fit viewport
    const scale = Math.min(viewW / treeW, viewH / treeH, 1);

    // 3) center inside viewport (in screen space)
    const offsetX = (viewW - treeW * scale) / 2;
    const offsetY = (viewH - treeH * scale) / 2;

    // 4) IMPORTANT: order is center -> scale -> shift-to-zero
    scaleBox.style.transform =
      `translate(${offsetX}px, ${offsetY}px) scale(${scale}) translate(${-bounds.minX}px, ${-bounds.minY}px)`;

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
  const btnChild  = makeBtn("Хүүхэд нэмэх");
  const btnDetail = makeBtn("Дэлгэрэнгүй мэдээлэл");
  const btnEdit   = makeBtn("Мэдээлэл засах");
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

  card.append(
    btnUp,
    btnAdd,
    menu,
    avatarWrap,
    nameBox
  );

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
    toggleMenu(menu);
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
      photoUrl: "img/profilespouse.jpg",
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
    deletePerson(member);
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

// ================== MENU HELPERS ==================
function toggleMenu(menu) {
  closeAllMenus();
  menu.classList.toggle("hidden");
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

  // Хэрвээ эдгээрээс аль нэг нь байхгүй бол modal-гүй хуудсан дээр байна гэж үзээд алдаа гаргалгүй return хийнэ
  if (!backdrop || !modal || !form || !btnCancel) {
    console.warn("Person modal elements not found, skipping modal setup");
    return;
  }

  btnCancel.addEventListener("click", closePersonModal);
  backdrop.addEventListener("click", closePersonModal);

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

  switch (modalMode) {
    case "edit":
      if (modalTarget) editPersonWithData(modalTarget, data);
      break;
    case "add-father":
      if (modalTarget) addFatherWithData(modalTarget, data);
      break;
    case "add-mother":
      if (modalTarget) addMotherWithData(modalTarget, data);
      break;
    case "add-spouse":
      if (modalTarget) addSpouseWithData(modalTarget, data);
      break;
    case "add-child":
      if (modalTarget) addChildWithData(modalTarget, data);
      break;
  }

  saveTreeToDB();  // бүх өөрчлөлтийг файлд хадгална
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
    alert("Эцэг аль хэдийн бүртгэлтэй байна.");
    return;
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
  members.forEach(m => normalizeParents(m));
}



function addMotherWithData(child, data) {
  const existingMother = getParentBySex(child, "female");
  if (existingMother) {
    alert("Эх аль хэдийн бүртгэлтэй байна.");
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
  members.forEach(m => normalizeParents(m));
}


function addSpouseWithData(person, data) {
  if (person.spouseId) {
    alert("Хань аль хэдийн бүртгэлтэй байна.");
    return;
  }

  const sex = normalizeSex(data.sex);

  const spouse = new FamilyMember({
    id: nextId++,
    name: data.name || "Хань",
    age: data.age,
    sex,
    level: person.level,
    photoUrl: data.photoUrl || "img/profilespouse.jpg",
  });

  spouse.spouseId = person.id;
  person.spouseId = spouse.id;

  // 🔐 sync existing children (NO OVERWRITE)
  person.children.forEach(cid => {
    const child = findMember(cid);
    if (!child) return;

    // link child list
    if (!spouse.children.includes(child.id)) {
      spouse.children.push(child.id);
    }

    // add parent ONLY if missing
    const hasMale   = getParentBySex(child, "male");
    const hasFemale = getParentBySex(child, "female");

    if (sex === "male" && !hasMale) {
      child.parents.push(spouse.id);
    } 
    else if (sex === "female" && !hasFemale) {
      child.parents.push(spouse.id);
    }
  });

  members.push(spouse);
  members.forEach(m => normalizeParents(m));
}



function addChildWithData(parent, data) {
  const sex = normalizeSex(data.sex);

  const child = new FamilyMember({
    id: nextId++,
    name: data.name || "Хүүхэд",
    age: data.age,
    sex,
    level: parent.level + 1,
    photoUrl: data.photoUrl || "img/profileson.jpg",
  });

  // parent → child list (safe)
  if (!parent.children.includes(child.id)) {
    parent.children.push(child.id);
  }

  // ✅ ALWAYS link parent id (no reliance on parent.sex)
  child.parents = [];
  child.parents.push(parent.id);

  // spouse auto-link (safe)
  if (parent.spouseId) {
    const spouse = findMember(parent.spouseId);
    if (spouse) {
      if (!spouse.children.includes(child.id)) {
        spouse.children.push(child.id);
      }
      if (!child.parents.includes(spouse.id)) {
        child.parents.push(spouse.id);
      }
    }
  }

  members.push(child);
  members.forEach(m => normalizeParents(m));
}



function editPersonWithData(member, data) {
  // 📝 name
  if (typeof data.name === "string" && data.name.trim() !== "") {
    member.name = data.name.trim();
  }

  // 🎂 age (хоосон бол хуучныг хадгална)
  if (typeof data.age === "string") {
    const trimmedAge = data.age.trim();
    if (trimmedAge !== "") {
      member.age = trimmedAge;
    }
  }

  // 🚻 sex (зөвхөн өгөгдсөн үед)
  if (typeof data.sex === "string" && data.sex.trim() !== "") {
    member.sex = normalizeSex(data.sex);
  }

  // 🖼 photoUrl (хоосон string-ээр дарж устгахгүй)
  if (typeof data.photoUrl === "string" && data.photoUrl.trim() !== "") {
    member.photoUrl = data.photoUrl.trim();
  }
}


function deletePerson(member) {
  if (member.level === 0 && members.length === 1) {
    alert("Үндсэн 'Би' node-ийг устгах боломжгүй.");
    return;
  }
  if (!confirm("Энэ хүнийг устгах уу?")) return;

  const id = member.id;

  // 1) Remove the member itself
  members = members.filter(m => m.id !== id);

  // 2) Remove references + spouse links
  members.forEach(m => {
    m.children = (m.children || []).filter(cid => cid !== id);
    m.parents  = (m.parents  || []).filter(pid => pid !== id);
    if (m.spouseId === id) m.spouseId = null;
  });

  // 3) Fix child levels when their parent was deleted
  //    For every remaining node, recompute level from any existing parent if possible.
  const byId = new Map(members.map(m => [m.id, m]));

  members.forEach(child => {
    const pids = (child.parents || []).filter(pid => byId.has(pid));
    if (!pids.length) return; // no parent left → keep current level (no data loss)

    const parentLevels = pids
      .map(pid => byId.get(pid).level)
      .filter(v => typeof v === "number" && isFinite(v));

    if (!parentLevels.length) return;

    const targetLevel = Math.min(...parentLevels) + 1;
    if (child.level !== targetLevel) child.level = targetLevel;
  });

  // 4) Normalize parents everywhere (no data loss after Fix #1)
  members.forEach(m => normalizeParents(m));

  saveTreeToDB();
  scheduleRender();
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
  if (![x1, y1, x2, y2].every(v => typeof v === "number" && isFinite(v))) {
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

  const visibleIds = new Set(visibleMembers.map(m => m.id));
  const GAP = 18;

  /* ================= SPOUSE ================= */
  visibleMembers.forEach(m => {
    if (!m.spouseId || !visibleIds.has(m.spouseId)) return;
    if (m.id > m.spouseId) return;

    const a = cardRect(m.id);
    const b = cardRect(m.spouseId);
    if (!a || !b) return;

    const y = (a.top + a.bottom) / 2;
    safeLine(svg, a.right, y, b.left, y);
  });

  /* ================= CHILD → PARENTS (UNIFIED FIX) ================= */
  visibleMembers.forEach(child => {
    const parents = (child.parents || [])
      .map(pid => findMember(pid))
      .filter(p => p && visibleIds.has(p.id))
      .map(p => cardRect(p.id))
      .filter(Boolean);

    if (!parents.length) return;

    const c = cardRect(child.id);
    if (!c) return;

    const parentsCenterX =
      parents.reduce((s, p) => s + p.cx, 0) / parents.length;

    const topParentY = Math.max(...parents.map(p => p.bottom));
    const midY = topParentY + GAP;

    /* parents → horizontal bar */
    parents.forEach(p => {
      safeLine(svg, p.cx, p.bottom, p.cx, midY);
    });

    if (parents.length > 1) {
      const minX = Math.min(...parents.map(p => p.cx));
      const maxX = Math.max(...parents.map(p => p.cx));
      safeLine(svg, minX, midY, maxX, midY);
    }

    /* down to child */
    safeLine(svg, parentsCenterX, midY, parentsCenterX, c.top - 6);
    safeLine(svg, parentsCenterX, c.top - 6, c.cx, c.top - 6);
    safeLine(svg, c.cx, c.top - 6, c.cx, c.top);
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
      (member.sex === "male"
        ? "Эр"
        : member.sex === "female"
        ? "Эм"
        : "—");
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
document.getElementById("profile-close")?.addEventListener(
  "click",
  closeProfileView
);

document.getElementById("profile-backdrop")?.addEventListener(
  "click",
  closeProfileView
);
let currentProfileMember = null;



function closeProfileEdit() {
  document.getElementById("profile-edit-backdrop").hidden = true;
  document.getElementById("profile-edit").hidden = true;
}

document.getElementById("profile-edit-close")
  ?.addEventListener("click", closeProfileEdit);

document.getElementById("profile-edit-backdrop")
  ?.addEventListener("click", closeProfileEdit);

document.getElementById("profile-edit-save")
  ?.addEventListener("click", () => {
    if (!currentProfileMember) return;
    if (preview && !preview.hidden) {
      currentProfileMember.photoUrl = preview.src;
    }
    currentProfileMember.familyName =
      document.getElementById("edit-familyName").value.trim();

    currentProfileMember.fatherName =
      document.getElementById("edit-fatherName").value.trim();

    currentProfileMember.birthDate =
      document.getElementById("edit-birthDate").value;

    currentProfileMember.deathDate =
      document.getElementById("edit-deathDate").value;

    currentProfileMember.education =
      document.getElementById("edit-education").value.trim();

    currentProfileMember.position =
      document.getElementById("edit-position").value.trim();

    currentProfileMember.achievements =
      document.getElementById("edit-achievements")
        .value
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean);

    // 🔽 🔽 🔽 ЭНД birthPlace LOGIC-ОО ОРУУЛНА 🔽 🔽 🔽
    const country = document.getElementById("edit-country")?.value;
    const province = document.getElementById("edit-province")?.value;
    const soum = document.getElementById("edit-soum")?.value;
    const foreign = document.getElementById("edit-foreign-place")?.value;

    if (country === "MN") {
      currentProfileMember.birthPlace =
        [province, soum].filter(Boolean).join(", ");
    } else if (country === "OTHER") {
      currentProfileMember.birthPlace = foreign?.trim() || "";
    }

    // 🔼 🔼 🔼 ЭНД ДУУСНА 🔼 🔼 🔼

    saveTreeToDB();
    openProfileView(currentProfileMember);
    closeProfileEdit();
  });

// ================== PROFILE EDIT BUTTON ==================
document.getElementById("profile-edit-btn")
  ?.addEventListener("click", () => {
    if (currentProfileMember) {
      openProfileEdit(currentProfileMember);
    }
  });

// ================== BIRTH PLACE LOGIC (STEP 1) ==================


// ================== BIRTH PLACE DROPDOWN LOGIC ==================
const countrySelect  = document.getElementById("edit-country");
const provinceSelect = document.getElementById("edit-province");
const soumSelect     = document.getElementById("edit-soum");
const foreignInput   = document.getElementById("edit-foreign-place");
const mongoliaBlock  = document.getElementById("mongolia-fields");
const foreignBlock   = document.getElementById("foreign-fields");

if (countrySelect) {
  countrySelect.addEventListener("change", () => {
    const val = countrySelect.value;

    // === Монгол ===
    if (val === "MN") {
      mongoliaBlock.hidden = false;
      foreignBlock.hidden  = true;

      provinceSelect.disabled = false;
      soumSelect.disabled = false;

      // Аймгуудыг бөглөх
      provinceSelect.innerHTML =
        `<option value="">— Сонгох —</option>` +
        Object.keys(window.MONGOLIA)
          .map(p => `<option value="${p}">${p}</option>`)
          .join("");

      soumSelect.innerHTML = `<option value="">— Сонгох —</option>`;
    }

    // === Гадаад улс ===
    else if (val === "OTHER") {
      mongoliaBlock.hidden = true;
      foreignBlock.hidden  = false;

      provinceSelect.value = "";
      soumSelect.value = "";
    }

    // === Сонгоогүй ===
    else {
      mongoliaBlock.hidden = true;
      foreignBlock.hidden  = true;
    }
  });
}

// Аймаг → Сум
provinceSelect?.addEventListener("change", () => {
  const province = provinceSelect.value;
  const soums = window.MONGOLIA[province] || [];

  soumSelect.innerHTML =
    `<option value="">— Сонгох —</option>` +
    soums.map(s => `<option value="${s}">${s}</option>`).join("");
});

function syncBirthPlaceUI(member) {
  const countrySelect  = document.getElementById("edit-country");
  const provinceSelect = document.getElementById("edit-province");
  const soumSelect     = document.getElementById("edit-soum");
  const foreignInput   = document.getElementById("edit-foreign-place");
  const mongoliaBlock  = document.getElementById("mongolia-fields");
  const foreignBlock   = document.getElementById("foreign-fields");

  if (!countrySelect) return;

  // RESET
  mongoliaBlock.hidden = true;
  foreignBlock.hidden  = true;

  provinceSelect.disabled = true;
  soumSelect.disabled = true;

  // === Монгол ===
  if (member.birthPlace) {
    const parts = member.birthPlace.split(",").map(x => x.trim());

    if (parts.length >= 1 && window.MONGOLIA[parts[0]]) {
      countrySelect.value = "MN";
      mongoliaBlock.hidden = false;

      provinceSelect.disabled = false;
      soumSelect.disabled = false;

      // Аймаг
      provinceSelect.innerHTML =
        `<option value="">— Сонгох —</option>` +
        Object.keys(window.MONGOLIA)
          .map(p => `<option value="${p}">${p}</option>`)
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

  document.getElementById("edit-familyName").value = member.familyName || "";
  document.getElementById("edit-fatherName").value = member.fatherName || "";
  document.getElementById("edit-birthDate").value = member.birthDate || "";
  document.getElementById("edit-deathDate").value = member.deathDate || "";
  document.getElementById("edit-education").value = member.education || "";
  document.getElementById("edit-position").value = member.position || "";
  document.getElementById("edit-achievements").value =
    (member.achievements || []).join("\n");

  // ⭐ ТӨРСӨН ГАЗАР UI sync
  syncBirthPlaceUI(member);

  document.getElementById("profile-edit-backdrop").hidden = false;
  document.getElementById("profile-edit").hidden = false;
  // preload profile photo
  // preload profile photo (SAFE)
  if (preview && placeholder && urlInput) {
    if (member.photoUrl) {
      preview.src = member.photoUrl;
      preview.hidden = false;
      placeholder.hidden = true;
      urlInput.value =
        member.photoUrl.startsWith("http") ? member.photoUrl : "";
    } else {
      preview.hidden = true;
      placeholder.hidden = false;
      urlInput.value = "";
    }
  }


}


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

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    preview.hidden = false;
    placeholder.hidden = true;
    urlInput.value = ""; // URL цэвэрлэнэ
  };
  reader.readAsDataURL(file);
}

async function loadTreeFromDB() {
  const user = window.auth?.currentUser;
  if (!user) return;

  try {
    const res = await fetch("/api/tree/load", {
      headers: {
        "Content-Type": "application/json",
        "x-user-uid": user.uid
      }
    });

    const data = await res.json();
    if (!data || !data.ok) return;

    const rawMembers = Array.isArray(data.members) ? data.members : [];

    // 1️⃣ Restore members
    members = rawMembers.map(raw => {
      const m = new FamilyMember(raw);
      m.parents = Array.isArray(raw.parents) ? raw.parents.slice() : [];
      m.children = Array.isArray(raw.children) ? raw.children.slice() : [];
      m.spouseId = raw.spouseId ?? null;
      m.collapseUp = !!raw.collapseUp;
      return m;
    });

    // 2️⃣ If empty → create root
    if (!members.length) {
      createDefaultRoot();
    }

    // 3️⃣ Repair data consistency (CRITICAL)
    repairTreeData();

    // 4️⃣ Recalculate nextId safely
    nextId =
      members.reduce((max, m) => (m.id > max ? m.id : max), 0) + 1;

    // 5️⃣ Render AFTER data is fully clean
    scheduleRender();


  } catch (err) {
    console.error("DB-ээс tree ачааллахад алдаа:", err);
  }
}  


