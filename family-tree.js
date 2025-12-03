// ================== TOGTOOSON HEMJEE ==================
const CARD_W = 150;
const CARD_H = 190;
const H_GAP = 60;  // хөндлөн unit хоорондын зай
const V_GAP = 60;  // босоо мөр хоорондын зай

// ================== DATA COMPONENT ==================
class FamilyMember {
  constructor({ id, name, level }) {
    this.id = id;
    this.name = name || "";
    this.level = level;      // үе (0 = би, -1 = эцэг эх, +1 = хүүхэд гэх мэт)

    const parts = (this.name || "").trim().split(/\s+/);
    this.lastname = parts[0] || "";
    this.firstname = parts[1] || "";

    // pixel байрлал – зөвхөн layoutTree() тооцоолно
    this.x = 0;
    this.y = 0;

    // харилцаа
    this.parents = [];    // [id, id?]
    this.children = [];   // [id, ...]
    this.spouseId = null; // одоохондоо 1 хань гэж үзсэн
  }
}

let members = [];
let nextId = 1;

let treeRoot, nodesLayer, canvas, ctx;
let posMap = new Map(); // id -> {x, y}

// ================== INIT ==================
window.addEventListener("DOMContentLoaded", () => {
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  canvas = document.getElementById("tree-lines");
  ctx = canvas.getContext("2d");

  // үндсэн root node: Би
  const me = new FamilyMember({
    id: nextId++,
    name: "Би",
    level: 0,
  });
  members.push(me);

  layoutTree();
  renderTree();

  window.addEventListener("resize", () => {
    layoutTree();   // өргөн өөрчлөгдвөл дахиад зөв байрлуулна
    renderTree();
  });

  document.addEventListener("click", () => {
    closeAllMenus();
  });
});

// ================== HELPER ==================
function findMember(id) {
  return members.find((m) => m.id === id);
}

function layoutTree() {
  if (!treeRoot) return;

  const levels = Array.from(new Set(members.map((m) => m.level))).sort(
    (a, b) => a - b
  );

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;
  const containerWidth = treeRoot.clientWidth || 900;

  const newPosMap = new Map();

  levels.forEach((levelValue, rowIndex) => {
    const rowNodes = members.filter((m) => m.level === levelValue);
    if (!rowNodes.length) return;

    // 1) Эхлээд anchorX тооцоё (эцэг эхийнх нь дундаж X)
    let hasAnchor = false;
    rowNodes.forEach((m) => {
      let anchor = 0;
      if (m.parents && m.parents.length > 0) {
        const parentPosList = m.parents
          .map((pid) => newPosMap.get(pid))
          .filter(Boolean);

        if (parentPosList.length > 0) {
          anchor =
            parentPosList.reduce((sum, p) => sum + p.x, 0) /
            parentPosList.length;
          hasAnchor = true;
        }
      }
      m._anchor = anchor;
    });

    // 2) Тухайн level-ийн "unit"-үүдийг үүсгэнэ (ганц хүн, эсвэл хос)
    const used = new Set();
    const units = [];

    rowNodes.forEach((m) => {
      if (used.has(m.id)) return;

      if (m.spouseId) {
        const s = findMember(m.spouseId);
        if (s && s.level === levelValue && !used.has(s.id)) {
          units.push({
            type: "couple",
            ids: [m.id, s.id],
          });
          used.add(m.id);
          used.add(s.id);
          return;
        }
      }

      units.push({
        type: "single",
        ids: [m.id],
      });
      used.add(m.id);
    });

    const y = paddingTop + rowIndex * rowGap;
    const UNIT_WIDTH = CARD_W * 2.2;
    const MIN_DIST = UNIT_WIDTH + H_GAP * 0.2;

    // 3) Хэрвээ энэ level-д эцэг эхийн anchor БҮРЭН алга (жишээ нь хамгийн дээд үе)
    //    бол хуучин шигээ "мөрөө голлуулж" байрлуулна
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

    // 4) Anchor-тэй тохиолдолд: эцэг эхийнхээ яг доор тавина
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

    // Anchor-ээр нь эрэмбэлж дарааллыг тогтооно
    units.sort((a, b) => a.anchor - b.anchor);

    // 5) Anchor-руу аль болох ойрхон тавих, давхцахгүй байлгах
    let currentX = null;
    units.forEach((u, idx) => {
      let desired = u.anchor;

      // Зарим unit-д parent байхгүй байж болно (ah duu гэх мэт) – тэднийг урд unit-ийн баруун талд байрлуулна
      if (!desired || !isFinite(desired)) {
        desired =
          currentX == null ? containerWidth / 2 : currentX + MIN_DIST;
      }

      let centerX;
      if (currentX == null) {
        centerX = desired || containerWidth / 2;
      } else {
        // давхцахаас сэргийлж, хамгийн багадаа MIN_DIST зайтай болгоно
        centerX = Math.max(desired, currentX + MIN_DIST);
      }

      u._centerX = centerX;
      currentX = centerX;
    });

    // Бага зэрэг "нэг мөр цэгцтэй" харагдуулахын тулд бүх unit-үүдийг жаахан шилжүүлж болно
    let minX = Math.min(...units.map((u) => u._centerX));
    let maxX = Math.max(...units.map((u) => u._centerX));
    const margin = 40;
    let shift = 0;

    if (maxX - minX < containerWidth) {
      // контейнерийн дотор боломжит хэмжээнд бага зэрэг төвлөрүүлье
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

  // Member-үүдийн x, y-гаа шинэчилнэ
  members.forEach((m) => {
    const pos = newPosMap.get(m.id);
    if (pos) {
      m.x = pos.x;
      m.y = pos.y;
    }
  });

  posMap = newPosMap;

  // container-ийн өндрийг level-ийн тоонд тааруулна
  const totalHeight =
    paddingTop * 2 + (levels.length - 1) * rowGap + CARD_H;
  treeRoot.style.height = Math.max(450, totalHeight) + "px";
}


// ================== CARD RENDER ==================
function renderTree() {
  if (!nodesLayer) return;

  nodesLayer.innerHTML = "";

  members.forEach((m) => {
    const card = createFamilyCard(m);
    card.style.left = m.x - CARD_W / 2 + "px";
    card.style.top = m.y - CARD_H / 2 + "px";

    nodesLayer.appendChild(card);
  });

  resizeCanvas();
  drawLines();
}

function resizeCanvas() {
  const rect = treeRoot.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

// ================== CARD UI COMPONENT ==================
function createFamilyCard(member) {
  const card = document.createElement("div");
  card.className = "family-card";

  // ↑ товч (одоохондоо логик өгөөгүй, дараагийн шатанд ашиглаж болно)
  const btnUp = document.createElement("button");
  btnUp.className = "node-btn node-btn-up";
  btnUp.setAttribute("aria-label", "Дээр хүн нэмэх");
  const tri = document.createElement("span");
  tri.className = "triangle-up";
  btnUp.appendChild(tri);

  // + товч
  const btnAdd = document.createElement("button");
  btnAdd.className = "node-btn node-btn-add";
  btnAdd.setAttribute("aria-label", "Шинэ хүн нэмэх");

  // нэмэх цэс
  const menu = document.createElement("div");
  menu.className = "add-menu hidden";

  const btnParent = document.createElement("button");
  btnParent.className = "add-pill";
  btnParent.textContent = "Эцэг эх нэмэх";

  const btnSpouse = document.createElement("button");
  btnSpouse.className = "add-pill";
  btnSpouse.textContent = "Хань нэмэх";

  const btnChild = document.createElement("button");
  btnChild.className = "add-pill";
  btnChild.textContent = "Хүүхэд нэмэх";

  menu.appendChild(btnParent);
  menu.appendChild(btnSpouse);
  menu.appendChild(btnChild);

  // avatar
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "card-avatar";

  const avatarCircle = document.createElement("div");
  avatarCircle.className = "avatar-circle";

  const avatarIcon = document.createElement("span");
  avatarIcon.className = "avatar-icon";

  avatarCircle.appendChild(avatarIcon);
  avatarWrap.appendChild(avatarCircle);

  // нэр
  const nameBox = document.createElement("div");
  nameBox.className = "card-name";

  const lastEl = document.createElement("div");
  lastEl.className = "lastname";
  lastEl.textContent = member.lastname || "Овог";

  const firstEl = document.createElement("div");
  firstEl.className = "firstname";
  firstEl.textContent = member.firstname || "Нэр";

  nameBox.appendChild(lastEl);
  nameBox.appendChild(firstEl);

  // нийлүүлэх
  card.appendChild(btnUp);
  card.appendChild(btnAdd);
  card.appendChild(menu);
  card.appendChild(avatarWrap);
  card.appendChild(nameBox);

  // event-үүд
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    console.log("Сонгосон гишүүн:", member);
  });

  btnAdd.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menu);
  });

  btnParent.addEventListener("click", (e) => {
    e.stopPropagation();
    addParents(member);
    closeAllMenus();
  });

  btnSpouse.addEventListener("click", (e) => {
    e.stopPropagation();
    addSpouse(member);
    closeAllMenus();
  });

  btnChild.addEventListener("click", (e) => {
    e.stopPropagation();
    addChild(member);
    closeAllMenus();
  });

  btnUp.addEventListener("click", (e) => {
    e.stopPropagation();
    console.log("Up товч дарагдлаа:", member);
    // дараагийн шат: "өндөр түвшний" хүн нэмэх гэх мэт логик өгч болно
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

// ================== ADD FUNCTIONS ==================

// Эцэг эх нэмэх – тухайн node-ийн дээр хоёр card
function addParents(child) {
  if (child.parents.length > 0) {
    console.log("Эцэг эх аль хэдийн байна");
    return;
  }

  const parentLevel = child.level - 1;

  const father = new FamilyMember({
    id: nextId++,
    name: "Аав",
    level: parentLevel,
  });

  const mother = new FamilyMember({
    id: nextId++,
    name: "Ээж",
    level: parentLevel,
  });

  // харилцаа
  father.children.push(child.id);
  mother.children.push(child.id);
  child.parents = [father.id, mother.id];

  // эцэг, эхийг хооронд нь хань болгоё (гэрлэсэн хувилбар)
  father.spouseId = mother.id;
  mother.spouseId = father.id;

  members.push(father, mother);

  layoutTree();
  renderTree();
}

// Хань нэмэх – тухайн node-ийн хажууд 1 card
function addSpouse(person) {
  if (person.spouseId) {
    console.log("Хань аль хэдийн байна");
    return;
  }

  const spouse = new FamilyMember({
    id: nextId++,
    name: "Хань",
    level: person.level,
  });

  spouse.spouseId = person.id;
  person.spouseId = spouse.id;

  members.push(spouse);

  layoutTree();
  renderTree();
}

// Хүүхэд нэмэх – доор олон card нэмэгдэж болно (нэг нэгээр)
function addChild(parent) {
  const childLevel = parent.level + 1;

  const child = new FamilyMember({
    id: nextId++,
    name: "Хүүхэд",
    level: childLevel,
  });

  // parent–child харилцаа
  child.parents.push(parent.id);
  parent.children.push(child.id);

  // spouse байвал түүнтэй ч холбоно
  if (parent.spouseId) {
    const spouse = findMember(parent.spouseId);
    if (spouse) {
      child.parents.push(spouse.id);
      spouse.children.push(child.id);
    }
  }

  members.push(child);

  layoutTree();
  renderTree();
}

function drawLines() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 2;

  // ===== 1. ХАНЬ ХООРОНДЫН ШУГАМ (картын дунд) =====
  members.forEach(m => {
    if (!m.spouseId) return;

    const spouse = findMember(m.spouseId);
    if (!spouse) return;

    // нэг хосыг 2 удаа зурахаас сэргийлнэ
    if (m.id > spouse.id) return;

    const p1 = posMap.get(m.id);
    const p2 = posMap.get(spouse.id);
    if (!p1 || !p2) return;

    const y = p1.y; // картын төв

    ctx.beginPath();
    ctx.moveTo(p1.x + CARD_W * 0.3, y);
    ctx.lineTo(p2.x - CARD_W * 0.3, y);
    ctx.stroke();
  });

  // ===== 2. ХОЁР ЭЦЭГ ЭХ + ОЛОН ХҮҮХЭД (FS-style бүтэц) =====
  const pairMap = new Map(); // "p1-p2" -> { parents:[p1,p2], children:[...] }

  members.forEach(child => {
    if (!child.parents || child.parents.length < 2) return;

    const [a, b] = child.parents;
    const p1 = Math.min(a, b);
    const p2 = Math.max(a, b);
    const key = p1 + "-" + p2;

    if (!pairMap.has(key)) {
      pairMap.set(key, { parents: [p1, p2], children: [] });
    }
    pairMap.get(key).children.push(child.id);
  });

  pairMap.forEach(group => {
    const [p1id, p2id] = group.parents;
    const parent1Pos = posMap.get(p1id);
    const parent2Pos = posMap.get(p2id);
    if (!parent1Pos || !parent2Pos) return;

    const childrenPos = group.children
      .map(id => posMap.get(id))
      .filter(Boolean);

    if (!childrenPos.length) return;

    // Эцэг эхийн доод ирмэг, хүүхдийн дээд ирмэг
    const parentBottomY = parent1Pos.y + CARD_H / 2;
    const childTopY = childrenPos[0].y - CARD_H / 2;

    // Эцэг эхийн хоорондын дундаж X
    const midParentX = (parent1Pos.x + parent2Pos.x) / 2;

    // Эцэг эхийн доорхи horizontal joint (FS-д яг картын доор байдаг)
    const parentsBarY = parentBottomY + 16;

    // Хүүхдүүдийн sibling line байрлал
    const minChildX = Math.min(...childrenPos.map(c => c.x));
    const maxChildX = Math.max(...childrenPos.map(c => c.x));
    const siblingY = childTopY - 20;

    ctx.beginPath();

    // Эцэг эх тус бүрээс доош босоо
    ctx.moveTo(parent1Pos.x, parentBottomY);
    ctx.lineTo(parent1Pos.x, parentsBarY);

    ctx.moveTo(parent2Pos.x, parentBottomY);
    ctx.lineTo(parent2Pos.x, parentsBarY);

    // Эцэг эхийн доорх хөндлөн joint
    ctx.moveTo(parent1Pos.x, parentsBarY);
    ctx.lineTo(parent2Pos.x, parentsBarY);

    // Joint-ын дундаас sibling line руу доош
    ctx.moveTo(midParentX, parentsBarY);
    ctx.lineTo(midParentX, siblingY);

    // Sibling line (ах дүүсийг холбосон хөндлөн)
    ctx.moveTo(minChildX, siblingY);
    ctx.lineTo(maxChildX, siblingY);

    // Хүүхэд бүрийн дээрээс доош
    childrenPos.forEach(pos => {
      ctx.moveTo(pos.x, siblingY);
      ctx.lineTo(pos.x, childTopY);
    });

    ctx.stroke();
  });

  // ===== 3. ГАНЦ ЭЦЭГ/ЭХТЭЙ ХҮҮХЭД =====
  members.forEach(child => {
    if (!child.parents || child.parents.length !== 1) return;

    const parentId = child.parents[0];
    const p = posMap.get(parentId);
    const c = posMap.get(child.id);
    if (!p || !c) return;

    const parentBottom = p.y + CARD_H / 2;
    const childTop = c.y - CARD_H / 2;

    ctx.beginPath();
    ctx.moveTo(p.x, parentBottom);
    ctx.lineTo(p.x, (parentBottom + childTop) / 2);
    ctx.lineTo(c.x, (parentBottom + childTop) / 2);
    ctx.lineTo(c.x, childTop);
    ctx.stroke();
  });
}
