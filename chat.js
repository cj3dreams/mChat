// Конфигурация Parse
Parse.initialize(
    "gnAJvSu6vtwIe6b7URaorh9AcoxlnPwIRu67fH3Y", // App ID (твой)
    "PHWwE8p5dTupZpzOajRrA7CG8aBcYosU2EUSUEmI"  // JavaScript Key
);
Parse.serverURL = "https://parseapi.back4app.com/";

// Глобальные переменные
let currentUser = null;
let messagePoolInterval = null;
let lastMessageId = null;

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

// Вход в систему
async function login() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showNotification(' ', 'error');
        return;
    }
    
    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const result = await Parse.Cloud.run('login', {
            username: username,
            deviceInfo: { screen: `${window.screen.width}x${window.screen.height}` }
        });
        
        // Проверяем ошибку
        if (result.error) {
            showNotification(' ', 'error');
            return;
        }
        
        currentUser = {
            id: result.userId,
            type: result.userType,
            username: username,
            color: result.color
        };
        
        // Показываем разные интерфейсы
        if (currentUser.type === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'flex';
            });
            chatSubtitle.innerHTML = '👑';
        } else {
            chatSubtitle.innerHTML = '💖';
        }
        
        // Переключаем экраны
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        
        // Загружаем сообщения
        loadMessages();
        
        // Запускаем проверку новых сообщений
        startMessagePooling();
        
    } catch (error) {
        showNotification(' ', 'error');
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
        
        messages.forEach(msg => {
            addMessageToUI(msg);
            // Запоминаем ID последнего сообщения
            lastMessageId = msg.id;
        });
        
        scrollToBottom();
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Проверка новых сообщений (каждые 2 секунды)
function startMessagePooling() {
    messagePoolInterval = setInterval(async () => {
        if (!currentUser) return;
        
        try {
            const messages = await Parse.Cloud.run('getMessages');
            
            // Находим новые сообщения
            const newMessages = messages.filter(msg => 
                !lastMessageId || msg.id > lastMessageId
            );
            
            // Добавляем новые сообщения
            newMessages.forEach(msg => {
                addMessageToUI(msg);
                lastMessageId = msg.id;
                
                // Звук если сообщение не наше
                if (msg.user !== currentUser.username) {
                    playNotificationSound();
                }
            });
            
            // Прокручиваем если есть новые
            if (newMessages.length > 0) {
                scrollToBottom();
            }
            
        } catch (error) {
            console.error('Pooling error:', error);
        }
    }, 2000); // Проверяем каждые 2 секунды
}

// Добавление сообщения в UI
function addMessageToUI(msg) {
    // Проверяем не добавляли ли уже
    if (document.getElementById(`msg-${msg.id}`)) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.userType}`;
    messageDiv.id = `msg-${msg.id}`;
    
    const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-sender" style="color: ${msg.color}">
                ${msg.userType === 'admin' ? '👑' : '💖'}
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
        
        const result = await Parse.Cloud.run('sendMessage', {
            userId: currentUser.id,
            text: text
        });
        
        if (result.error) {
            showNotification('Ошибка отправки', 'error');
            return;
        }
        
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
    
    formatted = formatted.replace(/:([a-z_]+):/g, (match, p1) => {
        return emojiMap[`:${p1}:`] || match;
    });
    
    return formatted.replace(/\n/g, '<br>');
}

// Прокрутка вниз
function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Получение информации о пользователе (для админа)
async function getUserInfo() {
    try {
        const userInfo = await Parse.Cloud.run('getUserInfo', {
            userId: currentUser.id
        });
        
        if (userInfo.error) {
            showNotification('Ошибка получения информации', 'error');
            return;
        }
        
        if (userInfo.length > 0) {
            displayUserInfo(userInfo[0]);
        } else {
            userInfoDiv.innerHTML = '<div class="info-item"><p>Мархабо еще не вошла в систему</p></div>';
        }
        
        // Показываем панель
        adminPanel.classList.add('active');
        
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
    `;
}

// Очистка чата
async function clearChat() {
    if (!confirm('Вы уверены что хотите очистить весь чат?')) return;
    
    try {
        const result = await Parse.Cloud.run('clearChat', {
            userId: currentUser.id
        });
        
        if (result.error) {
            showNotification('Только администратор может очищать чат', 'error');
            return;
        }
        
        messagesDiv.innerHTML = '';
        
        // Системное сообщение
        const systemDiv = document.createElement('div');
        systemDiv.className = 'message system';
        systemDiv.innerHTML = `<div class="message-text">Чат очищен. Удалено сообщений: ${result.cleared}</div>`;
        messagesDiv.appendChild(systemDiv);
        
        showNotification(`Очищено ${result.cleared} сообщений`, 'success');
        
    } catch (error) {
        console.error('Error clearing chat:', error);
        showNotification('Ошибка очистки', 'error');
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
    
    // Очистка интервала pooling
    if (messagePoolInterval) {
        clearInterval(messagePoolInterval);
        messagePoolInterval = null;
    }
    
    // Сброс состояния
    currentUser = null;
    lastMessageId = null;
    
    // Переключение экранов
    chatScreen.classList.remove('active');
    loginScreen.classList.add('active');
    usernameInput.value = '';
    usernameInput.focus();
    
    // Скрываем админские элементы
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
    });
    
    // Скрываем панель
    adminPanel.classList.remove('active');
}

// Проверка соединения
async function checkConnection() {
    try {
        await Parse.Cloud.run('ping', {});
        connectionStatus.innerHTML = '<i class="fas fa-circle"></i> Сервер доступен';
        connectionStatus.style.color = '#00b894';
        return true;
    } catch (error) {
        connectionStatus.innerHTML = '<i class="fas fa-circle"></i> Нет соединения';
        connectionStatus.style.color = '#d63031';
        return false;
    }
}

// Звук уведомления
function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

// Уведомления
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
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
        if (e.target.tagName === 'SPAN' && e.target.parentElement.className === 'emoji-list') {
            const emoji = e.target.textContent.trim().split(' ')[0];
            messageInput.value += emoji;
            messageInput.focus();
            emojiPanel.classList.remove('active');
        }
    });
    
    // Для админа
    infoBtn.addEventListener('click', () => {
        if (adminPanel.classList.contains('active')) {
            adminPanel.classList.remove('active');
        } else {
            getUserInfo();
        }
    });
    
    closePanel.addEventListener('click', () => {
        adminPanel.classList.remove('active');
    });
    
    clearBtn.addEventListener('click', clearChat);
});
