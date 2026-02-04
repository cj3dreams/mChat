// Конфигурация Parse
Parse.initialize(
    "gnAJvSu6vtwIe6b7URaorh9AcoxlnPwIRu67fH3Y",
    "PHWwE8p5dTupZpzOajRrA7CG8aBcYosU2EUSUEmI"
);
Parse.serverURL = "https://parseapi.back4app.com/";

// Глобальные переменные
let currentUser = null;
let checkMessagesInterval = null;
let lastCheckTime = null;

// DOM элементы
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('loginBtn');
const backBtn = document.getElementById('backBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesDiv = document.getElementById('messages');
const infoBtn = document.getElementById('infoBtn');
const clearBtn = document.getElementById('clearBtn');
const adminPanel = document.getElementById('adminPanel');
const closePanel = document.getElementById('closePanel');
const userInfoDiv = document.getElementById('userInfo');
const connectionStatus = document.getElementById('connectionStatus');

// Вход в систему
async function login() {
    const username = usernameInput.value.trim();
    if (!username) return;
    
    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const result = await Parse.Cloud.run('login', {
            username: username,
            deviceInfo: { screen: `${window.screen.width}x${window.screen.height}` }
        });
        
        // Проверяем ошибку
        if (result.error) {
            showError();
            return;
        }
        
        currentUser = {
            id: result.userId,
            type: result.userType,
            username: username,
            color: result.color
        };
        
        // Админские кнопки
        if (currentUser.type === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'flex';
            });
        }
        
        // Переключаем экраны
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        
        // Загружаем сообщения
        await loadMessages();
        
        // Запускаем проверку новых сообщений
        startMessageChecking();
        
    } catch (error) {
        showError();
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
        });
        
        scrollToBottom();
        
        // Запоминаем время последней проверки
        lastCheckTime = new Date();
        
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Проверка новых сообщений
function startMessageChecking() {
    // Останавливаем старый интервал если есть
    if (checkMessagesInterval) {
        clearInterval(checkMessagesInterval);
    }
    
    // Проверяем каждые 2 секунды
    checkMessagesInterval = setInterval(async () => {
        if (!currentUser) return;
        
        try {
            const messages = await Parse.Cloud.run('getMessages');
            
            // Находим ID всех текущих сообщений
            const currentMessageIds = new Set();
            document.querySelectorAll('.message').forEach(msg => {
                const id = msg.id.replace('msg-', '');
                currentMessageIds.add(id);
            });
            
            // Добавляем только новые сообщения
            let hasNewMessages = false;
            messages.forEach(msg => {
                if (!currentMessageIds.has(msg.id)) {
                    addMessageToUI(msg);
                    hasNewMessages = true;
                    
                    // Звук если сообщение не наше
                    if (msg.user !== currentUser.username) {
                        playNotificationSound();
                    }
                }
            });
            
            // Прокручиваем если есть новые
            if (hasNewMessages) {
                scrollToBottom();
            }
            
        } catch (error) {
            console.error('Error checking messages:', error);
        }
    }, 2000); // Каждые 2 секунды
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
        <div class="message-text">${msg.text}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
}

// Отправка сообщения
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;
    
    try {
        sendBtn.disabled = true;
        
        const result = await Parse.Cloud.run('sendMessage', {
            userId: currentUser.id,
            text: text
        });
        
        if (result.error) {
            alert('Ошибка отправки');
            return;
        }
        
        messageInput.value = '';
        messageInput.focus();
        
        // Не перезагружаем все сообщения - pooling сам подхватит
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Ошибка отправки');
    } finally {
        sendBtn.disabled = false;
    }
}

// Получение информации о пользователе
async function getUserInfo() {
    if (!currentUser || currentUser.type !== 'admin') return;
    
    try {
        const userInfo = await Parse.Cloud.run('getUserInfo', {
            userId: currentUser.id
        });
        
        if (userInfo.error) {
            alert('Нет доступа');
            return;
        }
        
        if (userInfo.length > 0) {
            const info = userInfo[0];
            userInfoDiv.innerHTML = `
                <div class="info-item">
                    <h4><i class="fas fa-user"></i> Пользователь</h4>
                    <p>${info.username}</p>
                </div>
                <div class="info-item">
                    <h4><i class="fas fa-signal"></i> Статус</h4>
                    <p>${info.isOnline ? 'Онлайн' : 'Офлайн'}</p>
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
            `;
            
            adminPanel.classList.add('active');
        } else {
            userInfoDiv.innerHTML = '<div class="info-item"><p>Мархабо не в сети</p></div>';
            adminPanel.classList.add('active');
        }
        
    } catch (error) {
        console.error('Error getting user info:', error);
    }
}

// Очистка чата
async function clearChat() {
    if (!currentUser || currentUser.type !== 'admin') return;
    if (!confirm('Очистить чат?')) return;
    
    try {
        const result = await Parse.Cloud.run('clearChat', {
            userId: currentUser.id
        });
        
        if (result.error) {
            alert('Нет доступа');
            return;
        }
        
        // Очищаем сообщения
        messagesDiv.innerHTML = '';
        
        // Системное сообщение
        const systemDiv = document.createElement('div');
        systemDiv.className = 'message system';
        systemDiv.innerHTML = `<div class="message-text">Чат очищен. Удалено сообщений: ${result.cleared}</div>`;
        messagesDiv.appendChild(systemDiv);
        
    } catch (error) {
        console.error('Error clearing chat:', error);
    }
}

// Выход
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
    
    // Останавливаем проверку сообщений
    if (checkMessagesInterval) {
        clearInterval(checkMessagesInterval);
        checkMessagesInterval = null;
    }
    
    // Сбрасываем состояние
    currentUser = null;
    lastCheckTime = null;
    
    // Переключаем экраны
    chatScreen.classList.remove('active');
    loginScreen.classList.add('active');
    usernameInput.value = '';
    usernameInput.focus();
    
    // Скрываем админские кнопки
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
    });
    
    // Скрываем панель
    adminPanel.classList.remove('active');
}

// Прокрутка вниз
function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Проверка соединения
async function checkConnection() {
    try {
        await Parse.Cloud.run('ping', {});
        connectionStatus.innerHTML = '<i class="fas fa-circle"></i> Сервер доступен';
        return true;
    } catch (error) {
        connectionStatus.innerHTML = '<i class="fas fa-circle"></i> Нет соединения';
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

// Простая ошибка
function showError() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #e74c3c;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 10000;
    `;
    errorDiv.textContent = ' ';
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 2000);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    
    // Автофокус
    usernameInput.focus();
    
    // Обработчики событий
    loginBtn.addEventListener('click', login);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    backBtn.addEventListener('click', logout);
    infoBtn.addEventListener('click', getUserInfo);
    clearBtn.addEventListener('click', clearChat);
    closePanel.addEventListener('click', () => {
        adminPanel.classList.remove('active');
    });
});
