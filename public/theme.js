(function () {
  const btnTheme = document.getElementById("btn-theme");
  const icon = document.getElementById("theme-icon");
  if (!btnTheme) return;

  function syncThemeIcon() {
    const isDark = document.body.classList.contains("dark");
    if (!icon) return;
    icon.src = isDark ? "img/sun.png" : "img/moon.png";
    icon.alt = isDark ? "Sun icon" : "Moon icon";
  }

  // localStorage-оос унших
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }

  // эхлээд icon-оо тааруулна
  syncThemeIcon();
  

  btnTheme.addEventListener("click", (e) => {
    e.stopPropagation();

    // ✅ ганцхан удаа toggle хийнэ
    document.body.classList.toggle("dark");

    // хадгалах
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // icon солих
    syncThemeIcon();
  });
})();
