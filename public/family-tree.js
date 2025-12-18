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


let members = [];
let nextId = 1;

let treeRoot, nodesLayer, canvas, ctx;
let posMap = new Map(); // id -> {x,y}

// Person modal state
let modalMode = null;   // "add-father" | "add-mother" | "add-spouse" | "add-child" | "edit"
let modalTarget = null; // FamilyMember

// ============== INIT ==============
window.addEventListener("DOMContentLoaded", () => {
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  canvas = document.getElementById("tree-lines");
  ctx = canvas.getContext("2d");

  loadTreeFromJson();
});

function createDefaultRoot() {
  const me = new FamilyMember({
    id: 1,
    name: "Би",
    age: "",
    sex: "",
    level: 0,
    photoUrl: "img/profileson.jpg",
  });
  members.push(me);
}

async function loadTreeFromJson() {
  try {
    const res = await fetch("family-tree.json");
    if (!res.ok) {
      throw new Error("JSON олдсонгүй эсвэл алдаа: " + res.status);
    }

    const data = await res.json();
    const rawMembers = Array.isArray(data.members) ? data.members : [];

    // JSON → FamilyMember объект руу хөрвүүлэх
    members = rawMembers.map((raw) => {
      const m = new FamilyMember(raw);
      m.parents = raw.parents || [];
      m.children = raw.children || [];
      m.spouseId = raw.spouseId ?? null;
      m.collapseUp = !!raw.collapseUp;
      return m;
    });

    // Хэрвээ JSON хоосон бол fallback
    if (!members.length) {
      createDefaultRoot();
    }
  } catch (err) {
    console.error("family-tree.json ачааллахад алдаа:", err);
    // Алдаа гарвал бас fallback
    createDefaultRoot();
  }

  // nextId-гаа JSON-оос дахин тооцоолно
  nextId = members.reduce((max, m) => (m.id > max ? m.id : max), 0) + 1;

  // Үлдсэн анхны setup
  setupPersonModal();
  setupThemeButton();

  layoutTree();
  renderTree();

  window.addEventListener("resize", () => {
    layoutTree();
    renderTree();
  });

  document.addEventListener("click", () => {
    closeAllMenus();
  });
}

// ============== SAVE TO JSON (backend рүү) ==============
async function saveTreeToJson() {
  try {
    const payload = { members };
    await fetch("/api/tree/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Ургийн мод хадгалах үед алдаа:", e);
  }
}

// ================== HELPERS ==================
function findMember(id) {
  return members.find((m) => m.id === id);
}

// ---- ancestors hidden set (collapseUp) ----
function buildHiddenAncestorSet() {
  const hidden = new Set();

  members.forEach((m) => {
    if (!m.collapseUp) return;
    const stack = [...(m.parents || [])];

    while (stack.length) {
      const pid = stack.pop();
      if (hidden.has(pid)) continue;
      hidden.add(pid);
      const p = findMember(pid);
      if (p && p.parents && p.parents.length) {
        stack.push(...p.parents);
      }
    }
  });

  return hidden;
}

// ================== LAYOUT ==================
function layoutTree() {
  if (!treeRoot) return;

  const hiddenAnc = buildHiddenAncestorSet();
  const visibleMembers = members.filter((m) => !hiddenAnc.has(m.id));
  if (!visibleMembers.length) return;

  const levels = Array.from(
    new Set(visibleMembers.map((m) => m.level))
  ).sort((a, b) => a - b);

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;
  const containerWidth = treeRoot.clientWidth || 900;

  const newPosMap = new Map();

  levels.forEach((levelValue, rowIndex) => {
    const rowNodes = visibleMembers.filter((m) => m.level === levelValue);
    if (!rowNodes.length) return;

    // Anchor: эцэг эхийн нь X-үүдийн дундаж
    let hasAnchor = false;
    rowNodes.forEach((m) => {
      let anchor = 0;
      const parentPosList = (m.parents || [])
        .filter((pid) => !hiddenAnc.has(pid))
        .map((pid) => newPosMap.get(pid))
        .filter(Boolean);

      if (parentPosList.length > 0) {
        anchor =
          parentPosList.reduce((sum, p) => sum + p.x, 0) /
          parentPosList.length;
        hasAnchor = true;
      }
      m._anchor = anchor;
    });

    // Эхнэр нөхрийн нэгж
    const used = new Set();
    const units = [];

    rowNodes.forEach((m) => {
      if (used.has(m.id)) return;

      if (m.spouseId && !hiddenAnc.has(m.spouseId)) {
        const s = findMember(m.spouseId);
        if (s && s.level === levelValue && !used.has(s.id)) {
          units.push({ type: "couple", ids: [m.id, s.id] });
          used.add(m.id);
          used.add(s.id);
          return;
        }
      }
      units.push({ type: "single", ids: [m.id] });
      used.add(m.id);
    });

    const y = paddingTop + rowIndex * rowGap;
    const UNIT_WIDTH = CARD_W * 2.2;
    const MIN_DIST = UNIT_WIDTH + H_GAP * 0.2;

    // Anchor байхгүй бол зүгээр төвд нь тааруулна
    if (!hasAnchor) {
      const unitCount = units.length;
      const totalWidth =
        unitCount * UNIT_WIDTH + (unitCount - 1) * H_GAP;
      const startX = Math.max((containerWidth - totalWidth) / 2, 20);

      units.forEach((u, idx) => {
        const centerX =
          startX + idx * (UNIT_WIDTH + H_GAP) + UNIT_WIDTH / 2;

        if (u.type === "single") {
          const id = u.ids[0];
          newPosMap.set(id, { x: centerX, y });
        } else {
          const [id1, id2] = [...u.ids].sort((a, b) => a - b);
          const offset = CARD_W * 0.55;

          newPosMap.set(id1, { x: centerX - offset, y });
          newPosMap.set(id2, { x: centerX + offset, y });
        }
      });

      return;
    }

    // Anchor-тай үед: эцэг эхийн доор тааруулах
    units.forEach((u) => {
      const anchors = u.ids.map((id) => {
        const mem = rowNodes.find((m) => m.id === id);
        return mem ? mem._anchor || 0 : 0;
      });
      let avg =
        anchors.reduce((sum, a) => sum + a, 0) /
        Math.max(anchors.length, 1);
      if (!avg || !isFinite(avg)) avg = 0;
      u.anchor = avg;
    });

    units.sort((a, b) => a.anchor - b.anchor);

    let currentX = null;
    units.forEach((u) => {
      let desired = u.anchor;
      if (!desired || !isFinite(desired)) {
        desired =
          currentX == null ? containerWidth / 2 : currentX + MIN_DIST;
      }

      let centerX;
      if (currentX == null) {
        centerX = desired || containerWidth / 2;
      } else {
        centerX = Math.max(desired, currentX + MIN_DIST);
      }

      u._centerX = centerX;
      currentX = centerX;
    });

    let minX = Math.min(...units.map((u) => u._centerX));
    let maxX = Math.max(...units.map((u) => u._centerX));
    const margin = 40;
    let shift = 0;

    if (maxX - minX < containerWidth) {
      const usedWidth = maxX - minX;
      shift = (containerWidth - usedWidth) / 2 - minX;
    } else if (minX < margin) {
      shift = margin - minX;
    }

    units.forEach((u) => {
      const cx = u._centerX + shift;

      if (u.type === "single") {
        const id = u.ids[0];
        newPosMap.set(id, { x: cx, y });
      } else {
        const [id1, id2] = [...u.ids].sort((a, b) => a - b);
        const offset = CARD_W * 0.55;

        newPosMap.set(id1, { x: cx - offset, y });
        newPosMap.set(id2, { x: cx + offset, y });
      }
    });
  });

  members.forEach((m) => {
    const pos = newPosMap.get(m.id);
    if (pos) {
      m.x = pos.x;
      m.y = pos.y;
    }
  });

  posMap = newPosMap;

  const totalHeight =
    paddingTop * 2 + (levels.length - 1) * rowGap + CARD_H;
  treeRoot.style.height = Math.max(450, totalHeight) + "px";
}

// ================== RENDER ==================
function layoutVisibleMembers() {
  const hiddenAnc = buildHiddenAncestorSet();
  return members.filter((m) => !hiddenAnc.has(m.id));
}

function renderTree() {
  if (!nodesLayer) return;

  nodesLayer.innerHTML = "";

  const visibleMembers = layoutVisibleMembers();

  visibleMembers.forEach((m) => {
    const card = createFamilyCard(m);
    card.style.left = m.x - CARD_W / 2 + "px";
    card.style.top = m.y - CARD_H / 2 + "px";
    nodesLayer.appendChild(card);
  });

  resizeCanvas();
  drawLines(visibleMembers);
}

function resizeCanvas() {
  const rect = treeRoot.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

// ================== CARD COMPONENT ==================
function createFamilyCard(member) {
  const card = document.createElement("div");
  card.className = "family-card";
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
    layoutTree();
    renderTree();
    saveTreeToJson();
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

  saveTreeToJson();  // бүх өөрчлөлтийг файлд хадгална
  closePersonModal();
  layoutTree();
  renderTree();
}

// ================== ADD / EDIT / DELETE ==================
function normalizeSex(str) {
  const s = (str || "").toLowerCase();
  if (s === "male" || s === "эр" || s === "эрэгтэй") return "male";
  if (s === "female" || s === "эм" || s === "эмэгтэй") return "female";
  return "";
}

function addFatherWithData(child, data) {
  if (child.parents[0]) {
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
  child.parents[0] = father.id;

  // эх байвал хань болгож холбоно
  if (child.parents[1]) {
    const mother = findMember(child.parents[1]);
    if (mother) {
      father.spouseId = mother.id;
      mother.spouseId = father.id;
    }
  }

  members.push(father);
}

function addMotherWithData(child, data) {
  if (child.parents[1]) {
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
  child.parents[1] = mother.id;

  if (child.parents[0]) {
    const father = findMember(child.parents[0]);
    if (father) {
      mother.spouseId = father.id;
      father.spouseId = mother.id;
    }
  }

  members.push(mother);
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

  members.push(spouse);
}

function addChildWithData(parent, data) {
  const sex = normalizeSex(data.sex);

  const level = parent.level + 1;
  const child = new FamilyMember({
    id: nextId++,
    name: data.name || "Хүүхэд",
    age: data.age,
    sex,
    level,
    photoUrl: data.photoUrl || "img/profileson.jpg",
  });

  // parent → child
  parent.children.push(child.id);

  if (parent.sex === "male") {
    child.parents[0] = parent.id;
  } else if (parent.sex === "female") {
    child.parents[1] = parent.id;
  } else {
    child.parents.push(parent.id);
  }

  if (parent.spouseId) {
    const spouse = findMember(parent.spouseId);
    if (spouse) {
      spouse.children.push(child.id);
      if (spouse.sex === "male") child.parents[0] = spouse.id;
      else if (spouse.sex === "female") child.parents[1] = spouse.id;
      else if (!child.parents.includes(spouse.id))
        child.parents.push(spouse.id);
    }
  }

  members.push(child);
}

function editPersonWithData(member, data) {
  member.name = data.name || member.name;
  member.age = data.age || "";
  member.sex = normalizeSex(data.sex);

  // photoUrl ирсэн бол шинэчилнэ
  if (typeof data.photoUrl !== "undefined" && data.photoUrl !== "") {
    member.photoUrl = data.photoUrl;
  }
}

function deletePerson(member) {
  if (member.level === 0 && members.length === 1) {
    alert("Үндсэн 'Би' node-ийг устгах боломжгүй.");
    return;
  }
  if (!confirm("Энэ хүнийг устгах уу?")) return;

  const id = member.id;

  members.forEach((m) => {
    m.children = m.children.filter((cid) => cid !== id);
    m.parents = (m.parents || []).filter((pid) => pid !== id);
    if (m.spouseId === id) m.spouseId = null;
  });

  members = members.filter((m) => m.id !== id);

  saveTreeToJson();
  layoutTree();
  renderTree();
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

// ================== DRAW LINES ==================
function drawLines(visibleMembers) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  const visibleIds = new Set(visibleMembers.map((m) => m.id));

  // 1. Spouse lines
  visibleMembers.forEach((m) => {
    if (!m.spouseId) return;
    if (!visibleIds.has(m.spouseId)) return;

    const spouse = findMember(m.spouseId);
    if (!spouse) return;
    if (m.id > spouse.id) return;

    const p1 = posMap.get(m.id);
    const p2 = posMap.get(spouse.id);
    if (!p1 || !p2) return;

    const y = p1.y;

    ctx.beginPath();
    ctx.moveTo(p1.x + CARD_W * 0.3, y);
    ctx.lineTo(p2.x - CARD_W * 0.3, y);
    ctx.stroke();
  });

  // 2. Хоёр эцэг эх + олон хүүхэд
  const pairMap = new Map();

  visibleMembers.forEach((child) => {
    const parentsArr = (child.parents || []).filter((id) =>
      visibleIds.has(id)
    );
    if (parentsArr.length < 2) return;

    const [a, b] = parentsArr;
    const p1 = Math.min(a, b);
    const p2 = Math.max(a, b);
    const key = p1 + "-" + p2;

    if (!pairMap.has(key)) {
      pairMap.set(key, { parents: [p1, p2], children: [] });
    }
    pairMap.get(key).children.push(child.id);
  });

  pairMap.forEach((group) => {
    const [p1id, p2id] = group.parents;
    const parent1Pos = posMap.get(p1id);
    const parent2Pos = posMap.get(p2id);
    if (!parent1Pos || !parent2Pos) return;

    const childrenPos = group.children
      .map((id) => posMap.get(id))
      .filter(Boolean);

    if (!childrenPos.length) return;

    const parentBottomY = parent1Pos.y + CARD_H / 2;
    const childTopY = childrenPos[0].y - CARD_H / 2;

    const midParentX = (parent1Pos.x + parent2Pos.x) / 2;

    const parentsBarY = parentBottomY + 16;

    const minChildX = Math.min(...childrenPos.map((c) => c.x));
    const maxChildX = Math.max(...childrenPos.map((c) => c.x));
    const siblingY = childTopY - 20;

    ctx.beginPath();

    ctx.moveTo(parent1Pos.x, parentBottomY);
    ctx.lineTo(parent1Pos.x, parentsBarY);

    ctx.moveTo(parent2Pos.x, parentBottomY);
    ctx.lineTo(parent2Pos.x, parentsBarY);

    ctx.moveTo(parent1Pos.x, parentsBarY);
    ctx.lineTo(parent2Pos.x, parentsBarY);

    ctx.moveTo(midParentX, parentsBarY);
    ctx.lineTo(midParentX, siblingY);

    ctx.moveTo(minChildX, siblingY);
    ctx.lineTo(maxChildX, siblingY);

    childrenPos.forEach((pos) => {
      ctx.moveTo(pos.x, siblingY);
      ctx.lineTo(pos.x, childTopY);
    });

    ctx.stroke();
  });

  // 3. Ганц эцэг/эхтэй хүүхэд
  visibleMembers.forEach((child) => {
    const parentsArr = (child.parents || []).filter((id) =>
      visibleIds.has(id)
    );
    if (parentsArr.length !== 1) return;

    const parentId = parentsArr[0];
    const p = posMap.get(parentId);
    const c = posMap.get(child.id);
    if (!p || !c) return;

    const parentBottom = p.y + CARD_H / 2;
    const childTop = c.y - CARD_H / 2;
    const midY = (parentBottom + childTop) / 2;

    ctx.beginPath();
    ctx.moveTo(p.x, parentBottom);
    ctx.lineTo(p.x, midY);
    ctx.lineTo(c.x, midY);
    ctx.lineTo(c.x, childTop);
    ctx.stroke();
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

    saveTreeToJson();
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
}


