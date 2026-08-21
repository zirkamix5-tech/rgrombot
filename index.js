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
const persistentGreetedUsers = new Set(); // Постоянный список поприветствованных (сохраняется для игнорирования после перезапуска)
const playerBalances = {};           // Балансы игроков (КРЫШКИ для казино)
const shopBalances = {};             // Балансы обычных очков магазина
const boostShopBalances = {};        // Отдельный счет для покупки бустов
const playerDebts = {};              // Кредитные долги игроков перед банком
const casinoDebts = {};              // Долги игроков лично перед казино (КРЫШКИ)
const casinoDebtDeadlines = {};      // Таймер/дедлайн погашения долга казино (timestamp в мс)
const personalBankBalances = {};     // Единый личный банковский счёт игроков (сюда капает зарплата, пенсии и т.д.)

// --- ДАННЫЕ ДЛЯ КРЕДИТОВ И ТЮРЬМЫ ---
const bankDebtDeadlines = {};        // Таймер дедлайна возврата банковского кредита (timestamp в мс)
const playerJailDeadlines = {};      // Таймер окончания тюремного срока (timestamp в мс)
const playerJailStages = {};         // Ступень тюремного срока (0 - нет, 1 - маленький, 2 - увеличенный, 3 - пожизненное)
const playerLastChanceUsed = {};     // Флаг: использован ли единственный шанс после пожизненного (true/false)

// --- СИСТЕМА ВОЗРАСТА И ПЕНСИЙ ---
const playerAges = {};               // Возраст игроков (playerAges[username] = число лет)
const lastPensionTime = {};          // Таймер выплаты пенсии, чтобы не начислять каждую секунду

// --- СИСТЕМА БРАКОВ И СЕМЕЙ ---
const playerMarriages = {};          // playerMarriages[username] = partnerUsername
const marriageDates = {};            // marriageDates[username] = дата/время свадьбы
const pendingProposals = {};         // pendingProposals[targetUsername] = proposingUsername
const marriageTimestamps = {};       // Точный timestamp свадьбы для проверки сроков детей
const playerChildren = {};           // playerChildren[username] = количество детей
const lastChildTime = {};            // Кулдаун для системы детей (24 часа)
const familyVaults = {};             // familyVaults[familyKey] = amount (семейный сейф для каждой пары)

// --- СИСТЕМА ИГР МЕЖДУ ИГРОКАМИ (ДУЭЛИ / СТАВКИ) ---
const pendingDuels = {};             // pendingDuels[targetUsername] = { challenger, amount, gameType }

// --- СИСТЕМА УСИЛИТЕЛЕЙ (БУСТЕРОВ) ДЛЯ КАЗИНО ---
const playerBoosts = {};             // playerBoosts[username] = { luck: 0, x2: 0, shield: 0 }

const CASINO_BOOSTS = {
    'удача': { price: 150, desc: 'Повышает шанс выигрыша в казино на след. 5 игр', type: 'luck', amount: 5 },
    'х2': { price: 300, desc: 'Удваивает выигрыш в казино на след. 3 игры', type: 'x2', amount: 3 },
    'щит': { price: 200, desc: 'Защищает от проигрыша (возврат 50% ставки) на след. 3 игры', type: 'shield', amount: 3 },
    
    // --- НОВЫЕ БОНУСЫ (30 ШТУК) ---
    // Ветка Удачи
    'печенька': { price: 50, type: 'luck', amount: 1, desc: '+1 игра с повышенной удачей' },
    'зелье_удачи': { price: 100, type: 'luck', amount: 3, desc: 'Кратковременный всплеск удачи (3 игры)' },
    'кольцо_фортуны': { price: 200, type: 'luck', amount: 6, desc: 'Кольцо дарит удачу (6 игр)' },
    'амулет': { price: 400, type: 'luck', amount: 15, desc: 'Длительная удача (15 игр)' },
    'подкова': { price: 700, type: 'luck', amount: 30, desc: 'Надежная удача (30 игр)' },
    'клевер': { price: 1500, type: 'luck', amount: 65, desc: 'Четырехлистный клевер (65 игр удачи)' },
    'лапка': { price: 2500, type: 'luck', amount: 120, desc: 'Кроличья лапка (120 игр удачи)' },
    'золото_инков': { price: 5000, type: 'luck', amount: 250, desc: 'Древняя удача (250 игр)' },
    'магнит': { price: 10000, type: 'luck', amount: 550, desc: 'Притягивает победу (550 игр)' },
    'корона': { price: 25000, type: 'luck', amount: 1000, desc: 'Корона короля казино (1000 игр удачи)' },
    
    // Ветка Умножения (х2)
    'эликсир': { price: 150, type: 'x2', amount: 1, desc: 'Удвоение на 1 игру' },
    'кристалл': { price: 350, type: 'x2', amount: 4, desc: 'Сверкающий кристалл х2 (4 игры)' },
    'часы_времени': { price: 1200, type: 'x2', amount: 12, desc: 'Часы удваивают выигрыш (12 игр)' },
    'допинг': { price: 1400, type: 'x2', amount: 15, desc: 'Удвоение на 15 игр' },
    'адреналин': { price: 2500, type: 'x2', amount: 30, desc: 'Удвоение на 30 игр' },
    'стероиды': { price: 5000, type: 'x2', amount: 65, desc: 'Мощное удвоение (65 игр)' },
    'мутаген': { price: 9000, type: 'x2', amount: 120, desc: 'Химическое удвоение (120 игр)' },
    'артефакт': { price: 18000, type: 'x2', amount: 250, desc: 'Магическое удвоение (250 игр)' },
    'грааль': { price: 35000, type: 'x2', amount: 550, desc: 'Священный Грааль (550 игр х2)' },
    'скипетр': { price: 50000, type: 'x2', amount: 1000, desc: 'Скипетр власти (1000 игр х2)' },
    
    // Ветка Защиты (Щиты)
    'зонтик': { price: 75, type: 'shield', amount: 1, desc: 'Щит от проигрыша на 1 игру' },
    'талисман': { price: 450, type: 'shield', amount: 7, desc: 'Деревянный талисман (7 игр защиты)' },
    'сфера_жизни': { price: 800, type: 'shield', amount: 12, desc: 'Сфера возврата средств (12 игр)' },
    'каска': { price: 900, type: 'shield', amount: 15, desc: 'Щит на 15 игр' },
    'броник': { price: 1800, type: 'shield', amount: 30, desc: 'Бронежилет на 30 игр' },
    'танк': { price: 3500, type: 'shield', amount: 60, desc: 'Танковая броня на 60 игр' },
    'бункер': { price: 7000, type: 'shield', amount: 120, desc: 'Надежный бункер (120 игр)' },
    'аура': { price: 14000, type: 'shield', amount: 250, desc: 'Аура защиты (250 игр)' },
    'эгида': { price: 30000, type: 'shield', amount: 550, desc: 'Эгида бессмертия (550 игр)' },
    'мантия': { price: 40000, type: 'shield', amount: 1000, desc: 'Мантия защиты (1000 игр со щитом)' }
};

// --- СИСТЕМА ДОЛЖНОСТЕЙ В КАЗИНО И ФОНД ЗАРПЛАТ ---
const casinoStaff = {};              // casinoStaff[username] = 'должность'
let casinoSalaryFund = 0;            // Фонд зарплаты сотрудников казино

const CASINO_ROLES = {
    'хостес': {salary: 50, desc: 'Встречает гостей, которые идут в казино'},
    'бармен': {salary: 75, desc: 'Встречает гостей, напитками'},
    'стриптизёрша': {salary: 120, desc: 'Танцует для гостей'},
    'стриптизёр': {salary: 130, desc: 'Танцует для гостей'},
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

// --- АВТОМАТИЧЕСКОЕ ПЕРЕЧИСЛЕНИЕ СРЕДСТВ ИЗ БАНКА В ФОНД ЗАРПЛАТЫ КАЗИНО ---
setInterval(() => {
    const transferAmount = 1000; // Сумма автоматического пополнения фонда из банка за раз
    if (mainBankBalance >= transferAmount) {
        mainBankBalance -= transferAmount;
        casinoSalaryFund += transferAmount;
        client.action('QumosX', `🏦 Банк автоматически перевёл ${transferAmount} 🪙 в Фонд зарплаты казино.`);
    }
}, 1 * 60 * 60 * 1000); // Проверка и перевод каждый день.

// --- АВТОМАТИЧЕСКОЕ УПРАВЛЕНИЕ КАЗИНО ПО ВРЕМЕНИ ---
setInterval(() => {
    if (manualOverride) return;

    const now = new Date();
    const hours = now.getHours();

    const shouldBeOpen = hours >= 2 || hours < 4 ;

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

// --- ПРОВЕРКА ДЕДЛАЙНОВ БАНКОВСКИХ КРЕДИТОВ И ТЮРЬМЫ ---
setInterval(() => {
    const now = Date.now();
    for (const [username, deadline] of Object.entries(bankDebtDeadlines)) {
        if (deadline && now > deadline && playerDebts[username] > 0) {
            const currentStage = playerJailStages[username] || 0;

            if (currentStage === 0) {
                playerJailStages[username] = 1;
                playerJailDeadlines[username] = now + (1 * 60 * 60 * 1000);
                client.say('QumosX', `🚨 ВНИМАНИЕ! @${username} не вернул банковский кредит вовремя! Суд приговорил его к первому тюремному заключению.`);
            } else if (currentStage === 1) {
                playerJailStages[username] = 2;
                playerJailDeadlines[username] = now + (24 * 60 * 60 * 1000);
                client.say('QumosX', `🚨 ВНИМАНИЕ! У @${username} продолжается просрочка кредита! Тюремный срок автоматически увеличен.`);
            } else if (currentStage >= 2) {
                playerJailStages[username] = 3;
                playerJailDeadlines[username] = now + (36500 * 24 * 60 * 60 * 1000);
                client.say('QumosX', `💀 СУДЕБНЫЙ ПРИГОВОР! @${username} довел дело до ПОЖИЗНЕННОГО заключения за неуплату кредита! Доступ ко всему заблокирован навсегда.`);
            }

            delete bankDebtDeadlines[username];
        }
    }
    
    for (const [username, jailDeadline] of Object.entries(playerJailDeadlines)) {
        if (jailDeadline && now > jailDeadline) {
            const stage = playerJailStages[username] || 0;
            if (stage === 3) continue;
            delete playerJailDeadlines[username];
            playerJailStages[username] = 0;
            client.say('QumosX', `🔓 @${username} отбыл свой срок в тюрьме и вышел на свободу! Возвращайтесь к честной жизни.`);
        }
    }
}, 60 * 1000);

// --- АВТО-УВЕЛИЧЕНИЕ ВОЗРАСТА ИГРОКОВ ---
setInterval(() => {
    for (const username of Object.keys(playerBalances)) {
        playerAges[username] = (playerAges[username] || 15) + 1;
    }
}, 10 * 60 * 60 * 1000);

// --- СИСТЕМА НАЧИСЛЕНИЯ ПЕНСИЙ ---
setInterval(() => {
    for (const [username, age] of Object.entries(playerAges)) {
        if (age >= 50) {
            const jobKey = playerJobs[username];
            const jobSalary = (jobKey && JOBS_DATA[jobKey]) ? JOBS_DATA[jobKey].salary : 30;
            const pensionAmount = Math.floor(jobSalary * 0.6);

            if (mainBankBalance < pensionAmount) continue;

            mainBankBalance -= pensionAmount;
            personalBankBalances[username] = (personalBankBalances[username] || 0) + pensionAmount;
            client.say('QumosX', `👴 Государственный банк выплатил пенсию ветерану труда @${username} (Возраст: ${age} лет) в размере ${pensionAmount} 💵 на личный банковский счёт!`);
        }
    }
}, 800 * 800 * 1000);

// --- СИСТЕМА АВТО-ВЫДАЧИ ЗАРПЛАТЫ СОТРУДНИКАМ КАЗИНО ---
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
}, 180 * 180 * 1000);

// --- СИСТЕМА НАЧИСЛЕНИЯ КОММУНАЛЬНЫХ НАЛОГОВ ---
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
    'Мусорщик': { salary: 30, cooldown: 15 * 60 * 1000, req: 0 },
    'Грузчик': { salary: 55, cooldown: 15 * 60 * 1000, req: 0 },
    'Курьер': { salary: 100, cooldown: 30 * 60 * 1000, req: 125 },
	'Разнощик': { salary: 125, cooldown: 40 * 60 * 1000, req: 200 },
	'Почтальйон': { salary: 140, cooldown: 40 * 60 * 1000, req: 200 },
    'Электрик': { salary: 150, cooldown: 45 * 60 * 1000, req: 200 },
    'Бухгалтер': { salary: 200, cooldown: 50 * 60 * 1000, req: 300 },
    'Помощник-Повара': { salary: 230, cooldown: 60 * 60 * 1000, req: 270 },
    'Менеджер': { salary: 250, cooldown: 80 * 60 * 1000, req: 450 },
    'Проститут': { salary: 500, cooldown: 60 * 60 * 1000, req: 1000 },
    'Проститутка': { salary: 700, cooldown: 60 * 60 * 1000, req: 1000 },
    'Мастер маникюра': { salary: 700, cooldown: 60 * 60 * 1000, req: 1000 },
    'Официант': { salary: 700, cooldown: 60 * 60 * 1000, req: 1000 },
    'Программист': { salary: 800, cooldown: 100 * 60 * 1000, req: 500 },
    'Домашний-кондитер': { salary: 900, cooldown: 60 * 60 * 1000, req: 1000 },
    'Шеф-Повар': { salary: 1200, cooldown: 60 * 60 * 1000, req: 1000 },
    'Су-шеф': { salary: 2000, cooldown: 60 * 60 * 1000, req:  1000 },
	'Могильщик': { salary: 2200, cooldown: 120 * 120 * 1000, req: 9000 },
	'Полицейский': { salary: 2300, cooldown: 130 * 130 * 1000, req: 5000 },
	'Пожарный': { salary: 2300, cooldown: 130 * 130 * 1000, req: 5000 },
	'Медик': { salary: 2300, cooldown: 130 * 130 * 1000, req: 5000 },
    'Модель': { salary: 2300, cooldown: 60 * 60 * 1000, req: 2700 },
    'Актёр': { salary: 2500, cooldown: 60 * 60 * 1000, req: 2900 },
	'Хакер': { salary: 5000, cooldown: 120 * 120 * 1000, req: 7000 },
	'Сапёр': { salary: 9000, cooldown: 180 * 180 * 1000, req: 12000 },
	'Телохранитель': { salary: 10000, cooldown: 240 * 240 * 1000, req: 25000 },
	'Чистильщик': { salary: 50000, cooldown: 250 * 250 * 1000, req: 90000 },
	'Бизнесмен': { salary: 90000, cooldown: 500 * 500 * 1000, req: 125000 },
};

const SHOP_ITEMS = {
    'велосипед': { price: 1000, type: 'транспорт', desc: 'Двухколесный друг для поездок' },
    'мопед': { price: 2000, type: 'транспорт', desc: 'Уже с ветерком!' },
    'электросамокат': { price: 3500, type: 'транспорт', desc: 'Уже легче' },
    'электромопед': { price: 5500, type: 'транспорт', desc: 'Электро...' },
    'машина': { price: 5000, type: 'транспорт', desc: 'Настоящая личная тачка' },
    'спорткар': { price: 20000, type: 'транспорт', desc: 'Быстрая машина для стритрейсера' },
    'Яхта': { price: 60000, type: 'транспорт', desc: 'Легче чем было' },
    'круиз-лайнер': { price: 75000, type: 'транспорт', desc: 'Плаваем удачно' },
    'самолёт': { price: 100000, type: 'транспорт', desc: 'Уже летаем.' },
    'вертолёт': { price: 155000, type: 'транспорт', desc: 'Ура, вертик.' },
    'комната': { price: 12000, type: 'жилье', desc: 'Уголок в общежитии' },
    'квартира': { price: 50000, type: 'жилье', desc: 'Собственная квартира в центре' },
    'дом': { price: 125000, type: 'жилье', desc: 'Загородный домик' },
    'коттедж': { price: 300000, type: 'жилье', desc: 'Загородный коттедж' },
    'вилла': { price: 1000000, type: 'жилье', desc: 'Уф, богато!' }
};

const bankBannedUsers = {};

const knownBots = new Set([
    'nightbot', 'streamelements', 'fossabot', 'moobot', 'soundalerts',
    'Streamlabs', 'WizeBot', 'Coebot', 'Phantombot', 'AlippBot', 'BotRix', 'AlerterBot', 'deepseekbot'
]);

function самСдоровался(username) {
    return greetedUsers.has(username) || persistentGreetedUsers.has(username);
}

function отметитьСдоровавшимся(username) {
    greetedUsers.add(username);
    persistentGreetedUsers.add(username);
}

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

    // --- ПРОВЕРКА НАХОЖДЕНИЯ В ТЮРЬМЕ ---
    if (playerJailDeadlines[username] && playerJailDeadlines[username] > Date.now()) {
        const stage = playerJailStages[username] || 1;
        if (stage === 3) {
            if (message.trim().startsWith('!')) {
                client.say(channel, `💀 @${username}, у вас ПОЖИЗНЕННОЕ заключение за долги! Вы не можете пользоваться ничем, ни казино, вообще ничем! За вас может внести залог кто-то другой (!выкупить @${username}).`);
            }
            return;
        } else {
            const timeLeftSec = Math.ceil((playerJailDeadlines[username] - Date.now()) / 1000);
            if (message.trim().startsWith('!')) {
                client.say(channel, `🔒 @${username}, вы находитесь в тюрьме за неоплаченный кредит (Стадия ${stage})! Осталось сидеть: ~${Math.ceil(timeLeftSec / 60)} мин.`);
            }
            return;
        }
    }

    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username === 'qumosx' || username === 'gospod_bomzhik' || username === 'miss__krevetka' || username === 'r0ma_gr0m';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username === 'qumosx' || username === 'gospod_bomzhik' || username === 'miss__krevetka' || username === 'r0ma_gr0m';

    if (!самСдоровался(username)) {
        отметитьСдоровавшимся(username);
    }

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

    // --- УПРАВЛЕНИЕ КАЗИНО И ФОНДОМ ЗАРПЛАТ ---
    if (lowerMessage === '!каз открыть' && isMod) {
        isCasinoOpen = true;
        manualOverride = true;
        client.say(channel, `🟢 Сотрудник казино @${username}!, открывает его вручную. КАЗИНО ОТКРЫТО!`);
        return;
    }
    if (lowerMessage === '!каз закрыть' && isMod) {
        isCasinoOpen = false;
        manualOverride = true;
        client.say(channel, `🔴 Сотрудник казино @${username}!, вручную закрывает его. КАЗИНО ЗАКРЫТО!`);
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
        client.say(channel, `📈 СЧЕТА БАНКОВ | Банк: ${mainBankBalance} 🪙 | Казино: ${casinoBank} 🪙 | Фонд ЗП казино: ${casinoSalaryFund} 🪙 | Магазин: ${storeBank} | Банк бустов: ${boostsBank} 🔮`);
        return;
    }

    // Команда для ручного перевода средств из Банка в Фонд Зарплаты казино
    if (lowerMessage.startsWith('!банквфонд')) {
        if (!isBroadcaster) {
            client.say(channel, `❌ @${username}, эта команда доступна только Владельцу!`);
            return;
        }
        const amount = parseInt(trimmedMessage.split(' ')[1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Укажите сумму для перевода из Банка в Фонд. Пример: !банквфонд 1000`);
            return;
        }
        if (mainBankBalance < amount) {
            client.say(channel, `❌ В Основном банке (${mainBankBalance} 🪙) недостаточно средств для такого перевода!`);
            return;
        }

        mainBankBalance -= amount;
        casinoSalaryFund += amount;
        client.say(channel, `🏦 Владелец перевел ${amount} 🪙 из Основного банка в Фонд зарплаты казино! Баланс фонда: ${casinoSalaryFund} 🪙`);
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
        const bankType = parts[2]?.toLowerCase();
        const amountArg = parts[3]?.toLowerCase();

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

    if (lowerMessage === '!снять всё' && isBroadcaster) {
        const total = mainBankBalance + casinoBank + boostsBank + storeBank;
        if (total <= 0) {
            client.say(channel, `⚠️ Ошибка! Во всех банках пусто.`);
            return;
        }
        personalBankBalances[username] = (personalBankBalances[username] || 0) + total;
        client.say(channel, `💸 Владелец @${username} обнулил все банки, забрав ${total} 💵 на свой личный счет!`);
        
        mainBankBalance = 0;
        casinoBank = 0;
        boostsBank = 0;
        storeBank = 0;
        return;
    }

    // --- ПЕРЕДАЧА КРЫШЕК МЕЖДУ ИГРОКАМИ ---
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

    // --- ДУЭЛИ И ИГРЫ МЕЖДУ ИГРОКАМИ ---
    if (lowerMessage.startsWith('!казпати') || lowerMessage.startsWith('!патиказ') || lowerMessage.startsWith('!дуэль')) {
        const parts = trimmedMessage.split(' ');
        const targetArg = parts[1]?.replace('@', '').toLowerCase();
        const gameType = parts[2]?.toLowerCase() || 'покер';
        const amount = parseInt(parts[3]);

        if (!targetArg || isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Использование: !дуэль @ник [покер/рулетка/казино] [ставка]. Пример: !дуэль @Игрок покер 100`);
            return;
        }

        if (targetArg === username) {
            client.say(channel, `❌ Нельзя играть с самим собой.`);
            return;
        }

        if (!['покер', 'рулетка', 'казино'].includes(gameType)) {
            client.say(channel, `❌ Неверный режим игры! Доступно: покер, рулетка, казино.`);
            return;
        }

        if (playerBalances[username] < amount) {
            client.say(channel, `❌ У вас недостаточно КРЫШЕК для такой ставки! Ваш баланс: ${playerBalances[username]} 🪙`);
            return;
        }

        pendingDuels[targetArg] = { challenger: username, amount, gameType };
        client.say(channel, `⚔️ @${username} вызывает @${targetArg} на дуэль в режиме **${gameType}** на ставку ${amount} 🪙! Чтобы принять вызов, напишите: !принятьдуэль`);
        return;
    }

    if (lowerMessage === '!принятьдуэль' || lowerMessage === '!согласитьсянадуэль') {
        const duelData = pendingDuels[username];
        if (!duelData) {
            client.say(channel, `⚠️ У вас нет активных вызовов на дуэль.`);
            return;
        }

        const challenger = duelData.challenger;
        const amount = duelData.amount;
        const gameType = duelData.gameType;

        delete pendingDuels[username];

        if (playerBalances[challenger] < amount) {
            client.say(channel, `❌ У инициатора дуэли (@${challenger}) больше нет нужной суммы КРЫШЕК.`);
            return;
        }

        if (playerBalances[username] < amount) {
            client.say(channel, `❌ У вас недостаточно КРЫШЕК для принятия дуэли (${amount} 🪙).`);
            return;
        }

        playerBalances[challenger] -= amount;
        playerBalances[username] -= amount;
        const totalPot = amount * 2;

        let winner = '';
        let loser = '';

        if (gameType === 'покер') {
            const score1 = Math.random();
            const score2 = Math.random();
            if (score1 > score2) {
                winner = challenger;
                loser = username;
            } else if (score2 > score1) {
                winner = username;
                loser = challenger;
            } else {
                playerBalances[challenger] += amount;
                playerBalances[username] += amount;
                client.say(channel, `🤝 Дуэль между @${challenger} и @${username} в покер закончилась ничьей! Ставки возвращены.`);
                return;
            }
        } else if (gameType === 'рулетка') {
            const roll1 = Math.floor(Math.random() * 37);
            const roll2 = Math.floor(Math.random() * 37);
            if (roll1 > roll2) {
                winner = challenger;
                loser = username;
                client.say(channel, `🎯 Рулетка дуэли: @${challenger} выбил ${roll1}, а @${username} выбил ${roll2}.`);
            } else if (roll2 > roll1) {
                winner = username;
                loser = challenger;
                client.say(channel, `🎯 Рулетка дуэли: @${username} выбил ${roll2}, а @${challenger} выбил ${roll1}.`);
            } else {
                playerBalances[challenger] += amount;
                playerBalances[username] += amount;
                client.say(channel, `🎯 Рулетка дуэли: Ничья (${roll1}:${roll2})! Ставки возвращены.`);
                return;
            }
        } else {
            const roll1 = Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
            const roll2 = Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6);
            if (roll1 > roll2) {
                winner = challenger;
                loser = username;
            } else if (roll2 > roll1) {
                winner = username;
                loser = challenger;
            } else {
                playerBalances[challenger] += amount;
                playerBalances[username] += amount;
                client.say(channel, `🎲 Бросок кубиков в казино между @${challenger} и @${username}: Ничья! Ставки возвращены.`);
                return;
            }
        }

        const tax = Math.floor(totalPot * 0.1);
        const netWin = totalPot - tax;
        
        const bankShare = Math.floor(tax * 0.4);
        const casinoShare = Math.floor(tax * 0.3);
        const boostShare = tax - bankShare - casinoShare;
        
        mainBankBalance += bankShare;
        casinoBank += casinoShare;
        boostsBank += boostShare;
        boostShopBalances[winner] = (boostShopBalances[winner] || 0) + Math.max(1, Math.floor(tax * 0.1));

        playerBalances[winner] += netWin;
        client.say(channel, `🏆 Победитель дуэли (@${winner}) забирает банк в размере +${netWin} 🪙! (Комиссия: ${tax} 🪙). Поздравляем!`);
        return;
    }

    // --- СИСТЕМА БРАКОВ И СЕМЕЙ ---
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
        client.say(channel, `💍 @${username} вставая на правое колено, делает предложение руки и сердца @${targetArg}! Чтобы согласиться, напишите: !принять. Чтобы отказаться: !отказаться`);
        return;
    }

    if (lowerMessage === '!принять' || lowerMessage === '!согласиться') {
        const proposer = pendingProposals[username];
        if (!proposer) {
            client.say(channel, `⚠️ У вас нет активных предложений для принятия.`);
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
        marriageDates[proposer] = marriageDates[username] = dateStr;
        
        const nowMs = Date.now();
        marriageTimestamps[proposer] = nowMs;
        marriageTimestamps[username] = nowMs;

        delete pendingProposals[username];
        client.say(channel, `❤️ СЛАДКО! @${proposer} и @${username} официально стали мужем и женой! 🎉 С праздником новую семью!`);
        return;
    }

    if (lowerMessage === '!отказаться' || lowerMessage === '!отклонить') {
        const proposer = pendingProposals[username];
        if (!proposer) {
            client.say(channel, `⚠️ У вас нет активных предложений, чтобы от них отказываться.`);
            return;
        }

        delete pendingProposals[username];
        client.say(channel, `💔 @${username} холодно отклонил(-а) предложение руки и сердца от @${proposer}. Свадьбы не будет!`);
        return;
    }

    if (lowerMessage.startsWith('!поцеловать')) {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `❌ @${username}, вы не состоите в браке, некого целовать!`);
            return;
        }
        client.say(channel, `💋 @${username} нежно и страстно целует свою вторую половинку — @${partner}! ❤️`);
        return;
    }

    if (lowerMessage.startsWith('!обнять')) {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `❌ @${username}, у вас нет пары для объятий.`);
            return;
        }
        client.say(channel, `🤗 @${username} крепко-крепко обнимает своего любимого мужа/жену — @${partner}! 🥰`);
        return;
    }

    // --- СЕМЕЙНЫЙ СЕЙФ ---
    if (lowerMessage.startsWith('!сейф')) {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `❌ @${username}, семейный сейф доступен только тем, кто состоит в браке!`);
            return;
        }

        const familyKey = [username, partner].sort().join('_');
        if (familyVaults[familyKey] === undefined) {
            familyVaults[familyKey] = 0;
        }

        const args = trimmedMessage.split(' ');
        const action = args[1]?.toLowerCase();
        const amount = parseInt(args[2]);

        if (!action || (action !== 'баланс' && isNaN(amount))) {
            client.say(channel, `⚠️ Использование: !сейф баланс | !сейф положить [сумма] | !сейф взять [сумма]`);
            return;
        }

        if (action === 'баланс') {
            client.say(channel, `🔐 Семейный сейф (@${username} & @${partner}): ${familyVaults[familyKey]} 🪙 крышек.`);
            return;
        }

        if (action === 'положить') {
            if (amount <= 0 || personalBankBalances[username] < amount) {
                client.say(channel, `❌ Неверная сумма или недостаточно КРЫШЕК на руках! Ваш баланс: ${personalBankBalances[username]} 🪙`);
                return;
            }
            personalBankBalances[username] -= amount;
            familyVaults[familyKey] += amount;
            client.say(channel, `💼 @${username} положил(-а) ${amount} 🪙 в семейный сейф. Баланс сейфа: ${familyVaults[familyKey]} 🪙`);
            return;
        }

        if (action === 'взять') {
            if (amount <= 0 || familyVaults[familyKey] < amount) {
                client.say(channel, `❌ Неверная сумма или в семейном сейфе недостаточно средств! В сейфе: ${familyVaults[familyKey]} 🪙`);
                return;
            }
            familyVaults[familyKey] -= amount;
            personalBankBalances[username] += amount;
            client.say(channel, `🏧 @${username} забрал(-а) ${amount} 🪙 из семейного сейфа. Остаток в сейфе: ${familyVaults[familyKey]} 🪙`);
            return;
        }

        client.say(channel, `⚠️ Неверное действие. Используйте: !сейф баланс, !сейф положить [сумма], !сейф взять [сумма]`);
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
        const familyKey = [username, partner].sort().join('_');
        const vaultBalance = familyVaults[familyKey] || 0;
        client.say(channel, `💒 Семья: @${username} ❤️ @${partner} | В браке с: ${date} | Детей: ${kidsCount} | Семейный сейф: ${vaultBalance} 🪙`);
        return;
    }

    if (lowerMessage === '!топбраков' || lowerMessage === '!топпар') {
        const processedMarriages = new Set();
        const marriageList = [];

        for (const [user1, user2] of Object.entries(playerMarriages)) {
            if (!processedMarriages.has(user2) && !processedMarriages.has(user1)) {
                processedMarriages.add(user1);
                processedMarriages.add(user2);
                const date = marriageDates[user1] || 'неизвестно';
                const kids = playerChildren[user1] || 0;
                marriageList.push({ user1, user2, date, kids });
            }
        }

        if (marriageList.length === 0) {
            client.say(channel, `🏆 Пары ещё не сформированы.`);
            return;
        }

        let topText = `🏆 ТОП БРАКОВ: `;
        marriageList.slice(0, 10).forEach((m, index) => {
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6⃣', '7⃣', '8⃣', '9⃣', '🔟'];
            topText += `${medals[index]} @${m.user1} ❤️ @${m.user2} (📅 С ${m.date}) | `;
        });
        client.say(channel, topText);
        return;
    }

    if (lowerMessage === '!ребёнок') {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `❌ @${username}, вы должны состоять в браке, чтобы завести ребёнка!`);
            return;
        }

        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;
        if (lastChildTime[username] && (now - lastChildTime[username] < cooldown)) {
            client.say(channel, `⏳ @${username}, вы недавно уже пытались завести ребёнка. Попробуйте позже.`);
            return;
        }

        const marriageTime = marriageTimestamps[username] || 0;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if ((now - marriageTime) < sevenDays) {
            client.say(channel, `❌ @${username}, Ваша семья ещё слишком молода! Нужно прожить в браке не менее 7 дней.`);
            return;
        }

        lastChildTime[username] = now;
        lastChildTime[partner] = now;

        playerChildren[username] = (playerChildren[username] || 0) + 1;
        playerChildren[partner] = (playerChildren[partner] || 0) + 1;

        client.say(channel, `👶 У счастливой пары @${username} и @${partner} родился ребёнок! Поздравляем с пополнением в семье! ❤️`);
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

        client.say(channel, `💔 @${username} и @${partner} эта прекрасная пара развелась, каждый идёт своей дорогой!`);
        return;
    }

    // --- БАНКОВСКАЯ СИСТЕМА И ДОЛГИ ---
    if (lowerMessage === '!банк' || lowerMessage === '!bank') {
        client.say(channel, `🏦 @${username}, ваш личный банковский счёт: ${personalBankBalances[username]} 💵`);
        return;
    }

    if (lowerMessage.startsWith('!кредит') || lowerMessage.startsWith('!взятькредит')) {
        if (bankBannedUsers[username]) {
            client.say(channel, `❌ @${username}, вам запрещено пользоваться этим банком из-за неоплаченного кредита в течение 3-х дней!`);
            return;
        }

        if (playerDebts[username] > 0) {
            client.say(channel, `❌ @${username}, Банк отказал вам в выдаче нового кредита, так как у вас уже есть неоплаченный кредит. (${playerDebts[username]} 💵)! Погасите его через !погасить [сумма].`);
            return;
        }

        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ Укажите сумму кредита. Пример: !кредит 500`);
            return;
        }

        if (amount > 10000) {
            client.say(channel, `❌ Максимальная сумма кредита составляет 10000 💵!`);
            return;
        }

        playerDebts[username] += amount;
        personalBankBalances[username] = (personalBankBalances[username] || 0) + amount;

        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
        bankDebtDeadlines[username] = Date.now() + THREE_DAYS_MS;

        client.say(channel, `🏦 Банк одобрил и выдал @${username} кредит на сумму ${amount} 💵! Внимание: верните кредит в течение 3 дней, иначе начнется тюремное заключение!`);
        return;
    }

    if (lowerMessage === '!долг' || lowerMessage === '!мойдолг') {
        let timeLeftText = '';
        if (casinoDebtDeadlines[username]) {
            const diffHours = Math.ceil((casinoDebtDeadlines[username] - Date.now()) / (1000 * 60 * 60));
            if (diffHours > 0) {
                const days = (diffHours / 24).toFixed(1);
                timeLeftText = ` (Казино дедлайн: ~${days} дн.)`;
            } else {
                timeLeftText = ` (КАЗИНО СРОК ИСТЕК!)`;
            }
        }
        
        let bankTimeLeftText = '';
        if (bankDebtDeadlines[username]) {
            const diffHours = Math.ceil((bankDebtDeadlines[username] - Date.now()) / (1000 * 60 * 60));
            if (diffHours > 0) {
                const days = (diffHours / 24).toFixed(1);
                bankTimeLeftText = ` (Банк дедлайн: ~${days} дн.)`;
            } else {
                bankTimeLeftText = ` (БАНКОВСКИЙ СРОК ИСТЕК!)`;
            }
        }

        const stage = playerJailStages[username] || 0;
        let jailStatus = stage > 0 ? ` | Тюремная стадия: ${stage}/3` : '';

        client.say(channel, `💳 @${username} | Кредит в банке: ${playerDebts[username]} 💵${bankTimeLeftText} | Долг в казино: ${casinoDebts[username]} 🪙${timeLeftText}${jailStatus}`);
        return;
    }

    if (lowerMessage.startsWith('!выкупить') || lowerMessage.startsWith('!залог')) {
        const parts = trimmedMessage.split(' ');
        const targetUser = parts[1]?.replace('@', '').toLowerCase() || username;

        if (!playerJailDeadlines[targetUser]) {
            client.say(channel, `❌ Игрок @${targetUser} не находится в тюрьме.`);
            return;
        }

        if (playerLastChanceUsed[targetUser]) {
            client.say(channel, `❌ Игрок @${targetUser} уже использовал свой единственный шанс в жизни на амнистию/выкуп! Больше его выпустить нельзя.`);
            return;
        }

        const debtAmount = playerDebts[targetUser] || 500;
        const bailCost = debtAmount + Math.floor(debtAmount * 0.2);

        if (personalBankBalances[username] < bailCost) {
            client.say(channel, `❌ У вас (@${username}) недостаточно средств на личном банковском счете для внесения залога за @${targetUser}! Нужно: ${bailCost} 💵`);
            return;
        }

        personalBankBalances[username] -= bailCost;
        mainBankBalance += bailCost;

        playerDebts[targetUser] = 0;
        delete bankDebtDeadlines[targetUser];
        delete playerJailDeadlines[targetUser];
        playerJailStages[targetUser] = 0;
        bankBannedUsers[targetUser] = false;
        playerLastChanceUsed[targetUser] = true;

        client.say(channel, `🚨 ВНИМАНИЕ! За @${targetUser} внесли залог и выплатили его кредит! Он выпущен на свободу, но ЕМУ ВЫНЕСЕНО ПРЕДУПРЕЖДЕНИЕ: этот шанс дается всего 1 раз в жизни!`);
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
        let amount = args[2]?.toLowerCase() === 'all' || args[2]?.toLowerCase() === 'все' ? casinoDebts[username] : parseInt(args[2]);
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

    if (lowerMessage.startsWith('!погасить кредит') || lowerMessage.startsWith('!вернуть кредит') || lowerMessage.startsWith('!погасить')) {
        const args = trimmedMessage.split(' ');
        const amountArg = args.find(arg => !isNaN(parseInt(arg)));
        let amount = parseInt(amountArg);
        const currentDebt = playerDebts[username];

        if (isNaN(amount) || amount <= 0 || currentDebt <= 0) {
            client.say(channel, `⚠️ У вас нет активных долгов/кредитов или неверная сумма. Пример: !погасить [cумма]`);
            return;
        }
        if (amount > currentDebt) amount = currentDebt;
        if (personalBankBalances[username] < amount) {
            client.say(channel, `❌ Недостаточно средств на личном банковском счёте (${personalBankBalances[username]} 💵) для погашения ${amount} 💵 кредита.`);
            return;
        }

        personalBankBalances[username] -= amount;
        playerDebts[username] -= amount;
        mainBankBalance += amount;

        if (playerDebts[username] === 0) {
            delete bankDebtDeadlines[username];
            delete playerJailDeadlines[username]; 
            playerJailStages[username] = 0;
            bankBannedUsers[username] = false; 
        }

        client.say(channel, `✅ @${username} успешно погасил ${amount} 💵 кредита! Остаток долга: ${playerDebts[username]} 💵`);
        return;
    }

    // --- ТОП КАЗИНО ---
    if (lowerMessage === '!топказ' || lowerMessage === '!topcas' || lowerMessage === '!топкрышки') {
        const sortedPlayers = Object.entries(playerBalances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        if (sortedPlayers.length === 0) {
            client.say(channel, `🏆 Топ пустой! Займи первое место сам. (!каз)`);
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

    // --- ДОЛЖНОСТИ В КАЗИНО ---
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

    // --- КОММУНАЛЬНЫЕ НАЛОГИ ---
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

    // --- МАГАЗИН ПРЕДМЕТОВ ---
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
            client.say(channel, `❌ Недостаточно средств на личном банковском счёте! У вас: ${personalBankBalances[username]} 💵 (нужно: ${item.price})`);
            return;
        }

        personalBankBalances[username] -= item.price;
        
        const bankTax = Math.floor(item.price * 0.15);
        storeBank += bankTax;
        mainBankBalance += bankTax;

        if (!playerInventory[username]) playerInventory[username] = [];
        playerInventory[username].push(itemName);

        // --- ДОБАВЛЕНО: КЕШБЭК В БУСТ-ШОП ПРИ ПОКУПКЕ ---
        // Игрок получает 10% от стоимости товара обычного магазина в виде очков буст-шопа
        const cashbackPoints = Math.max(1, Math.floor(item.price * 0.10));
        boostShopBalances[username] = (boostShopBalances[username] || 0) + cashbackPoints;
        // ------------------------------------------------

        if (item.type === 'жилье') {
            if (!playerUtilities[username]) {
                playerUtilities[username] = { water: 0, gas: 0, light: 0 };
            }
            playerUtilities[username].water += 50;
            playerUtilities[username].gas += 60;
            playerUtilities[username].light += 75;
            client.say(channel, `🏠 Поздравляем с покупкой жилья! Следите за коммунальными услугами (!коммуналка).`);
        }

        client.say(channel, `🛍️ Поздравляем, @${username}! Вы купили "${itemName}" за ${item.price} 💵 с личного счёта в банке! (🎁 Кешбэк: +${cashbackPoints} 🔮 в буст-шоп)`);
        return;
    }

    // --- МАГАЗИН БУСТОВ ---
    if (lowerMessage === '!бустшоп' || lowerMessage === '!усилители' || lowerMessage === '!бустики') {
        let text = `⚡ МАГАЗИН БУСТОВ (за счет бустов 🔮): `;
        Object.entries(CASINO_BOOSTS).forEach(([bName, bData]) => {
            text += `[${bName}] — ${bData.price} очков (${bData.desc}) | `;
        });
        client.say(channel, text + `Купить: !купитьбуст [название] | Ваш счет: !счётбустов`);
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
            client.say(channel, `❌ Такого усилителя нет! Каталог: !бустшоп`);
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

    // --- КАЗИНО ---
    if (lowerMessage.startsWith('!каз')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ Казино сейчас закрыто. Приходите позже.`);
            return;
        }

        if (playerBalances[username] <= 0) {
            client.say(channel, `❌ @${username}, у вас 0 КРЫШЕК! Вы всё слили. Заработайте деньги на работе (!работа) или обменяйте их с банковского счёта (!обмен), чтобы продолжить игру.`);
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

        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣', '💩', '🥐', '🍩', '🛑', '🎲', '🚽', '🧊', '🍪', '🩸', '🚬'];
        let r1 = symbols[Math.floor(Math.random() * symbols.length)];
        let r2 = symbols[Math.floor(Math.random() * symbols.length)];
        let r3 = symbols[Math.floor(Math.random() * symbols.length)];

        if (winChanceBonus > 0 && r1 !== r2 && r2 !== r3 && r1 !== r3) {
            if (Math.random() < 0.5) r2 = r1;
        }

        if (r1 === r2 && r2 === r3) {
            let rawWin = bet * 15 * winMultiplier;
            const tax = Math.floor(rawWin * 0.1);
            
            const bankShare = Math.floor(tax * 0.50);
            const casinoShare = Math.floor(tax * 3.50);
            const boostBankShare = Math.floor(tax * 0.1);
            const storeShare = tax - bankShare - casinoShare - boostBankShare;

            mainBankBalance += bankShare;
            casinoBank += casinoShare;
            boostsBank += boostBankShare;
            storeBank += storeShare;

            const rewardPoints = Math.max(1, Math.floor(tax * 0.2));
            boostShopBalances[username] = (boostShopBalances[username] || 0) + rewardPoints;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += Math.floor(bet / 2);
            client.say(channel, `🎰 ДЖЕКПОТ! @${username} (${r1} ${r2} ${r3}) выиграл +${win} КРЫШЕК! Баланс: ${playerBalances[username]} 🪙`);
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            let rawWin = Math.floor(bet * 2.5 * winMultiplier);
            const tax = Math.max(1, Math.floor(rawWin * 0.1));

            const bankShare = Math.max(1, Math.floor(tax * 0.3));
            const casinoShare = Math.max(1, Math.floor(tax * 0.3));
            const boostBankShare = Math.max(1, Math.floor(tax * 0.2));
            const storeShare = Math.max(0, tax - bankShare - casinoShare - boostBankShare);

            mainBankBalance += bankShare;
            casinoBank += casinoShare;
            boostsBank += boostBankShare;
            storeBank += storeShare;

            const rewardPoints = Math.max(1, Math.floor(tax * 0.2));
            boostShopBalances[username] = (boostShopBalances[username] || 0) + rewardPoints;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += 2;
            client.say(channel, `✨ Пара (${r1} ${r2} ${r3})! @${username} выиграл +${win} КРЫШЕК! Баланс: ${playerBalances[username]} 🪙`);
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

    // --- ПОКЕР ---
    if (lowerMessage.startsWith('!покер')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ Казино сейчас закрыто. Приходите позже.`);
            return;
        }

        if (playerBalances[username] <= 0) {
            client.say(channel, `❌ @${username}, у вас 0 КРЫШЕК! Заработайте их на работе (!работы).`);
            return;
        }

        const args = trimmedMessage.split(' ');
        let bet = args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'все' ? playerBalances[username] : parseInt(args[1]);

        if (isNaN(bet) || bet <= 0 || playerBalances[username] < bet) {
            client.say(channel, `⚠️ @${username}, неверная ставка для покера. Пример: !покер 50`);
            return;
        }

        playerBalances[username] -= bet;

        const suits = ['♠', '♣', '♥', '♦'];
        const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        let hand = [];
        for (let i = 0; i < 5; i++) {
            let r = ranks[Math.floor(Math.random() * ranks.length)];
            let s = suits[Math.floor(Math.random() * suits.length)];
            hand.push(r + s);
        }

        let rankCounts = {};
        hand.forEach(card => {
            let r = card.slice(0, -1);
            rankCounts[r] = (rankCounts[r] || 0) + 1;
        });

        let counts = Object.values(rankCounts).sort((a, b) => b - a);
        let rawWin = 0;
        let comboName = "Старшая карта (Проигрышь)";

        if (counts[0] === 4) {
            rawWin = bet * 20;
            comboName = "Каре 🔥";
        } else if (counts[0] === 3 && counts[1] === 2) {
            rawWin = bet * 10;
            comboName = "Фулл-хаус 🎲";
        } else if (counts[0] === 3) {
            rawWin = bet * 4;
            comboName = "Тройка ✨";
        } else if (counts[0] === 2 && counts[1] === 2) {
            rawWin = bet * 3;
            comboName = "Две пары ✌️";
        } else if (counts[0] === 2) {
            rawWin = bet * 1.5;
            comboName = "Пара 👍";
        }

        if (rawWin > 0) {
            rawWin = Math.floor(rawWin);
            const tax = Math.max(1, Math.floor(rawWin * 0.1));

            const bankShare = Math.max(1, Math.floor(tax * 0.3));
            const casinoShare = Math.max(1, Math.floor(tax * 0.3));
            const boostBankShare = Math.max(1, Math.floor(tax * 0.2));
            const storeShare = Math.max(0, tax - bankShare - casinoShare - boostBankShare);

            mainBankBalance += bankShare;
            casinoBank += casinoShare;
            boostsBank += boostBankShare;
            storeBank += storeShare;

            const rewardPoints = Math.max(1, Math.floor(tax * 0.2));
            boostShopBalances[username] = (boostShopBalances[username] || 0) + rewardPoints;

            const win = rawWin - tax;
            playerBalances[username] += win;
            client.say(channel, `🃏 ПОКЕР | @${username} [ ${hand.join(' ')} ] — ${comboName}! Выигрыш: +${win} 🪙 | Баланс: ${playerBalances[username]} 🪙`);
        } else {
            client.say(channel, `🃏 ПОКЕР | @${username} [ ${hand.join(' ')} ] — ${comboName}. Увы, ставка сгорела. Баланс: ${playerBalances[username]} 🪙`);
        }
        return;
    }

    // --- РУЛЕТКА ---
    if (lowerMessage.startsWith('!рулетка')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ Казино сейчас закрыто.`);
            return;
        }

        if (playerBalances[username] <= 0) {
            client.say(channel, `❌ @${username}, у вас 0 КРЫШЕК! Заработайте их на работе (!работы).`);
            return;
        }

        const args = trimmedMessage.split(' ');
        const betArg = args[1];          
        const targetArg = args[2]?.toLowerCase(); 

        let bet = betArg?.toLowerCase() === 'all' || betArg?.toLowerCase() === 'все' ? playerBalances[username] : parseInt(betArg);

        if (isNaN(bet) || bet <= 0 || playerBalances[username] < bet || !targetArg) {
            client.say(channel, `⚠️ Использование: !рулетка [ставка] [красное / черное / зеленый / 0-36]. Пример: !рулетка 50 красное`);
            return;
        }

        const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        const blackNumbers = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
        
        let isValidBetTarget = false;
        let targetType = ''; 
        let targetNum = null;

        if (['красное', 'red', 'красный'].includes(targetArg)) {
            targetType = 'red';
            isValidBetTarget = true;
        } else if (['черное', 'black', 'чёрное'].includes(targetArg)) {
            targetType = 'black';
            isValidBetTarget = true;
        } else if (['зеленый', 'green', 'зелёный', 'зеро', '0'].includes(targetArg)) {
            targetType = 'green';
            targetNum = 0;
            isValidBetTarget = true;
        } else {
            const num = parseInt(targetArg);
            if (!isNaN(num) && num >= 0 && num <= 36) {
                targetType = 'number';
                targetNum = num;
                isValidBetTarget = true;
            }
        }

        if (!isValidBetTarget) {
            client.say(channel, `❌ Неверная ставка! Укажите цвет (красное, чёрное, зелёный) или конкретное число от 0 до 36.`);
            return;
        }

        playerBalances[username] -= bet;

        const rolledNumber = Math.floor(Math.random() * 37);
        let rolledColor = '🟢 зелёный (0)';
        if (redNumbers.includes(rolledNumber)) rolledColor = '🔴 красное';
        else if (blackNumbers.includes(rolledNumber)) rolledColor = '⚫ чёрное';

        let isWin = false;
        let rawWin = 0;

        if (targetType === 'red' && redNumbers.includes(rolledNumber)) {
            isWin = true;
            rawWin = bet * 2;
        } else if (targetType === 'black' && blackNumbers.includes(rolledNumber)) {
            isWin = true;
            rawWin = bet * 2;
        } else if (targetType === 'green' && rolledNumber === 0) {
            isWin = true;
            rawWin = bet * 14; 
        } else if (targetType === 'number' && targetNum === rolledNumber) {
            isWin = true;
            rawWin = bet * 35; 
        }

        if (isWin) {
            const tax = Math.max(1, Math.floor(rawWin * 0.1));
            
            const bankShare = Math.max(1, Math.floor(tax * 0.3));
            const casinoShare = Math.max(1, Math.floor(tax * 0.3));
            const boostBankShare = Math.max(1, Math.floor(tax * 0.2));
            const storeShare = Math.max(0, tax - bankShare - casinoShare - boostBankShare);

            mainBankBalance += bankShare;
            casinoBank += casinoShare;
            boostsBank += boostBankShare;
            storeBank += storeShare;

            const rewardPoints = Math.max(1, Math.floor(tax * 0.2));
            boostShopBalances[username] = (boostShopBalances[username] || 0) + rewardPoints;

            const win = rawWin - tax;
            playerBalances[username] += win;
            client.say(channel, `🎯 РУЛЕТКА | Выпало: ${rolledNumber} (${rolledColor})! 🏆 @${username} победил и выиграл +${win} 🪙! Баланс: ${playerBalances[username]} 🪙`);
        } else {
            client.say(channel, `🎯 РУЛЕТКА | Выпало: ${rolledNumber} (${rolledColor}). ❌ @${username} проиграл ставку. Баланс: ${playerBalances[username]} 🪙`);
        }
        return;
    }

    // --- ПРОФИЛЬ И СТАТИСТИКА ---
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

        let profileText = `📊 Профиль @${targetUser} ➔ 🎂 Возраст: ${age} лет | 🪙 КРЫШКИ: ${caps} | 🏦 Банк (личный счёт): ${pBank} | 🏦 Банк-долг: ${debt} | 🎰 Долг казино: ${cDebt} | 🔮 Буст-очки: ${boostPoints} | 💼 Работа: ${job}`;
        if (casinoRole) profileText += ` | Должность: ${casinoRole}`;
        profileText += ` | 💒 Семья: ${marriage} | 🛒 Имущество: [${inventory}] | 💡 Коммуналка: [${utilitiesText}] | ⚡ Бусты: [${activeBoosts}]`;

        client.say(channel, profileText);
        return;
    }

    if (lowerMessage === '!*100#' || lowerMessage === '*100#') {
        client.say(channel, `💰 @${username} | Возраст: ${playerAges[username]} лет | Казино: ${playerBalances[username]} 🪙 | Баланс в банке: ${personalBankBalances[username]} 💵 | Счёт бустов: ${boostShopBalances[username]} 🔮 | Долги (Банк: ${playerDebts[username]} | Казино: ${casinoDebts[username]})`);
        return;
    }

    // --- РАБОТА И ОБМЕН ---
    if (lowerMessage.startsWith('!работы')) {
        const parts = trimmedMessage.split(' ');
        const page = parseInt(parts[1]) || 1;
        const jobEntries = Object.entries(JOBS_DATA);
        const perPage = 12;
        const totalPages = Math.ceil(jobEntries.length / perPage);

        const start = (page - 1) * perPage;
        const pageJobs = jobEntries.slice(start, start + perPage);

        if (pageJobs.length === 0) {
            client.say(channel, `❌ Страница ${page} не найдена. Всего страниц: ${totalPages}`);
            return;
        }

        let text = `💼 ДОСТУПНЫЕ РАБОТЫ (Стр. ${page}/${totalPages}): `;
        pageJobs.forEach(([jobName, data]) => {
            text += `[${jobName}] Зарп: ${data.salary} 💵 (мин. в банке: ${data.req}) | `;
        });
        text += `(Смотреть след: !работы 3 | Устроиться: !устроиться [название])`;
        client.say(channel, text);
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

client.connect().catch(console.error);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RGROMBOT Full Featured Twitch Bot Service is Running!\n');
}).listen(PORT, () => {
    console.log(`HTTP сервер запущен на порту ${PORT}`);
});
