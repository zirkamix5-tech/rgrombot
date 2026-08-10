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
const shopBalances = {};             // Балансы обычных очков магазина
const boostShopBalances = {};        // Отдельный счет для покупки бустов
const playerDebts = {};              // Кредитные долги игроков перед банком
const casinoDebts = {};              // Долги игроков лично перед казино (КРЫШКИ)
const casinoDebtDeadlines = {};      // Таймер/дедлайн погашения долга казино (timestamp в мс)
const personalBankBalances = {};     // Единый личный банковский счёт игроков (сюда капает зарплата, пенсии и т.д.)

// --- СИСТЕМА ВОЗРАСТА И ПЕНСИЙ ---
const playerAges = {};               // Возраст игроков (playerAges[username] = число лет)
const lastPensionTime = {};          // Таймер выплаты пенсии, чтобы не начислять каждую секунду

// --- СИСТЕМА БРАКОВ И СЕМЕЙ ---
const playerMarriages = {};          // playerMarriages[username] = partnerUsername
const marriageDates = {};            // marriageDates[username] = дата/время свадьбы
const pendingProposals = {};         // pendingProposals[targetUsername] = proposingUsername
const marriageTimestamps = {};       // Точный timestamp свадьбы для проверки сроков детей
const playerChildren = {};           // playerChildren[username] = количество детей

// --- СИСТЕМА УСИЛИТЕЛЕЙ (БУСТЕРОВ) ДЛЯ КАЗИНО ---
const playerBoosts = {};             // playerBoosts[username] = { luck: 0, x2: 0, shield: 0 }

const CASINO_BOOSTS = {
    'удача': { price: 150, desc: 'Повышает шанс выигрыша в казино на след. 5 игр', type: 'luck', amount: 5 },
    'х2': { price: 300, desc: 'Удваивает выигрыш в казино на след. 3 игры', type: 'x2', amount: 3 },
    'щит': { price: 200, desc: 'Защищает от проигрыша (возврат 50% ставки) на след. 3 игры', type: 'shield', amount: 3 }
};

// --- СИСТЕМА ДОЛЖНОСТЕЙ В КАЗИНО И ФОНД ЗАРПЛАТ ---
const casinoStaff = {};              // casinoStaff[username] = 'должность'
let casinoSalaryFund = 0;            // Фонд зарплаты сотрудников казино

const CASINO_ROLES = {
    'хостес': {salary: 50, desc: 'Встречает гостей, которые идут в казино'},
    'бармен': {salary: 75, desc: 'Встречает гостей, которые идут в казино'},
    'стриптизёрша': {salary: 120, desc: 'Встречает гостей, которые идут в казино'},
    'стриптизёр': {salary: 130, desc: 'Встречает гостей, которые идут в казино'},
    'крупье': { salary: 140, desc: 'Принимает ставки и раздает фишки в казино' },
    'охранник': { salary: 160, desc: 'Следит за порядком и успокаивает буйных игроков' },
    'менеджер': { salary: 200, desc: 'Управляет процессами и контролирует столы' },
    'директор': { salary: 1200, desc: 'Главный распорядитель казино' }
};

// --- СИСТЕМА КОММУНАЛЬНЫХ НАЛОГОВ И СЧЕТОВ ---
const playerUtilities = {};          // playerUtilities[username] = { water: number, gas: number, light: number }

// --- БАНКОВСКАЯ СИСТЕМА И СЧЕТА СТРИМА ---
let mainBankBalance = 0;             // Основной банковский счет (сюда капают проценты)
let casinoBank = 0;                  // Банк казино
let boostsBank = 0;                  // Банк бустов
let storeBank = 0;                   // Банк магазина
let isCasinoOpen = true;             // Состояние казино
let manualOverride = false;          // Флаг ручного вмешательства

// --- АВТОМАТИЧЕСКОЕ УПРАВЛЕНИЕ КАЗИНО ПО ВРЕМЕНИ ---
setInterval(() => {
    if (manualOverride) return;

    const now = new Date();
    const hours = now.getHours();

    const shouldBeOpen = hours >= 20 || hours < 8 ;

    if (shouldBeOpen && !isCasinoOpen) {
        isCasinoOpen = true;
        client.action('QumosX', `🟢 Наступило время! Казино автоматически ОТКРЫТО. Добро пожаловать! (!каз)`);
    } else if (!shouldBeOpen && isCasinoOpen) {
        isCasinoOpen = false;
        client.action('QumosX', `🔴 Наступил час! Казино автоматически ЗАКРЫТО до завтрашнего дня.`);
    }
}, 60 * 1000);

// --- ПРОВЕРКА ДЕДЛАЙНОВ ДОЛГОВ КАЗИНО ПО ТАЙМЕРУ ---
setInterval(() => {
    const now = Date.now();
    for (const [username, deadline] of Object.entries(casinoDebtDeadlines)) {
        if (deadline && now > deadline && casinoDebts[username] > 0) {
            client.say('QumosX', `⚠️ ВНИМАНИЕ! У @${username} истек 3-дневный срок возврата долга казино (${casinoDebts[username]} 🪙)! Коллекторы выехали!`);
            const fine = Math.min(playerBalances[username], Math.floor(casinoDebts[username] * 0.2));
            if (fine > 0) {
                playerBalances[username] -= fine;
                casinoDebts[username] -= fine;
                client.say('QumosX', `💸 Казино принудительно списало у @${username} ${fine} 🪙 в счет просроченного долга.`);
            }
            delete casinoDebtDeadlines[username];
        }
    }
}, 60 * 1000);

// --- АВТО-УВЕЛИЧЕНИЕ ВОЗРАСТА ИГРОКОВ (Раз в 3 часа реального времени) ---
setInterval(() => {
    for (const username of Object.keys(playerBalances)) {
        playerAges[username] = (playerAges[username] || 18) + 1;
    }
}, 3 * 60 * 60 * 1000);

// --- СИСТЕМА НАЧИСЛЕНИЯ ПЕНСИЙ (Каждый час для игроков 50+) ---
setInterval(() => {
    for (const [username, age] of Object.entries(playerAges)) {
        if (age >= 50) {
            const jobKey = playerJobs[username];
            const jobSalary = (jobKey && JOBS_DATA[jobKey]) ? JOBS_DATA[jobKey].salary : 30;
            const pensionAmount = Math.floor(jobSalary * 0.6);

            if (mainBankBalance < pensionAmount) {
                continue;
            }

            mainBankBalance -= pensionAmount;
            personalBankBalances[username] = (personalBankBalances[username] || 0) + pensionAmount;
            client.say('QumosX', `👴 Государственный банк выплатил пенсию ветерану труда @${username} (Возраст: ${age} лет) в размере ${pensionAmount} 💵 на личный банковский счёт!`);
        }
    }
}, 60 * 60 * 1000);

// --- СИСТЕМА АВТО-ВЫДАЧИ ЗАРПЛАТЫ СОТРУДНИКАМ КАЗИНО (Каждый час) ---
setInterval(() => {
    const staffEntries = Object.entries(casinoStaff);
    if (staffEntries.length === 0) return;

    let totalNeeded = 0;
    staffEntries.forEach(([username, roleKey]) => {
        const roleData = CASINO_ROLES[roleKey];
        if (roleData) totalNeeded += roleData.salary;
    });

    if (casinoSalaryFund < totalNeeded) {
        client.say('QumosX', `⚠️ В фонде зарплаты казино (${casinoSalaryFund} 🪙) недостаточно средств для выплаты зарплат сотрудникам! Пополните фонд.`);
        return;
    }

    casinoSalaryFund -= totalNeeded;
    staffEntries.forEach(([username, roleKey]) => {
        const roleData = CASINO_ROLES[roleKey];
        if (roleData) {
            personalBankBalances[username] = (personalBankBalances[username] || 0) + roleData.salary;
        }
    });

    client.say('QumosX', `💰 Автоматическая выплата зарплат сотрудникам казино успешно проведена из фонда! Зарплаты зачислены на личные банковские счета 💵.`);
}, 60 * 60 * 1000);

// --- СИСТЕМА НАЧИСЛЕНИЯ КОММУНАЛЬНЫХ НАЛОГОВ (Каждый час для владельцев жилья) ---
setInterval(() => {
    for (const [username, inventory] of Object.entries(playerInventory)) {
        const hasHousing = inventory.some(item => {
            const itemInfo = SHOP_ITEMS[item];
            return itemInfo && itemInfo.type === 'жилье';
        });

        if (hasHousing) {
            if (!playerUtilities[username]) {
                playerUtilities[username] = { water: 0, gas: 0, light: 0 };
            }
            playerUtilities[username].water += 25;
            playerUtilities[username].gas += 30;
            playerUtilities[username].light += 35;
        }
    }
}, 60 * 60 * 1000);

// --- СИСТЕМА РАБОТЫ И ИМУЩЕСТВА ---
const playerJobs = {};               
const jobCooldowns = {};             
const playerInventory = {};          

const JOBS_DATA = {
    'Мусорщик': { salary: 30, cooldown: 60 * 60 * 1000, req: 0 },
    'Грузчик': { salary: 55, cooldown: 15 * 60 * 1000, req: 0 },
    'Курьер': { salary: 100, cooldown: 30 * 60 * 1000, req: 125 },
    'Электрик': { salary: 150, cooldown: 45 * 60 * 1000, req: 200 },
    'Бухгалтер': { salary: 200, cooldown: 60 * 60 * 1000, req: 300 },
    'Помощник-Повара': { salary: 230, cooldown: 60 * 60 * 1000, req: 270 },
    'Менеджер': { salary: 250, cooldown: 80 * 60 * 1000, req: 450 },
    'Проститут': { salary: 500, cooldown: 60 * 60 * 1000, req: 1000 },
    'Проститутка': { salary: 700, cooldown: 60 * 60 * 1000, req: 1000 },
    'Официант': { salary: 700, cooldown: 60 * 60 * 1000, req: 1000 },
    'Программист': { salary: 800, cooldown: 100 * 60 * 1000, req: 500 },
    'Домашний-кондитер': { salary: 900, cooldown: 120 * 120 * 1000, req: 1000 },
    'Шеф-Повар': { salary: 1200, cooldown: 60 * 60 * 1000, req: 1000 },
    'Су-шеф': { salary: 2000, cooldown: 60 * 60 * 1000, req:  1000 },
    'Модель': { salary: 2300, cooldown: 60 * 60 * 1000, req: 2700 },
    'Актёр': { salary: 2500, cooldown: 60 * 60 * 1000, req: 2900 },
};

const SHOP_ITEMS = {
    'велосипед': { price: 500, type: 'транспорт', desc: 'Двухколесный друг для поездок' },
    'мопед': { price: 1500, type: 'транспорт', desc: 'Уже с ветерком!' },
    'электросамокат': { price: 3500, type: 'транспорт', desc: 'Уже легче' },
    'электромопед': { price: 5500, type: 'транспорт', desc: 'Электро...' },
    'машина': { price: 5000, type: 'транспорт', desc: 'Настоящая личная тачка' },
    'спорткар': { price: 20000, type: 'транспорт', desc: 'Быстрая машина для стритрейсера' },
    'Яхта': { price: 30000, type: 'транспорт', desc: 'Легче чем было' },
    'Круиз-Лайнер': { price: 75000, type: 'транспорт', desc: 'Плаваем удачно' },
    'Самолёт': { price: 100000, type: 'транспорт', desc: 'Уже летаем.' },
    'Вертолёт': { price: 125000, type: 'транспорт', desc: 'Ура, вертик.' },
    'комната': { price: 3000, type: 'жилье', desc: 'Уголок в общежитии' },
    'квартира': { price: 12000, type: 'жилье', desc: 'Собственная квартира в центре' },
    'дом': { price: 45000, type: 'жилье', desc: 'Загородный домик' },
    'Коттедж': { price: 60000, type: 'жилье', desc: 'Загородный коттедж' },
    'Вилла': { price: 100000, type: 'жилье', desc: 'Уф, богато!' }
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

    const username = (tags['display-name'] || tags.username).toLowerCase();
    if (isBot(tags, username)) return;

    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username === 'qumosx' || username === 'gospod_bomzhik' || username === 'miss__krevetka' || username === 'r0ma_gr0m';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username === 'qumosx' || username === 'gospod_bomzhik' || username === 'miss__krevetka' || username === 'r0ma_gr0m';

    // Инициализация данных пользователя по умолчанию
    if (playerBalances[username] === undefined) playerBalances[username] = 100;
    if (personalBankBalances[username] === undefined) personalBankBalances[username] = 0;
    if (!shopBalances[username]) shopBalances[username] = 0;
    if (!boostShopBalances[username]) boostShopBalances[username] = 0;
    if (playerDebts[username] === undefined) playerDebts[username] = 0;
    if (casinoDebts[username] === undefined) casinoDebts[username] = 0;
    if (playerAges[username] === undefined) playerAges[username] = 18;
    if (!playerBoosts[username]) {
        playerBoosts[username] = { luck: 0, x2: 0, shield: 0 };
    }
    if (!playerUtilities[username]) {
        playerUtilities[username] = { water: 0, gas: 0, light: 0 };
    }
    if (playerChildren[username] === undefined) playerChildren[username] = 0;

    // --- 2. УПРАВЛЕНИЕ КАЗИНО И ФОНДОМ ЗАРПЛАТ (ВЛАДЕЛЕЦ) ---
    if (lowerMessage === '!каз открыть' && isMod) {
        isCasinoOpen = true;
        manualOverride = true;
        client.say(channel, `🟢 Сотрудник казино @${username}!, открывает его в ручную. КАЗИНО ОТКРЫТО!`);
        return;
    }
    if (lowerMessage === '!каз закрыть' && isMod) {
        isCasinoOpen = false;
        manualOverride = true;
        client.say(channel, `🔴 Сотрудник казино @${username}!, в ручную закрывает его. КАЗИНО ЗАКРЫТО!`);
        return;
    }

    if (lowerMessage.startsWith('!возраст') && isBroadcaster) {
        const parts = trimmedMessage.split(' ');
        const targetArg = parts[1]?.replace('@', '').toLowerCase();
        const newAge = parseInt(parts[2]);

        if (!targetArg || isNaN(newAge) || newAge < 0) {
            client.say(channel, `⚠️ Использование: !возраст @ник [новое число]`);
            return;
        }

        playerAges[targetArg] = newAge;
        client.say(channel, `🎂 Владелец установил возраст игрока @${targetArg} равным ${newAge} лет.`);
        return;
    }

    if (lowerMessage === '!банкстат') {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, просмотр общего счёта всех банков доступен только Владельцу!`);
            return;
        }
        client.say(channel, `📈 СЧЕТА БАНКОВ | Главный счет: ${mainBankBalance} 🪙 | Казино: ${casinoBank} 🪙 | Фонд ЗП казино: ${casinoSalaryFund} 🪙 | Магазин: ${storeBank} | Банк бустов: ${boostsBank} 🔮`);
        return;
    }

    if (lowerMessage.startsWith('фонд+') || lowerMessage.startsWith('!фонд+')) {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, пополнять фонд зарплаты казино может только Владелец!`);
            return;
        }
        const amount = parseInt(trimmedMessage.split(' ')[1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Укажите сумму пополнения фонда. Пример: !фонд+ 1000`);
            return;
        }
        casinoSalaryFund += amount;
        client.say(channel, `💼 Владелец пополнил фонд зарплаты казино на ${amount} 🪙! Общий фонд зарплат: ${casinoSalaryFund} 🪙`);
        return;
    }

    if (lowerMessage.startsWith('фонд-') || lowerMessage.startsWith('!фонд-')) {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, снимать деньги из фонда зарплаты казино может только Владелец!`);
            return;
        }
        const args = trimmedMessage.split(' ');
        let amount = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? casinoSalaryFund : parseInt(args[1]);

        if (isNaN(amount) || amount <= 0 || amount > casinoSalaryFund) {
            client.say(channel, `⚠️ Ошибка! В фонде зарплат доступно: ${casinoSalaryFund} 🪙`);
            return;
        }

        casinoSalaryFund -= amount;
        personalBankBalances[username] = (personalBankBalances[username] || 0) + amount;
        client.say(channel, `💸 Владелец @${username} снял ${amount} 🪙 из фонда зарплаты казино на свой личный банковский счет (+${amount} 💵)!`);
        return;
    }

    if (lowerMessage.startsWith('!нанять') || lowerMessage.startsWith('!дать роль')) {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, управлять должностями сотрудников может только Владелец!`);
            return;
        }
        const parts = trimmedMessage.split(' ');
        const targetArg = parts[1]?.replace('@', '').toLowerCase();
        const roleArg = parts[2]?.toLowerCase();

        if (!targetArg || !roleArg || !CASINO_ROLES[roleArg]) {
            client.say(channel, `⚠️ Использование: !нанять @ник [должность]. Доступные: хостес, бармен, стриптизёр, стриптизёрша, крупье, охранник, менеджер, директор`);
            return;
        }

        casinoStaff[targetArg] = roleArg;
        client.say(channel, `👔 Владелец назначил игрока @${targetArg} на должность в казино: **${roleArg}** (Зарплата: ${CASINO_ROLES[roleArg].salary} 🪙 / раз в час)`);
        return;
    }

    if (lowerMessage.startsWith('!уволитьказ') || lowerMessage.startsWith('!снять роль')) {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, эта команда доступна только Владельцу!`);
            return;
        }
        const targetArg = trimmedMessage.split(' ')[1]?.replace('@', '').toLowerCase();
        if (!targetArg || !casinoStaff[targetArg]) {
            client.say(channel, `⚠️ Укажите корректного сотрудника казино.`);
            return;
        }
        delete casinoStaff[targetArg];
        client.say(channel, `🚪 Владелец снял с должности сотрудника @${targetArg}.`);
        return;
    }

    if (lowerMessage.startsWith('крышечки') || lowerMessage.startsWith('!крышечки')) {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, Выдавать крышки может только Владелец.`);
            return;
        }
        const parts = trimmedMessage.split(' ');
        const targetArg = parts[1]?.replace('@', '').toLowerCase();
        const amount = parseInt(parts[2]);

        if (!targetArg || isNaN(amount)) {
            client.say(channel, `⚠️ Использование: !крышечки @ник [сумма] (можно указывать отрицательные для списания)`);
            return;
        }

        if (playerBalances[targetArg] === undefined) {
            playerBalances[targetArg] = 100;
        }

        playerBalances[targetArg] += amount;
        client.say(channel, `👑 Владелец начислил/изменил баланс игрока @${targetArg} на ${amount > 0 ? '+' : ''}${amount} 🪙! Новый баланс: ${playerBalances[targetArg]} 🪙`);
        return;
    }

    if (lowerMessage.startsWith('!снять банк') && isBroadcaster) {
        const parts = trimmedMessage.split(' ');
        const bankType = parts[1]?.toLowerCase();
        const amountArg = parts[2]?.toLowerCase();

        if (!bankType) {
            client.say(channel, `⚠️ Укажите банк: !снять банк [казино / бусты / магазин / банк] [сумма / all]`);
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

        if (bankType === 'казино') casinoBank -= amount;
        else if (bankType === 'бусты' || bankType === 'бустов') boostsBank -= amount;
        else if (bankType === 'магазин') storeBank -= amount;
        else if (bankType === 'банк' || bankType === 'общий') mainBankBalance -= amount;

        personalBankBalances[username] = (personalBankBalances[username] || 0) + amount;
        client.say(channel, `💸 Владелец @${username} снял ${amount} из (${targetName}) на свой личный банковский счет (+${amount} 💵)!`);
        return;
    }

    // --- 3. ПЕРЕДАЧА КРЫШЕК МЕЖДУ ИГРОКАМИ ---
    if (lowerMessage.startsWith('!передать') || lowerMessage.startsWith('!дать')) {
        const parts = trimmedMessage.split(' ');
        const targetArg = parts[1]?.replace('@', '').toLowerCase();
        const amount = parseInt(parts[2]);

        if (!targetArg || isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Использование: !передать @ник [сумма]`);
            return;
        }

        if (targetArg === username) {
            client.say(channel, `❌ Нельзя передавать крышки самому себе!`);
            return;
        }

        if (playerBalances[username] < amount) {
            client.say(channel, `❌ У вас недостаточно КРЫШЕК для перевода! Ваш баланс: ${playerBalances[username]} 🪙`);
            return;
        }

        if (playerBalances[targetArg] === undefined) {
            playerBalances[targetArg] = 100;
        }

        playerBalances[username] -= amount;
        playerBalances[targetArg] += amount;

        client.say(channel, `🤝 @${username} успешно передал ${amount} 🪙 крышек игроку @${targetArg}!`);
        return;
    }

    // --- 4. СИСТЕМА БРАКОВ И СЕМЕЙ ---
    if (lowerMessage.startsWith('!свадьба') || lowerMessage.startsWith('!брак')) {
        const parts = trimmedMessage.split(' ');
        const targetArg = parts[1]?.replace('@', '').toLowerCase();

        if (!targetArg) {
            client.say(channel, `⚠️ Укажите партнера. Пример: !свадьба @Игрок`);
            return;
        }
        if (targetArg === username) {
            client.say(channel, `❌ Нельзя жениться на самом себе!`);
            return;
        }
        if (playerMarriages[username]) {
            client.say(channel, `❌ Вы уже состоите в браке с @${playerMarriages[username]}! Сначала оформите !развод.`);
            return;
        }
        if (playerMarriages[targetArg]) {
            client.say(channel, `❌ Игрок @${targetArg} уже состоит в браке.`);
            return;
        }

        const weddingCost = 250;
        if (personalBankBalances[username] < weddingCost) {
            client.say(channel, `❌ Недостаточно денег на личном банковском счете для свадьбы! Нужно: ${weddingCost} 🪙`);
            return;
        }

        pendingProposals[targetArg] = username;
        client.say(channel, `💍 @${username} Вставая на правое колено, делает предложение руки и сердца @${targetArg}! Чтобы согласиться, напишите: !принять. Чтобы отказаться: !отказаться`);
        return;
    }

    if (lowerMessage === '!принять' || lowerMessage === '!согласиться') {
        const proposer = pendingProposals[username];
        if (!proposer) {
            client.say(channel, `⚠️ Вам никто не делал предложений.`);
            return;
        }

        if (playerMarriages[username] || playerMarriages[proposer]) {
            delete pendingProposals[username];
            client.say(channel, `❌ Кто-то из игроков уже состоит в браке.`);
            return;
        }

        const weddingCost = 250;
        if (personalBankBalances[proposer] < weddingCost) {
            delete pendingProposals[username];
            client.say(channel, `❌ У инициатора свадьбы (@${proposer}) больше нет ${weddingCost} 🪙 на личном банковском счете.`);
            return;
        }

        personalBankBalances[proposer] -= weddingCost;
        mainBankBalance += Math.floor(weddingCost * 0.5);

        playerMarriages[proposer] = username;
        playerMarriages[username] = proposer;
        const dateStr = new Date().toLocaleDateString();
        marriageDates[proposer] = dateStr;
        marriageDates[username] = dateStr;
        
        const nowMs = Date.now();
        marriageTimestamps[proposer] = nowMs;
        marriageTimestamps[username] = nowMs;

        delete pendingProposals[username];
        client.say(channel, `❤️ ГОРЬКО! @${proposer} и @${username} официально поженились! 🎉 С праздником новую семью!`);
        return;
    }

    if (lowerMessage === '!отказаться' || lowerMessage === '!отклонить') {
        const proposer = pendingProposals[username];
        if (!proposer) {
            client.say(channel, `⚠️ Вам никто не делал предложений, чтобы от них отказываться.`);
            return;
        }
        delete pendingProposals[username];
        client.say(channel, `💔 @${username} холодно отклонил(-а) предложение руки и сердца от @${proposer}. Свадьбы не будет!`);
        return;
    }

    if (lowerMessage === '!семья' || lowerMessage === '!пара' || lowerMessage === '!бракпрофиль') {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `💔 @${username}, вы пока не состоите в браке. Найдите пару: !свадьба @ник`);
            return;
        }
        const date = marriageDates[username] || 'неизвестно';
        const kidsCount = playerChildren[username] || 0;
        client.say(channel, `💒 Семья: @${username} ❤️ @${partner} | В браке с: ${date} | Детей: ${kidsCount}`);
        return;
    }

    if (lowerMessage === '!ребенок' || lowerMessage === '!родить' || lowerMessage === '!дети') {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `❌ @${username}, чтобы завести ребенка, нужно сначала состоять в браке! (!свадьба @ник)`);
            return;
        }

        const mTime = marriageTimestamps[username] || 0;
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const ageOfMarriage = Date.now() - mTime;

        if (ageOfMarriage > SEVEN_DAYS_MS) {
            client.say(channel, `❌ С момента вашей свадьбы прошло больше 7 дней. Возможность завести ребенка в первые дни брака упущена!`);
            return;
        }

        playerChildren[username] = (playerChildren[username] || 0) + 1;
        playerChildren[partner] = (playerChildren[partner] || 0) + 1;

        client.say(channel, `👶 Ура! В семье @${username} и @${partner} родился ребёнок! Теперь у вас в семье детей: ${playerChildren[username]}. Здоровья малышу! ❤️`);
        return;
    }

    if (lowerMessage === '!развод') {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `⚠️ Вы не состоите в браке.`);
            return;
        }

        delete playerMarriages[username];
        delete playerMarriages[partner];
        delete marriageDates[username];
        delete marriageDates[partner];
        delete marriageTimestamps[username];
        delete marriageTimestamps[partner];
        delete playerChildren[username];
        delete playerChildren[partner];

        client.say(channel, `💔 @${username} и @${partner} Эта прекрасная пара развелась, каждый идёт своей дорогой!`);
        return;
    }

    // --- 5. БАНКОВСКАЯ СИСТЕМА (ЛИЧНЫЙ СЧЕТ В БАНКЕ) И ДОЛГИ ---
    if (lowerMessage === '!банк' || lowerMessage === '!bank') {
        client.say(channel, `🏦 @${username}, ваш личный банковский счёт: ${personalBankBalances[username]} 💵`);
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
        personalBankBalances[username] = (personalBankBalances[username] || 0) + amount;
        client.say(channel, `🏦 Банк одобрил и выдал @${username} кредит на сумму ${amount} 💵 на личный банковский счёт! Общий долг: ${playerDebts[username]} 💵`);
        return;
    }

    if (lowerMessage === '!долг' || lowerMessage === '!мойдолг') {
        let timeLeftText = '';
        if (casinoDebtDeadlines[username]) {
            const diffHours = Math.ceil((casinoDebtDeadlines[username] - Date.now()) / (1000 * 60 * 60));
            if (diffHours > 0) {
                const days = (diffHours / 24).toFixed(1);
                timeLeftText = ` (Осталось вернуть за: ~${days} дн.)`;
            } else {
                timeLeftText = ` (СРОК ВОЗВРАТА ИСТЕК!)`;
            }
        }
        client.say(channel, `💳 @${username} | Кредит банка: ${playerDebts[username]} 💵 | Долг казино: ${casinoDebts[username]} 🪙${timeLeftText}`);
        return;
    }

    if (lowerMessage.startsWith('!долгказ') || lowerMessage.startsWith('!каздолг')) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Укажите сумму долга у казино. Пример: !долгказ 200`);
            return;
        }
        if (casinoDebts[username] > 0) {
            client.say(channel, `❌ У вас уже есть активный долг казино (${casinoDebts[username]} 🪙). Сначала верните его через !вернуть долг [сумма].`);
            return;
        }
        casinoDebts[username] = amount;
        playerBalances[username] += amount;
        
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        casinoDebtDeadlines[username] = Date.now() + THREE_DAYS_MS;

        client.say(channel, `🎰 Владелец казино выдал в долг @${username} ${amount} КРЫШЕК! Внимание: долг нужно вернуть ровно за 3 дня! Проверить таймер: !долг`);
        return;
    }

    if (lowerMessage.startsWith('!вернуть долг') || lowerMessage.startsWith('!долгказик')) {
        const args = trimmedMessage.split(' ');
        let amount = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? casinoDebts[username] : parseInt(args[1]);
        const currentDebt = casinoDebts[username];

        if (isNaN(amount) || amount <= 0 || currentDebt <= 0) {
            client.say(channel, `⚠️ У вас нет долгов перед казино или неверная сумма.`);
            return;
        }
        if (amount > currentDebt) amount = currentDebt;
        if (playerBalances[username] < amount) {
            client.say(channel, `❌ Недостаточно КРЫШЕК на балансе (${playerBalances[username]} 🪙) для возврата ${amount} 🪙 долга казино.`);
            return;
        }

        playerBalances[username] -= amount;
        casinoDebts[username] -= amount;
        casinoBank += amount;

        if (casinoDebts[username] === 0) {
            delete casinoDebtDeadlines[username];
        }

        client.say(channel, `✅ @${username} вернул казино ${amount} 🪙! Остаток долга казино: ${casinoDebts[username]} 🪙`);
        return;
    }

    if (lowerMessage.startsWith('!погасить кредит') || lowerMessage.startsWith('!вернуть кредит')) {
        const args = trimmedMessage.split(' ');
        let amount = parseInt(args[1]);
        const currentDebt = playerDebts[username];

        if (isNaN(amount) || amount <= 0 || currentDebt <= 0) {
            client.say(channel, `⚠️ У вас нет активных долгов/кредитов или неверная сумма. Пример: !погасить кредит 300`);
            return;
        }
        if (amount > currentDebt) amount = currentDebt;
        if (personalBankBalances[username] < amount) {
            client.say(channel, `❌ Недостаточно средств на личном банковском счете (${personalBankBalances[username]} 💵) для погашения ${amount} 💵 кредита.`);
            return;
        }

        personalBankBalances[username] -= amount;
        playerDebts[username] -= amount;
        mainBankBalance += amount;
        client.say(channel, `✅ @${username} успешно погасил ${amount} 💵 кредита! Остаток долга: ${playerDebts[username]} 💵`);
        return;
    }

    // --- 6. ТОП КАЗИНО ---
    if (lowerMessage === '!топказ' || lowerMessage === '!topcas' || lowerMessage === '!топкрышки') {
        const sortedPlayers = Object.entries(playerBalances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        if (sortedPlayers.length === 0) {
            client.say(channel, `🏆 Топ казино пока пуст! Сделайте ставку через !spin`);
            return;
        }

        let topText = `🏆 ТОП-5 КАЗИНО (КРЫШКИ): `;
        sortedPlayers.forEach(([user, balance], index) => {
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            topText += `${medals[index]} @${user}: ${balance} 🪙 | `;
        });
        client.say(channel, topText);
        return;
    }

    // --- 7. СИСТЕМА ДОЛЖНОСТЕЙ В КАЗИНО ---
    if (lowerMessage === '!должностиказ' || lowerMessage === '!staff') {
        let text = `🎰 ДОЛЖНОСТИ В КАЗИНО: `;
        Object.entries(CASINO_ROLES).forEach(([rName, rData]) => {
            text += `[${rName}] Зарплата: ${rData.salary} 🪙 | ${rData.desc} | `;
        });
        client.say(channel, text);
        return;
    }

    if (lowerMessage === '!я' || lowerMessage === '!моядолжность') {
        const staffRole = casinoStaff[username];
        if (!staffRole) {
            client.say(channel, `🎰 @${username}, вы не работаете в казино. Доступные должности: !должностиказ`);
            return;
        }
        const rData = CASINO_ROLES[staffRole];
        client.say(channel, `👔 Ваша должность в казино: **${staffRole}** | Зарплата: ${rData.salary} 🪙 | Команды сотрудника: !приветказ, !проверитьстол`);
        return;
    }

    if (lowerMessage === '!приветказ') {
        const staffRole = casinoStaff[username];
        if (!staffRole) {
            client.say(channel, `❌ @${username}, эта команда доступна только официальным сотрудникам казино!`);
            return;
        }
        client.say(channel, `🎲 Корпоративное приветствие от ${staffRole} @${username}: "Добро пожаловать в наше казино! Удачи за игровыми столами!"`);
        return;
    }

    if (lowerMessage === '!проверитьстол') {
        const staffRole = casinoStaff[username];
        if (!staffRole) {
            client.say(channel, `❌ @${username}, эта команда доступна только сотрудникам казино!`);
            return;
        }
        client.say(channel, `🔍 Сотрудник @${username} (${staffRole}) проверил игровые столы. Все механизмы крутятся честно, казино готово к ставкам! 🎰`);
        return;
    }

    // --- 8. СИСТЕМА КОММУНАЛЬНЫХ НАЛОГОВ ---
    if (lowerMessage === '!коммуналка' || lowerMessage === '!налоги' || lowerMessage === '!счета') {
        const u = playerUtilities[username] || { water: 0, gas: 0, light: 0 };
        client.say(channel, `💡 @${username} Ваши счета за коммуналку ➔ 🚰 Вода: ${u.water} 💵 | 🔥 Газ: ${u.gas} 💵 | ⚡ Свет: ${u.light} 💵. Оплата: !оплатить [вода/газ/свет/все]`);
        return;
    }

    if (lowerMessage.startsWith('!оплатить ')) {
        const targetUtil = trimmedMessage.split(' ')[1]?.toLowerCase();
        const u = playerUtilities[username] || { water: 0, gas: 0, light: 0 };

        if (!['вода', 'газ', 'свет', 'все'].includes(targetUtil)) {
            client.say(channel, `⚠️ Укажите, что оплатить: !оплатить [вода / газ / свет / все]`);
            return;
        }

        let totalToPay = 0;
        let paidTypes = [];

        if (targetUtil === 'вода') {
            if (u.water <= 0) { client.say(channel, `❌ У вас нет задолженности за воду.`); return; }
            totalToPay = u.water;
            paidTypes.push('вода');
        } else if (targetUtil === 'газ') {
            if (u.gas <= 0) { client.say(channel, `❌ У вас нет задолженности за газ.`); return; }
            totalToPay = u.gas;
            paidTypes.push('газ');
        } else if (targetUtil === 'свет') {
            if (u.light <= 0) { client.say(channel, `❌ У вас нет задолженности за свет.`); return; }
            totalToPay = u.light;
            paidTypes.push('свет');
        } else if (targetUtil === 'все') {
            totalToPay = u.water + u.gas + u.light;
            if (totalToPay <= 0) { client.say(channel, `❌ У вас нет никаких задолженностей по коммуналке!`); return; }
            if (u.water > 0) paidTypes.push('вода');
            if (u.gas > 0) paidTypes.push('газ');
            if (u.light > 0) paidTypes.push('свет');
        }

        if (personalBankBalances[username] < totalToPay) {
            client.say(channel, `❌ Недостаточно средств на личном банковском счёте! У вас: ${personalBankBalances[username]} 💵 (нужно: ${totalToPay} 💵)`);
            return;
        }

        personalBankBalances[username] -= totalToPay;

        const bankShare = Math.floor(totalToPay * 0.50);
        mainBankBalance += bankShare;
        storeBank += (totalToPay - bankShare);

        if (targetUtil === 'вода' || targetUtil === 'все') playerUtilities[username].water = 0;
        if (targetUtil === 'газ' || targetUtil === 'все') playerUtilities[username].gas = 0;
        if (targetUtil === 'свет' || targetUtil === 'все') playerUtilities[username].light = 0;

        client.say(channel, `🏠 @${username} успешно оплатил(-а) коммуналку (${paidTypes.join(', ')}) на сумму ${totalToPay} 💵 со своего банковского счета! Спасибо за дисциплину.`);
        return;
    }

    // --- 9. МАГАЗИН ПРЕДМЕТОВ ---
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

        if (personalBankBalances[username] < item.price) {
            client.say(channel, `❌ Недостаточно средств на личном банковском счете! У вас: ${personalBankBalances[username]} 💵 (нужно: ${item.price})`);
            return;
        }

        personalBankBalances[username] -= item.price;
        
        const bankTax = Math.floor(item.price * 0.15);
        storeBank += bankTax;
        mainBankBalance += bankTax;

        if (!playerInventory[username]) playerInventory[username] = [];
        playerInventory[username].push(itemName);

        if (item.type === 'жилье') {
            if (!playerUtilities[username]) {
                playerUtilities[username] = { water: 0, gas: 0, light: 0 };
            }
            playerUtilities[username].water += 50;
            playerUtilities[username].gas += 60;
            playerUtilities[username].light += 75;
            client.say(channel, `🏠 Поздравляем с покупкой жилья! Следите за комунальными услугами (!коммуналка).`);
        }

        client.say(channel, `🛍️ Поздравляем, @${username}! Вы купили "${itemName}" за ${item.price} 💵 с личного счета в банке!`);
        return;
    }

    // --- 10. МАГАЗИН БУСТОВ И СЧЕТ БУСТОВ ---
    if (lowerMessage === '!бустшоп' || lowerMessage === '!усилители' || lowerMessage === '!бустики') {
        let text = `⚡ МАГАЗИН БУСТОВ (за счет бустов 🔮): `;
        Object.entries(CASINO_BOOSTS).forEach(([bName, bData]) => {
            text += `[${bName}] — ${bData.price} очков (${bData.desc}) | `;
        });
        client.say(channel, text + `Купить: !газбуст [название] | Ваш счет: !счётбустов`);
        return;
    }

    if (lowerMessage === '!счётбустов' || lowerMessage === '!бустбаланс') {
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

        const bankTax = Math.floor(boostData.price * 0.20);
        boostsBank += bankTax;
        mainBankBalance += bankTax;

        client.say(channel, `🎉 Успешно! @${username} приобрел буст "**${boostKey}**" (+${boostData.amount} зарядов)!`);
        return;
    }

    // --- 11. КАЗИНО ---
    if (lowerMessage.startsWith('!каз')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ Казино сейчас закрыто. Приходите позже, после 12:00.`);
            return;
        }

        if (playerBalances[username] <= 0) {
            client.say(channel, `❌ @${username}, у вас 0 КРЫШЕК! Вы всё слили. Заработайте деньги на работе (!работа) или обменяйте их с банковского счета (!обмен), чтобы продолжить игру.`);
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

        if (boosts.luck > 0) {
            boosts.luck--;
            winChanceBonus = 0.10;
        }

        if (boosts.x2 > 0) {
            boosts.x2--;
            winMultiplier = 2;
        }

        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣', '💩', '🥐', '🍩', '🛑', '🎲', '🚽'];
        let r1 = symbols[Math.floor(Math.random() * symbols.length)];
        let r2 = symbols[Math.floor(Math.random() * symbols.length)];
        let r3 = symbols[Math.floor(Math.random() * symbols.length)];

        if (winChanceBonus > 0 && r1 !== r2 && r2 !== r3 && r1 !== r3) {
            if (Math.random() < 0.5) r2 = r1;
        }

        if (r1 === r2 && r2 === r3) {
            let rawWin = bet * 15 * winMultiplier;
            const tax = Math.floor(rawWin * 0.1);
            
            const bankShare = Math.floor(tax * 0.5);
            casinoBank += (tax - bankShare);
            mainBankBalance += bankShare;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += Math.floor(bet / 2);
            client.say(channel, `🎰 ДЖЕКПOT! @${username} (${r1} ${r2} ${r3}) выиграл +${win} КРЫШКИ! Баланс: ${playerBalances[username]} 🪙`);
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            let rawWin = Math.floor(bet * 2.5 * winMultiplier);
            const tax = Math.max(1, Math.floor(rawWin * 0.1));

            const bankShare = Math.max(1, Math.floor(tax * 0.5));
            casinoBank += (tax - bankShare);
            mainBankBalance += bankShare;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += 2;
            client.say(channel, `✨ Пара (${r1} ${r2} ${r3})! @${username} выиграл +${win} КРЫШКИ! Баланс: ${playerBalances[username]} 🪙`);
        } else {
            if (boosts.shield > 0) {
                boosts.shield--;
                const refund = Math.floor(bet * 0.5);
                playerBalances[username] += refund;
                client.say(channel, `🛡️ Щит спас @${username}! Возвращено 50% ставки (${refund} 🪙). Баланс: ${playerBalances[username]} 🪙`);
            } else {
                shopBalances[username] += 1;
                client.say(channel, `❌ Эх, @${username} (${r1} ${r2} ${r3}). Проигрыш. Баланс: ${playerBalances[username]} 🪙`);
            }
        }
        return;
    }

    // --- 12. ПРОФИЛЬ, БАЛАНС И СТАТИСТИКА ИГРОКА ---
    if (lowerMessage.startsWith('!статистика') || lowerMessage.startsWith('!профиль') || lowerMessage.startsWith('!стат')) {
        const args = trimmedMessage.split(' ');
        let targetUser = username;

        if (args[1]) {
            const requestedUser = args[1].replace('@', '').toLowerCase();
            if (requestedUser !== username) {
                if (!isBroadcaster) {
                    client.say(channel, `❌ @${username}, Вы можете просматривать только свою статистику! (Напишите !статистика без аргументов).`);
                    return;
                }
            }
            targetUser = requestedUser;
        }

        if (playerBalances[targetUser] === undefined) {
            playerBalances[targetUser] = 100;
        }

        const caps = playerBalances[targetUser];
        const pBank = personalBankBalances[targetUser] || 0;
        const debt = playerDebts[targetUser] || 0;
        const cDebt = casinoDebts[targetUser] || 0;
        const boostPoints = boostShopBalances[targetUser] || 0;
        const age = playerAges[targetUser] || 18;
        
        const job = playerJobs[targetUser] || 'Безработный';
        const casinoRole = casinoStaff[targetUser] ? `🎰 ${casinoStaff[targetUser]}` : '';
        const invArray = playerInventory[targetUser] || [];
        const inventory = invArray.length > 0 ? invArray.join(', ') : 'Ничего нет';
        const marriage = playerMarriages[targetUser] ? `💍 @${playerMarriages[targetUser]} (детей: ${playerChildren[targetUser] || 0})` : 'Холостяк(-ая)';
        const u = playerUtilities[targetUser] || { water: 0, gas: 0, light: 0 };
        const utilitiesText = `🚰В:${u.water}|🔥Г:${u.gas}|⚡С:${u.light}`;
        
        const b = playerBoosts[targetUser] || { luck: 0, x2: 0, shield: 0 };
        const activeBoosts = `Уд:${b.luck}|x2:${b.x2}|Щит:${b.shield}`;

        let profileText = `📊 Профиль @${targetUser} ➔ 🎂 Возраст: ${age} лет | 🪙 КРЫШКИ: ${caps} | 🏦 Банк (личный счет): ${pBank} | 🏦 Банк-долг: ${debt} | 🎰 Долг казино: ${cDebt} | 🔮 Буст-очки: ${boostPoints} | 💼 Работа: ${job}`;
        if (casinoRole) profileText += ` | Должность: ${casinoRole}`;
        profileText += ` | 💒 Семья: ${marriage} | 🛒 Имущество: [${inventory}] | 💡 Коммуналка: [${utilitiesText}] | ⚡ Бусты: [${activeBoosts}]`;

        client.say(channel, profileText);
        return;
    }

    if (lowerMessage === '!*100#' || lowerMessage === '*100#') {
        client.say(channel, `💰 @${username} | Возраст: ${playerAges[username]} лет | Казино: ${playerBalances[username]} 🪙 | Личный банк: ${personalBankBalances[username]} 💵 | Счёт бустов: ${boostShopBalances[username]} 🔮 | Долги (Банк: ${playerDebts[username]} | Казино: ${casinoDebts[username]})`);
        return;
    }

    // --- 13. РАБОТА И ОБМЕН ---
    if (lowerMessage === '!работы') {
        let text = `💼 ДОСТУПНЫЕ РАБОТЫ: `;
        Object.entries(JOBS_DATA).forEach(([jobName, data]) => {
            text += `[${jobName}] Зарплата: ${data.salary} 💵 (мин. денег в банке: ${data.req}) | `;
        });
        client.say(channel, text + `Устроиться: !устроиться [название]`);
        return;
    }

    if (lowerMessage.startsWith('!устроиться')) {
        const jobNameArg = trimmedMessage.split(' ')[1];
        if (!jobNameArg) {
            client.say(channel, `⚠️ Укажите название работы. Пример: !устроиться Курьер. Список: !работы`);
            return;
        }

        const foundJobKey = Object.keys(JOBS_DATA).find(j => j.toLowerCase() === jobNameArg.toLowerCase());
        const jobConfig = JOBS_DATA[foundJobKey];

        if (!jobConfig) {
            client.say(channel, `❌ Такой работы не существует! Список доступных: !работы`);
            return;
        }

        const userBank = personalBankBalances[username] || 0;
        if (userBank < jobConfig.req) {
            client.say(channel, `❌ Недостаточно средств в банке! Для работы "${foundJobKey}" нужно иметь минимум ${jobConfig.req} 💵 на личной банковской карте.`);
            return;
        }

        playerJobs[username] = foundJobKey;
        client.say(channel, `🎉 Поздравляем, @${username}! Вы успешно устроились на новую работу: **${foundJobKey}**!`);
        return;
    }

    if (lowerMessage === '!мояработа' || lowerMessage === '!prof') {
        const currentJob = playerJobs[username];
        if (!currentJob) {
            client.say(channel, `💼 @${username}, вы сейчас безработный. Выберите вакансию через !работы`);
            return;
        }
        const jobConfig = JOBS_DATA[currentJob];
        client.say(channel, `💼 Ваша текущая профессия: **${currentJob}** | Зарплата в банк: ${jobConfig.salary} 💵 | Интервал: ${jobConfig.cooldown / 60000} мин.`);
        return;
    }

    if (lowerMessage === '!уволиться') {
        if (!playerJobs[username]) {
            client.say(channel, `⚠️ @${username}, вы и так нигде не работаете.`);
            return;
        }
        const oldJob = playerJobs[username];
        delete playerJobs[username];
        delete jobCooldowns[username];
        client.say(channel, `🚪 @${username} уволился с должности "${oldJob}" и теперь снова безработный.`);
        return;
    }

    if (lowerMessage === '!работать' || lowerMessage === '!work') {
        const currentJob = playerJobs[username];
        if (!currentJob) { 
            client.say(channel, `❌ Вы безработный! Выберите работу: !работы`); 
            return; 
        }
        const jobConfig = JOBS_DATA[currentJob];
        const now = Date.now();
        const timeLeft = (jobCooldowns[username] || 0) + jobConfig.cooldown - now;

        if (timeLeft > 0) {
            client.say(channel, `⏳ @${username}, смена еще не окончена. Подождите ~${Math.ceil(timeLeft / 60000)} мин.`);
            return;
        }

        jobCooldowns[username] = now;
        personalBankBalances[username] = (personalBankBalances[username] || 0) + jobConfig.salary;
        client.say(channel, `💼 @${username} успешно отработал смену (**${currentJob}**) и получил +${jobConfig.salary} 💵 на свой личный банковский счёт!`);
        return;
    }

    if (lowerMessage.startsWith('!обмен')) {
        const amount = parseInt(trimmedMessage.split(' ')[2]);
        if (isNaN(amount) || amount <= 0 || personalBankBalances[username] < amount) {
            client.say(channel, `⚠️ Ошибка обмена. Проверьте личный банковский счёт: ${personalBankBalances[username]} 💵`);
            return;
        }
        personalBankBalances[username] -= amount;
        playerBalances[username] += amount;
        client.say(channel, `💱 @${username} обменял ${amount} 💵 из банка на ${amount} 🪙 крышек для казино!`);
        return;
    }

    if (lowerMessage.startsWith('!обналичить') || lowerMessage.startsWith('!вывести')) {
        let amount = trimmedMessage.split(' ')[1]?.toLowerCase() === 'all' ? playerBalances[username] : parseInt(trimmedMessage.split(' ')[1]);
        if (isNaN(amount) || amount <= 0 || playerBalances[username] < amount) {
            client.say(channel, `⚠️ Ошибка вывода. Баланс казино: ${playerBalances[username]} 🪙`);
            return;
        }
        playerBalances[username] -= amount;
        personalBankBalances[username] = (personalBankBalances[username] || 0) + amount;
        client.say(channel, `🏧 @${username} вывел ${amount} 🪙 из казино на свой личный банковский счёт (+${amount} 💵)!`);
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
