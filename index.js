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
const playerBalances = {};           // Балансы игроков (КРЫШКИ для казино)
const workBalances = {};             // Отдельный счет игрока (деньги за работу)
const shopBalances = {};             // Балансы обычных очков магазина
const boostShopBalances = {};        // Отдельный счет для покупки бустов
const playerDebts = {};              // Кредитные долги игроков перед банком

// --- СИСТЕМА УСИЛИТЕЛЕЙ (БУСТЕРОВ) ДЛЯ КАЗИНО ---
const playerBoosts = {};             // playerBoosts[username] = { luck: 0, x2: 0, shield: 0 }

const CASINO_BOOSTS = {
    'удача': { price: 150, desc: 'Повышает шанс выигрыша в казино на след. 5 игр', type: 'luck', amount: 5 },
    'х2': { price: 300, desc: 'Удваивает выигрыш в казино на след. 3 игры', type: 'x2', amount: 3 },
    'щит': { price: 200, desc: 'Защищает от проигрыша (возврат 50% ставки) на след. 3 игры', type: 'shield', amount: 3 }
};

// --- БАНКОВСКАЯ СИСТЕМА И СЧЕТА СТРИМА ---
let mainBankBalance = 0;             // Основной банковский счет (сюда капают проценты)
let casinoBank = 0;                  // Банк казино
let boostsBank = 0;                  // Банк бустов
let storeBank = 0;                   // Банк магазина
let isCasinoOpen = true;             // Состояние казино
let manualOverride = false;          // Флаг ручного вмешательства

// --- СИСТЕМА РАБОТЫ И ИМУЩЕСТВА ---
const playerJobs = {};               
const jobCooldowns = {};             
const playerInventory = {};          

const JOBS_DATA = {
    'Грузчик': { salary: 45, cooldown: 15 * 60 * 1000, req: 0 },
    'Курьер': { salary: 90, cooldown: 25 * 60 * 1000, req: 100 },
    'Менеджер': { salary: 180, cooldown: 40 * 60 * 1000, req: 500 },
    'Программист': { salary: 350, cooldown: 60 * 60 * 1000, req: 1500 }
};

const SHOP_ITEMS = {
    'велосипед': { price: 500, type: 'транспорт', desc: 'Двухколесный друг для поездок' },
    'мопед': { price: 1500, type: 'транспорт', desc: 'Уже с ветерком!' },
    'машина': { price: 5000, type: 'транспорт', desc: 'Настоящая личная тачка' },
    'спорткар': { price: 20000, type: 'транспорт', desc: 'Быстрая машина для стритрейсера' },
    'комната': { price: 3000, type: 'жилье', desc: 'Уголок в общежитии' },
    'квартира': { price: 12000, type: 'жилье', desc: 'Собственная квартира в центре' },
    'дом': { price: 45000, type: 'жилье', desc: 'Загородный коттедж' }
};

// --- СПИСОК ИЗВЕСТНЫХ БОТОВ И ПРОВЕРКА ---
const knownBots = new Set([
    'nightbot', 'streamelements', 'fossabot', 'moobot', 'soundalerts',
    'Streamlabs', 'WizeBot', 'Coebot', 'Phantombot', 'AlippBot', 'BotRix', 'AlerterBot'
]);

function isBot(tags, username) {
    const lowerUser = username.toLowerCase();
    if (knownBots.has(lowerUser)) return true;
    if (lowerUser.endsWith('bot') || lowerUser.endsWith('_bot') || lowerUser.endsWith('-bot')) return true;
    if (tags['user-type'] === 'bot' || tags.badges?.bot) return true;
    return false;
}

client.on('message', (channel, tags, message, self) => {
    if (self) return;

    const username = tags['display-name'] || tags.username;
    if (isBot(tags, username)) return;

    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx' || username.toLowerCase() === 'rgrombot';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx';

    // Инициализация данных пользователя
    if (!playerBalances[username]) playerBalances[username] = 100;
    if (!workBalances[username]) workBalances[username] = 200;
    if (!shopBalances[username]) shopBalances[username] = 50;
    if (!boostShopBalances[username]) boostShopBalances[username] = 100;
    if (playerDebts[username] === undefined) playerDebts[username] = 0;
    if (!playerBoosts[username]) {
        playerBoosts[username] = { luck: 0, x2: 0, shield: 0 };
    }

    // --- 1. АВТОПРИВЕТСТВИЕ ---
    if (!greetedUsers.has(username)) {
        greetedUsers.add(username);
        client.say(channel, `Привет, @${username}! Работает банк стрима: бери кредиты (!кредит [сумма]), покупай бусты и играй в казино!`);
    }

    // --- 2. УПРАВЛЕНИЕ КАЗИНО И ВЫВОД СРЕДСТВ ИЗ БАНКОВ (ВЛАДЕЛЕЦ) ---
    if (lowerMessage === '!открыть казино' && isMod) {
        isCasinoOpen = true;
        manualOverride = true;
        client.say(channel, `🟢 Казино вручную ОТКРЫТО!`);
        return;
    }
    if (lowerMessage === '!закрыть казино' && isMod) {
        isCasinoOpen = false;
        manualOverride = true;
        client.say(channel, `🔴 Казино вручную ЗАКРЫТО!`);
        return;
    }

    // Универсальное снятие средств со всех банков владельцем -> на рабочий счет владельца
    if (lowerMessage.startsWith('!снятьбанк') && isBroadcaster) {
        const parts = trimmedMessage.split(' ');
        const bankType = parts[1]?.toLowerCase();
        const amountArg = parts[2]?.toLowerCase();

        if (!bankType) {
            client.say(channel, `⚠️ Укажите банк: !снятьбанк [казино / бусты / магазин / банк] [сумма / all]`);
            return;
        }

        let targetName = '';
        let currentVal = 0;

        if (bankType === 'казино') {
            targetName = 'банк казино';
            currentVal = casinoBank;
        } else if (bankType === 'бусты' || bankType === 'бустов') {
            targetName = 'банк бустов';
            currentVal = boostsBank;
        } else if (bankType === 'магазин') {
            targetName = 'банк магазина';
            currentVal = storeBank;
        } else if (bankType === 'банк' || bankType === 'общий') {
            targetName = 'основной счет банка';
            currentVal = mainBankBalance;
        } else {
            client.say(channel, `❌ Неизвестный банк. Доступно: казино, бусты, магазин, банк`);
            return;
        }

        let amount = amountArg === 'all' || amountArg === 'все' ? currentVal : parseInt(amountArg);

        if (isNaN(amount) || amount <= 0 || amount > currentVal) {
            client.say(channel, `⚠️ Ошибка! В банке (${targetName}) доступно: ${currentVal}`);
            return;
        }

        // Списание с выбранного банка
        if (bankType === 'казино') casinoBank -= amount;
        else if (bankType === 'бусты' || bankType === 'бустов') boostsBank -= amount;
        else if (bankType === 'магазин') storeBank -= amount;
        else if (bankType === 'банк' || bankType === 'общий') mainBankBalance -= amount;

        // Зачисление владельцу на рабочий счет
        workBalances[username] = (workBalances[username] || 0) + amount;
        client.say(channel, `💸 Владелец @${username} снял ${amount} из (${targetName}) на свой рабочий счет (+${amount} 💵)!`);
        return;
    }

    // --- 3. БАНКОВСКАЯ СИСТЕМА (КРЕДИТЫ И СЧЕТА) ---
    if (lowerMessage === '!банк' || lowerMessage === '!bank') {
        client.say(channel, `🏦 БАНК СТРИМА | Основной счет: ${mainBankBalance} 🪙 | Казино: ${casinoBank} 🪙 | Бусты: ${boostsBank} | Магазин: ${storeBank} 💵`);
        return;
    }

    if (lowerMessage.startsWith('!кредит') || lowerMessage.startsWith('!взятькредит')) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Укажите сумму кредита. Пример: !кредит 500`);
            return;
        }
        playerDebts[username] += amount;
        playerBalances[username] += amount; // Выдаем кредит на игровой баланс казино
        client.say(channel, `🏦 Банк одобрил и выдал @${username} кредит на сумму ${amount} 🪙! Общий долг: ${playerDebts[username]} 🪙`);
        return;
    }

    if (lowerMessage === '!долг' || lowerMessage === '!мойдолг') {
        client.say(channel, `💳 @${username}, ваш текущий кредитный долг: ${playerDebts[username]} 🪙`);
        return;
    }

    if (lowerMessage.startsWith('!погаситькредит') || lowerMessage.startsWith('!вернутькредит')) {
        const args = trimmedMessage.split(' ');
        let amount = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? playerDebts[username] : parseInt(args[1]);
        const currentDebt = playerDebts[username];

        if (isNaN(amount) || amount <= 0 || currentDebt <= 0) {
            client.say(channel, `⚠️ У вас нет активных долгов или неверная сумма.`);
            return;
        }
        if (amount > currentDebt) amount = currentDebt;
        if (playerBalances[username] < amount) {
            client.say(channel, `❌ Недостаточно средств на балансе казино (${playerBalances[username]} 🪙) для погашения ${amount} 🪙 долга.`);
            return;
        }

        playerBalances[username] -= amount;
        playerDebts[username] -= amount;
        mainBankBalance += amount; // Деньги от погашения кредита идут на банковский счет банка
        client.say(channel, `✅ @${username} успешно погасил ${amount} 🪙 долга! Остаток долга: ${playerDebts[username]} 🪙`);
        return;
    }

    // --- 4. МАГАЗИН ПРЕДМЕТОВ (С ПРОЦЕНТОМ В БАНК) ---
    if (lowerMessage === '!магазин') {
        let text = `🛒 МАГАЗИН ТОВАРОВ: `;
        Object.entries(SHOP_ITEMS).forEach(([itemName, itemData]) => {
            text += `[${itemName}] — ${itemData.price} 💵 (${itemData.desc}) | `;
        });
        client.say(channel, text + `Купить: !купить [название]`);
        return;
    }

    if (lowerMessage.startsWith('!купить ') && !lowerMessage.startsWith('!купитьбуст')) {
        const itemName = trimmedMessage.split(' ')[1]?.toLowerCase();
        const item = SHOP_ITEMS[itemName];

        if (!item) {
            client.say(channel, `❌ Такого товара нет в магазине! Каталог: !магазин`);
            return;
        }

        if (workBalances[username] < item.price) {
            client.say(channel, `❌ Недостаточно средств на рабочем счете! У вас: ${workBalances[username]} 💵 (нужно: ${item.price})`);
            return;
        }

        workBalances[username] -= item.price;
        
        // Процент от покупки идет в банк магазина и на главный счет банка
        const bankTax = Math.floor(item.price * 0.15); // 15% в банк
        storeBank += bankTax;
        mainBankBalance += bankTax;

        if (!playerInventory[username]) playerInventory[username] = [];
        playerInventory[username].push(itemName);

        client.say(channel, `🛍️ Поздравляем, @${username}! Вы купили "${itemName}" за ${item.price} 💵! (15% (${bankTax}) уведено в банк)`);
        return;
    }

    // --- 5. МАГАЗИН БУСТОВ И СЧЕТ БУСТОВ ---
    if (lowerMessage === '!бустышоп' || lowerMessage === '!усилители' || lowerMessage === '!boosts') {
        let text = `⚡ МАГАЗИН БУСТОВ (за счет бустов 🔮): `;
        Object.entries(CASINO_BOOSTS).forEach(([bName, bData]) => {
            text += `[${bName}] — ${bData.price} очков (${bData.desc}) | `;
        });
        client.say(channel, text + `Купить: !купитьбуст [название] | Ваш счет: !счетбустов`);
        return;
    }

    if (lowerMessage === '!счетбустов' || lowerMessage === '!boostbalance') {
        client.say(channel, `🔮 @${username}, ваш баланс счета бустов: ${boostShopBalances[username]} очков | Активные бусты: !моибусты`);
        return;
    }

    if (lowerMessage === '!моибусты') {
        const b = playerBoosts[username];
        client.say(channel, `⚡ @${username} | Удача: ${b.luck} зарядов | Множитель x2: ${b.x2} зарядов | Щит: ${b.shield} зарядов`);
        return;
    }

    if (lowerMessage.startsWith('!купитьбуст') || lowerMessage.startsWith('!buyboost')) {
        const boostKey = trimmedMessage.split(' ')[1]?.toLowerCase();
        const boostData = CASINO_BOOSTS[boostKey];

        if (!boostData) {
            client.say(channel, `❌ Такого усилителя нет! Каталог: !бустышоп`);
            return;
        }

        if (boostShopBalances[username] < boostData.price) {
            client.say(channel, `❌ Недостаточно средств на счете бустов! У вас: ${boostShopBalances[username]} очков (нужно: ${boostData.price})`);
            return;
        }

        boostShopBalances[username] -= boostData.price;
        playerBoosts[username][boostData.type] += boostData.amount;

        // Процент от покупки буста идет в банк бустов и на главный счет банка
        const bankTax = Math.floor(boostData.price * 0.20); // 20% в банк
        boostsBank += bankTax;
        mainBankBalance += bankTax;

        client.say(channel, `🎉 Успешно! @${username} приобрел буст "**${boostKey}**" (+${boostData.amount} зарядов)! Часть средств ушла в банк бустов.`);
        return;
    }

    // --- 6. КАЗИНО С УЧЕТОМ ПРОЦЕНТОВ В БАНК ---
    if (lowerMessage.startsWith('!spin')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ Казино сейчас закрыто.`);
            return;
        }

        const args = trimmedMessage.split(' ');
        let bet = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? playerBalances[username] : parseInt(args[1]);

        if (isNaN(bet) || bet <= 0 || playerBalances[username] < bet) {
            client.say(channel, `⚠️ @${username}, неверная ставка. У вас на балансе казино: ${playerBalances[username]} 🪙`);
            return;
        }

        playerBalances[username] -= bet;

        const boosts = playerBoosts[username];
        let winMultiplier = 1;
        let winChanceBonus = 0;
        let usedAnyBoost = false;

        if (boosts.luck > 0) {
            boosts.luck--;
            winChanceBonus = 0.20;
            usedAnyBoost = true;
        }

        if (boosts.x2 > 0) {
            boosts.x2--;
            winMultiplier = 2;
            usedAnyBoost = true;
        }

        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        let r1 = symbols[Math.floor(Math.random() * symbols.length)];
        let r2 = symbols[Math.floor(Math.random() * symbols.length)];
        let r3 = symbols[Math.floor(Math.random() * symbols.length)];

        if (winChanceBonus > 0 && r1 !== r2 && r2 !== r3 && r1 !== r3) {
            if (Math.random() < 0.5) r2 = r1;
        }

        if (r1 === r2 && r2 === r3) {
            let rawWin = bet * 15 * winMultiplier;
            const tax = Math.floor(rawWin * 0.1);
            
            // Процент от выигрыша казино идет в банк казино и на главный счет банка
            const bankShare = Math.floor(tax * 0.5);
            casinoBank += (tax - bankShare);
            mainBankBalance += bankShare;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += Math.floor(bet / 2);
            client.say(channel, `🎰 ДЖЕКПOT! @${username} (${r1} ${r2} ${r3}) выиграл +${win} КРЫШКИ! (Процент ушел в банк)`);
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            let rawWin = Math.floor(bet * 2.5 * winMultiplier);
            const tax = Math.max(1, Math.floor(rawWin * 0.1));

            const bankShare = Math.max(1, Math.floor(tax * 0.5));
            casinoBank += (tax - bankShare);
            mainBankBalance += bankShare;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += 2;
            client.say(channel, `✨ Пара (${r1} ${r2} ${r3})! @${username} выиграл +${win} КРЫШКИ!`);
        } else {
            if (boosts.shield > 0) {
                boosts.shield--;
                const refund = Math.floor(bet * 0.5);
                playerBalances[username] += refund;
                client.say(channel, `🛡️ Щит спас @${username}! Возвращено 50% ставки (${refund} 🪙).`);
            } else {
                shopBalances[username] += 1;
                client.say(channel, `❌ Эх, @${username} (${r1} ${r2} ${r3}). Проигрыш.`);
            }
        }
        return;
    }

    // --- 7. ОБЩИЙ БАЛАНС И СТАТИСТИКА ---
    if (lowerMessage === '!баланс' || lowerMessage === '!крышки') {
        client.say(channel, `💰 @${username} | Казино: ${playerBalances[username]} 🪙 | Работа: ${workBalances[username]} 💵 | Счёт бустов: ${boostShopBalances[username]} 🔮 | Долг банку: ${playerDebts[username]} 🪙`);
        return;
    }

    // --- 8. РАБОТА И ОБМЕН ---
    if (lowerMessage === '!работы') {
        let text = `💼 ДОСТУПНЫЕ РАБОТЫ: `;
        Object.entries(JOBS_DATA).forEach(([jobName, data]) => {
            text += `[${jobName}] Зарплата: ${data.salary} 💵 | `;
        });
        client.say(channel, text + `Устроиться: !устроиться [название]`);
        return;
    }

    if (lowerMessage === '!работа' || lowerMessage === '!work') {
        const currentJob = playerJobs[username];
        if (!currentJob) { client.say(channel, `❌ Вы безработный! Список: !работы`); return; }
        const jobConfig = JOBS_DATA[currentJob];
        const now = Date.now();
        const timeLeft = (jobCooldowns[username] || 0) + jobConfig.cooldown - now;

        if (timeLeft > 0) {
            client.say(channel, `⏳ @${username}, смена не окончена. Ждать ~${Math.ceil(timeLeft / 60000)} мин.`);
            return;
        }

        jobCooldowns[username] = now;
        workBalances[username] += jobConfig.salary;
        client.say(channel, `💼 @${username} отработал смену (**${currentJob}**) и получил +${jobConfig.salary} 💵!`);
        return;
    }

    if (lowerMessage.startsWith('!обменять крышки')) {
        const amount = parseInt(trimmedMessage.split(' ')[2]);
        if (isNaN(amount) || amount <= 0 || workBalances[username] < amount) {
            client.say(channel, `⚠️ Ошибка обмена. Проверьте рабочий счет: ${workBalances[username]} 💵`);
            return;
        }
        workBalances[username] -= amount;
        playerBalances[username] += amount;
        client.say(channel, `💱 @${username} обменял ${amount} 💵 на ${amount} 🪙 крышек для казино!`);
        return;
    }

    if (lowerMessage.startsWith('!обналичить') || lowerMessage.startsWith('!вывести')) {
        let amount = trimmedMessage.split(' ')[1]?.toLowerCase() === 'all' ? playerBalances[username] : parseInt(trimmedMessage.split(' ')[1]);
        if (isNaN(amount) || amount <= 0 || playerBalances[username] < amount) {
            client.say(channel, `⚠️ Ошибка вывода. Баланс казино: ${playerBalances[username]} 🪙`);
            return;
        }
        playerBalances[username] -= amount;
        workBalances[username] += amount;
        client.say(channel, `🏧 @${username} вывел ${amount} 🪙 из казино на личный рабочий счет (+${amount} 💵)!`);
        return;
    }
});

// Подключение бота
client.connect().catch(console.error);

// HTTP-сервер для Render.com
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RGROMBOT Full Featured Twitch Bot Service is Running!\n');
}).listen(PORT, () => {
    console.log(`HTTP сервер запущен на порту ${PORT}`);
});
