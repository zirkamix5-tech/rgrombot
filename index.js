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
const shopBalances = {};             // Балансы очков магазина (отдельный счет)
const playerVips = new Set();        // Список игроков с VIP-статусом

// --- СИСТЕМА ДОЛГОВ ---
const playerDebts = {};              // Сумма долга игрока
const debtTimestamps = {};           // Время взятия долга (миллисекунды)
const DEBT_LIMIT_MS = 3 * 24 * 60 * 60 * 1000; // 3 дня в миллисекундах

// --- СИСТЕМА БРАКОВ, ПОЛИАМОРИИ И ДЕТЕЙ ---
const marriages = {};                // marriages[username] = { partners: [Set], timestamp: ms, date: 'ДД.ММ.ГГГГ', children: [] }
const marriageProposals = {};        // marriageProposals[targetUser] = fromUser

// --- СИСТЕМА РАБОТЫ И ИМУЩЕСТВА ---
const playerJobs = {};               // playerJobs[username] = 'Название работы'
const jobCooldowns = {};             // jobCooldowns[username] = timestamp последнего смены/зарплаты
const playerInventory = {};          // playerInventory[username] = Set(['машина', 'квартира'])

// Список доступных профессий: [зарплата, кулдаун в мс, мин. денег на руках для устройства]
const JOBS_DATA = {
    'Грузчик': { salary: 45, cooldown: 15 * 60 * 1000, req: 0 },
    'Курьер': { salary: 90, cooldown: 25 * 60 * 1000, req: 100 },
    'Менеджер': { salary: 180, cooldown: 40 * 60 * 1000, req: 500 },
    'Программист': { salary: 350, cooldown: 60 * 60 * 1000, req: 1500 }
};

// Каталог магазина имущества (покупается за рабочие деньги!)
const SHOP_ITEMS = {
    'велосипед': { price: 500, type: 'транспорт', desc: 'Двухколесный друг для поездок' },
    'мопед': { price: 1500, type: 'транспорт', desc: 'Уже с ветерком!' },
    'машина': { price: 5000, type: 'транспорт', desc: 'Настоящая личная тачка' },
    'спорткар': { price: 20000, type: 'транспорт', desc: 'Быстрая машина для стритрейсера' },
    'комната': { price: 3000, type: 'жилье', desc: 'Уголок в общежитии' },
    'квартира': { price: 12000, type: 'жилье', desc: 'Собственная квартира в центре' },
    'дом': { price: 45000, type: 'жилье', desc: 'Загородный коттедж' }
};

let casinoBank = 0;                  // Общий банк казино (от % побед в !spin)
let storeBank = 0;                   // Общий банк магазина (от % покупок в !купить)
let isCasinoOpen = true;             // Состояние казино (открыто по умолчанию)
let manualOverride = false;          // Флаг ручного вмешательства в расписание

// --- СПИСОК ИЗВЕСТНЫХ БОТОВ И ПРОВЕРКА ---
const knownBots = new Set([
    'nightbot',
    'streamelements',
    'fossabot',
    'moobot',
    'soundalerts',
    'Streamlabs',
    'WizeBot',
    'Coebot',
    'Phantombot',
    'AlippBot',
    'BotRix',
    'AlerterBot'
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

    if (isBot(tags, username)) {
        return;
    }

    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx' || username.toLowerCase() === 'rgrombot';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx';

    // Инициализация балансов игрока
    if (!playerBalances[username]) {
        playerBalances[username] = 100; // Стартовые крышки для казино
    }
    if (!workBalances[username]) {
        workBalances[username] = 200;   // Стартовые деньги с работы
    }
    if (!shopBalances[username]) {
        shopBalances[username] = 50;    // Стартовые очки для магазина
    }
    if (playerDebts[username] === undefined) {
        playerDebts[username] = 0;
    }

    // --- 1. МОДУЛЬ АВТОПРИВЕТСТВИЯ ---
    if (!greetedUsers.has(username)) {
        greetedUsers.add(username);
        const greeting = `Привет, @${username}! Добро пожаловать на стрим! Устраивайся на работу (!работы), зарабатывай деньги, покупай имущество (!имуществошоп) или обменивай их на крышки для казино (!spin)!`;
        client.say(channel, greeting);
        console.log(`[Автоприветствие] Отправлено для: ${username}`);
    }

    // --- 2. УПРАВЛЕНИЕ КАЗИНО И БАНКАМИ (МОДЕРАТОРЫ / ВЛАДЕЛЕЦ) ---
    if (lowerMessage === '!открыть казино' && isMod) {
        isCasinoOpen = true;
        manualOverride = true;
        client.say(channel, `🟢 Казино вручную ОТКРЫТО! Крутите слоты командой !spin [сумма]!`);
        return;
    }

    if (lowerMessage === '!закрыть казино' && isMod) {
        isCasinoOpen = false;
        manualOverride = true;
        client.say(channel, `🔴 Казино вручную ЗАКРЫТО!`);
        return;
    }

    if (lowerMessage === '!авто режим казино' && isMod) {
        manualOverride = false;
        client.say(channel, `⚙️ Ручной режим отключен. Казино переведено на автоматическое расписание.`);
        return;
    }

    if (lowerMessage.startsWith('!снятьбанк') && isBroadcaster) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0 || amount > casinoBank) {
            client.say(channel, `⚠️ Ошибка! Проверьте сумму. Текущий банк казино: ${casinoBank}`);
            return;
        }
        casinoBank -= amount;
        playerBalances[username] = (playerBalances[username] || 0) + amount;
        client.say(channel, `💸 Владелец @${username} снял из банка казино ${amount} КРЫШКИ!`);
        return;
    }

    if (lowerMessage.startsWith('!снятьбанкмагазина') && isBroadcaster) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0 || amount > storeBank) {
            client.say(channel, `⚠️ Ошибка! Проверьте сумму. Банк магазина: ${storeBank}`);
            return;
        }
        storeBank -= amount;
        shopBalances[username] = (shopBalances[username] || 0) + amount;
        client.say(channel, `💸 Владелец @${username} снял из банка магазина ${amount} очков!`);
        return;
    }

    // --- 3. ОБЩАЯ СТАТИСТИКА СТРИМА ---
    if (lowerMessage === '!статистика' || lowerMessage === '!стримстат' || lowerMessage === '!stats') {
        const totalPlayers = Object.keys(playerBalances).length;
        const totalCoins = Object.values(playerBalances).reduce((acc, val) => acc + val, 0);
        const totalWorkMoney = Object.values(workBalances).reduce((acc, val) => acc + val, 0);
        
        client.say(channel, `📈 СТАТИСТИКА: Игроков: ${totalPlayers} | Крышек на руках: ${totalCoins} 🪙 | Денег на счетах работы: ${totalWorkMoney} 💵 | Банк казино: ${casinoBank}`);
        return;
    }

    // --- 4. СИСТЕМА БРАКОВ И ПОЛИАМОРИИ ---
    if (lowerMessage.startsWith('!брак') || lowerMessage.startsWith('!marry')) {
        const args = trimmedMessage.split(' ');
        if (args.length < 2) {
            client.say(channel, `⚠️ @${username}, укажите ник игрока. Пример: !брак [ник]`);
            return;
        }
        let targetUserRaw = args[1].replace('@', '');
        if (username.toLowerCase() === targetUserRaw.toLowerCase()) {
            client.say(channel, `🤔 @${username}, нельзя вступить в брак с самим собой!`);
            return;
        }
        if (marriages[username] && marriages[username].partners.length >= 2) {
            client.say(channel, `❌ @${username}, ваш полиаморный союз уже заполнен (максимум 3 участника)!`);
            return;
        }
        marriageProposals[targetUserRaw.toLowerCase()] = username;
        client.say(channel, `💍 @${username} сделал(а) предложение игроку @${targetUserRaw}! Согласие: !принять брак`);
        return;
    }

    if (lowerMessage === '!принять брак' || lowerMessage === '!acceptmarry') {
        const proposer = marriageProposals[username.toLowerCase()];
        if (!proposer) {
            client.say(channel, `ℹ️ @${username}, вам никто не делал предложений.`);
            return;
        }
        const proposerKey = Object.keys(playerBalances).find(u => u.toLowerCase() === proposer.toLowerCase()) || proposer;
        const currentTimestamp = Date.now();
        const currentDate = new Date().toLocaleDateString('ru-RU');

        if (!marriages[proposerKey]) {
            marriages[proposerKey] = { partners: [], timestamp: currentTimestamp, date: currentDate, children: [] };
        }
        if (!marriages[proposerKey].partners.includes(username)) marriages[proposerKey].partners.push(username);

        if (!marriages[username]) {
            marriages[username] = { partners: [], timestamp: currentTimestamp, date: currentDate, children: [] };
        }
        if (!marriages[username].partners.includes(proposerKey)) marriages[username].partners.push(proposerKey);

        delete marriageProposals[username.toLowerCase()];
        client.say(channel, `💒 Горько! Сформирован союз между @${proposerKey} и @${username}! 🎉`);
        return;
    }

    if (lowerMessage === '!отклонить брак') {
        delete marriageProposals[username.toLowerCase()];
        client.say(channel, `💔 @${username} отклонил(а) предложение.`);
        return;
    }

    if (lowerMessage === '!семья' || lowerMessage === '!пара') {
        const familyData = marriages[username];
        if (!familyData || familyData.partners.length === 0) {
            client.say(channel, `💍 @${username} пока одинок(а).`);
            return;
        }
        const partnersList = familyData.partners.map(p => `@${p}`).join(', ');
        client.say(channel, `❤️ Семья @${username}: партнеры — ${partnersList} | Составлен: ${familyData.date}`);
        return;
    }

    // --- 5. СИСТЕМА ДОЛГОВ КАЗИНО ---
    if (lowerMessage === '!долг' || lowerMessage === '!debt') {
        const debt = playerDebts[username];
        if (debt === 0) {
            client.say(channel, `✨ @${username}, долгов перед казино нет.`);
            return;
        }
        client.say(channel, `⚠️ @${username}, ваш долг казино: ${debt} КРЫШКИ. Погасить: !вернутьдолг [сумма]`);
        return;
    }

    if (lowerMessage.startsWith('!вдолг')) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @${username}, укажите сумму кредита. Пример: !вдолг 100`);
            return;
        }
        if (playerDebts[username] === 0) debtTimestamps[username] = Date.now();
        playerDebts[username] += amount;
        playerBalances[username] += amount;
        client.say(channel, `🤝 @${username} взял в долг ${amount} КРЫШКИ. Баланс казино: ${playerBalances[username]}`);
        return;
    }

    if (lowerMessage.startsWith('!вернутьдолг')) {
        const args = trimmedMessage.split(' ');
        const currentDebt = playerDebts[username];
        if (currentDebt === 0) {
            client.say(channel, `ℹ️ @${username}, у вас нет долгов.`);
            return;
        }
        let amount = (args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все') ? currentDebt : parseInt(args[1]);
        if (isNaN(amount) || amount <= 0 || playerBalances[username] < amount) {
            client.say(channel, `❌ Недостаточно крышек для возврата долга!`);
            return;
        }
        playerBalances[username] -= amount;
        playerDebts[username] -= amount;
        if (playerDebts[username] === 0) debtTimestamps[username] = null;
        client.say(channel, `✅ @${username} вернул ${amount} КРЫШКИ в счет долга. Остаток долга: ${playerDebts[username]}`);
        return;
    }

    // --- 6. ПЕРЕДАЧА ДЕНЕГ/КРЫШЕК ---
    if (lowerMessage.startsWith('!передать') || lowerMessage.startsWith('!pay')) {
        const args = trimmedMessage.split(' ');
        if (args.length < 3) {
            client.say(channel, `⚠️ Используйте: !передать [ник] [сумма]`);
            return;
        }
        let targetUserRaw = args[1].replace('@', '');
        let targetUser = Object.keys(playerBalances).find(u => u.toLowerCase() === targetUserRaw.toLowerCase());
        const amount = parseInt(args[2]);

        if (!targetUser || isNaN(amount) || amount <= 0 || playerBalances[username] < amount) {
            client.say(channel, `❌ Ошибка перевода. Проверьте баланс и имя игрока.`);
            return;
        }
        playerBalances[username] -= amount;
        playerBalances[targetUser] += amount;
        client.say(channel, `🤝 @${username} перевел ${amount} КРЫШКИ игроку @${targetUser}!`);
        return;
    }

    // --- 7. ТОП ИГРОКОВ КАЗИНО ---
    if (lowerMessage === '!топ' || lowerMessage === '!top') {
        const sortedPlayers = Object.entries(playerBalances).sort(([, a], [, b]) => b - a).slice(0, 5);
        if (sortedPlayers.length === 0) return;
        let topText = `🏆 ТОП-5 КАЗИНО: `;
        sortedPlayers.forEach(([user, balance], index) => {
            topText += `${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index]} @${user} (${balance} 🪙) `;
        });
        client.say(channel, topText);
        return;
    }

    // --- 8. МАГАЗИН БОНУСОВ ---
    if (lowerMessage === '!шоп' || lowerMessage === '!магазин') {
        client.say(channel, `🛒 МАГАЗИН БОНУСОВ: 1️⃣ Пакет крышек (+100 🪙) — 80 очков | 2️⃣ Счастливый билет — 50 очков | 3️⃣ VIP-статус — 300 очков. Купить: !купить [номер]`);
        return;
    }

    if (lowerMessage.startsWith('!купить') && !lowerMessage.startsWith('!купитьвещь')) {
        const args = trimmedMessage.split(' ');
        const itemNumber = parseInt(args[1]);
        if (isNaN(itemNumber)) return;

        if (itemNumber === 1 && shopBalances[username] >= 80) {
            shopBalances[username] -= 80;
            playerBalances[username] += 100;
            client.say(channel, `🎁 @${username} купил пакет крышек (+100 🪙 в казино)!`);
        } else if (itemNumber === 2 && shopBalances[username] >= 50) {
            shopBalances[username] -= 50;
            const win = Math.floor(Math.random() * 81) + 20;
            playerBalances[username] += win;
            client.say(channel, `🎟️ @${username} купил билет и выиграл +${win} КРЫШКИ!`);
        } else if (itemNumber === 3 && shopBalances[username] >= 300) {
            if (playerVips.has(username)) {
                client.say(channel, `ℹ️ У вас уже есть VIP.`);
                return;
            }
            shopBalances[username] -= 300;
            playerVips.add(username);
            client.say(channel, `⭐ Поздравляем, @${username} получил VIP-статус!`);
        } else {
            client.say(channel, `❌ Недостаточно очков магазина! Проверьте баланс: !магазинсчет`);
        }
        return;
    }

    if (lowerMessage === '!магазинсчет') {
        client.say(channel, `💎 @${username}, ваши очки магазина: ${shopBalances[username]}`);
        return;
    }

    // --- 9. КАЗИНО (!spin) ---
    if (lowerMessage.startsWith('!spin')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ Казино сейчас закрыто (работает с 14:00 до 05:00).`);
            return;
        }

        const args = trimmedMessage.split(' ');
        let bet = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? playerBalances[username] : parseInt(args[1]);

        if (isNaN(bet) || bet <= 0 || playerBalances[username] < bet) {
            client.say(channel, `⚠️ @${username}, неверная ставка. У вас на балансе казино: ${playerBalances[username]} 🪙`);
            return;
        }

        playerBalances[username] -= bet;
        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];

        if (r1 === r2 && r2 === r3) {
            const rawWin = bet * 15;
            const tax = Math.floor(rawWin * 0.1);
            const win = rawWin - tax;
            casinoBank += tax;
            playerBalances[username] += win;
            shopBalances[username] += Math.floor(bet / 2);
            client.say(channel, `🎰 ДЖЕКПOT! @${username} (${r1} ${r2} ${r3}) выиграл +${win} КРЫШКИ! Баланс: ${playerBalances[username]}`);
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            const rawWin = Math.floor(bet * 2.5);
            const tax = Math.max(1, Math.floor(rawWin * 0.1));
            const win = rawWin - tax;
            casinoBank += tax;
            playerBalances[username] += win;
            shopBalances[username] += 2;
            client.say(channel, `✨ @${username} поймал пару (${r1} ${r2} ${r3})! Выигрыш: +${win} КРЫШКИ. Баланс: ${playerBalances[username]}`);
        } else {
            shopBalances[username] += 1;
            client.say(channel, `❌ Эх, @${username} (${r1} ${r2} ${r3}). Проигрыш. Баланс: ${playerBalances[username]}`);
        }
        return;
    }

    if (lowerMessage === '!balance' || lowerMessage === '!крышки' || lowerMessage === '!баланс') {
        client.say(channel, `💰 @${username} | Крышки (казино): ${playerBalances[username]} 🪙 | Счет работы: ${workBalances[username]} 💵 | Очки магазина: ${shopBalances[username]}`);
        return;
    }

    // --- 10. МОДУЛЬ РАБОТЫ И КОНВЕРТАЦИИ СЧЕТОВ ---
    if (lowerMessage === '!работы' || lowerMessage === '!профессии') {
        let text = `💼 ДОСТУПНЫЕ РАБОТЫ: `;
        Object.entries(JOBS_DATA).forEach(([jobName, data]) => {
            text += `[${jobName}] Зарплата: ${data.salary} 💵 (Откат: ${data.cooldown / 60000} мин., Мин. сбережений: ${data.req} 💵) | `;
        });
        client.say(channel, text + `Устроиться: !устроиться [название]`);
        return;
    }

    if (lowerMessage === '!мояработа' || lowerMessage === '!работастат') {
        const currentJob = playerJobs[username] || 'Безработный(ая)';
        client.say(channel, `👷 @${username}, ваша профессия: ${currentJob}. Проверить счет: !баланс`);
        return;
    }

    if (lowerMessage.startsWith('!устроиться') || lowerMessage.startsWith('!joinjob')) {
        const args = trimmedMessage.split(' ');
        if (args.length < 2) {
            client.say(channel, `⚠️ Укажите профессию. Пример: !устроиться Курьер (список: !работы)`);
            return;
        }
        const targetJob = Object.keys(JOBS_DATA).find(j => j.toLowerCase() === args[1].toLowerCase());
        if (!targetJob) {
            client.say(channel, `❌ Такой профессии не существует! Список: !работы`);
            return;
        }
        const jobConfig = JOBS_DATA[targetJob];
        if (workBalances[username] < jobConfig.req) {
            client.say(channel, `❌ Недостаточно средств на рабочем счете! Нужно минимум: ${jobConfig.req} 💵`);
            return;
        }
        playerJobs[username] = targetJob;
        client.say(channel, `🎉 Поздравляем, @${username}! Вы устроились на работу: **${targetJob}**! Зарплата капает на рабочий счет.`);
        return;
    }

    if (lowerMessage === '!уволиться') {
        if (!playerJobs[username]) {
            client.say(channel, `ℹ️ Вы нигде не работаете.`);
            return;
        }
        delete playerJobs[username];
        client.say(channel, `📜 @${username} уволился(ась).`);
        return;
    }

    if (lowerMessage === '!работа' || lowerMessage === '!work') {
        const currentJob = playerJobs[username];
        if (!currentJob) {
            client.say(channel, `❌ Вы безработный! Выберите профессию: !работы (!устроиться [название])`);
            return;
        }
        const jobConfig = JOBS_DATA[currentJob];
        const now = Date.now();
        const timeLeft = (jobCooldowns[username] || 0) + jobConfig.cooldown - now;

        if (timeLeft > 0) {
            client.say(channel, `⏳ @${username}, смена еще не закончилась! Ждать еще ~${Math.ceil(timeLeft / 60000)} мин.`);
            return;
        }

        jobCooldowns[username] = now;
        workBalances[username] += jobConfig.salary;
        client.say(channel, `💼 @${username} отработал смену (**${currentJob}**) и получил зарплату: +${jobConfig.salary} 💵! Счет работы: ${workBalances[username]} 💵`);
        return;
    }

    // ** КОНВЕРТАЦИЯ: ИЗ РАБОЧИХ ДЕНЕГ В КРЫШКИ КАЗИНО **
    if (lowerMessage.startsWith('!обменять крышки') || lowerMessage.startsWith('!купитькрышки')) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[2]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Укажите сумму для обмена. Пример: !обменять крышки 100 (1 💵 = 1 🪙)`);
            return;
        }
        if (workBalances[username] < amount) {
            client.say(channel, `❌ На вашем рабочем счете недостаточно денег! Счет: ${workBalances[username]} 💵`);
            return;
        }

        workBalances[username] -= amount;
        playerBalances[username] += amount;
        client.say(channel, `💱 @${username} обменял ${amount} 💵 с рабочего счета на ${amount} 🪙 крышек для казино! Баланс казино: ${playerBalances[username]}`);
        return;
    }

    // ** ВЫВОД ИЗ КАЗИНО НА РАБОЧИЙ СЧЕТ (ОБНАЛИЧИВАНИЕ) **
    if (lowerMessage.startsWith('!обналичить') || lowerMessage.startsWith('!вывести')) {
        const args = trimmedMessage.split(' ');
        let amount = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? playerBalances[username] : parseInt(args[1]);

        if (isNaN(amount) || amount <= 0 || playerBalances[username] < amount) {
            client.say(channel, `⚠️ Укажите корректную сумму для вывода. Баланс казино: ${playerBalances[username]} 🪙`);
            return;
        }

        playerBalances[username] -= amount;
        workBalances[username] += amount;
        client.say(channel, `🏧 @${username} вывел ${amount} 🪙 из казино на личный рабочий счет (+${amount} 💵)! Счет работы: ${workBalances[username]} 💵`);
        return;
    }

    // --- 11. МАГАЗИН ИМУЩЕСТВА (ЗА РАБОЧИЕ ДЕНЬГИ) ---
    if (lowerMessage === '!имуществошоп' || lowerMessage === '!каталог') {
        let shopText = `🛒 МАГАЗИН ИМУЩЕСТВА (за рабочие деньги 💵): `;
        Object.entries(SHOP_ITEMS).forEach(([itemName, data]) => {
            shopText += `[${itemName}] — ${data.price} 💵 (${data.desc}) | `;
        });
        client.say(channel, shopText + `Купить: !купитьвещь [название]`);
        return;
    }

    if (lowerMessage === '!имущество' || lowerMessage === '!инвентарь') {
        const userItems = playerInventory[username];
        if (!userItems || userItems.size === 0) {
            client.say(channel, `🏡 @${username}, у вас пока нет имущества. Каталог: !имуществошоп`);
            return;
        }
        client.say(channel, `🎒 Имущество игрока @${username}: ${Array.from(userItems).join(', ')}`);
        return;
    }

    if (lowerMessage.startsWith('!купитьвещь') || lowerMessage.startsWith('!купитьимущество')) {
        const args = trimmedMessage.split(' ');
        if (args.length < 2) {
            client.say(channel, `⚠️ Укажите товар. Пример: !купитьвещь машина`);
            return;
        }

        const targetItemKey = args[1].toLowerCase();
        const itemData = SHOP_ITEMS[targetItemKey];

        if (!itemData) {
            client.say(channel, `❌ Такого товара нет в продаже! Список: !имуществошоп`);
            return;
        }

        if (!playerInventory[username]) playerInventory[username] = new Set();

        if (playerInventory[username].has(targetItemKey)) {
            client.say(channel, `ℹ️ У вас уже есть этот предмет!`);
            return;
        }

        if (workBalances[username] < itemData.price) {
            client.say(channel, `❌ Недостаточно средств на рабочем счете! Нужно: ${itemData.price} 💵, у вас: ${workBalances[username]} 💵`);
            return;
        }

        workBalances[username] -= itemData.price;
        playerInventory[username].add(targetItemKey);
        client.say(channel, `🎉 Поздравляем, @${username}! Вы приобрели **${targetItemKey}** за ${itemData.price} 💵! Проверить: !имущество`);
        return;
    }
});

// --- 12. АВТО-РАСПИСАНИЕ КАЗИНО ---
setInterval(() => {
    if (manualOverride) return;
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    if (hours === 5 && minutes === 0 && isCasinoOpen) {
        isCasinoOpen = false;
        client.channels.forEach(channel => client.say(channel, `🔴 Наступило 05:00. Казино автоматически ЗАКРЫТО до 14:00!`));
    }
    if (hours === 14 && minutes === 0 && !isCasinoOpen) {
        isCasinoOpen = true;
        client.channels.forEach(channel => client.say(channel, `🟢 Наступило 14:00. Казино автоматически ОТКРЫТО!`));
    }
}, 60 * 1000);

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
