const canvas = document.getElementById("pipelineCanvas")
const empty = document.getElementById("emptyCanvas")
const svg = document.getElementById("connections")

let nodeCounter = 0
let nodes = []

// ===== CREATE NODE =====

function createNode(type, x, y){

empty.style.display = "none"

const node = document.createElement("div")
node.className = "pipeline-node"
node.style.left = x+"px"
node.style.top = y+"px"

node.innerHTML = `
<div class="node-title">${type}</div>
<div class="node-port in"></div>
<div class="node-port out"></div>
`

canvas.appendChild(node)

makeDraggable(node)

nodes.push(node)
}

// ===== DRAG SIDEBAR NODES =====

document.querySelectorAll(".node-item").forEach(item=>{
item.addEventListener("dragstart", e=>{
e.dataTransfer.setData("type", item.dataset.type)
})
})

canvas.addEventListener("dragover", e=>e.preventDefault())

canvas.addEventListener("drop", e=>{
const type = e.dataTransfer.getData("type")
createNode(type, e.offsetX, e.offsetY)
})

// ===== ADD FIRST STEP BUTTON =====

document.getElementById("addStepBtn").onclick = ()=>{
createNode("Dataset", 300, 200)
}

// ===== DRAG NODE =====

function makeDraggable(el){

let offsetX, offsetY

el.addEventListener("mousedown", e=>{

offsetX = e.offsetX
offsetY = e.offsetY

function move(e){
el.style.left = (e.pageX - canvas.offsetLeft - offsetX)+"px"
el.style.top = (e.pageY - canvas.offsetTop - offsetY)+"px"
drawConnections()
}

function up(){
document.removeEventListener("mousemove", move)
document.removeEventListener("mouseup", up)
}

document.addEventListener("mousemove", move)
document.addEventListener("mouseup", up)

})
}

// ===== CONNECTIONS (простые линии) =====

function drawConnections(){

svg.innerHTML = ""

for(let i=0;i<nodes.length-1;i++){

const a = nodes[i]
const b = nodes[i+1]

const rectA = a.getBoundingClientRect()
const rectB = b.getBoundingClientRect()
const rectCanvas = canvas.getBoundingClientRect()

const x1 = rectA.right - rectCanvas.left
const y1 = rectA.top + rectA.height/2 - rectCanvas.top

const x2 = rectB.left - rectCanvas.left
const y2 = rectB.top + rectB.height/2 - rectCanvas.top

const path = document.createElementNS("http://www.w3.org/2000/svg","path")

path.setAttribute("d",`M ${x1} ${y1} C ${x1+80} ${y1}, ${x2-80} ${y2}, ${x2} ${y2}`)
path.setAttribute("stroke","#1e6fb8")
path.setAttribute("fill","none")
path.setAttribute("stroke-width","2")

svg.appendChild(path)
}

}
