(function () {
  const btnTheme = document.getElementById("btn-theme");
  if (!btnTheme) return;

  // localStorage-оос унших
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark");
  }

  btnTheme.addEventListener("click", (e) => {
    e.stopPropagation();

    document.body.classList.toggle("dark");

    // хадгалах
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
})();
