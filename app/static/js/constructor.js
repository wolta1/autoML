const canvas = document.getElementById("pipelineCanvas")
const empty = document.getElementById("emptyCanvas")

const modal = document.getElementById("configModal")
const modalBody = document.getElementById("modalBody")
const modalTitle = document.getElementById("modalTitle")

let nodes = []
let selectedNode = null

// ================= NODE CREATE =================

function createNode(type,x,y){

empty.style.display = "none"

const node = document.createElement("div")
node.className = "pipeline-node"
node.dataset.type = type
node.dataset.config = JSON.stringify({})
node.dataset.data = ""

node.style.left = x+"px"
node.style.top = y+"px"

node.innerHTML = `
<div class="node-title">${type}</div>
<div class="node-subtitle">Click to configure</div>
<div class="node-port in"></div>
<div class="node-port out"></div>
`

canvas.appendChild(node)

makeDraggable(node)

node.onclick = ()=> openConfig(node)

nodes.push(node)
}

// ================= DRAG FROM SIDEBAR =================

document.querySelectorAll(".node-item").forEach(item=>{
item.addEventListener("dragstart",e=>{
e.dataTransfer.setData("type",item.dataset.type)
})
})

canvas.addEventListener("dragover",e=>e.preventDefault())

canvas.addEventListener("drop",e=>{
createNode(e.dataTransfer.getData("type"),e.offsetX,e.offsetY)
})

// ================= OPEN CONFIG =================

function openConfig(node){

selectedNode = node
modal.classList.remove("hidden")

const type = node.dataset.type
modalBody.innerHTML = ""

if(type === "dataset") renderDatasetConfig()
if(type === "preprocess") renderPreprocessConfig()
if(type === "model") renderModelConfig()

modalTitle.innerText = "Настройка: " + type
}

// ================= DATASET CONFIG =================

function renderDatasetConfig(){

modalBody.innerHTML = `
<label class="dataset-drop" id="datasetDrop">
Перетащите CSV / XLSX сюда или нажмите
<input type="file" hidden id="datasetFile" accept=".csv,.xlsx">
</label>
<p id="datasetName">Файл не выбран</p>
`

const drop = document.getElementById("datasetDrop")
const input = document.getElementById("datasetFile")

drop.onclick = ()=> input.click()

drop.addEventListener("dragover", e=>{
e.preventDefault()
drop.style.background="#f3f6ff"
})

drop.addEventListener("dragleave", ()=>{
drop.style.background=""
})

drop.addEventListener("drop", e=>{
e.preventDefault()
handleFile(e.dataTransfer.files[0])
})

input.onchange = e=>{
handleFile(e.target.files[0])
}

}

// ================= FILE PARSE =================

function handleFile(file){

if(!file) return

document.getElementById("datasetName").innerText = file.name

if(file.name.endsWith(".csv")){

Papa.parse(file,{
header:true,
skipEmptyLines:true,
complete:(result)=>{
saveDataset(result.data,file.name)
}
})

}

else if(file.name.endsWith(".xlsx")){

const reader = new FileReader()

reader.onload = e=>{
const workbook = XLSX.read(e.target.result,{type:"binary"})
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const data = XLSX.utils.sheet_to_json(sheet)
saveDataset(data,file.name)
}

reader.readAsBinaryString(file)
}

}

// ================= SAVE DATASET =================

function saveDataset(data,name){

selectedNode.dataset.data = JSON.stringify(data)

selectedNode.dataset.config = JSON.stringify({
file:name,
rows:data.length,
columns:Object.keys(data[0] || {}).length
})

selectedNode.querySelector(".node-subtitle").innerText =
`${name} (${data.length} rows)`
}

// ================= PREPROCESS CONFIG =================

function renderPreprocessConfig(){

modalBody.innerHTML = `
<label>Scaling</label>
<select id="scaling">
<option>None</option>
<option>StandardScaler</option>
<option>MinMaxScaler</option>
<option>RobustScaler</option>
</select>

<label>Missing Values</label>
<select id="missing">
<option>Drop</option>
<option>Mean</option>
<option>Median</option>
<option>Zero</option>
</select>

<label>Encoding</label>
<select id="encoding">
<option>None</option>
<option>OneHotEncoder</option>
<option>LabelEncoder</option>
<option>TargetEncoder</option>
<option>OrdinalEncoder</option>
</select>
`
}

// ================= MODEL CONFIG =================

function renderModelConfig(){

modalBody.innerHTML = `
<label>Модель</label>

<select id="modelType">
<option>RandomForest</option>
<option>XGBoost</option>
<option>SVM</option>
<option>LogisticRegression</option>
<option>CatBoost</option>
</select>
`
}

// ================= SAVE CONFIG =================

document.getElementById("saveConfig").onclick = ()=>{

if(!selectedNode) return

const type = selectedNode.dataset.type
let config = {}

if(type === "preprocess"){

config.scaling =
document.getElementById("scaling").value

config.missing =
document.getElementById("missing").value

config.encoding =
document.getElementById("encoding").value
}

if(type === "model"){
config.model =
document.getElementById("modelType").value
}

selectedNode.dataset.config = JSON.stringify(config)

selectedNode.querySelector(".node-subtitle").innerText =
Object.values(config).join(" | ")

closeModal()
}

// ================= CLOSE MODAL =================

function closeModal(){
modal.classList.add("hidden")
selectedNode = null
}

document.getElementById("closeModal").onclick = closeModal

// ================= DRAG NODE =================

function makeDraggable(el){

let offsetX,offsetY

el.addEventListener("mousedown",e=>{

offsetX = e.offsetX
offsetY = e.offsetY

function move(e){
el.style.left =
(e.pageX - canvas.offsetLeft - offsetX)+"px"

el.style.top =
(e.pageY - canvas.offsetTop - offsetY)+"px"
}

function up(){
document.removeEventListener("mousemove",move)
document.removeEventListener("mouseup",up)
}

document.addEventListener("mousemove",move)
document.addEventListener("mouseup",up)

})
}
