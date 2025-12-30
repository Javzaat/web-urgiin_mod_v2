import { 
  initializeApp 
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";


// ================== FIREBASE CONFIG ==================
const firebaseConfig = {
  apiKey: "AIzaSyC3Mu5W0Aol7DvtQ28mdtnD1qWt426ea9U",
  authDomain: "undes-27404.firebaseapp.com",
  projectId: "undes-27404",
  storageBucket: "undes-27404.firebasestorage.app",
  messagingSenderId: "392425028546",
  appId: "1:392425028546:web:6f24b527752361db68b45b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
window.auth = auth;



// ================== HEADER BUTTONS ==================
const welcomeText = document.getElementById("welcome-text");
const btnMyTree = document.getElementById("btn-my-tree");
const btnLogin = document.getElementById("btn-open-auth");
const btnLogout = document.getElementById("btn-logout");


// ================== AUTH MODAL ==================
const modal = document.getElementById("auth-modal");
const back = document.getElementById("auth-backdrop");
const closeBtn = document.getElementById("auth-close");

function openModal() {
  modal.hidden = false;
  back.hidden = false;

  setTimeout(() => {
    modal.classList.add("show");
    back.classList.add("show");
  }, 10);
}

function closeModal() {
  modal.classList.remove("show");
  back.classList.remove("show");

  setTimeout(() => {
    modal.hidden = true;
    back.hidden = true;
  }, 250);
}

btnLogin?.addEventListener("click", openModal);
closeBtn?.addEventListener("click", closeModal);
back?.addEventListener("click", closeModal);

function setLoggedInUI(user) {
  if (user) {
    const name = user.displayName || user.email.split("@")[0];

    if (welcomeText) {
      welcomeText.textContent = `Тавтай морилно уу, ${name}`;
      welcomeText.hidden = false;
    }
    if (btnMyTree) btnMyTree.hidden = false;  // ✅ login үед гарна
    if (btnLogout) btnLogout.hidden = false;
    if (btnLogin)  btnLogin.hidden  = true;

  } else {
    if (welcomeText) {
      welcomeText.textContent = "";
      welcomeText.hidden = true;
    }
    if (btnMyTree) btnMyTree.hidden = true;   // ✅ logout үед алга
    if (btnLogout) btnLogout.hidden = true;
    if (btnLogin)  btnLogin.hidden  = false;
  }
}


// ================== TABS ==================
const formSignin = document.getElementById("form-signin");
const formSignup = document.getElementById("form-signup");
const tabBtns = document.querySelectorAll(".tab-btn");

tabBtns.forEach((t) =>
  t.addEventListener("click", () => {
    tabBtns.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");

    if (t.dataset.tab === "signin") {
      formSignin.classList.remove("hidden");
      formSignup.classList.add("hidden");
    } else {
      formSignup.classList.remove("hidden");
      formSignin.classList.add("hidden");
    }
  })
);


// ======================= SUCCESS TOAST =======================
const toastBox = document.getElementById("toast-box");
const toastText = document.getElementById("toast-text");
const toastBackdrop = document.getElementById("toast-backdrop");

function showToast(msg) {
  toastText.textContent = msg;

  toastBox.hidden = false;
  toastBackdrop.hidden = false;

  setTimeout(() => {
    toastBox.classList.add("show");
    toastBackdrop.classList.add("show");
  }, 10);

  setTimeout(() => {
    toastBox.classList.remove("show");
    toastBackdrop.classList.remove("show");

    setTimeout(() => {
      toastBox.hidden = true;
      toastBackdrop.hidden = true;
    }, 250);
  }, 2000);
}


// ======================= SIGNUP =======================
formSignup.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("up-name").value.trim();
  const email = document.getElementById("up-email").value.trim();
  const pass = document.getElementById("up-pass").value.trim();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    // logout after signup (no auto-login)
    await signOut(auth);

    closeModal();

    // switch to SIGN-IN tab
    document.querySelector('[data-tab="signin"]').click();

    showToast("Амжилттай бүртгэгдлээ! Одоо нэвтэрнэ үү.");

  } catch (err) {
    showToast(err.message);
  }
});


// ======================= SIGNIN =======================
formSignin.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("in-email").value.trim();
  const pass = document.getElementById("in-pass").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);

    closeModal();
    showToast("Тавтай морилно уу!");

  } catch (err) {
    showToast(err.message);
  }
});



// ======================= CUSTOM LOGOUT POPUP =======================
const logoutModal = document.getElementById("logout-modal");
const logoutBackdrop = document.getElementById("logout-backdrop");
const logoutCancel = document.getElementById("logout-cancel");
const logoutConfirm = document.getElementById("logout-confirm");

btnLogout?.addEventListener("click", () => {
  logoutModal.hidden = false;
  logoutBackdrop.hidden = false;

  setTimeout(() => {
    logoutModal.classList.add("show");
    logoutBackdrop.classList.add("show");
  }, 10);
});

function closeLogoutPopup() {
  logoutModal.classList.remove("show");
  logoutBackdrop.classList.remove("show");

  setTimeout(() => {
    logoutModal.hidden = true;
    logoutBackdrop.hidden = true;
  }, 250);
}

logoutCancel?.addEventListener("click", closeLogoutPopup);
logoutBackdrop?.addEventListener("click", closeLogoutPopup);

logoutConfirm?.addEventListener("click", async () => {
  try {
    // ✅ Хэрвээ family-tree.html дээр байвал logout-оос өмнө save хийнэ
    if (typeof window.saveTreeNow === "function") {
      await window.saveTreeNow();
    }
  } catch (e) {
    console.warn("saveTreeNow failed before logout:", e);
  }

  await signOut(auth);
  closeLogoutPopup();
  showToast("Амжилттай гарлаа");
});



// ======================= AUTH STATE =======================
onAuthStateChanged(auth, (user) => {
  setLoggedInUI(user);
});



// ======================= FAMILY TREE ROUTING =======================
const btnCreateTree = document.querySelector(".go-tree"); // main CTA buttons
const btnPaymentStart = document.getElementById("btn-payment-start");

function requireLogin() {
  openModal();

  // switch to sign-in tab
  formSignin.classList.remove("hidden");
  formSignup.classList.add("hidden");

  tabBtns.forEach((x) => x.classList.remove("active"));
  tabBtns[0].classList.add("active");
}

function goToFamilyTree() {
  window.location.href = "family-tree.html";
}

document.querySelectorAll(".go-tree").forEach((btn) => {
  btn.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) return requireLogin();
    goToFamilyTree();
  });
});

