/* ================== CONSTANTS ================== */
const CARD_W = 150;
const CARD_H = 190;
const H_GAP = 60;
const V_GAP = 60;

/* ================== DATA MODEL ================== */
class FamilyMember {
  constructor({ id, name, age, sex, level }) {
    this.id = id;
    this.name = name || "";
    this.age = age || "";
    this.sex = sex || ""; // male / female / ""
    this.level = level;

    this.x = 0;
    this.y = 0;

    this.parents = []; // [fatherId, motherId]
    this.children = [];
    this.spouseId = null;

    this.collapseUp = false; // дээш талын мөчир нугалах
  }
}

/* ================== GLOBALS ================== */
let members = [];
let nextId = 1;

let treeRoot, nodesLayer, canvas, ctx;
let posMap = new Map();

let modalMode = null; // add-father / add-mother / add-spouse / add-child / edit
let modalTarget = null;

/* ================== INIT ================== */
window.addEventListener("DOMContentLoaded", () => {
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  canvas = document.getElementById("tree-lines");
  ctx = canvas.getContext("2d");

  // Root node: Би
  const me = new FamilyMember({
    id: nextId++,
    name: "Би",
    age: "",
    sex: "",
    level: 0
  });
  members.push(me);

  setupPersonModal();
  setupThemeButton();

  layoutTree();
  renderTree();

  window.addEventListener("resize", updateTree);

  document.addEventListener("click", () => {
    closeAllMenus();
  });
});

/* ================== HELPERS ================== */
function findMember(id) {
  return members.find((m) => m.id === id);
}

/* collapseUp → ancestors хасах */
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
      if (p?.parents?.length) {
        stack.push(...p.parents);
      }
    }
  });

  return hidden;
}

/* ================== LAYOUT ================== */
function layoutTree() {
  if (!treeRoot) return;

  const hiddenAnc = buildHiddenAncestorSet();
  const visibleMembers = members.filter((m) => !hiddenAnc.has(m.id));
  if (!visibleMembers.length) return;

  const levels = [...new Set(visibleMembers.map((m) => m.level))].sort(
    (a, b) => a - b
  );

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;
  const containerWidth = treeRoot.clientWidth || 900;
  const newPosMap = new Map();

  levels.forEach((levelValue, rowIndex) => {
    const rowNodes = visibleMembers.filter((m) => m.level === levelValue);
    if (!rowNodes.length) return;

    let hasAnchor = false;

    rowNodes.forEach((m) => {
      let anchor = 0;
      const parentPosList = (m.parents || [])
        .filter((pid) => !hiddenAnc.has(pid))
        .map((pid) => newPosMap.get(pid))
        .filter(Boolean);

      if (parentPosList.length) {
        anchor =
          parentPosList.reduce((s, p) => s + p.x, 0) /
          parentPosList.length;
        hasAnchor = true;
      }

      m._anchor = anchor;
    });

    const used = new Set();
    const units = [];

    // spouse буюу хосуудыг нэг блок болгоно
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

    if (!hasAnchor) {
      const unitCount = units.length;
      const totalWidth =
        unitCount * UNIT_WIDTH + (unitCount - 1) * H_GAP;
      const startX = Math.max((containerWidth - totalWidth) / 2, 20);

      units.forEach((u, idx) => {
        const centerX =
          startX + idx * (UNIT_WIDTH + H_GAP) + UNIT_WIDTH / 2;

        if (u.type === "single") {
          newPosMap.set(u.ids[0], { x: centerX, y });
        } else {
          const [id1, id2] = [...u.ids].sort((a, b) => a - b);
          const offset = CARD_W * 0.55;
          newPosMap.set(id1, { x: centerX - offset, y });
          newPosMap.set(id2, { x: centerX + offset, y });
        }
      });

      return;
    }

    // Anchor-т тулгуурласан байрлуулалт
    units.forEach((u) => {
      const anchors = u.ids.map((id) => {
        const mem = rowNodes.find((m) => m.id === id);
        return mem?._anchor || 0;
      });
      let avg =
        anchors.reduce((s, a) => s + a, 0) /
        Math.max(anchors.length, 1);
      if (!avg || !isFinite(avg)) avg = 0;
      u.anchor = avg;
    });

    units.sort((a, b) => a.anchor - b.anchor);

    let currentX = null;
    units.forEach((u) => {
      let desired = u.anchor;
      if (!desired || !isFinite(desired)) {
        desired = currentX == null ? containerWidth / 2 : currentX + MIN_DIST;
      }

      let centerX =
        currentX == null ? desired : Math.max(desired, currentX + MIN_DIST);

      u._centerX = centerX;
      currentX = centerX;
    });

    let minX = Math.min(...units.map((u) => u._centerX));
    let maxX = Math.max(...units.map((u) => u._centerX));
    let shift = 0;

    if (maxX - minX < containerWidth) {
      const usedWidth = maxX - minX;
      shift = (containerWidth - usedWidth) / 2 - minX;
    } else if (minX < 40) {
      shift = 40 - minX;
    }

    units.forEach((u) => {
      const cx = u._centerX + shift;

      if (u.type === "single") {
        newPosMap.set(u.ids[0], { x: cx, y });
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

/* ================== RENDER ================== */
function layoutVisibleMembers() {
  const hiddenAnc = buildHiddenAncestorSet();
  return members.filter((m) => !hiddenAnc.has(m.id));
}

function renderTree() {
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

/* ================== CARD ================== */
function createFamilyCard(member) {
  const card = document.createElement("div");
  card.className = "family-card";

  if (member.sex === "male") card.classList.add("male");
  else if (member.sex === "female") card.classList.add("female");

  if (member.collapseUp) card.classList.add("collapse-up");

  /* Collapse button */
  const btnUp = document.createElement("button");
  btnUp.className = "node-btn node-btn-up";
  btnUp.innerHTML = `<span class="triangle-up"></span>`;

  /* Add-menu button */
  const btnAdd = document.createElement("button");
  btnAdd.className = "node-btn node-btn-add";

  /* Menu */
  const menu = document.createElement("div");
  menu.className = "add-menu hidden";

  const btnFather = makeMenuBtn("Эцэг нэмэх");
  const btnMother = makeMenuBtn("Эх нэмэх");
  const btnSpouse = makeMenuBtn("Хань нэмэх");
  const btnChild = makeMenuBtn("Хүүхэд нэмэх");
  const btnEdit = makeMenuBtn("Мэдээлэл засах");
  const btnDelete = makeMenuBtn("Устгах", true);

  menu.append(btnFather, btnMother, btnSpouse, btnChild, btnEdit, btnDelete);

  /* Avatar */
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "card-avatar";

  const avatarCircle = document.createElement("div");
  avatarCircle.className = "avatar-circle";

  const icon = document.createElement("span");
  icon.className = "avatar-icon";

  avatarCircle.appendChild(icon);
  avatarWrap.appendChild(avatarCircle);

  /* Name & age */
  const nameBox = document.createElement("div");
  nameBox.className = "card-name";

  const full = document.createElement("div");
  full.className = "fullname";
  full.textContent = member.name || "Нэргүй";

  nameBox.appendChild(full);

  if (member.age) {
    const ageEl = document.createElement("div");
    ageEl.className = "card-age";
    ageEl.textContent = `${member.age} настай`;
    nameBox.appendChild(ageEl);
  }

  card.append(btnUp, btnAdd, menu, avatarWrap, nameBox);

  /* EVENTS */
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("edit", member);
  });

  btnAdd.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menu);
  });

  btnFather.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-father", member, { sex: "male", name: "Эцэг" });
    closeAllMenus();
  });

  btnMother.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-mother", member, { sex: "female", name: "Эх" });
    closeAllMenus();
  });

  btnSpouse.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-spouse", member, { name: "Хань" });
    closeAllMenus();
  });

  btnChild.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("add-child", member, { name: "Хүүхэд" });
    closeAllMenus();
  });

  btnEdit.addEventListener("click", (e) => {
    e.stopPropagation();
    openPersonModal("edit", member);
    closeAllMenus();
  });

  btnDelete.addEventListener("click", (e) => {
    e.stopPropagation();
    deletePerson(member);
    closeAllMenus();
    updateTree();
  });

  btnUp.addEventListener("click", (e) => {
    e.stopPropagation();
    member.collapseUp = !member.collapseUp;
    updateTree();
  });

  return card;
}

function makeMenuBtn(text, danger = false) {
  const btn = document.createElement("button");
  btn.className = "add-pill";
  if (danger) btn.classList.add("danger");
  btn.textContent = text;
  return btn;
}

/* ================== MENU HELPERS ================== */
function toggleMenu(menu) {
  closeAllMenus();
  menu.classList.toggle("hidden");
}

function closeAllMenus() {
  document.querySelectorAll(".add-menu").forEach((m) => m.classList.add("hidden"));
}

/* ================== MODAL ================== */
function setupPersonModal() {
  const backdrop = document.getElementById("person-backdrop");
  const modal = document.getElementById("person-modal");
  const form = document.getElementById("person-form");
  const cancel = document.getElementById("person-cancel");

  if (!backdrop || !modal) return;

  cancel.addEventListener("click", closePersonModal);
  backdrop.addEventListener("click", closePersonModal);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitPersonForm();
  });
}

function openPersonModal(mode, target, preset = {}) {
  modalMode = mode;
  modalTarget = target;

  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");
  const title = document.getElementById("person-modal-title");

  const nameI = document.getElementById("person-name");
  const ageI = document.getElementById("person-age");
  const sexI = document.getElementById("person-sex");

  if (mode === "edit") {
    title.textContent = "Хүн засах";
    nameI.value = target.name;
    ageI.value = target.age;
    sexI.value = target.sex;
  } else {
    title.textContent = "Хүн нэмэх";
    nameI.value = preset.name || "";
    ageI.value = "";
    sexI.value = preset.sex || "";
  }

  backdrop.hidden = false;
  modal.hidden = false;

  requestAnimationFrame(() => modal.classList.add("show"));
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
  const name = document.getElementById("person-name").value.trim();
  const age = document.getElementById("person-age").value.trim();
  const sex = document.getElementById("person-sex").value.trim();

  const data = { name, age, sex };

  switch (modalMode) {
    case "edit":
      editPersonWithData(modalTarget, data);
      break;
    case "add-father":
      addFatherWithData(modalTarget, data);
      break;
    case "add-mother":
      addMotherWithData(modalTarget, data);
      break;
    case "add-spouse":
      addSpouseWithData(modalTarget, data);
      break;
    case "add-child":
      addChildWithData(modalTarget, data);
      break;
  }

  closePersonModal();
  updateTree();
}

/* ================== ADD / EDIT / DELETE ================== */
function normalizeSex(s) {
  s = (s || "").toLowerCase();
  if (["male", "эр", "эрэгтэй"].includes(s)) return "male";
  if (["female", "эм", "эмэгтэй"].includes(s)) return "female";
  return "";
}

function addFatherWithData(child, data) {
  if (child.parents[0]) {
    alert("Эцэг аль хэдийн байна.");
    return;
  }

  const father = new FamilyMember({
    id: nextId++,
    name: data.name || "Эцэг",
    age: data.age,
    sex: "male",
    level: child.level - 1
  });

  father.children.push(child.id);
  child.parents[0] = father.id;

  if (child.parents[1]) {
    const mother = findMember(child.parents[1]);
    father.spouseId = mother.id;
    mother.spouseId = father.id;
  }

  members.push(father);
}

function addMotherWithData(child, data) {
  if (child.parents[1]) {
    alert("Эх аль хэдийн байна.");
    return;
  }

  const mother = new FamilyMember({
    id: nextId++,
    name: data.name || "Эх",
    age: data.age,
    sex: "female",
    level: child.level - 1
  });

  mother.children.push(child.id);
  child.parents[1] = mother.id;

  if (child.parents[0]) {
    const father = findMember(child.parents[0]);
    father.spouseId = mother.id;
    mother.spouseId = father.id;
  }

  members.push(mother);
}

function addSpouseWithData(person, data) {
  if (person.spouseId) {
    alert("Хань аль хэдийн бүртгэлтэй.");
    return;
  }

  let spouseSex = "female";
  if (person.sex === "female") spouseSex = "male";
  if (person.sex === "") spouseSex = "female";

  const spouse = new FamilyMember({
    id: nextId++,
    name: data.name || "Хань",
    age: data.age,
    sex: spouseSex,
    level: person.level
  });

  spouse.spouseId = person.id;
  person.spouseId = spouse.id;

  members.push(spouse);
}

function addChildWithData(parent, data) {
  const sex = normalizeSex(data.sex);

  const child = new FamilyMember({
    id: nextId++,
    name: data.name || "Хүүхэд",
    age: data.age,
    sex,
    level: parent.level + 1
  });

  parent.children.push(child.id);

  if (parent.sex === "male") child.parents[0] = parent.id;
  else if (parent.sex === "female") child.parents[1] = parent.id;
  else child.parents.push(parent.id);

  if (parent.spouseId) {
    const s = findMember(parent.spouseId);
    s.children.push(child.id);

    if (s.sex === "male") child.parents[0] = s.id;
    else if (s.sex === "female") child.parents[1] = s.id;
  }

  members.push(child);
}

function editPersonWithData(member, data) {
  member.name = data.name || member.name;
  member.age = data.age || "";
  member.sex = normalizeSex(data.sex);
}

function deletePerson(member) {
  if (member.level === 0) {
    alert("'Би' node-ийг устгаж болохгүй.");
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
}

/* ================== THEME ================== */
function setupThemeButton() {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });
}

/* ================== DRAW LINES ================== */
function drawLines(visibleMembers) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  const visibleIds = new Set(visibleMembers.map((m) => m.id));

  /* ----- Spouse lines ----- */
  visibleMembers.forEach((m) => {
    if (!m.spouseId || !visibleIds.has(m.spouseId)) return;

    const s = findMember(m.spouseId);
    if (!s || m.id > s.id) return;

    const p1 = posMap.get(m.id);
    const p2 = posMap.get(s.id);
    if (!p1 || !p2) return;

    ctx.beginPath();
    ctx.moveTo(p1.x + CARD_W * 0.3, p1.y);
    ctx.lineTo(p2.x - CARD_W * 0.3, p1.y);
    ctx.stroke();
  });

  /* ===== TWO PARENTS + multiple children ===== */
  const pairMap = new Map();

  visibleMembers.forEach((child) => {
    const parents = (child.parents || []).filter((id) =>
      visibleIds.has(id)
    );
    if (parents.length < 2) return;

    const p1 = Math.min(...parents);
    const p2 = Math.max(...parents);
    const key = `${p1}-${p2}`;

    if (!pairMap.has(key)) {
      pairMap.set(key, { parents: [p1, p2], children: [] });
    }
    pairMap.get(key).children.push(child.id);
  });

  pairMap.forEach((group) => {
    const [p1id, p2id] = group.parents;
    const p1 = posMap.get(p1id);
    const p2 = posMap.get(p2id);
    if (!p1 || !p2) return;

    const childrenPos = group.children
      .map((id) => posMap.get(id))
      .filter(Boolean);

    if (!childrenPos.length) return;

    const parentBottomY = p1.y + CARD_H / 2;
    const childTopY = childrenPos[0].y - CARD_H / 2;

    const midParentX = (p1.x + p2.x) / 2;
    const barY = parentBottomY + 16;

    const minX = Math.min(...childrenPos.map((c) => c.x));
    const maxX = Math.max(...childrenPos.map((c) => c.x));
    const siblingY = childTopY - 20;

    ctx.beginPath();

    // parent bars
    ctx.moveTo(p1.x, parentBottomY);
    ctx.lineTo(p1.x, barY);

    ctx.moveTo(p2.x, parentBottomY);
    ctx.lineTo(p2.x, barY);

    ctx.moveTo(p1.x, barY);
    ctx.lineTo(p2.x, barY);

    // down to children bar
    ctx.moveTo(midParentX, barY);
    ctx.lineTo(midParentX, siblingY);

    // horizontal children bar
    ctx.moveTo(minX, siblingY);
    ctx.lineTo(maxX, siblingY);

    // vertical child lines
    childrenPos.forEach((pos) => {
      ctx.moveTo(pos.x, siblingY);
      ctx.lineTo(pos.x, childTopY);
    });

    ctx.stroke();
  });

  /* ===== ONE PARENT ===== */
  visibleMembers.forEach((child) => {
    const parents = (child.parents || []).filter((id) =>
      visibleIds.has(id)
    );
    if (parents.length !== 1) return;

    const pid = parents[0];
    const p = posMap.get(pid);
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

/* ================== FINAL: updateTree() ================== */
function updateTree() {
  layoutTree();
  renderTree();
}
