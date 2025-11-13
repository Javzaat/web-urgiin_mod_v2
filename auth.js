import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

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

// ---- Modal open/close ----
const modal = document.getElementById("auth-modal");
const back = document.getElementById("auth-backdrop");
const btnOpen = document.getElementById("btn-open-auth");
const btnClose = document.getElementById("auth-close");

function openModal() {
  modal.removeAttribute("hidden");
  back.removeAttribute("hidden");
}
function closeModal() {
  modal.setAttribute("hidden", "");
  back.setAttribute("hidden", "");
}
btnOpen?.addEventListener("click", openModal);
btnClose?.addEventListener("click", closeModal);
back?.addEventListener("click", closeModal);

// ---- Tabs ----
const tabBtns = document.querySelectorAll(".tab-btn");
const formSignin = document.getElementById("form-signin");
const formSignup = document.getElementById("form-signup");

tabBtns.forEach((b) =>
  b.addEventListener("click", () => {
    tabBtns.forEach((t) => t.classList.remove("active"));
    b.classList.add("active");
    if (b.dataset.tab === "signin") {
      formSignin.classList.remove("hidden");
      formSignup.classList.add("hidden");
    } else {
      formSignup.classList.remove("hidden");
      formSignin.classList.add("hidden");
    }
  })
);

// ---- Sign up ----
formSignup.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("up-name").value.trim();
  const email = document.getElementById("up-email").value.trim();
  const pass = document.getElementById("up-pass").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    alert(`Сайн байна уу, ${name}! Бүртгэл амжилттай.`);
    formSignup.reset();
    closeModal();
  } catch (err) {
    alert("Алдаа: " + err.message);
  }
});

// ---- Sign in ----
formSignin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("in-email").value.trim();
  const pass = document.getElementById("in-pass").value;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    alert(`Тавтай морил, ${cred.user.displayName || cred.user.email}!`);
    formSignin.reset();
    closeModal();
  } catch (err) {
    alert("Нэвтрэх алдаа: " + err.message);
  }
});
