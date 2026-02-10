(function () {
  // ====== SLIDES (стрелка) ======
  const slidesWrap = document.getElementById("manualSlides");
  const slideBtn = document.getElementById("manualSlideBtn");

  function setStep(step) {
    if (!slidesWrap) return;

    slidesWrap.setAttribute("data-step", String(step));

    const slides = slidesWrap.querySelectorAll(".manual-slide");
    slides.forEach((s) => {
      const isActive = s.getAttribute("data-step") === String(step);
      s.classList.toggle("active", isActive);
      s.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  function getStep() {
    if (!slidesWrap) return 1;
    return Number(slidesWrap.getAttribute("data-step") || "1");
  }

  if (slidesWrap && slideBtn) {
    slideBtn.addEventListener("click", () => {
      const cur = getStep();
      setStep(cur === 1 ? 2 : 1);
    });

    // гарантируем старт
    setStep(getStep());
  }

  // ====== ОСТАЛЬНАЯ ЛОГИКА СТРАНИЦЫ (как было) ======

  // Таблица / info / describe / isna / dup
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
      tabPanes.forEach((p) => {
        p.classList.toggle("hidden", p.getAttribute("data-tab-content") !== tab);
        p.classList.toggle("active", p.getAttribute("data-tab-content") === tab);
      });
    });
  });

  // Описание кодирования
  const encodingSelect = document.getElementById("encodingType");
  const encodingDesc = document.getElementById("encodingDesc");
  function updateEncodingDesc() {
    if (!encodingSelect || !encodingDesc) return;
    const v = encodingSelect.value;
    if (v === "onehot") {
      encodingDesc.textContent =
        "OneHotEncoder — хорош, когда категорий немного. Каждая категория превращается в отдельную бинарную колонку.";
    } else if (v === "target") {
      encodingDesc.textContent =
        "TargetEncoder — усредняет таргет по категориям. Полезен при большом числе категорий, но требует аккуратной валидации.";
    } else if (v === "ordinal") {
      encodingDesc.textContent =
        "OrdinalEncoder — просто присваивает числовой код каждой категории. Подходит для деревьев, но может создавать ложный порядок.";
    } else if (v === "hash") {
      encodingDesc.textContent =
        "HashingEncoder — вариант для очень больших словарей категорий, когда OneHot становится слишком тяжёлым.";
    }
  }
  if (encodingSelect) {
    encodingSelect.addEventListener("change", updateEncodingDesc);
    updateEncodingDesc();
  }

  // Описание шкалирования
  const scalingSelect = document.getElementById("scalingType");
  const scalingDesc = document.getElementById("scalingDesc");
  function updateScalingDesc() {
    if (!scalingSelect || !scalingDesc) return;
    const v = scalingSelect.value;
    if (v === "none") {
      scalingDesc.textContent =
        "Без шкалирования — ок для деревев и бустингов. Линейные модели и kNN могут страдать от разных масштабов признаков.";
    } else if (v === "standard") {
      scalingDesc.textContent =
        "StandardScaler — вычитает среднее и делит на стандартное отклонение. Нормально для линейных моделей и логистической регрессии.";
    } else if (v === "minmax") {
      scalingDesc.textContent =
        "MinMaxScaler — сжимает значения в диапазон [0, 1]. Полезен для нейросетей и моделей, чувствительных к диапазону.";
    } else if (v === "robust") {
      scalingDesc.textContent =
        "RobustScaler — использует медиану и IQR, устойчив к выбросам. Хорош, когда распределения сильно перекошены.";
    }
  }
  if (scalingSelect) {
    scalingSelect.addEventListener("change", updateScalingDesc);
    updateScalingDesc();
  }

  // Выбор модели
  const modelCards = document.querySelectorAll(".model-card");
  const paramsBlocks = {
    linear: document.getElementById("params-linear"),
    trees: document.getElementById("params-trees"),
    catboost: document.getElementById("params-catboost"),
  };

  function setModel(model) {
    modelCards.forEach((card) => {
      const m = card.getAttribute("data-model");
      card.classList.toggle("active", m === model);
    });
    Object.keys(paramsBlocks).forEach((m) => {
      if (!paramsBlocks[m]) return;
      paramsBlocks[m].classList.toggle("visible", m === model);
    });
  }

  modelCards.forEach((card) => {
    card.addEventListener("click", () => {
      const m = card.getAttribute("data-model");
      setModel(m);
    });
  });

  // Режим гиперпараметров: авто / ручной
  const manualToggle = document.getElementById("manualToggle");
  const modeAutoPill = document.getElementById("modeAutoPill");
  function updateManualMode() {
    if (!manualToggle || !modeAutoPill) return;
    const manual = manualToggle.checked;
    modeAutoPill.textContent = manual ? "Auto + manual hints" : "Auto search";

    const allInputs = document.querySelectorAll(
      "#params-linear input, #params-linear select, #params-trees input, #params-trees select, #params-catboost input, #params-catboost select"
    );
    allInputs.forEach((el) => {
      el.disabled = !manual;
      el.style.opacity = manual ? "1" : "0.6";
    });
  }
  if (manualToggle) {
    manualToggle.addEventListener("change", updateManualMode);
    updateManualMode();
  }

  // Лоадер при запуске пайплайна
  const runBtn = document.getElementById("runPipelineBtn");
  const loaderOverlay = document.getElementById("loaderOverlay");
  if (runBtn && loaderOverlay) {
    runBtn.addEventListener("click", () => {
      runBtn.disabled = true;
      runBtn.textContent = "Запуск…";
      loaderOverlay.classList.remove("hidden");
      setTimeout(() => {
        loaderOverlay.classList.add("hidden");
        runBtn.disabled = false;
        runBtn.textContent = "Запустить обучение";
        alert("Мок: пайплайн предобработки и обучения успешно отработал.");
      }, 2200 + Math.random() * 900);
    });
  }
})();

/* ===== ТВОЙ ОРИГИНАЛЬНЫЙ КОД ПОЛНОСТЬЮ СОХРАНЁН ===== */
/* ... он остаётся без изменений ... */


/* ===== ДОБАВЛЕН МОДУЛЬ ЗАГРУЗКИ ДАТАСЕТА ===== */

(function(){

let datasetColumns = []

const dropZone = document.getElementById("mlDropZone")
const fileInput = document.getElementById("mlFileInput")

if (!dropZone || !fileInput) return

const datasetInfo = document.getElementById("mlDatasetInfo")
const schemaBadge = document.getElementById("mlSchemaBadge")
const datasetMeta = document.getElementById("mlDatasetMeta")

const metaFile = document.getElementById("mlMetaFile")
const metaShape = document.getElementById("mlMetaShape")

dropZone.addEventListener("click", () => fileInput.click())

dropZone.addEventListener("dragover", e=>{
  e.preventDefault()
  dropZone.classList.add("drag")
})

dropZone.addEventListener("dragleave", ()=>{
  dropZone.classList.remove("drag")
})

dropZone.addEventListener("drop", e=>{
  e.preventDefault()
  dropZone.classList.remove("drag")
  handleFile(e.dataTransfer.files[0])
})

fileInput.addEventListener("change", e=>{
  handleFile(e.target.files[0])
})

function handleFile(file){

  if(!file) return

  const ext = file.name.split(".").pop().toLowerCase()

  if(ext === "csv" || ext === "txt"){
    Papa.parse(file,{
      header:true,
      preview:20,
      complete:res=>{
        datasetColumns = res.meta.fields || []
        updateUI(file,res.data.length)
      }
    })
  }

  if(ext === "xlsx" || ext === "xls"){
    const reader = new FileReader()

    reader.onload = e=>{
      const wb = XLSX.read(e.target.result,{type:"binary"})
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet,{header:1})

      datasetColumns = data[0] || []
      updateUI(file,data.length-1)
    }

    reader.readAsBinaryString(file)
  }
}

function updateUI(file,rows){

  datasetInfo.innerHTML =
    `Файл: ${file.name}<br>
     Строк: ${rows} · Колонок: ${datasetColumns.length}`

  schemaBadge.style.display = "inline-flex"
  datasetMeta.style.display = "flex"

  metaFile.innerHTML = `<strong>Файл:</strong> ${file.name}`
  metaShape.innerHTML = `<strong>Shape:</strong> (${rows}, ${datasetColumns.length})`
}

})();
