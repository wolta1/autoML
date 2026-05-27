const canvas      = document.getElementById("pipelineCanvas")
const empty       = document.getElementById("emptyCanvas")
const svg         = document.getElementById("connections")

const configModal = document.getElementById("configModal")
const modalBody   = document.getElementById("modalBody")
const modalTitle  = document.getElementById("modalTitle")

const runModal    = document.getElementById("runModal")
const runLoader   = document.getElementById("runLoader")
const runResult   = document.getElementById("runResult")
const runStatus   = document.getElementById("runStatus")
const runTitle    = document.getElementById("runTitle")

const STATE = {
  nextId: 1,
  nodes: new Map(),
  connections: [],
  selectedId: null,
  drag: null,
  link: null,
  lastResult: null,
  authChecked: null,
}

const TYPE_LABEL = {
  dataset:    "Dataset",
  preprocess: "Preprocess",
  model:      "Model",
  evaluation: "Optuna",
}

const TYPE_BADGE = {
  dataset:    "dataset",
  preprocess: "preprocess",
  model:      "model",
  evaluation: "optuna",
}

const TYPE_MODAL_TITLE = {
  dataset:    "Dataset",
  preprocess: "Preprocess",
  model:      "Model",
  evaluation: "Optuna (подбор гиперпараметров)",
}

const DEFAULT_CONFIG = {
  dataset:    { fileName: "", target: "", columns: [], rows: 0 },
  preprocess: { scaling: "none", missing: "mean", encoding: "onehot",
                remove_full_dups: false, remove_id_dups: false },
  model:      { model_type: "linear" },
  evaluation: { hparam_mode: "auto", manual_params: {} },
}

const MODEL_LABELS = {
  linear:   "Линейная модель",
  trees:    "RandomForest",
  catboost: "Градиентный бустинг",
}


const SVG_NS = "http://www.w3.org/2000/svg"

function uid(){ return "n" + (STATE.nextId++) }

function deepClone(o){ return JSON.parse(JSON.stringify(o)) }

function refreshEmpty(){
  empty.style.display = STATE.nodes.size === 0 ? "" : "none"
}


document.querySelectorAll(".node-item").forEach(item => {
  item.addEventListener("dragstart", e => {
    e.dataTransfer.setData("type", item.dataset.type)
    e.dataTransfer.effectAllowed = "copy"
  })
})

canvas.addEventListener("dragover", e => {
  e.preventDefault()
  e.dataTransfer.dropEffect = "copy"
})

canvas.addEventListener("drop", e => {
  e.preventDefault()
  const type = e.dataTransfer.getData("type")
  if (!type) return
  const rect = canvas.getBoundingClientRect()
  createNode(type, e.clientX - rect.left - 90, e.clientY - rect.top - 24)
})

document.querySelectorAll("[data-empty-add]").forEach(box => {
  box.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect()
    const node = createNode("dataset", rect.width / 2 - 100, rect.height / 2 - 40)
    if (node) openConfig(node.id)
  })
})

document.getElementById("nodeSearch").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase()
  document.querySelectorAll("#nodeGroup .node-item").forEach(it => {
    const t = it.innerText.toLowerCase()
    it.style.display = t.includes(q) ? "" : "none"
  })
})


function createNode(type, x, y){
  if (!TYPE_LABEL[type]) return null

  const id = uid()
  const el = document.createElement("div")
  el.className = `pipeline-node node-type-${type}`
  el.dataset.id = id
  el.style.left = Math.max(0, x) + "px"
  el.style.top  = Math.max(0, y) + "px"

  el.innerHTML = `
    <div class="node-head">
      <div class="node-title"><span class="badge">${TYPE_BADGE[type] || type}</span><span class="title-text">${TYPE_LABEL[type]}</span></div>
    </div>
    <div class="node-body">
      <div class="node-subtitle">Нажмите для настройки</div>
    </div>
    <div class="node-port in"  data-port="in"></div>
    <div class="node-port out" data-port="out"></div>
  `
  canvas.appendChild(el)

  const node = {
    id, type, el,
    x, y,
    config: deepClone(DEFAULT_CONFIG[type]),
    file: null,
  }
  STATE.nodes.set(id, node)

  bindNodeEvents(node)
  refreshEmpty()
  return node
}

function deleteNode(id){
  const n = STATE.nodes.get(id)
  if (!n) return

  STATE.connections = STATE.connections.filter(c => {
    if (c.fromId === id || c.toId === id){
      c.pathEl?.remove()
      return false
    }
    return true
  })
  n.el.remove()
  STATE.nodes.delete(id)
  if (STATE.selectedId === id) STATE.selectedId = null
  refreshEmpty()
}

document.getElementById("clearBtn").onclick = () => {
  if (STATE.nodes.size === 0){
    window.showToast?.({
      type: "info",
      title: "Холст уже пуст",
      message: "Перетащите блоки из правой панели, чтобы начать сборку пайплайна.",
    })
    return
  }

  let confirmToast = null
  confirmToast = window.showToast?.({
    type: "warning",
    title: "Очистить холст?",
    message: "Все блоки и связи будут удалены без возможности восстановления.",
    duration: 0,
    action: {
      text: "Очистить",
      onClick: () => {
        confirmToast?.dismiss()
        Array.from(STATE.nodes.keys()).forEach(deleteNode)
        STATE.lastResult = null
        window.showToast?.({
          type: "success",
          title: "Холст очищен",
          message: "Можно начать сборку нового пайплайна.",
        })
      },
    },
  })
}


function bindNodeEvents(node){
  const head = node.el.querySelector(".node-head")
  const body = node.el.querySelector(".node-body")

  let dragStart = null
  let movedFar  = false

  function onMouseDown(e){
    if (e.button !== 0) return
    if (e.target.classList.contains("node-port")) return

    dragStart = { x: e.clientX, y: e.clientY, nx: node.x, ny: node.y }
    movedFar  = false

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup",   onMouseUp)
  }

  function onMouseMove(e){
    if (!dragStart) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    if (!movedFar && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) movedFar = true

    const nx = Math.max(0, dragStart.nx + dx)
    const ny = Math.max(0, dragStart.ny + dy)
    node.x = nx; node.y = ny
    node.el.style.left = nx + "px"
    node.el.style.top  = ny + "px"
    redrawConnectionsFor(node.id)
  }

  function onMouseUp(){
    document.removeEventListener("mousemove", onMouseMove)
    document.removeEventListener("mouseup",   onMouseUp)
    dragStart = null
  }

  head.addEventListener("mousedown", onMouseDown)
  body.addEventListener("mousedown", onMouseDown)

  node.el.addEventListener("click", e => {
    if (e.target.classList.contains("node-port")) return
    if (movedFar) { movedFar = false; return }
    openConfig(node.id)
  })

  const portIn  = node.el.querySelector(".node-port.in")
  const portOut = node.el.querySelector(".node-port.out")

  portOut.addEventListener("mousedown", e => {
    e.stopPropagation()
    e.preventDefault()
    startLinkDrag(node.id)
  })

  portIn.addEventListener("mouseenter", () => {
    if (STATE.link) portIn.classList.add("hovered")
  })
  portIn.addEventListener("mouseleave", () => portIn.classList.remove("hovered"))
}


function startLinkDrag(fromId){
  const tempPath = document.createElementNS(SVG_NS, "path")
  tempPath.setAttribute("class", "temp-link")
  svg.appendChild(tempPath)

  STATE.link = { fromId, tempPath }

  const fromPos = portCenter(fromId, "out")

  function onMove(e){
    const rect = canvas.getBoundingClientRect()
    const to = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    tempPath.setAttribute("d", bezier(fromPos, to))
  }

  function onUp(e){
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup",   onUp)
    tempPath.remove()

    const target = e.target
    if (target && target.classList.contains("node-port") && target.dataset.port === "in"){
      const targetNodeEl = target.closest(".pipeline-node")
      if (targetNodeEl){
        const toId = targetNodeEl.dataset.id
        if (toId !== fromId){
          addConnection(fromId, toId)
        }
      }
    }
    document.querySelectorAll(".node-port.hovered").forEach(p => p.classList.remove("hovered"))
    STATE.link = null
  }

  document.addEventListener("mousemove", onMove)
  document.addEventListener("mouseup",   onUp)
}

function addConnection(fromId, toId){
  if (STATE.connections.some(c => c.fromId === fromId && c.toId === toId)) return
  if (createsCycle(fromId, toId)) return

  const path = document.createElementNS(SVG_NS, "path")
  path.setAttribute("class", "connection")
  svg.appendChild(path)

  const conn = { fromId, toId, pathEl: path }

  path.addEventListener("dblclick", () => {
    path.remove()
    STATE.connections = STATE.connections.filter(c => c !== conn)
  })

  STATE.connections.push(conn)
  redrawConnection(conn)
}

function createsCycle(fromId, toId){
  const visited = new Set()
  const stack = [toId]
  while (stack.length){
    const cur = stack.pop()
    if (cur === fromId) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    STATE.connections.filter(c => c.fromId === cur).forEach(c => stack.push(c.toId))
  }
  return false
}

function portCenter(nodeId, side){
  const n = STATE.nodes.get(nodeId)
  if (!n) return { x: 0, y: 0 }
  const port = n.el.querySelector(`.node-port.${side}`)
  const cRect = canvas.getBoundingClientRect()
  const pRect = port.getBoundingClientRect()
  return {
    x: pRect.left - cRect.left + pRect.width / 2,
    y: pRect.top  - cRect.top  + pRect.height / 2,
  }
}

function bezier(a, b){
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x},${a.y} C ${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}

function redrawConnection(conn){
  const a = portCenter(conn.fromId, "out")
  const b = portCenter(conn.toId,   "in")
  conn.pathEl.setAttribute("d", bezier(a, b))
}

function redrawConnectionsFor(nodeId){
  STATE.connections.forEach(c => {
    if (c.fromId === nodeId || c.toId === nodeId) redrawConnection(c)
  })
}

function redrawAll(){
  STATE.connections.forEach(redrawConnection)
}

window.addEventListener("resize", redrawAll)

document.getElementById("closeModal").onclick = closeConfig
document.getElementById("deleteNode").onclick = () => {
  if (STATE.selectedId){
    deleteNode(STATE.selectedId)
    closeConfig()
  }
}
document.getElementById("saveConfig").onclick = saveConfig

function openConfig(id){
  const n = STATE.nodes.get(id)
  if (!n) return
  STATE.selectedId = id
  modalTitle.innerText = `Настройка: ${TYPE_MODAL_TITLE[n.type] || TYPE_LABEL[n.type]}`
  modalBody.innerHTML = ""

  if (n.type === "dataset")    renderDatasetConfig(n)
  if (n.type === "preprocess") renderPreprocessConfig(n)
  if (n.type === "model")      renderModelConfig(n)
  if (n.type === "evaluation") renderEvaluationConfig(n)

  configModal.classList.remove("hidden")
}

function closeConfig(){
  configModal.classList.add("hidden")
  STATE.selectedId = null
}


function renderDatasetConfig(n){
  const c = n.config
  modalBody.innerHTML = `
    <label class="dataset-drop" id="datasetDrop">
      ${c.fileName ? `Файл: <b>${c.fileName}</b><br><span class="dataset-info">${c.rows} строк · ${c.columns.length} колонок</span><br><span class="hint-text">Нажмите, чтобы выбрать другой</span>`
                   : `Перетащите CSV / XLSX сюда или нажмите`}
      <input type="file" hidden id="datasetFile" accept=".csv,.xlsx">
    </label>

    <label>Целевая переменная (target)</label>
    <select id="targetSelect" ${c.columns.length ? "" : "disabled"}>
      ${c.columns.length
        ? c.columns.map(col => `<option value="${col}" ${col === c.target ? "selected" : ""}>${col}</option>`).join("")
        : `<option>Загрузите файл, чтобы выбрать колонку</option>`}
    </select>
  `

  const drop = document.getElementById("datasetDrop")
  const inp  = document.getElementById("datasetFile")

  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover") })
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"))
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("dragover")
    if (e.dataTransfer.files[0]) handleDatasetFile(e.dataTransfer.files[0], n)
  })
  inp.onchange = e => {
    if (e.target.files[0]) handleDatasetFile(e.target.files[0], n)
  }
}

function handleDatasetFile(file, n){
  n.file = file
  n.config.fileName = file.name

  const apply = (rows, columns) => {
    n.config.columns = columns
    n.config.rows    = rows
    if (!columns.includes(n.config.target)) n.config.target = columns[0] || ""
    if (STATE.selectedId === n.id) renderDatasetConfig(n)
    updateNodeSubtitle(n)
  }

  if (/\.csv$/i.test(file.name)){
    Papa.parse(file, {
      header: true, skipEmptyLines: true, preview: 200,
      complete: res => {
        const cols = res.meta.fields || (res.data[0] ? Object.keys(res.data[0]) : [])
        apply(res.data.length, cols)
      },
    })
  } else if (/\.xlsx$/i.test(file.name)){
    const reader = new FileReader()
    reader.onload = e => {
      const wb    = XLSX.read(e.target.result, { type: "binary" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows  = XLSX.utils.sheet_to_json(sheet, { defval: null })
      const cols  = rows[0] ? Object.keys(rows[0]) : []
      apply(rows.length, cols)
    }
    reader.readAsBinaryString(file)
  } else {
    alert("Поддерживаются только CSV и XLSX")
  }
}


function renderPreprocessConfig(n){
  const c = n.config
  modalBody.innerHTML = `
    <label>Шкалирование</label>
    <select id="scaling">
      <option value="none"     ${c.scaling==="none"     ?"selected":""}>Нет</option>
      <option value="standard" ${c.scaling==="standard" ?"selected":""}>StandardScaler</option>
      <option value="minmax"   ${c.scaling==="minmax"   ?"selected":""}>MinMaxScaler</option>
      <option value="robust"   ${c.scaling==="robust"   ?"selected":""}>RobustScaler</option>
    </select>

    <label>Стратегия пропусков</label>
    <select id="missing">
      <option value="mean"   ${c.missing==="mean"  ?"selected":""}>Среднее (mean)</option>
      <option value="median" ${c.missing==="median"?"selected":""}>Медиана (median)</option>
      <option value="zero"   ${c.missing==="zero"  ?"selected":""}>Нулём</option>
      <option value="min"    ${c.missing==="min"   ?"selected":""}>Минимумом</option>
      <option value="max"    ${c.missing==="max"   ?"selected":""}>Максимумом</option>
    </select>

    <label>Кодирование категориальных</label>
    <select id="encoding">
      <option value="onehot"  ${c.encoding==="onehot" ?"selected":""}>OneHot</option>
      <option value="ordinal" ${c.encoding==="ordinal"?"selected":""}>Ordinal</option>
      <option value="target"  ${c.encoding==="target" ?"selected":""}>Target</option>
    </select>

    <label style="display:flex;align-items:center;gap:8px;margin-bottom:0;">
      <input type="checkbox" id="dupFull" ${c.remove_full_dups ? "checked" : ""}>
      Удалить полные дубли строк
    </label>

    <label style="display:flex;align-items:center;gap:8px;margin-bottom:0;">
      <input type="checkbox" id="dupId" ${c.remove_id_dups ? "checked" : ""}>
      Удалить дубли по ID-колонкам
    </label>
  `
}


function renderModelConfig(n){
  const c = n.config
  modalBody.innerHTML = `
    <label>Тип модели</label>
    <select id="modelType">
      <option value="linear"   ${c.model_type==="linear"  ?"selected":""}>Линейная (Logistic / Ridge)</option>
      <option value="trees"    ${c.model_type==="trees"   ?"selected":""}>RandomForest (дерево)</option>
      <option value="catboost" ${c.model_type==="catboost"?"selected":""}>GradientBoosting</option>
    </select>
    <p class="hint-text">
      Тип задачи (классификация / регрессия) определяется автоматически по целевой переменной.
    </p>
  `
}


function renderEvaluationConfig(n){
  const c = n.config
  const modelNode = findUpstream(n.id, "model")
  const modelType = modelNode?.config?.model_type || "linear"

  const mp = c.manual_params || {}

  let manualBlock = ""

  if (modelType === "linear"){
    manualBlock = `
      <div class="row-2">
        <div>
          <label>C</label>
          <input id="mp_C" type="number" step="0.01" value="${mp.C ?? 1.0}">
        </div>
        <div>
          <label>Penalty</label>
          <select id="mp_penalty">
            <option value="l2" ${mp.penalty==="l2"?"selected":""}>l2</option>
            <option value="l1" ${mp.penalty==="l1"?"selected":""}>l1</option>
          </select>
        </div>
      </div>
    `
  } else if (modelType === "trees"){
    manualBlock = `
      <div class="row-2">
        <div>
          <label>n_estimators</label>
          <input id="mp_n_est" type="number" min="10" step="10" value="${mp.n_estimators ?? 100}">
        </div>
        <div>
          <label>max_depth</label>
          <input id="mp_depth" type="number" min="1" step="1" value="${mp.max_depth ?? 10}">
        </div>
      </div>
    `
  } else {
    manualBlock = `
      <div class="row-2">
        <div>
          <label>learning_rate</label>
          <input id="mp_lr" type="number" min="0.001" step="0.01" value="${mp.learning_rate ?? 0.1}">
        </div>
        <div>
          <label>max_depth</label>
          <input id="mp_depth" type="number" min="1" step="1" value="${mp.max_depth ?? 6}">
        </div>
      </div>
      <div>
        <label>n_estimators</label>
        <input id="mp_n_est" type="number" min="10" step="10" value="${mp.n_estimators ?? 100}">
      </div>
    `
  }

  modalBody.innerHTML = `
    <label>Режим подбора</label>
    <select id="hparamMode">
      <option value="auto"   ${c.hparam_mode==="auto"  ?"selected":""}>Включить Optuna (автоматический подбор)</option>
      <option value="manual" ${c.hparam_mode==="manual"?"selected":""}>Указать гиперпараметры вручную</option>
    </select>

    <p class="hint-text" id="hpHint">
      ${c.hparam_mode === "auto"
        ? "Будут перебраны гиперпараметры с помощью байесовской оптимизации Optuna (≈ 20 испытаний)."
        : `Используются заданные ниже значения для модели <b>${MODEL_LABELS[modelType]}</b>. Поменять модель можно в блоке Model.`}
    </p>

    <div class="hparam-block" id="hparamBlock" style="${c.hparam_mode==="manual" ? "" : "display:none;"}">
      <div style="font-weight:700;font-size:13px;">Гиперпараметры (${MODEL_LABELS[modelType]})</div>
      ${manualBlock}
    </div>
  `

  document.getElementById("hparamMode").onchange = e => {
    const v = e.target.value
    document.getElementById("hparamBlock").style.display = v === "manual" ? "" : "none"
    document.getElementById("hpHint").innerHTML = v === "auto"
      ? "Будут перебраны гиперпараметры с помощью байесовской оптимизации Optuna (≈ 20 испытаний)."
      : `Используются заданные ниже значения для модели <b>${MODEL_LABELS[modelType]}</b>. Поменять модель можно в блоке Model.`
  }
}

function findUpstream(nodeId, type){
  const visited = new Set()
  const stack = [nodeId]
  while (stack.length){
    const cur = stack.pop()
    if (visited.has(cur)) continue
    visited.add(cur)
    const node = STATE.nodes.get(cur)
    if (node && node.id !== nodeId && node.type === type) return node
    STATE.connections.filter(c => c.toId === cur).forEach(c => stack.push(c.fromId))
  }
  for (const n of STATE.nodes.values()){
    if (n.type === type) return n
  }
  return null
}


function saveConfig(){
  if (!STATE.selectedId) return
  const n = STATE.nodes.get(STATE.selectedId)
  if (!n) return

  if (n.type === "dataset"){
    const sel = document.getElementById("targetSelect")
    if (sel && !sel.disabled) n.config.target = sel.value
  }

  if (n.type === "preprocess"){
    n.config.scaling          = document.getElementById("scaling").value
    n.config.missing          = document.getElementById("missing").value
    n.config.encoding         = document.getElementById("encoding").value
    n.config.remove_full_dups = document.getElementById("dupFull").checked
    n.config.remove_id_dups   = document.getElementById("dupId").checked
  }

  if (n.type === "model"){
    n.config.model_type = document.getElementById("modelType").value
  }

  if (n.type === "evaluation"){
    const mode = document.getElementById("hparamMode").value
    n.config.hparam_mode = mode
    const mp = {}
    if (mode === "manual"){
      const modelNode = findUpstream(n.id, "model")
      const mt = modelNode?.config?.model_type || "linear"
      if (mt === "linear"){
        mp.C       = parseFloat(document.getElementById("mp_C").value) || 1.0
        mp.penalty = document.getElementById("mp_penalty").value
      } else if (mt === "trees"){
        mp.n_estimators = parseInt(document.getElementById("mp_n_est").value) || 100
        mp.max_depth    = parseInt(document.getElementById("mp_depth").value) || 10
      } else {
        mp.learning_rate = parseFloat(document.getElementById("mp_lr").value) || 0.1
        mp.max_depth     = parseInt(document.getElementById("mp_depth").value) || 6
        mp.n_estimators  = parseInt(document.getElementById("mp_n_est").value) || 100
      }
    }
    n.config.manual_params = mp
  }

  updateNodeSubtitle(n)
  closeConfig()
}

function updateNodeSubtitle(n){
  const sub = n.el.querySelector(".node-subtitle")
  if (n.type === "dataset"){
    if (n.config.fileName){
      sub.innerHTML = `<b>${n.config.fileName}</b><br>${n.config.rows} строк · target: <b>${n.config.target || "—"}</b>`
    } else {
      sub.innerText = "Файл не выбран"
    }
  }
  if (n.type === "preprocess"){
    sub.innerText = `${n.config.scaling} · ${n.config.missing} · ${n.config.encoding}`
  }
  if (n.type === "model"){
    sub.innerText = MODEL_LABELS[n.config.model_type] || n.config.model_type
  }
  if (n.type === "evaluation"){
    sub.innerText = n.config.hparam_mode === "auto" ? "Автоподбор (Optuna)" : "Ручные гиперпараметры"
  }
}


const runBtn = document.getElementById("runBtn")
runBtn.onclick = runPipeline
document.getElementById("closeRunModal").onclick = () => {
  runModal.classList.add("hidden")
  if (!STATE.lastResult) clearStageHighlights()
}

const STAGES = [
  { id: "dataset",    label: "Загрузка данных и валидация" },
  { id: "preprocess", label: "Предобработка и сборка пайплайна" },
  { id: "model",      label: "Обучение модели" },
  { id: "evaluation", label: "Оценка качества и сохранение" },
]

let runProgress = null

function runPipeline(){
  if (runBtn.disabled) return

  const ds = nodeOf("dataset")
  const md = nodeOf("model")
  if (!ds){ return showRunError("Добавьте на холст блок <b>Dataset</b>.") }
  if (!ds.file){ return showRunError("В блоке <b>Dataset</b> не выбран файл данных.") }
  if (!ds.config.target){ return showRunError("В блоке <b>Dataset</b> не выбран target.") }
  if (!md){ return showRunError("Добавьте на холст блок <b>Model</b>.") }
  if (!isReachable(ds.id, md.id)){
    return showRunError("Соедините блок <b>Dataset</b> с блоком <b>Model</b> через линии.")
  }

  const pp = findUpstream(md.id, "preprocess") || nodeOf("preprocess")
  const ev = findUpstream(md.id, "evaluation") ||
             findDownstream(md.id, "evaluation") ||
             nodeOf("evaluation")

  const ppCfg = pp?.config || DEFAULT_CONFIG.preprocess
  const evCfg = ev?.config || { hparam_mode: "manual", manual_params: {} }

  const fd = new FormData()
  fd.append("file",             ds.file)
  fd.append("target",           ds.config.target)
  fd.append("missing_strategy", ppCfg.missing)
  fd.append("encoding_type",    ppCfg.encoding)
  fd.append("scaling_type",     ppCfg.scaling)
  fd.append("model_type",       md.config.model_type)
  fd.append("hparam_mode",      evCfg.hparam_mode)
  fd.append("remove_id_dups",   ppCfg.remove_id_dups   ? "true" : "false")
  fd.append("remove_full_dups", ppCfg.remove_full_dups ? "true" : "false")
  fd.append("outlier_rules",    "[]")
  fd.append("manual_params",    JSON.stringify(evCfg.manual_params || {}))
  fd.append("baseline_id",      "")

  runBtn.disabled = true
  STATE.lastResult = null
  showRunLoading(evCfg.hparam_mode === "auto")
  startStageProgress(evCfg.hparam_mode === "auto")

  fetch("/manual-train", { method: "POST", body: fd, credentials: "same-origin" })
    .then(async r => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(formatApiError(data))
      return data
    })
    .then(res => {
      finishStageProgress(() => showRunSuccess(res))
    })
    .catch(err => {
      stopStageProgress()
      showRunError(err.message || "Ошибка обучения")
    })
    .finally(() => {
      runBtn.disabled = false
    })
}

function startStageProgress(isAuto){
  stopStageProgress()
  runProgress = { idx: 0, timers: [] }
  setStage(0, isAuto)

  runProgress.timers.push(setTimeout(() => setStage(1, isAuto), 700))
  runProgress.timers.push(setTimeout(() => setStage(2, isAuto), 1500))
}

function finishStageProgress(done){
  stopStageProgress(true)
  setStage(2, false, true)
  setTimeout(() => {
    setStage(3, false)
    setTimeout(() => {
      setStage(4, false)
      done()
    }, 380)
  }, 220)
}

function stopStageProgress(keepHighlights){
  if (runProgress){
    runProgress.timers.forEach(clearTimeout)
    runProgress = null
  }
  if (!keepHighlights) clearStageHighlights()
}

function setStage(activeIdx, isAuto, modelDone){
  const list = document.getElementById("stageList")
  if (list){
    Array.from(list.children).forEach((el, i) => {
      el.classList.remove("active", "done")
      if (i < activeIdx || (i === 2 && modelDone)) el.classList.add("done")
      else if (i === activeIdx) el.classList.add("active")
    })
  }

  const status = document.getElementById("runStatus")
  if (status){
    if (activeIdx >= STAGES.length){
      status.innerText = "Готово"
    } else {
      const s = STAGES[activeIdx]
      let txt = s.label + "…"
      if (s.id === "model" && isAuto) txt = "Подбор гиперпараметров (Optuna) и обучение модели…"
      status.innerText = txt
    }
  }

  STAGES.forEach((s, i) => {
    const node = nodeOf(s.id)
    if (!node) return
    node.el.classList.remove("stage-running", "stage-done")
    if (i < activeIdx || (i === 2 && modelDone)) node.el.classList.add("stage-done")
    else if (i === activeIdx) node.el.classList.add("stage-running")
  })
}

function clearStageHighlights(){
  STATE.nodes.forEach(n => n.el.classList.remove("stage-running", "stage-done"))
}

function nodeOf(type){
  for (const n of STATE.nodes.values()){
    if (n.type === type) return n
  }
  return null
}

function isReachable(fromId, toId){
  const visited = new Set()
  const stack = [fromId]
  while (stack.length){
    const cur = stack.pop()
    if (cur === toId) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    STATE.connections.filter(c => c.fromId === cur).forEach(c => stack.push(c.toId))
  }
  return false
}

function findDownstream(nodeId, type){
  const visited = new Set()
  const stack = [nodeId]
  while (stack.length){
    const cur = stack.pop()
    if (visited.has(cur)) continue
    visited.add(cur)
    const node = STATE.nodes.get(cur)
    if (node && node.id !== nodeId && node.type === type) return node
    STATE.connections.filter(c => c.fromId === cur).forEach(c => stack.push(c.toId))
  }
  return null
}

function formatApiError(data){
  const d = data && data.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map(e => (e && (e.msg || e.message)) || JSON.stringify(e)).join("; ")
  if (d && typeof d === "object") return JSON.stringify(d)
  return "Ошибка запроса"
}


function showRunLoading(isAuto){
  runModal.classList.remove("hidden")
  runTitle.innerText = "Запуск пайплайна"
  runResult.classList.add("hidden")
  runResult.innerHTML = ""
  runLoader.classList.remove("hidden")

  const stagesHtml = STAGES.map(s => {
    const lbl = (s.id === "model" && isAuto)
      ? "Обучение модели (Optuna)"
      : s.label
    return `<div class="stage-item" data-stage="${s.id}"><span class="stage-icon"></span><span>${lbl}</span></div>`
  }).join("")

  runLoader.innerHTML = `
    <div class="spinner"></div>
    <div class="run-status" id="runStatus">Подготовка пайплайна…</div>
    <div class="stage-list" id="stageList">${stagesHtml}</div>
  `
}

function showRunError(html){
  runModal.classList.remove("hidden")
  runTitle.innerText = "Ошибка"
  runLoader.classList.add("hidden")
  runResult.classList.remove("hidden")
  runResult.innerHTML = `<div class="error-banner">${html}</div>`
}

function showRunSuccess(res){
  STATE.lastResult = res
  runTitle.innerText = "Модель обучена"
  runLoader.classList.add("hidden")
  runResult.classList.remove("hidden")

  const ds = nodeOf("dataset")
  const md = nodeOf("model")
  const taskRu = res.task === "classification" ? "классификация" : "регрессия"

  const metricCards = Object.entries(res.metrics || {}).map(([k, v]) =>
    `<div class="metric-card"><div class="lbl">${k}</div><div class="val">${v}</div></div>`
  ).join("")

  const paramsList = res.best_params && Object.keys(res.best_params).length
    ? `<p class="result-summary"><b>Гиперпараметры:</b> ${Object.entries(res.best_params).map(([k,v]) => `${k}=${v}`).join(", ")}</p>`
    : ""

  runResult.innerHTML = `
    <p class="result-summary">
      <b>Задача:</b> ${taskRu}<br>
      <b>Модель:</b> ${res.model_label || md?.config?.model_type} (${res.model_class})<br>
      <b>Target:</b> ${ds?.config?.target || "—"}<br>
      <b>ID модели:</b> <code>${res.model_id}</code>
    </p>

    <div class="metrics-grid">${metricCards}</div>

    ${paramsList}

    <div class="result-actions">
      <a class="btn primary" href="/download-model/${res.model_id}">Скачать модель (.pkl)</a>
      <a class="btn" href="/download-steps/${res.model_id}">Шаги пайплайна (JSON)</a>
      <button class="btn primary" id="favBtn">В избранное</button>
    </div>
  `

  document.getElementById("favBtn").onclick = saveToFavorites
}

async function saveToFavorites(){
  const res = STATE.lastResult
  if (!res) return
  const ds = nodeOf("dataset")
  const md = nodeOf("model")
  const btn = document.getElementById("favBtn")

  btn.disabled = true

  const payload = {
    model_id:      res.model_id,
    task:          res.task,
    model_key:     md?.config?.model_type || "linear",
    model_label:   res.model_label || MODEL_LABELS[md?.config?.model_type] || "Модель",
    target:        ds?.config?.target || "",
    metrics:       res.metrics || {},
    features_used: res.features_used || [],
    filename:      ds?.file?.name || ds?.config?.fileName || "",
  }

  try{
    const r = await fetch("/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
    if (r.status === 401){
      window.showToast?.({
        type: "info",
        title: "Требуется вход",
        message: "Войдите в личный кабинет, чтобы сохранять модели в избранное.",
        action: { text: "Войти", href: "/login?next=/constructor" },
      })
      return
    }
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(formatApiError(data))
    window.showToast?.({
      type: "success",
      title: "Модель добавлена в избранное",
      message: "Вы можете найти её в личном кабинете и при необходимости скачать или удалить.",
      action: { text: "Перейти", href: "/profile" },
    })
    btn.textContent = "★ В избранном"
  } catch (e){
    window.showToast?.({
      type: "error",
      title: "Не удалось сохранить",
      message: e.message || "Ошибка сохранения в избранное",
    })
  } finally {
    btn.disabled = false
  }
}

refreshEmpty()
