let selectedNode = "me";
let actionType = null;

// open menu
function openMenu(id) {
    selectedNode = id;
    const menu = document.getElementById("menu");
    menu.hidden = false;

    menu.style.left = event.pageX + "px";
    menu.style.top = event.pageY + "px";
}

// open form
function openForm(type) {
    actionType = type;

    document.getElementById("form-backdrop").hidden = false;
    document.getElementById("form-modal").hidden = false;

    document.getElementById("menu").hidden = true;

    // set title
    if (type === "father") document.getElementById("form-title").textContent = "Эцэг нэмэх";
    if (type === "mother") document.getElementById("form-title").textContent = "Эх нэмэх";
    if (type === "child") document.getElementById("form-title").textContent = "Хүүхэд нэмэх";
    if (type === "edit") document.getElementById("form-title").textContent = "Засах";
}

document.getElementById("saveBtn").onclick = function () {
    const name = document.getElementById("form-name").value;
    const gender = document.getElementById("form-gender").value;

    if (actionType === "edit") {
        document.getElementById("name-me").textContent = name;
    }

    closeForm();
};

function closeForm() {
    document.getElementById("form-backdrop").hidden = true;
    document.getElementById("form-modal").hidden = true;
}