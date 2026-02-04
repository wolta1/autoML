(function() {
// Таблица / info / describe / isna / dup
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    tabButtons.forEach(b => b.classList.toggle("active", b === btn));
    tabPanes.forEach(p => {
      p.classList.toggle("hidden", p.getAttribute("data-tab-content") !== tab);
      p.classList.toggle("active", p.getAttribute("data-tab-content") === tab);
    });
  });
});

// Описание кодирования
const encodingSelect = document.getElementById("encodingType");
const encodingDesc = document.getElementById("encodingDesc");
function updateEncodingDesc() {
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
encodingSelect.addEventListener("change", updateEncodingDesc);
updateEncodingDesc();

// Описание шкалирования
const scalingSelect = document.getElementById("scalingType");
const scalingDesc = document.getElementById("scalingDesc");
function updateScalingDesc() {
  const v = scalingSelect.value;
  if (v === "none") {
    scalingDesc.textContent =
      "Без шкалирования — ок для деревьев и бустингов. Линейные модели и kNN могут страдать от разных масштабов признаков.";
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
scalingSelect.addEventListener("change", updateScalingDesc);
updateScalingDesc();

// Выбор модели
const modelCards = document.querySelectorAll(".model-card");
const paramsBlocks = {
  linear: document.getElementById("params-linear"),
  trees: document.getElementById("params-trees"),
  catboost: document.getElementById("params-catboost"),
};
let currentModel = "linear";
function setModel(model) {
  currentModel = model;
  modelCards.forEach(card => {
    const m = card.getAttribute("data-model");
    card.classList.toggle("active", m === model);
  });
  Object.keys(paramsBlocks).forEach(m => {
    paramsBlocks[m].classList.toggle("visible", m === model);
  });
}
modelCards.forEach(card => {
  card.addEventListener("click", () => {
    const m = card.getAttribute("data-model");
    setModel(m);
  });
});

// Режим гиперпараметров: авто / ручной
const manualToggle = document.getElementById("manualToggle");
const modeAutoPill = document.getElementById("modeAutoPill");
function updateManualMode() {
  const manual = manualToggle.checked;
  modeAutoPill.textContent = manual ? "Auto + manual hints" : "Auto search";
  // В реальном интерфейсе здесь можно отключать input'ы при Auto
  const allInputs = document.querySelectorAll(
    "#params-linear input, #params-linear select, #params-trees input, #params-trees select, #params-catboost input, #params-catboost select"
  );
  allInputs.forEach(el => {
    el.disabled = !manual;
    el.style.opacity = manual ? "1" : "0.6";
  });
}
manualToggle.addEventListener("change", updateManualMode);
updateManualMode();

// Лоадер при запуске пайплайна
const runBtn = document.getElementById("runPipelineBtn");
const loaderOverlay = document.getElementById("loaderOverlay");
runBtn.addEventListener("click", () => {
  runBtn.disabled = true;
  runBtn.textContent = "Запуск…";
  loaderOverlay.classList.remove("hidden");
  setTimeout(() => {
    loaderOverlay.classList.add("hidden");
    runBtn.disabled = false;
    runBtn.textContent = "Запустить обучение";
    // Здесь можно перейти назад к основной странице / показать уведомление
    alert("Мок: пайплайн предобработки и обучения успешно отработал.");
  }, 2200 + Math.random() * 900);
});
})();