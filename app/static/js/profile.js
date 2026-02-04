(function() {
// Модальное окно редактирования
const openEditModalBtn = document.getElementById('openEditModal');
const editModalOverlay = document.getElementById('editModalOverlay');
const closeEditModalBtn = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEdit');

function openEditModal() {
  editModalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  editModalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

openEditModalBtn.addEventListener('click', openEditModal);
closeEditModalBtn.addEventListener('click', closeEditModal);
cancelEditBtn.addEventListener('click', closeEditModal);

// Закрытие модалки по клику вне окна
editModalOverlay.addEventListener('click', function(e) {
  if (e.target === editModalOverlay) {
    closeEditModal();
  }
});

// Сохранение профиля
const saveProfileBtn = document.getElementById('saveProfile');
saveProfileBtn.addEventListener('click', function() {
  const name = document.querySelector('.form-input').value;
  alert(`✅ Профиль успешно обновлён!\nИмя: ${name}`);
  closeEditModal();
});

// Быстрые настройки
const settingCards = document.querySelectorAll('.setting-card');
settingCards.forEach(card => {
  card.addEventListener('click', function() {
    const setting = this.getAttribute('data-setting');
    if (setting === 'profile') {
      openEditModal();
    } else if (setting === 'delete') {
      if (confirm('⚠️ Это действие необратимо!\nВсе ваши данные, модели и проекты будут удалены.\nВы уверены?')) {
        if (prompt('Для подтверждения введите "DELETE"') === 'DELETE') {
          alert('🗑️ Аккаунт будет удалён. Спасибо за использование платформы!');
        }
      }
    } else {
      alert(`Открытие раздела "${setting}"...`);
    }
  });
});

// Кнопки действий с моделями
const deleteButtons = document.querySelectorAll('.model-action-btn.delete');
deleteButtons.forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const modelCard = this.closest('.model-card');
    const modelName = modelCard.querySelector('.model-title').textContent;
    
    if (confirm(`Вы уверены, что хотите удалить модель "${modelName}"?`)) {
      modelCard.style.opacity = '0';
      setTimeout(() => {
        modelCard.remove();
      }, 300);
    }
  });
});

// Кнопки скачивания
const downloadButtons = document.querySelectorAll('.model-action-btn:nth-child(2)');
downloadButtons.forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const modelCard = this.closest('.model-card');
    const modelName = modelCard.querySelector('.model-title').textContent;
    alert(`Скачивание модели "${modelName}" начато...`);
  });
});

// Кнопки просмотра метрик
const metricsButtons = document.querySelectorAll('.model-action-btn:first-child');
metricsButtons.forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const modelCard = this.closest('.model-card');
    const modelName = modelCard.querySelector('.model-title').textContent;
    alert(`Открытие детальных метрик для модели "${modelName}"...`);
  });
});

// Завершение всех сессий
const endSessionsBtn = document.querySelector('.security-item + .btn');
if (endSessionsBtn) {
  endSessionsBtn.addEventListener('click', function() {
    if (confirm('Вы уверены, что хотите завершить все активные сессии?')) {
      alert('✅ Все сессии завершены. Вам нужно будет войти снова.');
    }
  });
}

// Инициализация
console.log('Profile page loaded');
})();