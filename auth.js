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


// ================== HEADER BUTTONS ==================
const welcomeText = document.getElementById("welcome-text");
const btnMyTree = document.getElementById("btn-my-tree");
const btnLogin = document.getElementById("btn-open-auth");
const btnLogout = document.getElementById("btn-logout");


// ================== MODAL ==================
const modal = document.getElementById("auth-modal");
const back = document.getElementById("auth-backdrop");
const closeBtn = document.getElementById("auth-close");

function openModal() {
  modal.hidden = false;
  back.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  back.hidden = true;
}

btnLogin.addEventListener("click", openModal);
closeBtn.addEventListener("click", closeModal);
back.addEventListener("click", closeModal);


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


// ================== SIGNUP ==================
formSignup.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("up-name").value.trim();
  const email = document.getElementById("up-email").value.trim();
  const pass = document.getElementById("up-pass").value.trim();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    alert("Бүртгэл амжилттай!");
    closeModal();

  } catch (err) {
    alert(err.message);
  }
});


// ================== SIGNIN ==================
formSignin.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("in-email").value.trim();
  const pass = document.getElementById("in-pass").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeModal();

  } catch (err) {
    alert(err.message);
  }
});


// ================== LOGOUT ==================
btnLogout.addEventListener("click", async () => {
  if (confirm("Гарах уу?")) {
    welcomeText.textContent = "";
    welcomeText.hidden = true;
    await signOut(auth);
  }
});


// ================== AUTH STATE ==================
onAuthStateChanged(auth, (user) => {
  if (user) {
    // LOGGED IN
    const name = user.displayName || user.email.split("@")[0];

    welcomeText.textContent = `Тавтай морилно уу, ${name}`;
    welcomeText.hidden = false;

    btnMyTree.hidden = false;
    btnLogout.hidden = false;
    btnLogin.hidden = true;

  } else {
    // LOGGED OUT
    welcomeText.textContent = "";
    welcomeText.hidden = true;

    btnMyTree.hidden = true;
    btnLogout.hidden = true;
    btnLogin.hidden = false;
  }
});