// Конфигурация Parse
Parse.initialize(
    "gnAJvSu6vtwIe6b7URaorh9AcoxlnPwIRu67fH3Y", // App ID (твой)
    "PHWwE8p5dTupZpzOajRrA7CG8aBcYosU2EUSUEmI"  // JavaScript Key
);
Parse.serverURL = "https://parseapi.back4app.com/";

// Глобальные переменные
let currentUser = null;
let currentSession = null;
let messagesQuery = null;
let deviceInfoInterval = null;
let focusInterval = null;

// DOM элементы
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('loginBtn');
const backBtn = document.getElementById('backBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesDiv = document.getElementById('messages');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPanel = document.getElementById('emojiPanel');
const infoBtn = document.getElementById('infoBtn');
const clearBtn = document.getElementById('clearBtn');
const adminPanel = document.getElementById('adminPanel');
const closePanel = document.getElementById('closePanel');
const userInfoDiv = document.getElementById('userInfo');
const chatSubtitle = document.getElementById('chatSubtitle');
const onlineStatus = document.getElementById('onlineStatus');
const infoModal = document.getElementById('infoModal');
const secretInfo = document.getElementById('secretInfo');
const connectionStatus = document.getElementById('connectionStatus');

// Сбор информации об устройстве
function collectDeviceInfo() {
    return {
        screen: `${window.screen.width}x${window.screen.height}`,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
        platform: navigator.platform,
        language: navigator.language,
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookies: navigator.cookieEnabled,
        java: navigator.javaEnabled ? navigator.javaEnabled() : false,
        pdf: navigator.pdfViewerEnabled || false,
        online: navigator.onLine,
        battery: navigator.getBattery ? 'Доступно' : 'Не доступно',
        memory: navigator.deviceMemory || 'Неизвестно',
        cores: navigator.hardwareConcurrency || 'Неизвестно',
        focused: document.hasFocus(),
        visibility: document.visibilityState,
        url: window.location.href,
        referrer: document.referrer || 'Прямой заход',
        timestamp: new Date().toISOString()
    };
}

// Вход в систему
async function login() {
    const username = usernameInput.value.trim();

    if (!username) {
        showNotification('Введите имя', 'error');
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const result = await Parse.Cloud.run('login', {
            username: username,
            deviceInfo: { screen: `${window.screen.width}x${window.screen.height}` }
        });

        // Проверяем если Cloud Code вернул ошибку
        if (result && typeof result.error !== 'undefined') {
            showNotification('Введите НАСТОЯЩЕЕ имя', 'error');
            return;
        }

        // Проверяем что есть userId (успешный логин)
        if (!result.userId) {
            showNotification('', 'error');
            return;
        }

        currentUser = {
            id: result.userId,
            type: result.userType,
            username: username
        };

        // Показываем разные интерфейсы
        if (currentUser.type === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'flex';
            });
            chatSubtitle.innerHTML = 'M';
        } else {
            chatSubtitle.innerHTML = '3Dreams';
        }

        // Переключаем экраны
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');

        // Загружаем сообщения
        loadMessages();

        // Запускаем пулинг сообщений
        startPolling();

        // Обновляем статус
        updateOnlineStatus();

        // Стартуем обновление информации об устройстве
        startDeviceInfoUpdates();
        startFocusTracking();

    } catch (error) {
        // Ошибка сети или Parse
        showNotification(' ', 'error');
        console.error('Login error:', error);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
    }
}

// Загрузка сообщений
async function loadMessages() {
    try {
        const messages = await Parse.Cloud.run('getMessages');
        messagesDiv.innerHTML = '';

        // ИСПРАВЛЯЕМ: сортируем по времени (старые сверху, новые снизу)
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        messages.forEach(msg => {
            addMessageToUI(msg);
        });

        scrollToBottom();
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Настройка Live Query
let pollingInterval = null;
let lastUpdateTime = null;

function startPolling() {
    // Останавливаем предыдущий пулинг если есть
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    // Запускаем пулинг каждые 2 секунды
    pollingInterval = setInterval(async () => {
        await checkNewMessages();
    }, 3400);
}

async function checkNewMessages() {
    try {
        const messages = await Parse.Cloud.run('getMessages');

        if (messages.length === 0) return;

        // Находим последнее сообщение в UI
        const lastMessageId = getLastMessageId();

        // Ищем новые сообщения
        const lastMessageIndex = messages.findIndex(msg => msg.id === lastMessageId);
        const newMessages = lastMessageIndex === -1
            ? messages
            : messages.slice(lastMessageIndex + 1);

        // Добавляем новые сообщения
        newMessages.forEach(msg => {
            if (!document.getElementById(`msg-${msg.id}`)) {
                addMessageToUI(msg);
            }
        });

        // Прокручиваем вниз если есть новые сообщения
        if (newMessages.length > 0) {
            scrollToBottom();

            // Воспроизводим звук для новых сообщений от другого пользователя
            if (currentUser && newMessages.some(msg => msg.user !== currentUser.username)) {
                playNotificationSound();
            }
        }

    } catch (error) {
        console.error('Error polling messages:', error);
    }
}

function getLastMessageId() {
    const messages = document.querySelectorAll('.message:not(.system)');
    if (messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    return lastMsg.id ? lastMsg.id.replace('msg-', '') : null;
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// Добавление сообщения в UI
function addMessageToUI(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.userType}`;
    messageDiv.id = `msg-${msg.id}`;

    const isCurrentUser = msg.user === (currentUser?.username || '');
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-sender" style="color: ${msg.color}">
                ${msg.userType === 'admin' ? '3Dreams' : 'M'}
            </div>
            <div class="message-time">${time}</div>
        </div>
        <div class="message-text">${formatMessage(msg.text)}</div>
    `;

    messagesDiv.appendChild(messageDiv);
}

// Отправка сообщения
async function sendMessage() {
    const text = messageInput.value.trim();

    if (!text || !currentUser) return;

    try {
        messageInput.disabled = true;
        sendBtn.disabled = true;

        await Parse.Cloud.run('sendMessage', {
            userId: currentUser.id,
            text: text
        });

        messageInput.value = '';
        messageInput.focus();

    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Ошибка отправки', 'error');
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
    }
}

// Форматирование сообщения (эмодзи, ссылки)
function formatMessage(text) {
    // Простая замена смайликов
    const emojiMap = {
        ':)': '😊',
        ':(': '😔',
        ':D': '😃',
        ';)': '😉',
        ':P': '😛',
        '<3': '❤️',
        '</3': '💔',
        ':heart:': '❤️',
        ':fire:': '🔥',
        ':crown:': '👑',
        ':star:': '⭐',
        ':sparkles:': '✨'
    };

    let formatted = text;
    Object.keys(emojiMap).forEach(key => {
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        formatted = formatted.replace(regex, emojiMap[key]);
    });

    // Обработка реальных эмодзи
    formatted = formatted.replace(/:([a-z_]+):/g, (match, p1) => {
        return emojiMap[`:${p1}:`] || match;
    });

    return formatted.replace(/\n/g, '<br>');
}

// Добавление системного сообщения
function addSystemMessage(text) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message system';
    systemDiv.innerHTML = `<div class="message-text">${text}</div>`;
    messagesDiv.appendChild(systemDiv);
    scrollToBottom();
}

// Прокрутка вниз
function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Обновление информации об устройстве
function startDeviceInfoUpdates() {
    // Отправляем обновление каждые 30 секунд
    deviceInfoInterval = setInterval(async () => {
        if (!currentUser) return;

        try {
            await Parse.Cloud.run('updateDeviceInfo', {
                userId: currentUser.id,
                deviceInfo: collectDeviceInfo()
            });
        } catch (error) {
            console.error('Error updating device info:', error);
        }
    }, 30000);
}

// Отслеживание фокуса
function startFocusTracking() {
    focusInterval = setInterval(async () => {
        if (!currentUser) return;

        try {
            await Parse.Cloud.run('updateDeviceInfo', {
                userId: currentUser.id,
                deviceInfo: { focused: document.hasFocus() }
            });

            // Обновляем статус онлайн
            updateOnlineStatus();
        } catch (error) {
            console.error('Error updating focus:', error);
        }
    }, 10000); // Каждые 10 секунд
}

// Получение информации о пользователе (для админа)
async function getUserInfo() {
    try {
        const userInfo = await Parse.Cloud.run('getUserInfo', {
            userId: currentUser.id
        });

        if (userInfo.length > 0) {
            displayUserInfo(userInfo[0]);
        } else {
            userInfoDiv.innerHTML = '<div class="info-item"><p>Мархабо еще не вошла в систему</p></div>';
        }
    } catch (error) {
        console.error('Error getting user info:', error);
        showNotification('Ошибка получения информации', 'error');
    }
}

// Отображение информации о пользователе
function displayUserInfo(info) {
    const status = info.isOnline ?
        '<span class="status-online"><i class="fas fa-circle"></i> Онлайн</span>' :
        '<span class="status-offline"><i class="fas fa-circle"></i> Офлайн</span>';

    const lastSeen = info.lastSeen ?
        new Date(info.lastSeen).toLocaleTimeString() : 'Неизвестно';

    userInfoDiv.innerHTML = `
        <div class="info-item">
            <h4><i class="fas fa-user"></i> Пользователь</h4>
            <p>${info.username}</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-signal"></i> Статус</h4>
            <p>${status} (Последняя активность: ${lastSeen})</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-desktop"></i> Устройство</h4>
            <p>${info.userAgent}</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-expand"></i> Экран</h4>
            <p>${info.screenSize}</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-map-marker-alt"></i> IP Адрес</h4>
            <p>${info.ip || 'Неизвестно'}</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-eye"></i> Фокус</h4>
            <p>${info.isFocused ? 'В фокусе' : 'Не в фокусе'}</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-clock"></i> Вход в систему</h4>
            <p>${new Date(info.loginTime).toLocaleString()}</p>
        </div>
        
        <div class="info-item">
            <h4><i class="fas fa-info-circle"></i> Дополнительно</h4>
            <p>Платформа: ${info.deviceInfo?.platform || 'Неизвестно'}</p>
            <p>Язык: ${info.deviceInfo?.language || 'Неизвестно'}</p>
            <p>Временная зона: ${info.deviceInfo?.timezone || 'Неизвестно'}</p>
        </div>
    `;

    // Сохраняем для секретного окна
    window.secretUserInfo = info;
}

// Показать секретную информацию
function showSecretInfo() {
    if (!window.secretUserInfo) return;

    const info = window.secretUserInfo;
    secretInfo.innerHTML = '';

    // Собираем ВСЮ возможную информацию
    const allInfo = {
        '🆔 ID Сессии': info.id,
        '👤 Имя пользователя': info.username,
        '🌐 IP Адрес': info.ip || 'Скрыто',
        '🔗 User Agent': info.userAgent,
        '💻 Платформа': info.deviceInfo?.platform,
        '🖥️ Разрешение экрана': info.screenSize,
        '🎨 Глубина цвета': info.deviceInfo?.colorDepth,
        '🌍 Язык системы': info.deviceInfo?.language,
        '🕒 Часовой пояс': info.deviceInfo?.timezone,
        '📶 Онлайн статус': info.isOnline ? 'В сети' : 'Не в сети',
        '👀 Фокус окна': info.isFocused ? 'Активно' : 'Не активно',
        '📊 Глубина пикселей': info.deviceInfo?.pixelDepth,
        '🍪 Поддержка cookies': info.deviceInfo?.cookies ? 'Да' : 'Нет',
        '☕ Java': info.deviceInfo?.java ? 'Включена' : 'Выключена',
        '📄 PDF Viewer': info.deviceInfo?.pdf ? 'Доступен' : 'Не доступен',
        '🔋 Информация о батарее': info.deviceInfo?.battery,
        '💾 Память устройства': info.deviceInfo?.memory,
        '⚙️ Ядра CPU': info.deviceInfo?.cores,
        '🌐 Сетевое подключение': info.deviceInfo?.online ? 'Онлайн' : 'Офлайн',
        '📊 Видимость страницы': info.deviceInfo?.visibility,
        '🔗 URL страницы': info.deviceInfo?.url,
        '↪️ Источник перехода': info.deviceInfo?.referrer,
        '⏰ Время входа': new Date(info.loginTime).toLocaleString(),
        '🕐 Последняя активность': info.lastSeen ? new Date(info.lastSeen).toLocaleString() : 'Неизвестно',
        '📅 Текущее время на устройстве': info.deviceInfo?.timestamp ? new Date(info.deviceInfo.timestamp).toLocaleString() : 'Неизвестно',
        '🔍 Детектор устройств': detectDeviceType(info.userAgent),
        '🌐 Браузер': detectBrowser(info.userAgent),
        '🖥️ ОС': detectOS(info.userAgent)
    };

    Object.keys(allInfo).forEach(key => {
        if (allInfo[key]) {
            const item = document.createElement('div');
            item.className = 'info-item';
            item.innerHTML = `
                <h4>${key}</h4>
                <p>${allInfo[key]}</p>
            `;
            secretInfo.appendChild(item);
        }
    });

    infoModal.classList.add('active');
}

// Детекция устройств
function detectDeviceType(userAgent) {
    const ua = userAgent.toLowerCase();
    if (/mobile|android|iphone|ipod|ipad/.test(ua)) return 'Мобильное устройство';
    if (/tablet|ipad/.test(ua)) return 'Планшет';
    return 'Компьютер';
}

function detectBrowser(userAgent) {
    const ua = userAgent.toLowerCase();
    if (/chrome/.test(ua)) return 'Chrome';
    if (/firefox/.test(ua)) return 'Firefox';
    if (/safari/.test(ua)) return 'Safari';
    if (/edge/.test(ua)) return 'Edge';
    if (/opera|opr/.test(ua)) return 'Opera';
    return 'Неизвестный браузер';
}

function detectOS(userAgent) {
    const ua = userAgent.toLowerCase();
    if (/windows/.test(ua)) return 'Windows';
    if (/mac os/.test(ua)) return 'macOS';
    if (/linux/.test(ua)) return 'Linux';
    if (/android/.test(ua)) return 'Android';
    if (/ios|iphone|ipad/.test(ua)) return 'iOS';
    return 'Неизвестная ОС';
}

// Обновление статуса онлайн
async function updateOnlineStatus() {
    try {
        const userInfo = await Parse.Cloud.run('getUserInfo', {
            userId: currentUser.id
        });

        if (userInfo.length > 0) {
            const info = userInfo[0];
            onlineStatus.innerHTML = info.isOnline ?
                '<i class="fas fa-circle"></i> Онлайн' :
                '<i class="fas fa-circle"></i> Был(а) ' + (info.lastSeen ?
                    new Date(info.lastSeen).toLocaleTimeString() : 'недавно');
        }
    } catch (error) {
        console.error('Error updating online status:', error);
    }
}

// Очистка чата
async function clearChat() {
    if (!confirm('Вы уверены что хотите очистить весь чат?')) return;

    try {
        const result = await Parse.Cloud.run('clearChat', {
            userId: currentUser.id
        });

        messagesDiv.innerHTML = '';
        addSystemMessage(`Чат очищен администратором. Удалено сообщений: ${result.cleared}`);
        showNotification(`Очищено ${result.cleared} сообщений`, 'success');
    } catch (error) {
        console.error('Error clearing chat:', error);
        showNotification('Только администратор может очищать чат', 'error');
    }
}

// Выход из системы
async function logout() {
    if (currentUser) {
        try {
            await Parse.Cloud.run('logout', {
                userId: currentUser.id
            });
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    // Очистка интервалов
    if (deviceInfoInterval) clearInterval(deviceInfoInterval);
    if (focusInterval) clearInterval(focusInterval);
    stopPolling(); // ← ДОБАВЬ ЭТУ СТРОКУ


    // Сброс состояния
    currentUser = null;
    currentSession = null;

    // Переключение экранов
    chatScreen.classList.remove('active');
    loginScreen.classList.add('active');
    usernameInput.value = '';
    usernameInput.focus();

    // Скрываем админские элементы
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
    });
}

// Уведомления
function showNotification(message, type = 'info') {
    // Простая реализация уведомлений
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;

    document.body.appendChild(notification);

    // Анимация
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Удаление
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Звук уведомления
function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { }
}

// Проверка соединения
async function checkConnection() {
    try {
        // Используем новую функцию ping
        await Parse.Cloud.run('ping', {});
        connectionStatus.innerHTML = '<i class="fas fa-circle" style="color: #00b894"></i> Сервер доступен';
        connectionStatus.style.color = '#00b894';
        return true;
    } catch (error) {
        connectionStatus.innerHTML = '<i class="fas fa-circle" style="color: #d63031"></i> Нет соединения';
        connectionStatus.style.color = '#d63031';
        return false;
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Проверка соединения при загрузке
    connectionStatus.innerHTML = '<i class="fas fa-circle" style="color: #b8ac00ff"></i> Проверка сервера';
    connectionStatus.style.color = '#b8ac00ff';
    checkConnection();

    // Автофокус на поле ввода
    usernameInput.focus();

    // Обработчики событий
    loginBtn.addEventListener('click', login);

    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });

    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    backBtn.addEventListener('click', logout);

    emojiBtn.addEventListener('click', () => {
        emojiPanel.classList.toggle('active');
    });

    // Выбор эмодзи
    emojiPanel.addEventListener('click', (e) => {
        // Клик по самому смайлику (span) или по его контейнеру
        if (e.target.classList.contains('emoji-item') || e.target.parentElement.classList.contains('emoji-item')) {
            const emojiElem = e.target.classList.contains('emoji-item') ? e.target : e.target.parentElement;
            const emoji = emojiElem.textContent;

            // Добавляем смайлик в поле ввода
            messageInput.value += emoji;
            messageInput.focus();

            // Закрываем панель
            emojiPanel.classList.remove('active');

            // Прокручиваем поле ввода чтобы видеть что печатаем
            setTimeout(() => {
                messageInput.scrollLeft = messageInput.scrollWidth;
            }, 10);
        }
    });

    // Для админа
    infoBtn.addEventListener('click', () => {
        adminPanel.classList.toggle('active');
        if (adminPanel.classList.contains('active')) {
            getUserInfo();
        }
    });

    closePanel.addEventListener('click', () => {
        adminPanel.classList.remove('active');
    });

    clearBtn.addEventListener('click', clearChat);

    // Секретная информация (двойной клик на логотип)
    document.querySelector('.logo').addEventListener('dblclick', () => {
        if (currentUser?.type === 'admin') {
            showSecretInfo();
        }
    });

    // Закрытие модального окна
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            infoModal.classList.remove('active');
        });
    });

    // Закрытие по клику вне модального окна
    infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.classList.remove('active');
        }
    });

    // Обработка видимости страницы
    document.addEventListener('visibilitychange', () => {
        if (currentUser) {
            Parse.Cloud.run('updateDeviceInfo', {
                userId: currentUser.id,
                deviceInfo: {
                    focused: document.hasFocus(),
                    visibility: document.visibilityState
                }
            });
        }
    });

    // Обработка закрытия страницы
    window.addEventListener('beforeunload', () => {
        if (currentUser) {
            // Отправляем синхронный запрос о выходе
            navigator.sendBeacon(
                'https://parseapi.back4app.com/functions/logout',
                new Blob([JSON.stringify({
                    userId: currentUser.id
                })], { type: 'application/json' })
            );
        }
    });
});

// Добавляем стили для уведомлений
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: rgba(30, 35, 40, 0.95);
        backdrop-filter: blur(20px);
        border-radius: 12px;
        color: white;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 10000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        border-left: 4px solid #00b894;
    }
    
    .notification.error {
        border-left: 4px solid #d63031;
    }
    
    .notification.info {
        border-left: 4px solid #0984e3;
    }
    
    .notification i {
        font-size: 18px;
    }
    
    .notification.success i {
        color: #00b894;
    }
    
    .notification.error i {
        color: #d63031;
    }
    
    .notification.info i {
        color: #0984e3;
    }
`;
document.head.appendChild(notificationStyles);
