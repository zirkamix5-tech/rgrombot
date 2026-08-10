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

// --- СИСТЕМА БРАКОВ И СЕМЕЙ ---
const playerMarriages = {};          // playerMarriages[username] = partnerUsername
const marriageDates = {};            // marriageDates[username] = дата/время свадьбы
const pendingProposals = {};         // pendingProposals[targetUsername] = proposingUsername

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

    const username = (tags['display-name'] || tags.username).toLowerCase();
    if (isBot(tags, username)) return;

    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username === 'qumosx' || username === 'rgrombot';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username === 'qumosx';

    // Инициализация данных пользователя по умолчанию
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
        client.say(channel, `Привет, @${username}! Работает банк стрима, казино и система браков (!свадьба @ник)!`);
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

        if (bankType === 'казино') casinoBank -= amount;
        else if (bankType === 'бусты' || bankType === 'бустов') boostsBank -= amount;
        else if (bankType === 'магазин') storeBank -= amount;
        else if (bankType === 'банк' || bankType === 'общий') mainBankBalance -= amount;

        workBalances[username] = (workBalances[username] || 0) + amount;
        client.say(channel, `💸 Владелец @${username} снял ${amount} из (${targetName}) на свой рабочий счет (+${amount} 💵)!`);
        return;
    }

    // --- 3. СИСТЕМА БРАКОВ И СЕМЕЙ ---
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
        if (playerBalances[username] < weddingCost) {
            client.say(channel, `❌ Недостаточно КРЫШЕК для свадьбы! Нужно: ${weddingCost} 🪙`);
            return;
        }

        pendingProposals[targetArg] = username;
        client.say(channel, `💍 @${username} сделал предложение руки и сердца @${targetArg}! Чтобы согласиться, напишите: !принять`);
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
        if (playerBalances[proposer] < weddingCost) {
            delete pendingProposals[username];
            client.say(channel, `❌ У инициатора свадьбы (@${proposer}) больше нет ${weddingCost} 🪙 на балансе.`);
            return;
        }

        playerBalances[proposer] -= weddingCost;
        mainBankBalance += Math.floor(weddingCost * 0.5); // Половина стоимости свадьбы идет в банк

        playerMarriages[proposer] = username;
        playerMarriages[username] = proposer;
        const dateStr = new Date().toLocaleDateString();
        marriageDates[proposer] = dateStr;
        marriageDates[username] = dateStr;

        delete pendingProposals[username];
        client.say(channel, `❤️ ГОРЬКО! @${proposer} и @${username} официально поженились! 🎉 С праздником новую семью!`);
        return;
    }

    if (lowerMessage === '!семья' || lowerMessage === '!пара' || lowerMessage === '!бракпрофиль') {
        const partner = playerMarriages[username];
        if (!partner) {
            client.say(channel, `💔 @${username}, вы пока не состоите в браке. Найдите пару: !свадьба @ник`);
            return;
        }
        const date = marriageDates[username] || 'неизвестно';
        client.say(channel, `💒 Семья: @${username} ❤️ @${partner} | В браке с: ${date}`);
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

        client.say(channel, `💔 @${username} и @${partner} официально развелись. Каждый идет своей дорогой.`);
        return;
    }

    // --- 4. БАНКОВСКАЯ СИСТЕМА (КРЕДИТЫ И СЧЕТА) ---
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
        playerBalances[username] += amount;
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
        mainBankBalance += amount;
        client.say(channel, `✅ @${username} успешно погасил ${amount} 🪙 долга! Остаток долга: ${playerDebts[username]} 🪙`);
        return;
    }

    // --- 5. МАГАЗИН ПРЕДМЕТОВ ---
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
        
        const bankTax = Math.floor(item.price * 0.15);
        storeBank += bankTax;
        mainBankBalance += bankTax;

        if (!playerInventory[username]) playerInventory[username] = [];
        playerInventory[username].push(itemName);

        client.say(channel, `🛍️ Поздравляем, @${username}! Вы купили "${itemName}" за ${item.price} 💵!`);
        return;
    }

    // --- 6. МАГАЗИН БУСТОВ И СЧЕТ БУСТОВ ---
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

        const bankTax = Math.floor(boostData.price * 0.20);
        boostsBank += bankTax;
        mainBankBalance += bankTax;

        client.say(channel, `🎉 Успешно! @${username} приобрел буст "**${boostKey}**" (+${boostData.amount} зарядов)!`);
        return;
    }

    // --- 7. КАЗИНО ---
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

        if (boosts.luck > 0) {
            boosts.luck--;
            winChanceBonus = 0.20;
        }

        if (boosts.x2 > 0) {
            boosts.x2--;
            winMultiplier = 2;
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
            
            const bankShare = Math.floor(tax * 0.5);
            casinoBank += (tax - bankShare);
            mainBankBalance += bankShare;

            const win = rawWin - tax;
            playerBalances[username] += win;
            shopBalances[username] += Math.floor(bet / 2);
            client.say(channel, `🎰 ДЖЕКПOT! @${username} (${r1} ${r2} ${r3}) выиграл +${win} КРЫШКИ!`);
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

    // --- 8. ПРОФИЛЬ, БАЛАНС И ОБЩАЯ СТАТИСТИКА ИГРОКА ---
    if (lowerMessage.startsWith('!статистика') || lowerMessage.startsWith('!профиль') || lowerMessage.startsWith('!стат')) {
        const args = trimmedMessage.split(' ');
        let targetUser = username;

        if (args[1]) {
            targetUser = args[1].replace('@', '').toLowerCase();
        }

        if (targetUser !== username && playerBalances[targetUser] === undefined) {
            client.say(channel, `❌ Игрок @${targetUser} не найден.`);
            return;
        }

        const caps = playerBalances[targetUser] || 0;
        const workMoney = workBalances[targetUser] || 0;
        const debt = playerDebts[targetUser] || 0;
        const boostPoints = boostShopBalances[targetUser] || 0;
        
        const job = playerJobs[targetUser] || 'Безработный';
        const invArray = playerInventory[targetUser] || [];
        const inventory = invArray.length > 0 ? invArray.join(', ') : 'Ничего нет';
        const marriage = playerMarriages[targetUser] ? `💍 @${playerMarriages[targetUser]}` : 'Холостяк(-ая)';
        
        const b = playerBoosts[targetUser] || { luck: 0, x2: 0, shield: 0 };
        const activeBoosts = `Уд:${b.luck}|x2:${b.x2}|Щит:${b.shield}`;

        client.say(channel, `📊 Профиль @${targetUser} ➔ 🪙 КРЫШКИ: ${caps} | 💵 Счет: ${workMoney} | 🏦 Долг: ${debt} | 🔮 Буст-очки: ${boostPoints} | 💼 Работа: ${job} | 💒 Семья: ${marriage} | 🛒 Имущество: [${inventory}] | ⚡ Бусты: [${activeBoosts}]`);
        return;
    }

    if (lowerMessage === '!баланс' || lowerMessage === '!крышки') {
        client.say(channel, `💰 @${username} | Казино: ${playerBalances[username]} 🪙 | Работа: ${workBalances[username]} 💵 | Счёт бустов: ${boostShopBalances[username]} 🔮 | Долг: ${playerDebts[username]} 🪙`);
        return;
    }

    if (lowerMessage === '!банкстат' && isMod) {
        client.say(channel, `📈 БАНКИ СТРИМА | Главный счет: ${mainBankBalance} 🪙 | Казино: ${casinoBank} 🪙 | Магазин: ${storeBank} | Банк бустов: ${boostsBank} 🔮`);
        return;
    }

    // --- 9. РАБОТА И ОБМЕН ---
    if (lowerMessage === '!работы') {
        let text = `💼 ДОСТУПНЫЕ РАБОТЫ: `;
        Object.entries(JOBS_DATA).forEach(([jobName, data]) => {
            text += `[${jobName}] Зарплата: ${data.salary} 💵 (мин. КРЫШКИ: ${data.req}) | `;
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

        const userCaps = playerBalances[username] || 0;
        if (userCaps < jobConfig.req) {
            client.say(channel, `❌ Недостаточно опыта/капитала! Для работы "${foundJobKey}" нужно иметь минимум ${jobConfig.req} КРЫШЕК на балансе казино.`);
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
        client.say(channel, `💼 Ваша текущая профессия: **${currentJob}** | Зарплата: ${jobConfig.salary} 💵 | Интервал: ${jobConfig.cooldown / 60000} мин.`);
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

    if (lowerMessage === '!работа' || lowerMessage === '!work') {
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
        workBalances[username] += jobConfig.salary;
        client.say(channel, `💼 @${username} успешно отработал смену (**${currentJob}**) и получил +${jobConfig.salary} 💵!`);
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
