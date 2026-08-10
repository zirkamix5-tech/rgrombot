const tmi = require('tmi.js');
const http = require('http');

// Конфигурация бота
const opts = {
    identity: {
        username: 'RGROMBOT',                          // Имя вашего бота
        password: `oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52`  // Токен подтягивается из переменных окружения Render
    },
    channels: [
        'QumosX'                                       // Имя вашего канала
    ]
};

const client = new tmi.client(opts);

// Множество для отслеживания пользователей, которых уже поприветствовали в этой сессии
const greetedUsers = new Set();

// База данных балансов игроков (в памяти бота)
const playerBalances = {};

client.on('message', (channel, tags, message, self) => {
    if (self) return; // Игнорируем сообщения самого бота

    const username = tags['display-name'];
    const lowerMessage = message.trim().toLowerCase();

    // --- 1. МОДУЛЬ АВТОПРИВЕТСТВИЯ ---
    if (!greetedUsers.has(username)) {
        greetedUsers.add(username);
        const greeting = `Привет, @${username}! Добро пожаловать на стрим! Копи КРЫШКИ и участвуй в казино командой !spin`;
        client.say(channel, greeting);
        console.log(`[Автоприветствие] Отправлено для: ${username}`);
    }

    // Инициализация баланса игрока, если его еще нет
    if (!playerBalances[username]) {
        playerBalances[username] = 100; // Стартовый бонус
    }

    // --- 2. МОДУЛЬ КАЗИНО (!spin) ---
    if (lowerMessage === '!spin') {
        const cost = 10; // Стоимость прокрутки

        if (playerBalances[username] < cost) {
            client.say(channel, `@{username}, у вас недостаточно КРЫШЕК! Ваш баланс: ${playerBalances[username]} КРЫШКИ.`);
            return;
        }

        playerBalances[username] -= cost;

        // Символы слота
        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];

        if (r1 === r2 && r2 === r3) {
            const win = 150;
            playerBalances[username] += win;
            client.say(channel, `🎰 ДЖЕКПOT! @{username} собрал (${r1} ${r2} ${r3}) и выиграл ${win} КРЫШКИ! Баланс: ${playerBalances[username]}`);
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            const win = 25;
            playerBalances[username] += win;
            client.say(channel, `✨ Неплохо! @{username} поймал пару (${r1} {r2} ${r3}) и получает +{win} КРЫШКИ! Баланс: ${playerBalances[username]}`);
        } else {
            client.say(channel, `❌ Эх, @{username}, выпало (${r1} ${r2} ${r3}). Повезет в следующий раз! Баланс: ${playerBalances[username]}`);
        }
    }

    // Проверка баланса командой !balance или !крышки
    if (lowerMessage === '!balance' || lowerMessage === '!крышки') {
        client.say(channel, `💰 @{username}, ваш текущий баланс: ${playerBalances[username]} КРЫШКИ.`);
    }
});

// Подключение бота
client.connect().catch(console.error);

// --- 3. HTTP-СЕРВЕР ДЛЯ RENDER.COM ---
// Render требует, чтобы веб-сервис прослушивал порт, иначе он посчитает приложение упавшим
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RGROMBOT Twitch Casino Service is Running!\n');
}).listen(PORT, () => {
    console.log(`HTTP сервер запущен на порту ${PORT}`);
});