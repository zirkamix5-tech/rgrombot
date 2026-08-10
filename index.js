const tmi = require('tmi.js');
const http = require('http');

// Конфигурация бота
const opts = {
    identity: {
        username: 'RGROMBOT',                          // Имя вашего бота
        password: `oauth:${process.env.TWITCH_TOKEN}`  // Токен из переменных окружения Render
    },
    channels: [
        'QumosX'                                       // Имя вашего канала
    ]
};

const client = new tmi.client(opts);

// --- СОСТОЯНИЕ И ДАННЫЕ БОТА ---
const greetedUsers = new Set();      // Список поприветствованных за сессию
const playerBalances = {};           // Балансы игроков (КРЫШКИ для казино)
const shopBalances = {};             // Балансы очков магазина (отдельный счет для бонусов)
const playerVips = new Set();        // Список игроков с VIP-статусом
let casinoBank = 0;                  // Общий банк казино (от % побед в !spin)
let storeBank = 0;                   // Общий банк магазина (от % покупок в !купить)
let isCasinoOpen = true;             // Состояние казино (открыто по умолчанию)
let manualOverride = false;          // Флаг ручного вмешательства в расписание

client.on('message', (channel, tags, message, self) => {
    if (self) return; // Игнорируем сообщения самого бота

    const username = tags['display-name'] || tags.username;
    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    // Проверка прав модератора / владельца
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx' || username.toLowerCase() === 'rgrombot';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx';

    // --- 1. МОДУЛЬ АВТОПРИВЕТСТВИЯ ---
    if (!greetedUsers.has(username)) {
        greetedUsers.add(username);
        const greeting = `Привет, @${username}! Добро пожаловать на стрим! Копи КРЫШКИ в казино (!spin) и очки магазина для покупки бонусов (!шоп)!`;
        client.say(channel, greeting);
        console.log(`[Автоприветствие] Отправлено для: ${username}`);
    }

    // Инициализация балансов игрока
    if (!playerBalances[username]) {
        playerBalances[username] = 100; // Стартовые крышки для казино
    }
    if (!shopBalances[username]) {
        shopBalances[username] = 50;    // Стартовые очки для магазина
    }

    // --- 2. УПРАВЛЕНИЕ КАЗИНО И БАНКАМИ (ДЛЯ МОДЕРАТОРОВ / ВЛАДЕЛЬЦА) ---
    if (lowerMessage === '!открыть казино' && isMod) {
        isCasinoOpen = true;
        manualOverride = true;
        client.say(channel, `🟢 Казино вручную ОТКРЫТО! Крутите слоты командой !spin [сумма]!`);
        console.log(`[Казино] Открыто пользователем ${username}`);
        return;
    }

    if (lowerMessage === '!закрыть казино' && isMod) {
        isCasinoOpen = false;
        manualOverride = true;
        client.say(channel, `🔴 Казино вручную ЗАКРЫТО!`);
        console.log(`[Казино] Закрыто пользователем ${username}`);
        return;
    }

    if (lowerMessage === '!авто режим казино' && isMod) {
        manualOverride = false;
        client.say(channel, `⚙️ Ручной режим отключен. Казино переведено на автоматическое расписание (Закрытие в 05:00, Открытие в 14:00).`);
        console.log(`[Казино] Возврат к авто-расписанию пользователем ${username}`);
        return;
    }

    // Снятие средств из банка казино (доступно ТОЛЬКО владельцу)
    if (lowerMessage.startsWith('!снятьбанк') && isBroadcaster) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму. Пример: !снятьбанк 500`);
            return;
        }

        if (amount > casinoBank) {
            client.say(channel, `❌ @{username}, в банке казино недостаточно средств! Текущий банк: ${casinoBank} КРЫШКИ.`);
            return;
        }

        casinoBank -= amount;
        playerBalances[username] = (playerBalances[username] || 0) + amount;

        client.say(channel, `💸 Владелец @{username} снял из банка казино ${amount} КРЫШКИ! Остаток в банке: ${casinoBank}.`);
        console.log(`[Банк Казино] Владелец ${username} снял ${amount} крышек.`);
        return;
    }

    // Снятие средств из банка магазина (доступно ТОЛЬКО владельцу)
    if (lowerMessage.startsWith('!снятьбанкмагазина') && isBroadcaster) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму. Пример: !снятьбанкмагазина 500`);
            return;
        }

        if (amount > storeBank) {
            client.say(channel, `❌ @{username}, в банке магазина недостаточно средств! Текущий банк: ${storeBank} очков.`);
            return;
        }

        storeBank -= amount;
        shopBalances[username] = (shopBalances[username] || 0) + amount;

        client.say(channel, `💸 Владелец @{username} снял из банка магазина ${amount} очков! Остаток в банке магазина: ${storeBank}.`);
        console.log(`[Банк Магазина] Владелец ${username} снял ${amount} очков.`);
        return;
    }

    // --- 3. ПЕРЕДАЧА КРЫШЕК ДРУГОМУ ИГРОКУ ---
    if (lowerMessage.startsWith('!передать') || lowerMessage.startsWith('!pay')) {
        const args = trimmedMessage.split(' ');
        if (args.length < 3) {
            client.say(channel, `⚠️ @{username}, неверный формат. Используйте: !передать [ник] [сумма]`);
            return;
        }

        let targetUserRaw = args[1].replace('@', '');
        let targetUser = Object.keys(playerBalances).find(u => u.toLowerCase() === targetUserRaw.toLowerCase());
        const amount = parseInt(args[2]);

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму для перевода.`);
            return;
        }

        if (!targetUser) {
            client.say(channel, `❌ @{username}, пользователь "${targetUserRaw}" еще не зарегистрирован в системе.`);
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

        playerBalances[username] -= amount;
        playerBalances[targetUser] += amount;

        client.say(channel, `🤝 @{username} успешно перевел ${amount} КРЫШКИ игроку @{targetUser}! Ваш баланс: ${playerBalances[username]} КРЫШКИ.`);
        return;
    }

    // --- 4. СИСТЕМА ТОП КАЗИНО ---
    if (lowerMessage === '!топ' || lowerMessage === '!казинотоп' || lowerMessage === '!top') {
        const sortedPlayers = Object.entries(playerBalances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

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

    // --- 5. МАГАЗИН БОНУСОВ (ОТДЕЛЬНЫЙ СЧЕТ И БАНК МАГАЗИНА) ---
    if (lowerMessage === '!шоп' || lowerMessage === '!магазин' || lowerMessage === '!shop') {
        client.say(channel, `🛒 МАГАЗИН БОНУСОВ (За очки магазина): 1️⃣ Пакет крышек (+100 🪙) — 80 очков | 2️⃣ Счастливый билет (лотерея) — 50 очков | 3️⃣ VIP-статус в чате — 300 очков. Купить: !купить [номер]`);
        return;
    }

    // Проверка счета магазина игрока
    if (lowerMessage === '!магазинсчет' || lowerMessage === '!шопбаланс') {
        client.say(channel, `💎 @{username}, ваш баланс очков магазина: ${shopBalances[username]} очков.`);
        return;
    }

    // Проверка банка магазина
    if (lowerMessage === '!банкмагазина') {
        client.say(channel, `🏦 Текущий банк магазина составляет: ${storeBank} очков.`);
        return;
    }

    if (lowerMessage.startsWith('!купить') || lowerMessage.startsWith('!buy')) {
        const args = trimmedMessage.split(' ');
        const itemNumber = parseInt(args[1]);

        if (isNaN(itemNumber)) {
            client.say(channel, `⚠️ @{username}, укажите номер товара. Пример: !купить 1 (напишите !шоп для списка)`);
            return;
        }

        const taxPercent = 15; // 15% от покупки уходит в банк магазина

        // Товар 1: Пакет +100 крышек для казино за 80 очков магазина
        if (itemNumber === 1) {
            const price = 80;
            const reward = 100;

            if (shopBalances[username] < price) {
                client.say(channel, `❌ @{username}, недостаточно очков магазина! Нужно: ${price}, у вас: ${shopBalances[username]}`);
                return;
            }

            const taxAmount = Math.floor(price * (taxPercent / 100));
            const netPrice = price - taxAmount;

            shopBalances[username] -= price;
            storeBank += taxAmount;
            playerBalances[username] += reward; // Начисляем в казино

            client.say(channel, `🎁 @{username} купил "Пакет крышек" за ${price} очков (${taxAmount} ушло в банк магазина)! Начислено +${reward} КРЫШКИ в казино! Ваш счет магазина: ${shopBalances[username]}`);
        }
        // Товар 2: Счастливый билет (лотерея) за 50 очков магазина
        else if (itemNumber === 2) {
            const price = 50;

            if (shopBalances[username] < price) {
                client.say(channel, `❌ @{username}, недостаточно очков магазина! Нужно: ${price}, у вас: ${shopBalances[username]}`);
                return;
            }

            const taxAmount = Math.floor(price * (taxPercent / 100));

            shopBalances[username] -= price;
            storeBank += taxAmount;
            
            const lotteryWin = Math.floor(Math.random() * 101) + 20; // от 20 до 120 крышек в казино
            playerBalances[username] += lotteryWin;

            client.say(channel, `🎟️ @{username} купил "Счастливый билет" за ${price} очков (${taxAmount} в банк магазина) и выиграл в казино: +${lotteryWin} КРЫШКИ! Счет магазина: ${shopBalances[username]}`);
        }
        // Товар 3: VIP-статус за 300 очков магазина
        else if (itemNumber === 3) {
            const price = 300;

            if (playerVips.has(username)) {
                client.say(channel, `ℹ️ @{username}, у вас уже есть VIP-статус!`);
                return;
            }

            if (shopBalances[username] < price) {
                client.say(channel, `❌ @{username}, недостаточно очков магазина для VIP! Нужно: ${price}, у вас: ${shopBalances[username]}`);
                return;
            }

            const taxAmount = Math.floor(price * (taxPercent / 100));

            shopBalances[username] -= price;
            storeBank += taxAmount;
            playerVips.add(username);

            client.say(channel, `⭐ Поздравляем, @{username}! Вы приобрели VIP-статус за ${price} очков (${taxAmount} ушло в банк магазина)!`);
        } 
        else {
            client.say(channel, `❌ @{username}, товара с таким номером не существует. Посмотрите список командой !шоп`);
        }
        return;
    }

    // --- 6. МОДУЛЬ КАЗИНО (!spin [ставка]) ---
    if (lowerMessage.startsWith('!spin')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ @{username}, казино сейчас закрыто. Открытие по расписанию в 14:00!`);
            return;
        }

        const args = trimmedMessage.split(' ');
        let bet = 10; 

        if (args.length > 1) {
            if (args[1].toLowerCase() === 'all' || args[1].toLowerCase() === 'всё' || args[1].toLowerCase() === 'все') {
                bet = playerBalances[username];
            } else {
                bet = parseInt(args[1]);
            }
        }

        if (isNaN(bet) || bet <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму ставки. Пример: !spin 50`);
            return;
        }

        if (playerBalances[username] < bet) {
            client.say(channel, `❌ @{username}, у вас недостаточно КРЫШЕК для такой ставки! Ваш баланс: ${playerBalances[username]} КРЫШКИ.`);
            return;
        }

        playerBalances[username] -= bet;

        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];

        // Джекпот (3 одинаковых)
        if (r1 === r2 && r2 === r3) {
            let rawWin = bet * 15; 
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

            // Также немного насыпаем очков магазина за активность в казино
            const shopReward = Math.floor(bet / 2) + 5;
            shopBalances[username] += shopReward;

            client.say(channel, `🎰 ДЖЕКПOT!${bonusText} @{username} собрал (${r1} ${r2} ${r3})! Выигрыш: ${rawWin} КРЫШЕК (${taxAmount} в банк казино). На руки: +${playerWin} КРЫШКИ! (+${shopReward} очков магазина). Баланс: ${playerBalances[username]}`);
        } 
        // Малый выигрыш (пара)
        else if (r1 === r2 || r2 === r3 || r1 === r3) {
            let rawWin = Math.floor(bet * 2.5);
            let bonusText = "";

            if (Math.random() < 0.15) {
                playerBalances[username] += bet; 
                bonusText = " 🔄 [Бонус: Ставка возвращена!]";
            }

            if (Math.random() < 0.10) {
                rawWin += Math.floor(bet * 1.5); 
                bonusText += " 🌧️ [Бонус: Дождь из крышек!]";
            }

            const taxPercent = 10; 
            const taxAmount = Math.max(1, Math.floor(rawWin * (taxPercent / 100)));
            const playerWin = rawWin - taxAmount;

            casinoBank += taxAmount; 
            playerBalances[username] += playerWin;

            const shopReward = Math.floor(bet / 4) + 2;
            shopBalances[username] += shopReward;

            client.say(channel, `✨ Неплохо! @{username} поймал пару (${r1} ${r2} ${r3})${bonusText}! В банк казино упало ${taxAmount}, вам начислено: +${playerWin} КРЫШКИ и +${shopReward} очков магазина! Баланс: ${playerBalances[username]}`);
        } 
        // Проигрыш
        else {
            const shopReward = 1; // Даже за проигрыш капает капля очков магазина
            shopBalances[username] += shopReward;

            if (Math.random() < 0.05) {
                const refund = Math.floor(bet / 2);
                playerBalances[username] += refund;
                client.say(channel, `🍀 Удача улыбнулась сквозь слезы! @{username}, выпало (${r1} ${r2} ${r3}), вернулось +${refund} КРЫШКИ и +${shopReward} очко магазина! Баланс: ${playerBalances[username]}`);
            } else {
                client.say(channel, `❌ Эх, @{username}, выпало (${r1} ${r2} ${r3}). Начислено +${shopReward} очко магазина за участие! Баланс крышек: ${playerBalances[username]}`);
            }
        }
    }

    // Проверка баланса игрока
    if (lowerMessage === '!balance' || lowerMessage === '!крышки') {
        client.say(channel, `💰 @{username}, ваш баланс крышек: ${playerBalances[username]} | Баланс очков магазина: ${shopBalances[username]}`);
    }

    // Проверка банка казино
    if (lowerMessage === '!банк' || lowerMessage === '!банкказино') {
        client.say(channel, `🏦 Банк казино: ${casinoBank} КРЫШКИ | Банк магазина: ${storeBank} очков.`);
    }
});

// --- 7. ПРОВЕРКА РАСПИСАНИЯ ПО ВРЕМЕНИ СЕРВЕРА ---
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

// --- 8. HTTP-СЕРВЕР ДЛЯ RENDER.COM ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RGROMBOT Twitch Separate Shop Currency & Store Bank Service is Running!\n');
}).listen(PORT, () => {
    console.log(`HTTP сервер успешно запущен на порту ${PORT}`);
});