let columns = []
let currentFile = null
let lastTrainResult = null

const dropZone = document.getElementById("dropZone")
const fileInput = document.getElementById("fileInput")
const info = document.getElementById("datasetInfo")
const targetSelect = document.getElementById("targetSelect")
const schemaBadge = document.getElementById("schemaBadge")
const targetLabel = document.getElementById("targetLabel")
const modelLabel = document.getElementById("modelLabel")
const progressContainer = document.getElementById("progressContainer")
const progress = document.getElementById("progress")
const progressText = document.getElementById("progressText")
const notification = document.getElementById("notification")
const downloadLink = document.getElementById("downloadLink")

dropZone.addEventListener("dragover", e => e.preventDefault())

dropZone.addEventListener("drop", e => {
  e.preventDefault()
  handleFile(e.dataTransfer.files[0])
})

fileInput.addEventListener("change", e => {
  handleFile(e.target.files[0])
})

function handleFile(file) {
  currentFile = file
  let ext = file.name.split(".").pop().toLowerCase()

  if (ext === "csv" || ext === "txt") {
    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: res => {
        columns = res.meta.fields
        updateUI(file, res.data.length)
      }
    })
  }

  if (ext === "xlsx" || ext === "xls") {
    let reader = new FileReader()

    reader.onload = e => {
      let wb = XLSX.read(e.target.result, { type: "binary" })
      let sheet = wb.Sheets[wb.SheetNames[0]]
      let data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      columns = data[0]
      updateUI(file, data.length - 1)
    }

    reader.readAsBinaryString(file)
  }
}

function updateUI(file, rows) {
  info.innerHTML = `Файл: ${file.name}<br>Строк: ${rows} · Колонок: ${columns.length}`
  schemaBadge.style.display = "inline-flex"

  targetSelect.innerHTML = ""

  columns.forEach(c => {
    let opt = document.createElement("option")
    opt.value = c
    opt.textContent = c
    targetSelect.appendChild(opt)
  })
}

targetSelect.onchange = () => {
  targetLabel.textContent = targetSelect.value || "— выберите колонку —"
}

document.getElementById("modelSelect").onchange = e => {
  modelLabel.textContent = e.target.options[e.target.selectedIndex].text
}

document.getElementById("trainBtn").onclick = async () => {
  let target = targetSelect.value
  let model = document.getElementById("modelSelect").value

  if (!currentFile) {
    alert("Сначала загрузите файл с данными")
    return
  }
  if (!target) {
    alert("Выберите целевую переменную")
    return
  }

  notification.style.display = "none"
  document.getElementById("favoriteBtn").style.display = "none"

  progressContainer.style.display = "block"
  progressText.style.display = "block"
  progress.style.width = "10%"
  progressText.textContent = "Загрузка данных и обучение модели..."

  let fd = new FormData()
  fd.append("file", currentFile)
  fd.append("target", target)
  fd.append("model", model)

  try {
    progress.style.width = "30%"

    const response = await fetch("/train", {
      method: "POST",
      body: fd
    })

    progress.style.width = "90%"

    if (!response.ok) {
      let err = await response.json().catch(() => ({}))
      throw new Error(err.detail || "Ошибка обучения")
    }

    const result = await response.json()
    lastTrainResult = result

    progress.style.width = "100%"
    progressText.textContent = "Готово!"

    setTimeout(() => {
      progressContainer.style.display = "none"
      progressText.style.display = "none"

      let taskLabel = result.task === "classification" ? "Классификация" : "Регрессия"
      let metricsHtml = Object.entries(result.metrics)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")

      let notifBody = document.querySelector("#notification p")
      if (notifBody) {
        notifBody.innerHTML =
          `Задача: <b>${taskLabel}</b><br>` +
          `Метрики: ${metricsHtml}<br>` +
          `Использовано признаков: ${result.features_used.length}`
      }

      if (result.dropped_columns && result.dropped_columns.length) {
        let droppedInfo = document.querySelector("#notification .dropped-info")
        if (!droppedInfo) {
          droppedInfo = document.createElement("p")
          droppedInfo.className = "dropped-info"
          droppedInfo.style.cssText = "margin-top:6px; font-size:13px; opacity:0.8;"
          notification.appendChild(droppedInfo)
        }
        droppedInfo.textContent = "Удалены столбцы: " + result.dropped_columns.join(", ")
      }

      downloadLink.href = `/download-model/${result.model_id}`
      downloadLink.download = `model_${result.model_id}.pkl`

      let stepsLink = document.getElementById("stepsLink")
      if (!stepsLink) {
        stepsLink = document.createElement("a")
        stepsLink.id = "stepsLink"
        stepsLink.className = downloadLink.className
        stepsLink.style.cssText = "margin-left:8px;"
        stepsLink.textContent = "Скачать отчёт пайплайна"
        downloadLink.parentNode.insertBefore(stepsLink, downloadLink.nextSibling)
      }
      stepsLink.href = `/download-steps/${result.model_id}`
      stepsLink.download = `pipeline_steps_${result.model_id}.json`

      notification.style.display = "block"
      document.getElementById("favoriteBtn").style.display = "inline-block"
    }, 500)

  } catch (error) {
    progressContainer.style.display = "none"
    progressText.style.display = "none"
    alert(error.message || "Ошибка при обучении модели")
  }
}

document.getElementById("favoriteBtn").onclick = async () => {
  if (!lastTrainResult) return

  try {
    const resp = await fetch("/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        model_id: lastTrainResult.model_id,
        task: lastTrainResult.task,
        model_key: document.getElementById("modelSelect").value,
        model_label: lastTrainResult.model_label,
        target: targetSelect.value,
        metrics: lastTrainResult.metrics,
        features_used: lastTrainResult.features_used,
        filename: currentFile.name,
      })
    })

    if (resp.status === 401) {
      alert("Войдите в личный кабинет, чтобы сохранять модели в избранное.")
      window.location.href = "/login?next=/automatic-learning"
      return
    }
    const favData = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      const msg = typeof favData.detail === "string" ? favData.detail : "Не удалось сохранить"
      throw new Error(msg)
    }
    const fav = favData
    alert(`Модель добавлена в избранное (ID: ${fav.fav_id})`)
  } catch (e) {
    alert(e.message || "Ошибка сохранения в избранное")
  }
}
