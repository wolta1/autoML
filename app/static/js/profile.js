(function () {
  const grid = document.getElementById("modelsGrid")
  const countEl = document.getElementById("modelsCount")
  const emptyState = document.getElementById("emptyState")
  const fetchOpts = { credentials: "same-origin" }

  function pluralize(n) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return n + " модель"
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return n + " модели"
    return n + " моделей"
  }

  function formatDate(iso) {
    if (!iso) return ""
    const d = new Date(iso)
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
  }

  function renderCard(fav) {
    const metricsHtml = Object.entries(fav.metrics || {})
      .map(([k, v]) => `<span class="metric-chip">${k}: ${v}</span>`)
      .join("")

    const taskTag = fav.task === "classification"
      ? '<span class="model-tag cls">Классификация</span>'
      : '<span class="model-tag reg">Регрессия</span>'

    const card = document.createElement("div")
    card.className = "model-card"
    card.dataset.favId = fav.fav_id
    card.innerHTML = `
      <div class="model-card-header">
        <div>
          <div class="model-title">${fav.model_label || fav.model_key || "Модель"}</div>
          <div class="model-meta">${formatDate(fav.created_at)} · ${fav.filename || ""}</div>
        </div>
        ${taskTag}
      </div>
      <div class="model-details">
        <strong>Целевая:</strong> ${fav.target || "—"}<br>
        <strong>Признаков:</strong> ${(fav.features_used || []).length}
      </div>
      <div class="model-metrics">${metricsHtml}</div>
      <div class="model-actions">
        <button class="model-action-btn download-btn" title="Скачать .pkl">Скачать</button>
        <button class="model-action-btn delete" title="Удалить из избранного">Удалить</button>
      </div>
    `
    card.querySelector(".download-btn").onclick = () => {
      window.location.href = `/download-favorite/${fav.fav_id}`
    }
    card.querySelector(".delete").onclick = async () => {
      if (!confirm("Удалить модель из избранного?")) return
      try {
        const resp = await fetch(`/favorite/${fav.fav_id}`, { method: "DELETE", ...fetchOpts })
        if (!resp.ok) throw new Error()
        card.remove()
        updateCount()
      } catch {
        alert("Ошибка удаления")
      }
    }
    return card
  }

  function updateCount() {
    const cards = grid.querySelectorAll(".model-card")
    countEl.textContent = pluralize(cards.length)
    if (emptyState) emptyState.style.display = cards.length ? "none" : "block"
  }

  async function loadFavorites() {
    try {
      const resp = await fetch("/favorites", fetchOpts)
      if (resp.status === 401) {
        window.location.href = "/login?next=/profile"
        return
      }
      if (!resp.ok) throw new Error()
      const data = await resp.json()
      if (emptyState && data.length) emptyState.style.display = "none"
      data.forEach(fav => grid.appendChild(renderCard(fav)))
      updateCount()
    } catch {
      if (emptyState) {
        emptyState.querySelector(".empty-state-title").textContent = "Не удалось загрузить модели"
        emptyState.querySelector(".empty-state-desc").textContent = "Проверьте подключение к серверу"
      }
    }
  }

  function setMsg(id, text, ok) {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = text || ""
    el.className = "account-msg" + (text ? (ok ? " ok" : " err") : "")
  }

  function apiErr(e, data) {
    if (typeof data?.detail === "string") return data.detail
    if (Array.isArray(data?.detail)) return data.detail.map(d => d.msg || d).join("; ")
    return e.message || "Ошибка"
  }

  const formUser = document.getElementById("formChangeUsername")
  if (formUser) {
    formUser.onsubmit = async (e) => {
      e.preventDefault()
      setMsg("msgUsername", "")
      try {
        const body = {
          new_username: document.getElementById("accNewUsername").value.trim(),
          password: document.getElementById("accUserPass").value,
        }
        const r = await fetch("/api/account/username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...fetchOpts,
          body: JSON.stringify(body),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(apiErr(new Error(), data))
        const name = body.new_username
        const pn = document.getElementById("profileName")
        const av = document.getElementById("profileAvatar")
        if (pn) pn.textContent = name
        if (av) av.textContent = (name[0] || "?").toUpperCase()
        document.getElementById("accNewUsername").value = ""
        document.getElementById("accUserPass").value = ""
        setMsg("msgUsername", "Логин обновлён", true)
      } catch (err) {
        setMsg("msgUsername", err.message, false)
      }
    }
  }

  const formPass = document.getElementById("formChangePassword")
  if (formPass) {
    formPass.onsubmit = async (e) => {
      e.preventDefault()
      setMsg("msgPassword", "")
      try {
        const r = await fetch("/api/account/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...fetchOpts,
          body: JSON.stringify({
            old_password: document.getElementById("accOldPass").value,
            new_password: document.getElementById("accNewPass").value,
          }),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(apiErr(new Error(), data))
        document.getElementById("accOldPass").value = ""
        document.getElementById("accNewPass").value = ""
        setMsg("msgPassword", "Пароль обновлён", true)
      } catch (err) {
        setMsg("msgPassword", err.message, false)
      }
    }
  }

  const formDel = document.getElementById("formDeleteAccount")
  if (formDel) {
    formDel.onsubmit = async (e) => {
      e.preventDefault()
      setMsg("msgDelete", "")
      if (!confirm("Удалить аккаунт без возможности восстановления?")) return
      try {
        const r = await fetch("/api/account/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...fetchOpts,
          body: JSON.stringify({
            password: document.getElementById("accDelPass").value,
          }),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(apiErr(new Error(), data))
        window.location.href = "/login?next=/profile"
      } catch (err) {
        setMsg("msgDelete", err.message, false)
      }
    }
  }

  loadFavorites()
})()
