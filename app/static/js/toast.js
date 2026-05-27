(function () {
  function getStack() {
    let stack = document.querySelector(".toast-stack")
    if (!stack) {
      stack = document.createElement("div")
      stack.className = "toast-stack"
      stack.setAttribute("role", "region")
      stack.setAttribute("aria-live", "polite")
      document.body.appendChild(stack)
    }
    return stack
  }

  const ICONS = { success: "\u2713", error: "!", info: "i", warning: "!" }

  function showToast(opts) {
    const o = opts || {}
    const type     = o.type    || "info"
    const title    = o.title   || ""
    const message  = o.message || ""
    const action   = o.action  || null
    const duration = o.duration === 0 ? 0 : (o.duration || 6000)

    const stack = getStack()

    const toast = document.createElement("div")
    toast.className = `toast ${type}`

    toast.innerHTML = `
      <div class="toast-icon">${ICONS[type] || "i"}</div>
      <div class="toast-content">
        ${title   ? `<div class="toast-title">${title}</div>` : ""}
        ${message ? `<div class="toast-message">${message}</div>` : ""}
      </div>
      <button type="button" class="toast-close" aria-label="Закрыть">\u2715</button>
    `

    if (action && action.text) {
      const content = toast.querySelector(".toast-content")
      let actionEl
      if (action.href) {
        actionEl = document.createElement("a")
        actionEl.href = action.href
        if (action.target) actionEl.target = action.target
      } else {
        actionEl = document.createElement("button")
        actionEl.type = "button"
        if (typeof action.onClick === "function") {
          actionEl.addEventListener("click", action.onClick)
        }
      }
      actionEl.className = "toast-action"
      actionEl.textContent = action.text
      content.appendChild(actionEl)
    }

    stack.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add("visible"))

    function dismiss() {
      toast.classList.remove("visible")
      setTimeout(() => toast.remove(), 250)
    }

    toast.querySelector(".toast-close").addEventListener("click", dismiss)

    if (duration > 0) {
      setTimeout(dismiss, duration)
    }

    return { dismiss, el: toast }
  }

  window.showToast = showToast
})()
