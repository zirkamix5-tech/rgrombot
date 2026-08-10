const tmi = require('tmi.js');
const http = require('http');

// Конфигурация бота
const opts = {
    identity: {
        username: 'RGROMBOT',                          // Имя вашего бота
        password: `oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52`  // Токен из переменных окружения Render
    },
    channels: [
        'QumosX'                                       // Имя вашего канала
    ]
};

const client = new tmi.client(opts);

// --- СОСТОЯНИЕ И ДАННЫЕ БОТА ---
const greetedUsers = new Set();      // Список поприветствованных за сессию
const playerBalances = {};           // Балансы игроков (КРЫШКИ)
let casinoBank = 0;                  // Общий банк казино
let isCasinoOpen = true;             // Состояние казино (открыто по умолчанию)
let manualOverride = false;          // Флаг ручного вмешательства в расписание

client.on('message', (channel, tags, message, self) => {
    if (self) return; // Игнорируем сообщения самого бота

    const username = tags['display-name'] || tags.username;
    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    // Проверка прав модератора / владельца
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx' || username.toLowerCase() === 'r0ma_gr0m';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx';

    // --- 1. МОДУЛЬ АВТОПРИВЕТСТВИЯ ---
    if (!greetedUsers.has(username)) {
        greetedUsers.add(username);
        const greeting = `Привет, @${username}! Добро пожаловать на стрим! Копи КРЫШКИ, участвуй в казино (!spin) и передавай их друзьям (!передать)!`;
        client.say(channel, greeting);
        console.log(`[Автоприветствие] Отправлено для: ${username}`);
    }

    // Инициализация баланса игрока
    if (!playerBalances[username]) {
        playerBalances[username] = 100; // Баланс крышек!
    }

    // --- 2. УПРАВЛЕНИЕ КАЗИНО И БАНКОМ (ДЛЯ МОДЕРАТОРОВ / ВЛАДЕЛЬЦА) ---
    if (lowerMessage === '!каз открыть' && isMod) {
        isCasinoOpen = true;
        manualOverride = true;
        client.say(channel, `🟢 Казино вручную ОТКРЫТО! Крутите слоты командой !spin!`);
        console.log(`[Казино] Открыто пользователем ${username}`);
        return;
    }

    if (lowerMessage === '!каз закрыть' && isMod) {
        isCasinoOpen = false;
        manualOverride = true;
        client.say(channel, `🔴 Казино вручную ЗАКРЫТО!`);
        console.log(`[Казино] Закрыто пользователем ${username}`);
        return;
    }

    if (lowerMessage === '!автоказ' && isMod) {
        manualOverride = false;
        client.say(channel, `⚙️ Ручной режим отключен. Казино переведено на автоматическое расписание (Закрытие в 05:00, Открытие в 14:00).`);
        console.log(`[Казино] Возврат к авто-расписанию пользователем ${username}`);
        return;
    }

    // Снятие КРЫШЕК из банка казино (доступно ТОЛЬКО владельцу канала)
    if (lowerMessage.startsWith('!снять каз') && isBroadcaster) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму для снятия. Пример: !снять каз 500`);
            return;
        }

        if (amount > casinoBank) {
            client.say(channel, `❌ @{username}, в банке казино недостаточно средств! Текущий банк: ${casinoBank} КРЫШКИ.`);
            return;
        }

        casinoBank -= amount;
        playerBalances[username] = (playerBalances[username] || 0) + amount;

        client.say(channel, `💸 Владелец @{username} снял из банка ${amount} КРЫШКИ! Остаток в банке: ${casinoBank} КРЫШКИ. Баланс владельца: ${playerBalances[username]} КРЫШКИ.`);
        console.log(`[Банк] Владелец ${username} снял ${amount} крышек. Остаток в банке: ${casinoBank}`);
        return;
    }

    // --- 3. ПЕРЕДАЧА КРЫШЕК ДРУГОМУ ИГРОКУ (!передать / !pay) ---
    if (lowerMessage.startsWith('!передать') || lowerMessage.startsWith('!pay')) {
        const args = trimmedMessage.split(' ');
        // Ожидается формат: !передать ИмяПолучателя 50
        if (args.length < 3) {
            client.say(channel, `⚠️ @{username}, неверный формат. Используйте: !передать [ник] [сумма]`);
            return;
        }

        // Очищаем ник от символа @, если пользователь его написал
        let targetUserRaw = args[1].replace('@', '');
        let targetUser = Object.keys(playerBalances).find(u => u.toLowerCase() === targetUserRaw.toLowerCase());
        const amount = parseInt(args[2]);

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму для перевода.`);
            return;
        }

        if (!targetUser) {
            client.say(channel, `❌ @{username}, пользователь "${targetUserRaw}" еще не зарегистрирован в системе (у него 0 крышек или он не писал в чат).`);
            return;
        }

        if (username.toLowerCase() === targetUser.toLowerCase()) {
            client.say(channel, `🤔 @{username}, нельзя переводить КРЫШКИ самому себе!`);
            return;
        }

        if (playerBalances[username] < amount) {
            client.say(channel, `❌ @{username}, у вас недостаточно КРЫШЕК для перевода! Ваш баланс: ${playerBalances[username]} КРЫШКИ.`);
            return;
        }

        // Проводим транзакцию
        playerBalances[username] -= amount;
        playerBalances[targetUser] += amount;

        client.say(channel, `🤝 @{username} успешно перевел ${amount} КРЫШКИ игроку @{targetUser}! Ваш баланс: ${playerBalances[username]} КРЫШКИ.`);
        console.log(`[Перевод] ${username} перевел ${amount} крышек пользователю ${targetUser}`);
        return;
    }

    // --- 4. СИСТЕМА ТОП КАЗИНО (!топ / !казинотоп) ---
    if (lowerMessage === '!топказ' || lowerMessage === '!казинотоп' || lowerMessage === '!top') {
        // Превращаем объект балансов в массив и сортируем по убыванию
        const sortedPlayers = Object.entries(playerBalances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5); // Берем топ-5

        if (sortedPlayers.length === 0) {
            client.say(channel, `📊 В рейтинге пока нет участников.`);
            return;
        }

        let topText = `🏆 ТОП-5 БОГАЧЕЙ КАЗИНО: `;
        sortedPlayers.forEach(([user, balance], index) => {
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            topText += `${medals[index]} @${user} (${balance} 🪙) `;
        });

        client.say(channel, topText);
        return;
    }

    // --- 5. МОДУЛЬ КАЗИНО (!каз) С БОНУСАМИ ---
    if (lowerMessage === '!каз') {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ @{username}, Казино сейчас закрыто. Открытие по расписанию в 14:00!`);
            return;
        }

        const cost = 10; // Стоимость прокрутки

        if (playerBalances[username] < cost) {
            client.say(channel, `❌ @{username}, у вас недостаточно КРЫШЕК! Ваш баланс: ${playerBalances[username]} КРЫШКИ.`);
            return;
        }

        playerBalances[username] -= cost;

        // Символы слота
        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];

        // Джекпот (3 одинаковых)
        if (r1 === r2 && r2 === r3) {
            let rawWin = 150; 
            let bonusText = "";

            if (Math.random() < 0.20) {
                rawWin *= 2;
                bonusText = " 🔥 [КРИТИЧЕСКИЙ ДЖЕКПOT x2!]";
            }

            const taxPercent = 10; 
            const taxAmount = Math.floor(rawWin * (taxPercent / 100));
            const playerWin = rawWin - taxAmount;

            casinoBank += taxAmount; 
            playerBalances[username] += playerWin;

            client.say(channel, `🎰 ДЖЕКПOT!${bonusText} @{username} собрал (${r1} ${r2} ${r3})! Выигрыш: ${rawWin} КРЫШЕК (${taxAmount} ушло в банк). На руки: +${playerWin} КРЫШКИ! Баланс: ${playerBalances[username]}`);
        } 
        // Малый выигрыш (пара)
        else if (r1 === r2 || r2 === r3 || r1 === r3) {
            let rawWin = 25;
            let bonusText = "";

            if (Math.random() < 0.15) {
                playerBalances[username] += cost; 
                bonusText = " 🔄 [Бонус: Бесплатная прокрутка!]";
            }

            if (Math.random() < 0.10) {
                rawWin += 20;
                bonusText += " 🌧️ [Бонус: Дождь из крышек +20!]";
            }

            const taxPercent = 10; 
            const taxAmount = Math.max(1, Math.floor(rawWin * (taxPercent / 100)));
            const playerWin = rawWin - taxAmount;

            casinoBank += taxAmount; 
            playerBalances[username] += playerWin;

            client.say(channel, `✨ Неплохо! @{username} поймал пару (${r1} ${r2} ${r3})${bonusText}! В банк упало ${taxAmount}, вам начислено: +${playerWin} КРЫШКИ! Баланс: ${playerBalances[username]}`);
        } 
        // Проигрыш
        else {
            if (Math.random() < 0.05) {
                const refund = 5;
                playerBalances[username] += refund;
                client.say(channel, `🍀 Удача улыбнулась сквозь слезы! @{username}, выпало (${r1} ${r2} ${r3}), но вы получили утешительный бонус: +${refund} КРЫШКИ обратно! Баланс: ${playerBalances[username]}`);
            } else {
                client.say(channel, `❌ Эх, @{username}, выпало (${r1} ${r2} ${r3}). Повезет в следующий раз! Баланс: ${playerBalances[username]}`);
            }
        }
    }

    // Проверка баланса игрока
    if (lowerMessage === '!balance' || lowerMessage === '!крышки') {
        client.say(channel, `💰 @{username}, ваш текущий баланс: ${playerBalances[username]} КРЫШКИ.`);
    }

    // Проверка банка казино
    if (lowerMessage === '!банк' || lowerMessage === '!банкказино') {
        client.say(channel, `🏦 Текущий банк казино составляет: ${casinoBank} КРЫШКИ.`);
    }
});

// --- 6. ПРОВЕРКА РАСПИСАНИЯ ПО ВРЕМЕНИ СЕРВЕРА ---
setInterval(() => {
    if (manualOverride) return;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Авто-закрытие в 05:00
    if (hours === 5 && minutes === 0 && isCasinoOpen) {
        isCasinoOpen = false;
        client.channels.forEach(channel => {
            client.say(channel, `🔴 Наступило 05:00. Казино автоматически ЗАКРЫТО до 14:00!`);
        });
        console.log(`[Авто-расписание] Казино закрыто по времени (05:00).`);
    }

    // Авто-открытие в 14:00
    if (hours === 14 && minutes === 0 && !isCasinoOpen) {
        isCasinoOpen = true;
        client.channels.forEach(channel => {
            client.say(channel, `🟢 Наступило 14:00. Казино автоматически ОТКРЫТО! Добро пожаловать!`);
        });
        console.log(`[Авто-расписание] Казино открыто по времени (14:00).`);
    }
}, 60 * 1000);

// Подключение бота к Twitch
client.connect().catch(console.error);

// --- 7. HTTP-СЕРВЕР ДЛЯ RENDER.COM ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RGROMBOT Twitch Casino Top & Transfer Service is Running!\n');
}).listen(PORT, () => {
    console.log(`HTTP сервер успешно запущен на порту ${PORT}`);
});