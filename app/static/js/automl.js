let columns = []

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

  if (!target) {
    alert("Выберите target")
    return
  }

  // Показываем прогресс-бар
  progressContainer.style.display = "block"
  progressText.style.display = "block"
  progress.style.width = "0%"

  // Симулируем прогресс обучения
  let progressValue = 0
  const progressInterval = setInterval(() => {
    progressValue += 5
    progress.style.width = `${progressValue}%`
    
    if (progressValue >= 100) {
      clearInterval(progressInterval)
      
      // Скрываем прогресс-бар
      progressContainer.style.display = "none"
      progressText.style.display = "none"
      
      // Показываем уведомление
      notification.style.display = "block"
      downloadLink.href = "/models/model.cpkl"
      
      // Показываем кнопку "Добавить в избранное"
      document.getElementById("favoriteBtn").style.display = "inline-block"
    }
  }, 200)

  try {
    // Отправка запроса на обучение
    const response = await fetch("/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, model })
    })

    if (!response.ok) throw new Error("Ошибка обучения")
  } catch (error) {
    console.error("Training error:", error)
    alert("Ошибка при обучении модели")
    progressContainer.style.display = "none"
    progressText.style.display = "none"
  }
}

document.getElementById("favoriteBtn").onclick = () => {
  alert("Модель добавлена в избранное")
}