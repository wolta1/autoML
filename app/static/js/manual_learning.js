(function () {
  // ── state ──────────────────────────────────────────────────────────
  let datasetColumns = []
  let datasetRows = 0
  let numericColumns = []
  let currentFile = null
  let originalData = []
  let fullData = []
  let lastTrainResult = null
  let baselineId = null

  // ── DOM refs ───────────────────────────────────────────────────────
  const dropZone = document.getElementById("mlDropZone")
  const fileInput = document.getElementById("mlFileInput")
  const datasetInfo = document.getElementById("mlDatasetInfo")
  const schemaBadge = document.getElementById("mlSchemaBadge")
  const datasetMeta = document.getElementById("mlDatasetMeta")
  const metaFile = document.getElementById("mlMetaFile")
  const metaShape = document.getElementById("mlMetaShape")
  const currentFileName = document.getElementById("currentFileName")
  const currentShape = document.getElementById("currentShape")
  const targetSelect = document.getElementById("targetSelect")
  const tableHead = document.getElementById("tableHead")
  const tableBody = document.getElementById("tableBody")
  const shapeContent = document.getElementById("shapeContent")
  const infoContent = document.getElementById("infoContent")
  const describeContent = document.getElementById("describeContent")
  const isnaContent = document.getElementById("isnaContent")
  const dupContent = document.getElementById("dupContent")

  // Analytics
  const analyticsPlaceholder = document.getElementById("analyticsPlaceholder")
  const analyticsHeader = document.getElementById("analyticsHeader")
  const analyticsColumn = document.getElementById("analyticsColumn")
  const statsCard = document.getElementById("statsCard")
  const boxplotCard = document.getElementById("boxplotCard")
  const histCard = document.getElementById("histCard")
  const analyticsFooter = document.getElementById("analyticsFooter")
  const boxplotSvg = document.getElementById("boxplotSvg")
  const histCanvas = document.getElementById("histCanvas")
  const boxplotColumn = document.getElementById("boxplotColumn")
  const histColumn = document.getElementById("histColumn")
  const varTypeBadge = document.getElementById("varTypeBadge")
  const uniqueBadge = document.getElementById("uniqueBadge")

  // Training
  const runBtn = document.getElementById("runPipelineBtn")
  const trainingResult = document.getElementById("trainingResult")
  const progressBar = document.getElementById("progressBar")
  const progressText = document.getElementById("progressText")
  const notification = document.getElementById("trainingNotification")
  const downloadSection = document.getElementById("downloadSection")
  const downloadLink = document.getElementById("downloadLink")
  const favoriteBtn = document.getElementById("favoriteBtn")
  const loaderOverlay = document.getElementById("loaderOverlay")

  // ── File upload ────────────────────────────────────────────────────
  if (dropZone && fileInput) {
    dropZone.addEventListener("click", () => fileInput.click())
    dropZone.addEventListener("dragover", e => {
      e.preventDefault()
      dropZone.classList.add("drag")
    })
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"))
    dropZone.addEventListener("drop", e => {
      e.preventDefault()
      dropZone.classList.remove("drag")
      handleFile(e.dataTransfer.files[0])
    })
    fileInput.addEventListener("change", e => handleFile(e.target.files[0]))
  }

  function handleFile(file) {
    if (!file) return
    currentFile = file
    const ext = file.name.split(".").pop().toLowerCase()

    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: res => {
          datasetColumns = res.meta.fields || []
          originalData = res.data.map(r => ({ ...r }))
          fullData = res.data
          datasetRows = res.data.length
          afterLoad(file)
        }
      })
    }

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader()
      reader.onload = e => {
        const wb = XLSX.read(e.target.result, { type: "binary" })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(sheet)
        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []
        datasetColumns = headerRow.map(String)
        originalData = jsonData.map(r => ({ ...r }))
        fullData = jsonData
        datasetRows = jsonData.length
        afterLoad(file)
      }
      reader.readAsBinaryString(file)
    }
  }

  function afterLoad(file) {
    numericColumns = datasetColumns.filter(col => {
      const sample = fullData.slice(0, 50)
      return sample.every(row => {
        const v = row[col]
        return v === null || v === undefined || v === "" || (typeof v === "number" && !isNaN(v)) || !isNaN(parseFloat(v))
      })
    })

    updateDatasetUI(file)
    updatePreviewTable()
    updateInfoTabs()
    populateTargetSelect()
    populateOutlierSelects()
    updateAnalyticsColumns()
  }

  function updateDatasetUI(file) {
    if (datasetInfo) { datasetInfo.classList.add("visible") }
    if (schemaBadge) { schemaBadge.classList.add("visible") }
    if (datasetMeta) { datasetMeta.classList.add("visible") }
    if (currentFileName) currentFileName.textContent = file.name
    if (currentShape) currentShape.textContent = `(${datasetRows.toLocaleString()}, ${datasetColumns.length})`
    if (metaFile) metaFile.innerHTML = `<strong>Файл:</strong> ${file.name}`
    if (metaShape) metaShape.innerHTML = `<strong>Shape:</strong> (${datasetRows.toLocaleString()}, ${datasetColumns.length})`
    if (analyticsPlaceholder) analyticsPlaceholder.style.display = "none"
    if (analyticsHeader) analyticsHeader.style.display = "block"
  }

  function updatePreviewTable() {
    if (!tableHead || !tableBody) return
    tableHead.innerHTML = datasetColumns.map(c => `<th>${c}</th>`).join("")
    tableBody.innerHTML = fullData.slice(0, 5).map(row =>
      `<tr>${datasetColumns.map(c => `<td>${row[c] !== undefined && row[c] !== null ? row[c] : ""}</td>`).join("")}</tr>`
    ).join("")
  }

  function updateInfoTabs() {
    if (shapeContent) shapeContent.textContent = `(${datasetRows}, ${datasetColumns.length})`

    if (infoContent) {
      const types = datasetColumns.map(col => {
        const isNum = numericColumns.includes(col)
        return `  ${col.padEnd(20)} ${isNum ? "float64/int64" : "object/string"}`
      })
      infoContent.textContent =
        `<class 'pandas.core.frame.DataFrame'>\n` +
        `RangeIndex: ${datasetRows} entries\n` +
        `Data columns (total ${datasetColumns.length} columns):\n` +
        types.join("\n")
    }

    if (describeContent && numericColumns.length > 0) {
      let lines = []
      numericColumns.slice(0, 6).forEach(col => {
        const vals = fullData.map(r => parseFloat(r[col])).filter(v => !isNaN(v))
        if (vals.length === 0) return
        const sorted = [...vals].sort((a, b) => a - b)
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        lines.push(`${col}: mean=${mean.toFixed(2)}, min=${sorted[0]}, max=${sorted[sorted.length - 1]}`)
      })
      describeContent.textContent = lines.join("\n") || "Нет числовых столбцов"
    }

    if (isnaContent) {
      const naCounts = datasetColumns.map(col => {
        const na = fullData.filter(r => r[col] === null || r[col] === undefined || r[col] === "").length
        return `${col}: ${na}`
      })
      isnaContent.textContent = naCounts.join("\n")
    }

    if (dupContent) {
      const seen = new Set()
      let dups = 0
      fullData.forEach(row => {
        const key = JSON.stringify(row)
        if (seen.has(key)) dups++
        else seen.add(key)
      })
      dupContent.textContent = `df.duplicated().sum()  # ${dups}`
    }
  }

  function populateTargetSelect() {
    if (!targetSelect) return
    targetSelect.innerHTML = '<option value="">— выберите —</option>'
    datasetColumns.forEach(col => {
      const opt = document.createElement("option")
      opt.value = col
      opt.textContent = col
      targetSelect.appendChild(opt)
    })
  }

  function populateOutlierSelects() {
    ;["outlierField1", "outlierField2"].forEach(id => {
      const sel = document.getElementById(id)
      if (!sel) return
      sel.innerHTML = '<option value="">— не выбрано —</option>'
      numericColumns.forEach(col => {
        const opt = document.createElement("option")
        opt.value = col
        opt.textContent = col
        sel.appendChild(opt)
      })
    })
  }

  function updateAnalyticsColumns() {
    if (!analyticsColumn) return
    analyticsColumn.innerHTML = '<option value="">— выберите колонку —</option>'
    datasetColumns.forEach(col => {
      const opt = document.createElement("option")
      opt.value = col
      opt.textContent = col
      analyticsColumn.appendChild(opt)
    })
  }

  // ── Apply outlier clipping ─────────────────────────────────────────
  const applyOutliersBtn = document.getElementById("applyOutliersBtn")
  const outlierStatus = document.getElementById("outlierStatus")

  if (applyOutliersBtn) {
    applyOutliersBtn.addEventListener("click", () => {
      if (!originalData.length) return

      const rules = getOutlierRules()
      if (!rules.length) {
        if (outlierStatus) outlierStatus.textContent = "Укажите хотя бы одно правило"
        return
      }

      fullData = originalData.map(r => ({ ...r }))
      let totalClipped = 0

      rules.forEach(({ field, min: lo, max: hi }) => {
        fullData.forEach(row => {
          const v = parseFloat(row[field])
          if (isNaN(v)) return
          if (lo !== null && v < lo) { row[field] = lo; totalClipped++ }
          if (hi !== null && v > hi) { row[field] = hi; totalClipped++ }
        })
      })

      datasetRows = fullData.length
      updatePreviewTable()
      updateInfoTabs()

      const currentCol = analyticsColumn?.value
      if (currentCol) analyzeColumn(currentCol)

      if (outlierStatus) {
        const fieldNames = rules.map(r => r.field).join(", ")
        outlierStatus.textContent = totalClipped > 0
          ? `Усечено ${totalClipped} значений в полях: ${fieldNames}`
          : `Выбросов не найдено (${fieldNames})`
      }
    })
  }

  // ── Analytics: column selection ────────────────────────────────────
  if (analyticsColumn) {
    analyticsColumn.addEventListener("change", e => {
      const col = e.target.value
      if (!col) { resetAnalytics(); return }
      analyzeColumn(col)
    })
  }

  function resetAnalytics() {
    if (statsCard) statsCard.classList.remove("visible")
    if (boxplotCard) boxplotCard.style.display = "none"
    if (histCard) histCard.style.display = "none"
    if (analyticsFooter) analyticsFooter.style.display = "none"
  }

  function analyzeColumn(colName) {
    const vals = fullData.map(r => r[colName]).filter(v => v !== null && v !== undefined && v !== "")
    const isNum = numericColumns.includes(colName)

    if (varTypeBadge) varTypeBadge.textContent = `Тип: ${isNum ? "числовой" : "категориальный"}`
    if (uniqueBadge) uniqueBadge.textContent = `Уникальных: ${new Set(vals.map(String)).size}`

    if (statsCard) statsCard.classList.add("visible")
    if (boxplotCard) boxplotCard.style.display = "block"
    if (histCard) histCard.style.display = "block"
    if (analyticsFooter) analyticsFooter.style.display = "flex"
    if (boxplotColumn) boxplotColumn.textContent = `· ${colName}`
    if (histColumn) histColumn.textContent = `· ${colName}`

    if (isNum) {
      const nums = vals.map(v => parseFloat(v)).filter(n => !isNaN(n))
      calcNumericStats(nums)
      drawBoxplot(nums)
      drawHistogram(nums)
    } else {
      clearNumericStats()
      drawCategoricalChart(vals)
      if (boxplotSvg) boxplotSvg.innerHTML =
        '<text x="200" y="90" text-anchor="middle" fill="rgba(11,18,32,.4)" font-size="11">Boxplot только для числовых</text>'
    }
  }

  function calcNumericStats(data) {
    if (!data.length) return
    const sorted = [...data].sort((a, b) => a - b)
    const n = sorted.length
    const mean = data.reduce((a, b) => a + b, 0) / n
    const median = n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    const std = Math.sqrt(data.reduce((s, x) => s + (x - mean) ** 2, 0) / n)
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
    set("statMean", mean.toFixed(2))
    set("statMedian", median.toFixed(2))
    set("statStd", std.toFixed(2))
    set("statMin", sorted[0].toFixed(2))
    set("statQ1", sorted[Math.floor(n * 0.25)].toFixed(2))
    set("statQ3", sorted[Math.floor(n * 0.75)].toFixed(2))
    set("statMax", sorted[n - 1].toFixed(2))
    set("statNa", String(fullData.length - data.length))
  }

  function clearNumericStats() {
    ;["statMean", "statMedian", "statStd", "statMin", "statQ1", "statQ3", "statMax"].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = "—"
    })
    const na = document.getElementById("statNa"); if (na) na.textContent = "0"
  }

  // ── Boxplot SVG ────────────────────────────────────────────────────
  function drawBoxplot(data) {
    if (!boxplotSvg || !data.length) return
    boxplotSvg.innerHTML = ""
    const sorted = [...data].sort((a, b) => a - b)
    const n = sorted.length
    const min = sorted[0], max = sorted[n - 1]
    const q1 = sorted[Math.floor(n * 0.25)]
    const median = sorted[Math.floor(n * 0.5)]
    const q3 = sorted[Math.floor(n * 0.75)]
    const iqr = q3 - q1
    const lf = q1 - 1.5 * iqr, uf = q3 + 1.5 * iqr
    const wMin = sorted.find(v => v >= lf) || min
    const wMax = [...sorted].reverse().find(v => v <= uf) || max
    const outliers = sorted.filter(v => v < lf || v > uf)
    const pad = 35, h = 180 - pad, range = max - min || 1
    const sc = v => pad + (1 - (v - min) / range) * h
    const ns = "http://www.w3.org/2000/svg"
    const mkLine = (x1, y1, x2, y2, cls) => {
      const l = document.createElementNS(ns, "line")
      l.setAttribute("x1", x1); l.setAttribute("y1", y1)
      l.setAttribute("x2", x2); l.setAttribute("y2", y2)
      l.setAttribute("class", cls); boxplotSvg.appendChild(l)
    }
    mkLine(200, sc(wMin), 200, sc(wMax), "boxplot-line")
    const box = document.createElementNS(ns, "rect")
    box.setAttribute("x", 170); box.setAttribute("y", sc(q3))
    box.setAttribute("width", 60); box.setAttribute("height", Math.max(sc(q1) - sc(q3), 2))
    box.setAttribute("class", "boxplot-box"); boxplotSvg.appendChild(box)
    mkLine(170, sc(median), 230, sc(median), "boxplot-median")
    mkLine(185, sc(wMin), 215, sc(wMin), "boxplot-whisker")
    mkLine(185, sc(wMax), 215, sc(wMax), "boxplot-whisker")
    outliers.forEach(v => {
      const c = document.createElementNS(ns, "circle")
      c.setAttribute("cx", 200); c.setAttribute("cy", sc(v)); c.setAttribute("r", 3)
      c.setAttribute("class", "boxplot-outlier"); boxplotSvg.appendChild(c)
    })
  }

  // ── Histogram Canvas ───────────────────────────────────────────────
  function drawHistogram(data) {
    if (!histCanvas || !data.length) return
    const ctx = histCanvas.getContext("2d")
    ctx.clearRect(0, 0, histCanvas.width, histCanvas.height)
    const bins = 12, min = Math.min(...data), max = Math.max(...data)
    const range = max - min || 1, bw = range / bins
    const counts = new Array(bins).fill(0)
    data.forEach(v => { counts[Math.min(Math.floor((v - min) / bw), bins - 1)]++ })
    const mc = Math.max(...counts), p = 25, cw = histCanvas.width - p * 2, ch = histCanvas.height - p
    ctx.strokeStyle = "rgba(11,18,32,.25)"; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(p, p); ctx.lineTo(p, histCanvas.height - p)
    ctx.lineTo(histCanvas.width - p, histCanvas.height - p); ctx.stroke()
    counts.forEach((c, i) => {
      const x = p + i * (cw / bins), bh = mc > 0 ? (c / mc) * ch : 0
      ctx.fillStyle = "rgba(30,111,184,.80)"
      ctx.fillRect(x + 1, histCanvas.height - p - bh, cw / bins - 2, bh)
    })
    ctx.fillStyle = "rgba(11,18,32,.45)"; ctx.font = "9px sans-serif"
    ctx.fillText(min.toFixed(1), p, histCanvas.height - 8)
    ctx.fillText(max.toFixed(1), histCanvas.width - p - 25, histCanvas.height - 8)
  }

  function drawCategoricalChart(data) {
    if (!histCanvas) return
    const ctx = histCanvas.getContext("2d")
    ctx.clearRect(0, 0, histCanvas.width, histCanvas.height)
    const counts = {}
    data.forEach(v => { counts[v] = (counts[v] || 0) + 1 })
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7)
    if (!entries.length) return
    const mc = Math.max(...entries.map(e => e[1]))
    const pad = { top: 15, right: 15, bottom: 45, left: 55 }
    const cw = histCanvas.width - pad.left - pad.right
    const ch = histCanvas.height - pad.top - pad.bottom
    const bh = ch / entries.length - 3
    ctx.strokeStyle = "rgba(11,18,32,.25)"; ctx.beginPath()
    ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, histCanvas.height - pad.bottom)
    ctx.lineTo(histCanvas.width - pad.right, histCanvas.height - pad.bottom); ctx.stroke()
    entries.forEach(([label, count], i) => {
      const w = mc > 0 ? (count / mc) * cw : 0, y = pad.top + i * (bh + 3)
      ctx.fillStyle = "rgba(30,111,184,.80)"; ctx.fillRect(pad.left, y, w, bh)
      ctx.fillStyle = "rgba(11,18,32,.65)"; ctx.font = "9px sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(label.length > 10 ? label.slice(0, 10) + "…" : label, pad.left - 6, y + bh / 2 + 3)
      ctx.textAlign = "left"; ctx.fillText(count, pad.left + w + 5, y + bh / 2 + 3)
    })
  }

  // ── Tabs ───────────────────────────────────────────────────────────
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab")
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === btn))
      document.querySelectorAll(".tab-pane").forEach(p => {
        const match = p.getAttribute("data-tab-content") === tab
        p.classList.toggle("active", match)
        p.classList.toggle("hidden", !match)
      })
    })
  })

  // ── Encoding description ───────────────────────────────────────────
  const encodingSelect = document.getElementById("encodingType")
  const encodingDesc = document.getElementById("encodingDesc")
  const encDescriptions = {
    onehot: "OneHotEncoder — хорош, когда категорий немного. Каждая категория превращается в отдельную бинарную колонку.",
    target: "TargetEncoder — усредняет таргет по категориям. Полезен при большом числе категорий.",
    ordinal: "OrdinalEncoder — присваивает числовой код категории. Подходит для деревьев.",
    hash: "HashingEncoder — хеширование категорий для очень больших словарей."
  }
  if (encodingSelect) {
    encodingSelect.addEventListener("change", () => {
      if (encodingDesc) encodingDesc.textContent = encDescriptions[encodingSelect.value] || ""
    })
  }

  // ── Scaling description ────────────────────────────────────────────
  const scalingSelect = document.getElementById("scalingType")
  const scalingDesc = document.getElementById("scalingDesc")
  const scaleDescriptions = {
    none: "Без шкалирования — ок для деревьев и бустингов.",
    standard: "StandardScaler — вычитает среднее и делит на стд. отклонение.",
    minmax: "MinMaxScaler — сжимает в [0, 1].",
    robust: "RobustScaler — использует медиану и IQR, устойчив к выбросам."
  }
  if (scalingSelect) {
    scalingSelect.addEventListener("change", () => {
      if (scalingDesc) scalingDesc.textContent = scaleDescriptions[scalingSelect.value] || ""
    })
  }

  // ── Model selection ────────────────────────────────────────────────
  const modelCards = document.querySelectorAll(".model-card")
  const paramsBlocks = {
    linear: document.getElementById("params-linear"),
    trees: document.getElementById("params-trees"),
    catboost: document.getElementById("params-catboost"),
  }

  function setModel(model) {
    modelCards.forEach(c => c.classList.toggle("active", c.getAttribute("data-model") === model))
    Object.keys(paramsBlocks).forEach(m => {
      if (paramsBlocks[m]) paramsBlocks[m].classList.toggle("visible", m === model)
    })
  }
  modelCards.forEach(card => {
    card.addEventListener("click", () => setModel(card.getAttribute("data-model")))
  })

  // ── Hyperparameter mode toggle ─────────────────────────────────────
  const manualToggle = document.getElementById("manualToggle")
  const modeAutoPill = document.getElementById("modeAutoPill")
  function updateManualMode() {
    if (!manualToggle || !modeAutoPill) return
    const manual = manualToggle.checked
    modeAutoPill.textContent = manual ? "Ручная настройка" : "Auto search (Optuna)"
    document.querySelectorAll(
      "#params-linear input, #params-linear select, #params-trees input, #params-catboost input"
    ).forEach(el => {
      el.disabled = !manual
      el.style.opacity = manual ? "1" : "0.6"
    })
  }
  if (manualToggle) {
    manualToggle.addEventListener("change", updateManualMode)
    updateManualMode()
  }

  // ── Slides ─────────────────────────────────────────────────────────
  const slidesWrap = document.getElementById("manualSlides")
  const slideBtn = document.getElementById("manualSlideBtn")

  function setStep(step) {
    if (!slidesWrap) return
    slidesWrap.setAttribute("data-step", String(step))
    slidesWrap.querySelectorAll(".manual-slide").forEach(s => {
      const active = s.getAttribute("data-step") === String(step)
      s.classList.toggle("active", active)
      s.setAttribute("aria-hidden", active ? "false" : "true")
    })
  }
  function getStep() { return Number(slidesWrap?.getAttribute("data-step") || "1") }

  if (slidesWrap && slideBtn) {
    slideBtn.addEventListener("click", () => setStep(getStep() === 1 ? 2 : 1))
    setStep(getStep())
  }

  // ── Collect all settings ───────────────────────────────────────────
  function getSelectedModel() {
    const checked = document.querySelector('input[name="modelType"]:checked')
    return checked ? checked.value : "linear"
  }

  function getOutlierRules() {
    const rules = []
    ;[1, 2].forEach(i => {
      const field = document.getElementById(`outlierField${i}`)?.value
      const minVal = document.getElementById(`outlierMin${i}`)?.value
      const maxVal = document.getElementById(`outlierMax${i}`)?.value
      if (field && (minVal || maxVal)) {
        rules.push({
          field,
          min: minVal ? parseFloat(minVal) : null,
          max: maxVal ? parseFloat(maxVal) : null,
        })
      }
    })
    return rules
  }

  function getManualParams() {
    const model = getSelectedModel()
    const params = {}
    if (model === "linear") {
      const c = document.getElementById("linearC")?.value
      const p = document.getElementById("linearPenalty")?.value
      if (c) params.C = parseFloat(c)
      if (p) params.penalty = p
    } else if (model === "trees") {
      const n = document.getElementById("treesNest")?.value
      const d = document.getElementById("treesDepth")?.value
      if (n) params.n_estimators = parseInt(n)
      if (d) params.max_depth = parseInt(d)
    } else if (model === "catboost") {
      const lr = document.getElementById("catboostLr")?.value
      const d = document.getElementById("catboostDepth")?.value
      if (lr) params.learning_rate = parseFloat(lr)
      if (d) params.max_depth = parseInt(d)
    }
    return params
  }

  // ── Baseline upload ────────────────────────────────────────────────
  const baselineDropZone = document.getElementById("baselineDropZone")
  const baselineInput = document.getElementById("baselineInput")
  const baselineInfo = document.getElementById("baselineInfo")
  const baselineError = document.getElementById("baselineError")
  const baselineModelType = document.getElementById("baselineModelType")
  const baselineHparams = document.getElementById("baselineHparams")
  const baselineMetrics = document.getElementById("baselineMetrics")
  const baselineRemoveBtn = document.getElementById("baselineRemoveBtn")

  if (baselineDropZone && baselineInput) {
    baselineDropZone.addEventListener("click", () => baselineInput.click())
    baselineDropZone.addEventListener("dragover", e => {
      e.preventDefault()
      baselineDropZone.classList.add("drag")
    })
    baselineDropZone.addEventListener("dragleave", () => baselineDropZone.classList.remove("drag"))
    baselineDropZone.addEventListener("drop", e => {
      e.preventDefault()
      baselineDropZone.classList.remove("drag")
      uploadBaseline(e.dataTransfer.files[0])
    })
    baselineInput.addEventListener("change", e => uploadBaseline(e.target.files[0]))
  }

  async function uploadBaseline(file) {
    if (!file) return
    if (baselineError) baselineError.style.display = "none"
    if (baselineInfo) baselineInfo.style.display = "none"
    baselineId = null

    const fd = new FormData()
    fd.append("file", file)

    try {
      const resp = await fetch("/upload-baseline", { method: "POST", body: fd })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.detail || "Не удалось загрузить baseline модель")
      }

      const data = await resp.json()
      baselineId = data.baseline_id

      if (baselineModelType) baselineModelType.textContent = data.model_type || "—"
      if (baselineHparams) {
        const hp = data.hyperparams || {}
        const entries = Object.entries(hp)
        baselineHparams.textContent = entries.length
          ? entries.map(([k, v]) => `${k}=${v}`).join(", ")
          : "по умолчанию"
      }
      if (baselineMetrics) {
        const m = data.metrics || {}
        const entries = Object.entries(m)
        baselineMetrics.textContent = entries.length
          ? entries.map(([k, v]) => `${k}: ${v}`).join(" · ")
          : "будут вычислены при обучении"
      }
      if (baselineInfo) baselineInfo.style.display = "block"

    } catch (err) {
      if (baselineError) {
        baselineError.textContent = err.message
        baselineError.style.display = "block"
      }
    }
  }

  if (baselineRemoveBtn) {
    baselineRemoveBtn.addEventListener("click", () => {
      baselineId = null
      if (baselineInfo) baselineInfo.style.display = "none"
      if (baselineError) baselineError.style.display = "none"
      if (baselineInput) baselineInput.value = ""
    })
  }

  // ── TRAIN ──────────────────────────────────────────────────────────
  if (runBtn) {
    runBtn.addEventListener("click", async () => {
      if (!currentFile) { alert("Сначала загрузите датасет (шаг 1)"); return }

      const target = targetSelect?.value
      if (!target) { alert("Выберите целевую переменную (target)"); return }

      const isManual = manualToggle?.checked
      const modelType = getSelectedModel()

      runBtn.disabled = true
      runBtn.textContent = "Обучение..."

      if (trainingResult) {
        trainingResult.classList.add("visible")
        if (notification) notification.classList.remove("visible")
        if (downloadSection) downloadSection.classList.remove("visible")
        if (favoriteBtn) favoriteBtn.classList.remove("visible")
        if (progressBar) progressBar.style.width = "10%"
        if (progressText) progressText.textContent = isManual ? "Обучение модели..." : "Автоподбор гиперпараметров (Optuna)..."
      }
      if (loaderOverlay) loaderOverlay.classList.remove("hidden")

      const fd = new FormData()
      fd.append("file", currentFile)
      fd.append("target", target)
      fd.append("missing_strategy", document.getElementById("missingStrategy")?.value || "mean")
      fd.append("remove_id_dups", document.getElementById("removeIdDups")?.checked ? "true" : "false")
      fd.append("remove_full_dups", document.getElementById("removeFullDups")?.checked ? "true" : "false")
      fd.append("encoding_type", encodingSelect?.value || "onehot")
      fd.append("scaling_type", scalingSelect?.value || "none")
      fd.append("model_type", modelType)
      fd.append("hparam_mode", isManual ? "manual" : "auto")
      fd.append("outlier_rules", JSON.stringify(getOutlierRules()))
      fd.append("manual_params", JSON.stringify(isManual ? getManualParams() : {}))
      if (baselineId) fd.append("baseline_id", baselineId)

      if (progressBar) progressBar.style.width = "30%"

      try {
        const resp = await fetch("/manual-train", { method: "POST", body: fd })
        if (progressBar) progressBar.style.width = "90%"

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.detail || "Ошибка обучения")
        }

        const result = await resp.json()
        lastTrainResult = result

        if (progressBar) progressBar.style.width = "100%"
        if (progressText) progressText.textContent = "Готово!"

        setTimeout(() => {
          if (loaderOverlay) loaderOverlay.classList.add("hidden")

          const taskLabel = result.task === "classification" ? "Классификация" : "Регрессия"
          const metricsHtml = Object.entries(result.metrics).map(([k, v]) => `${k}: ${v}`).join(" · ")

          if (notification) {
            let html =
              `<b>${taskLabel}</b> · ${result.model_class}<br>` +
              `Метрики: ${metricsHtml}<br>` +
              `Признаков: ${result.features_used.length}` +
              (result.optuna_used ? `<br>Optuna: лучшие параметры ${JSON.stringify(result.best_params)}` : "") +
              (result.dropped_columns.length ? `<br>Удалены столбцы: ${result.dropped_columns.join(", ")}` : "")

            if (result.baseline_comparison) {
              const bc = result.baseline_comparison
              const blMetrics = Object.entries(bc.baseline_metrics).map(([k, v]) => `${k}: ${v}`).join(" · ")
              const newMetrics = Object.entries(bc.new_metrics).map(([k, v]) => `${k}: ${v}`).join(" · ")
              const arrow = bc.is_better ? "↑" : "↓"
              const color = bc.is_better ? "#166534" : "#991b1b"
              const bg = bc.is_better ? "#dcfce7" : "#fef2f2"
              const label = bc.is_better ? "Новая модель лучше baseline" : "Новая модель хуже baseline"

              html += `<div style="margin-top:10px;padding:10px 14px;border-radius:10px;background:${bg};border:1px solid ${bc.is_better ? '#bbf7d0' : '#fecaca'};font-size:13px;color:${color};">`
              html += `<b>${arrow} ${label}</b> (${bc.primary_metric})<br>`
              html += `Baseline: ${blMetrics}<br>`
              html += `Новая модель: ${newMetrics}`
              html += `</div>`
            }

            notification.innerHTML = html
            notification.classList.add("visible")
          }

          if (downloadLink) {
            downloadLink.href = `/download-model/${result.model_id}`
            downloadLink.download = `model_${result.model_id}.pkl`
          }
          if (downloadSection) downloadSection.classList.add("visible")
          if (favoriteBtn) favoriteBtn.classList.add("visible")

          runBtn.disabled = false
          runBtn.textContent = "Запустить обучение"
        }, 400)

      } catch (err) {
        if (loaderOverlay) loaderOverlay.classList.add("hidden")
        if (trainingResult) trainingResult.classList.remove("visible")
        runBtn.disabled = false
        runBtn.textContent = "Запустить обучение"
        alert(err.message || "Ошибка при обучении модели")
      }
    })
  }

  // ── Favorite ───────────────────────────────────────────────────────
  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", async () => {
      if (!lastTrainResult) return
      try {
        const resp = await fetch("/favorite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            model_id: lastTrainResult.model_id,
            task: lastTrainResult.task,
            model_key: getSelectedModel(),
            model_label: lastTrainResult.model_label,
            target: targetSelect?.value || "",
            metrics: lastTrainResult.metrics,
            features_used: lastTrainResult.features_used,
            filename: currentFile?.name || "",
          })
        })
        if (resp.status === 401) {
          alert("Войдите в личный кабинет, чтобы сохранять модели в избранное.")
          window.location.href = "/login?next=/manual-learning"
          return
        }
        const favData = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          const msg = typeof favData.detail === "string" ? favData.detail : "Ошибка сохранения"
          throw new Error(msg)
        }
        const fav = favData
        alert(`Модель добавлена в избранное (ID: ${fav.fav_id})`)
        favoriteBtn.textContent = "★ В избранном"
        favoriteBtn.style.background = "rgba(30,111,184,.10)"
      } catch (e) {
        alert(e.message || "Ошибка сохранения в избранное")
      }
    })
  }
})()
