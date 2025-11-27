// ================== TOGTOOSON HEMJEE ==================
const CARD_W = 150;
const CARD_H = 190;
const H_GAP = 60;  // хөндлөн card хоорондын зай
const V_GAP = 60;  // босоо мөр хоорондын зай

// ================== DATA COMPONENT ==================
class FamilyMember {
  constructor({ id, name, level, parentId = null, col = 0 }) {
    this.id = id;
    this.name = name;
    this.level = level;      // үе (0 = би, -1 = эцэг эх, +1 = хүүхэд гэх мэт)
    this.parentId = parentId;

    const parts = (name || "").trim().split(/\s+/);
    this.lastname = parts[0] || "";
    this.firstname = parts[1] || "";

    // логик байрлал (layout-д ашиглана)
    this.col = col;

    // pixel байрлал – layoutTree() энэ хоёрыг тооцоолно
    this.x = 0;
    this.y = 0;

    // харилцаа
    this.parents = [];    // [id, id?]
    this.children = [];   // [id, ...]
    this.spouseId = null; // ганц spouse гэж үзэж байна (одоо)
  }
}

let members = [];
let nextId = 1;

let treeRoot, nodesLayer, canvas, ctx;
const posMap = new Map(); // id -> {x, y}

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
    col: 0,
  });
  members.push(me);

  layoutTree();
  renderTree();

  window.addEventListener("resize", () => {
    layoutTree();   // өргөн өөрчлөгдвөл мөрөө дахиад төвлөрүүлнэ
    renderTree();
  });

  document.addEventListener("click", () => {
    closeAllMenus();
  });
});

// ================== LAYOUT (дарахгүйгээр автоматаар байрлуулах) ==================
function layoutTree() {
  if (!treeRoot) return;

  const levels = Array.from(new Set(members.map((m) => m.level))).sort(
    (a, b) => a - b
  );

  const paddingTop = 80;
  const rowGap = CARD_H + V_GAP;
  const containerWidth = treeRoot.clientWidth || 900;

  // level бүр дээр col-оор нь эрэмбэлээд, дахин col индекс олгоно
  levels.forEach((levelValue, rowIndex) => {
    const rowNodes = members
      .filter((m) => m.level === levelValue)
      .sort((a, b) => a.col - b.col);

    rowNodes.forEach((m, i) => {
      m.col = i; // дахин индексжүүлнэ
    });

    const count = rowNodes.length;
    if (count === 0) return;

    const rowWidth = count * CARD_W + (count - 1) * H_GAP;
    const startX = Math.max((containerWidth - rowWidth) / 2, 20) + CARD_W / 2;
    const y = paddingTop + rowIndex * rowGap;

    rowNodes.forEach((m, i) => {
      const x = startX + i * (CARD_W + H_GAP);
      m.x = x;
      m.y = y;
    });
  });

  // container-ийн өндрийг бүх мөрөнд тааруулна
  const totalHeight =
    paddingTop * 2 + (levels.length - 1) * rowGap + CARD_H;
  treeRoot.style.height = Math.max(450, totalHeight) + "px";
}

// ================== CARD RENDER ==================
function renderTree() {
  if (!nodesLayer) return;

  nodesLayer.innerHTML = "";
  posMap.clear();

  members.forEach((m) => {
    posMap.set(m.id, { x: m.x, y: m.y });

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

  // ↑ товч (одоо зөвхөн UI, тусад нь логик өгөх бол хойш нь тавьж болно)
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

  // ↑ товчинд одоогоор тусгай логик өгөөгүй, шаардлагатай бол дараа нь хэрэглэж болно
  btnUp.addEventListener("click", (e) => {
    e.stopPropagation();
    console.log("Up товч дарагдлаа:", member);
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
function findMember(id) {
  return members.find((m) => m.id === id);
}

// Эцэг эх нэмэх – тухайн node-ийн дээр хоёр card
function addParents(child) {
  if (child.parents.length > 0) {
    console.log("Эцэг эх аль хэдийн байна");
    return;
  }

  const parentLevel = child.level - 1;

  // col-оо child.col-оос бага зэрэг тарааж өгөөд, дараа нь layoutTree() жигдлэнэ
  const father = new FamilyMember({
    id: nextId++,
    name: "Аав",
    level: parentLevel,
    col: child.col - 0.5,
  });

  const mother = new FamilyMember({
    id: nextId++,
    name: "Ээж",
    level: parentLevel,
    col: child.col + 0.5,
  });

  // харилцаа
  father.children.push(child.id);
  mother.children.push(child.id);
  child.parents = [father.id, mother.id];

  members.push(father, mother);

  layoutTree();
  renderTree();
}

// Хань нэмэх – тухайн node-ийн хажууд 1 card (эцэг эхтэй нь холбохгүй)
function addSpouse(person) {
  if (person.spouseId) {
    console.log("Хань аль хэдийн байна");
    return;
  }

  const spouse = new FamilyMember({
    id: nextId++,
    name: "Хань",
    level: person.level,
    col: person.col + 1,
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

  // parent + spouse байсан бол дундуур нь position-оо авахын тулд col-оо ойролцоолъё
  let baseCol = parent.col;
  const spouse = parent.spouseId ? findMember(parent.spouseId) : null;
  if (spouse) {
    baseCol = (parent.col + spouse.col) / 2;
  }

  const child = new FamilyMember({
    id: nextId++,
    name: "Хүүхэд",
    level: childLevel,
    col: baseCol,
  });

  // parent–child харилцаа
  child.parents.push(parent.id);
  parent.children.push(child.id);

  // spouse байвал түүнтэй ч холбоно (эцэг эхэд хань нь холбогдохгүй, зөвхөн хүүхэдтэй)
  if (spouse) {
    child.parents.push(spouse.id);
    spouse.children.push(child.id);
  }

  members.push(child);

  layoutTree();
  renderTree();
}

// ================== LINE DRAWING ==================
function drawLines() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 2;

  members.forEach((child) => {
    if (!child.parents || child.parents.length === 0) return;

    const childPos = posMap.get(child.id);
    if (!childPos) return;

    if (child.parents.length === 1) {
      // ганц эцэг/эх
      const pPos = posMap.get(child.parents[0]);
      if (!pPos) return;

      ctx.beginPath();
      ctx.moveTo(pPos.x, pPos.y + CARD_H / 2);
      ctx.lineTo(childPos.x, childPos.y - CARD_H / 2);
      ctx.stroke();
    } else if (child.parents.length >= 2) {
      // хоёр эцэг эх – T хэлбэрийн шугам
      let p1Pos = posMap.get(child.parents[0]);
      let p2Pos = posMap.get(child.parents[1]);
      if (!p1Pos || !p2Pos) return;

      // зүүн/баруун гэж эрэмбэлнэ
      if (p1Pos.x > p2Pos.x) {
        const tmp = p1Pos;
        p1Pos = p2Pos;
        p2Pos = tmp;
      }

      const jointY = (p1Pos.y + childPos.y) / 2;
      const midX = (p1Pos.x + p2Pos.x) / 2;

      ctx.beginPath();

      // parent1 доош
      ctx.moveTo(p1Pos.x, p1Pos.y + CARD_H / 2);
      ctx.lineTo(p1Pos.x, jointY);

      // parent2 доош
      ctx.moveTo(p2Pos.x, p2Pos.y + CARD_H / 2);
      ctx.lineTo(p2Pos.x, jointY);

      // хооронд нь хөндлөн
      ctx.moveTo(p1Pos.x, jointY);
      ctx.lineTo(p2Pos.x, jointY);

      // голоос хүүхэд рүү
      ctx.moveTo(midX, jointY);
      ctx.lineTo(childPos.x, childPos.y - CARD_H / 2);

      ctx.stroke();
    }
  });
}
