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
const shopBalances = {};             // Балансы очков магазина (отдельный счет)
const playerVips = new Set();        // Список игроков с VIP-статусом

// --- СИСТЕМА ДОЛГОВ ---
const playerDebts = {};              // Сумма долга игрока
const debtTimestamps = {};           // Время взятия долга (миллисекунды)
const DEBT_LIMIT_MS = 3 * 24 * 60 * 60 * 1000; // 3 дня в миллисекундах

// --- СИСТЕМА БРАКОВ, ПОЛИАМОРИИ И ДЕТЕЙ ---
const marriages = {};                // marriages[username] = { partners: [Set], timestamp: ms, date: 'ДД.ММ.ГГГГ', children: [] }
const marriageProposals = {};        // marriageProposals[targetUser] = fromUser

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
    'AlerterBot',
    'JeetBot',
    'CreatisBot',
    'QumosX'
]);

function isBot(tags, username) {
    const lowerUser = username.toLowerCase();
    
    // Проверка по стандартному списку известных ботов
    if (knownBots.has(lowerUser)) return true;
    
    // Проверка окончания никнейма на "-bot" или "_bot"
    if (lowerUser.endsWith('bot') || lowerUser.endsWith('_bot') || lowerUser.endsWith('-bot')) return true;
    
    // Проверка официального Twitch-флага бота в тегах (если передается)
    if (tags['user-type'] === 'bot' || tags.badges?.bot) return true;

    return false;
}

client.on('message', (channel, tags, message, self) => {
    if (self) return; // Игнорируем сообщения самого бота

    const username = tags['display-name'] || tags.username;

    // --- ГЛОБАЛЬНЫЙ ФИЛЬТР БОТОВ ---
    if (isBot(tags, username)) {
        return; // Полностью игнорируем любых ботов
    }

    const trimmedMessage = message.trim();
    const lowerMessage = trimmedMessage.toLowerCase();
    
    // Проверка прав модератора / владельца
    const isMod = tags.mod || tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx' || username.toLowerCase() === 'rgrombot';
    const isBroadcaster = tags.badges?.broadcaster === '1' || username.toLowerCase() === 'qumosx';

    // --- 1. МОДУЛЬ АВТОПРИВЕТСТВИЯ ---
    if (!greetedUsers.has(username)) {
        greetedUsers.add(username);
        const greeting = `Привет, @${username}! Добро пожаловать на стрим! Копи КРЫШКИ (!spin), создавай семьи (!брак), заводи детей (!родить), следи за долгами (!долг) и смотри статистику (!статистика)!`;
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
    if (playerDebts[username] === undefined) {
        playerDebts[username] = 0;
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
        return;
    }

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
        return;
    }

    // --- 3. ОБЩАЯ СТАТИСТИКА СТРИМА ---
    if (lowerMessage === '!статистика' || lowerMessage === '!стримстат' || lowerMessage === '!stats') {
        const totalPlayers = Object.keys(playerBalances).length;
        const totalCoins = Object.values(playerBalances).reduce((acc, val) => acc + val, 0);
        
        const countedMarriages = new Set();
        let totalMarriagesCount = 0;

        Object.entries(marriages).forEach(([user, data]) => {
            const sortedGroup = [user, ...data.partners].sort().join('-');
            if (!countedMarriages.has(sortedGroup)) {
                countedMarriages.add(sortedGroup);
                totalMarriagesCount++;
            }
        });

        let realChildrenCount = 0;
        countedMarriages.forEach(groupStr => {
            const members = groupStr.split('-');
            const representative = members[0];
            if (marriages[representative] && marriages[representative].children) {
                realChildrenCount += marriages[representative].children.length;
            }
        });

        let totalDebtSum = 0;
        let debtorsCount = 0;
        Object.entries(playerDebts).forEach(([user, debt]) => {
            if (debt > 0) {
                totalDebtSum += debt;
                debtorsCount++;
            }
        });

        client.say(channel, `📈 СТАТИСТИКА КАНАЛА: Игроков: ${totalPlayers} | Крышек на руках: ${totalCoins} 🪙 | Банк казино: ${casinoBank} | Союзов: ${totalMarriagesCount} 💍 | Детей: ${realChildrenCount} 👶 | Должников: ${debtorsCount} (Сумма долгов: ${totalDebtSum} 🪙)`);
        return;
    }

    // --- 4. СИСТЕМА БРАКОВ, ПОЛИАМОРИИ И ДЕТЕЙ ---
    if (lowerMessage.startsWith('!брак') || lowerMessage.startsWith('!marry')) {
        const args = trimmedMessage.split(' ');
        if (args.length < 2) {
            client.say(channel, `⚠️ @{username}, укажите ник игрока. Пример: !брак [ник]`);
            return;
        }

        let targetUserRaw = args[1].replace('@', '');
        
        if (username.toLowerCase() === targetUserRaw.toLowerCase()) {
            client.say(channel, `🤔 @{username}, нельзя вступить в брак с самим собой!`);
            return;
        }

        if (marriages[username] && marriages[username].partners.length >= 2) {
            client.say(channel, `❌ @{username}, ваш полиаморный союз уже заполнен (максимум 3 участника)!`);
            return;
        }

        marriageProposals[targetUserRaw.toLowerCase()] = username;
        client.say(channel, `💍 @{username} сделал(а) предложение руки и сердца игроку @{targetUserRaw}! Для согласия напишите: !принять брак`);
        console.log(`[Брак] Предложение от ${username} для ${targetUserRaw}`);
        return;
    }

    if (lowerMessage === '!принять брак' || lowerMessage === '!acceptmarry') {
        const proposer = marriageProposals[username.toLowerCase()];
        if (!proposer) {
            client.say(channel, `ℹ️ @{username}, вам никто не делал предложений о браке.`);
            return;
        }

        if (marriages[username] && marriages[username].partners.length >= 2) {
            client.say(channel, `❌ @{username}, у вас уже максимальное количество партнеров (полиамория до 3 человек)!`);
            return;
        }

        const proposerKey = Object.keys(playerBalances).find(u => u.toLowerCase() === proposer.toLowerCase()) || proposer;
        if (marriages[proposerKey] && marriages[proposerKey].partners.length >= 2) {
            client.say(channel, `❌ @{username}, у игрока @{proposerKey} уже заполнен полиаморный союз!`);
            return;
        }

        const currentTimestamp = Date.now();
        const currentDate = new Date().toLocaleDateString('ru-RU');

        if (!marriages[proposerKey]) {
            marriages[proposerKey] = { partners: [], timestamp: currentTimestamp, date: currentDate, children: [] };
        }
        if (!marriages[proposerKey].partners.includes(username)) {
            marriages[proposerKey].partners.push(username);
        }

        if (!marriages[username]) {
            marriages[username] = { partners: [], timestamp: currentTimestamp, date: currentDate, children: [] };
        }
        if (!marriages[username].partners.includes(proposerKey)) {
            marriages[username].partners.push(proposerKey);
        }

        marriages[proposerKey].partners.forEach(partner => {
            if (partner.toLowerCase() !== username.toLowerCase()) {
                if (!marriages[username].partners.includes(partner)) marriages[username].partners.push(partner);
                if (marriages[partner] && !marriages[partner].partners.includes(username)) marriages[partner].partners.push(username);
                if (marriages[partner] && !marriages[partner].partners.includes(proposerKey)) marriages[partner].partners.push(proposerKey);
            }
        });

        delete marriageProposals[username.toLowerCase()];

        client.say(channel, `💒 Горько! Сформирован полиаморный союз между @{proposerKey} и @{username}! Дата создания семьи: ${currentDate}. Ура! 🎉`);
        console.log(`[Брак] Создан союз с участием ${username} и ${proposerKey}`);
        return;
    }

    if (lowerMessage === '!отклонить брак' || lowerMessage === '!declinemarry') {
        if (!marriageProposals[username.toLowerCase()]) {
            client.say(channel, `ℹ️ @{username}, у вас нет активных предложений.`);
            return;
        }
        delete marriageProposals[username.toLowerCase()];
        client.say(channel, `💔 @{username} отклонил(а) предложение о браке.`);
        return;
    }

    if (lowerMessage === '!родить' || lowerMessage === '!ребенок' || lowerMessage === '!child') {
        const familyData = marriages[username];
        if (!familyData || familyData.partners.length === 0) {
            client.say(channel, `❌ @{username}, вы не состоите в браке, чтобы заводить детей! Сначала найдите пару через !брак.`);
            return;
        }

        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const timeInMarriage = Date.now() - familyData.timestamp;

        if (timeInMarriage < sevenDaysMs) {
            const daysLeft = Math.ceil((sevenDaysMs - timeInMarriage) / (1000 * 60 * 60 * 24));
            client.say(channel, `⏳ @{username}, ваша семья еще слишком молода! Нужно пробыть в браке минимум 7 дней (осталось ~${daysLeft} дн.).`);
            return;
        }

        const babyNames = ['Крышечка', 'Малыш Боб', 'Пупсик', 'Бусинка', 'Громозека', 'Счастливчик', 'Казявка', 'Пиксель'];
        const randomBabyName = babyNames[Math.floor(Math.random() * babyNames.length)];

        const allFamilyMembers = [username, ...familyData.partners];
        allFamilyMembers.forEach(member => {
            if (marriages[member]) {
                if (!marriages[member].children) marriages[member].children = [];
                marriages[member].children.push(randomBabyName);
            }
        });

        client.say(channel, `👶 Поздравляем семейство (@{username} и партнеров)! В браке родился ребенок по имени **${randomBabyName}**! Ура! 🍼🎉`);
        console.log(`[Ребенок] В семье ${username} родился ребенок: ${randomBabyName}`);
        return;
    }

    if (lowerMessage === '!семья' || lowerMessage === '!пара' || lowerMessage === '!family') {
        const familyData = marriages[username];
        if (!familyData || familyData.partners.length === 0) {
            client.say(channel, `💍 @{username} пока одинок(а). Найдите пару командой: !брак [ник]`);
            return;
        }

        const partnersList = familyData.partners.map(p => `@${p}`).join(', ');
        const childrenList = familyData.children && familyData.children.length > 0 ? familyData.children.join(', ') : 'нет';
        client.say(channel, `❤️ Семья @{username}: партнеры — ${partnersList} | Дети: ${childrenList} | Дата союза: ${familyData.date} 📅`);
        return;
    }

    if (lowerMessage === '!развод' || lowerMessage === '!divorce') {
        const familyData = marriages[username];
        if (!familyData || familyData.partners.length === 0) {
            client.say(channel, `ℹ️ @{username}, вы не состоите в браке.`);
            return;
        }

        familyData.partners.forEach(partner => {
            if (marriages[partner]) {
                marriages[partner].partners = marriages[partner].partners.filter(p => p.toLowerCase() !== username.toLowerCase());
                if (marriages[partner].partners.length === 0) {
                    delete marriages[partner];
                }
            }
        });

        delete marriages[username];
        client.say(channel, `📜 @{username} оформил(а) развод и вышел(ла) из семейного союза.`);
        return;
    }

    // --- 5. СИСТЕМА ДОЛГОВ КАЗИНО ---
    if (lowerMessage === '!долг' || lowerMessage === '!debt') {
        const debt = playerDebts[username];
        if (debt === 0) {
            client.say(channel, `✨ @{username}, у вас нет долгов перед казино. Вы чисты!`);
            return;
        }

        const timeLeft = debtTimestamps[username] ? (debtTimestamps[username] + DEBT_LIMIT_MS) - Date.now() : 0;
        if (timeLeft <= 0) {
            client.say(channel, `🚨 @{username}, ваш долг составляет ${debt} КРЫШКИ! Срок возврата просрочен! Доступ в казино заблокирован до погашения долга (!вернутьдолг [сумма]).`);
        } else {
            const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
            client.say(channel, `⚠️ @{username}, ваш долг: ${debt} КРЫШКИ. Осталось времени на возврат: ~${hoursLeft} ч. Погасить: !вернутьдолг [сумма]`);
        }
        return;
    }

    if (lowerMessage.startsWith('!вдолг') || lowerMessage.startsWith('!borrow')) {
        const args = trimmedMessage.split(' ');
        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите корректную сумму кредита. Пример: !вдолг 100`);
            return;
        }

        if (playerDebts[username] === 0) {
            debtTimestamps[username] = Date.now();
        }

        playerDebts[username] += amount;
        playerBalances[username] += amount;

        client.say(channel, `🤝 @{username} взял в долг ${amount} КРЫШКИ! Общий долг: ${playerDebts[username]} КРЫШКИ. Верните в течение 3 дней, иначе казино заблокирует доступ! Баланс: ${playerBalances[username]}`);
        return;
    }

    if (lowerMessage.startsWith('!вернутьдолг') || lowerMessage.startsWith('!вернуть') || lowerMessage.startsWith('!paydebt')) {
        const args = trimmedMessage.split(' ');
        const currentDebt = playerDebts[username];

        if (currentDebt === 0) {
            client.say(channel, `ℹ️ @{username}, у вас нет активных долгов.`);
            return;
        }

        let amount = parseInt(args[1]);
        if (args[1] && (args[1].toLowerCase() === 'all' || args[1].toLowerCase() === 'всё' || args[1].toLowerCase() === 'все')) {
            amount = currentDebt;
        }

        if (isNaN(amount) || amount <= 0) {
            client.say(channel, `⚠️ @{username}, укажите сумму для возврата. Пример: !вернутьдолг 50 (или !вернуть все)`);
            return;
        }

        if (playerBalances[username] < amount) {
            client.say(channel, `❌ @{username}, у вас на балансе казино недостаточно крышек! Баланс: ${playerBalances[username]} | Долг: ${currentDebt}`);
            return;
        }

        const payAmount = Math.min(amount, currentDebt);
        playerBalances[username] -= payAmount;
        playerDebts[username] -= payAmount;

        if (playerDebts[username] === 0) {
            debtTimestamps[username] = null;
            client.say(channel, `🎉 Поздравляем, @{username}! Вы полностью погасили долг перед казино! Блокировка снята. Баланс: ${playerBalances[username]}`);
        } else {
            client.say(channel, `✅ @{username} вернул ${payAmount} КРЫШКИ в счет долга. Остаток долга: ${playerDebts[username]} КРЫШКИ.`);
        }
        return;
    }

    // --- 6. ПЕРЕДАЧА КРЫШЕК ДРУГОМУ ИГРОКУ ---
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

        client.say(channel, `🤝 @{username} успешно перевел ${amount} КРЫШКИ игроку @{targetUser}!`);
        return;
    }

    // --- 7. СИСТЕМА ТОП КАЗИНО ---
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

    // --- 8. МАГАЗИН БОНУСОВ ---
    if (lowerMessage === '!шоп' || lowerMessage === '!магазин' || lowerMessage === '!shop') {
        client.say(channel, `🛒 МАГАЗИН БОНУСОВ (За очки магазина): 1️⃣ Пакет крышек (+100 🪙) — 80 очков | 2️⃣ Счастливый билет (лотерея) — 50 очков | 3️⃣ VIP-статус в чате — 300 очков. Купить: !купить [номер]`);
        return;
    }

    if (lowerMessage === '!магазинсчет' || lowerMessage === '!шопбаланс') {
        client.say(channel, `💎 @{username}, ваш баланс очков магазина: ${shopBalances[username]} очков.`);
        return;
    }

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

        const taxPercent = 15; 

        if (itemNumber === 1) {
            const price = 80;
            const reward = 100;

            if (shopBalances[username] < price) {
                client.say(channel, `❌ @{username}, недостаточно очков магазина! Нужно: ${price}, у вас: ${shopBalances[username]}`);
                return;
            }

            const taxAmount = Math.floor(price * (taxPercent / 100));
            shopBalances[username] -= price;
            storeBank += taxAmount;
            playerBalances[username] += reward;

            client.say(channel, `🎁 @{username} купил "Пакет крышек" за ${price} очков (${taxAmount} в банк магазина)! Начислено +${reward} КРЫШКИ в казино!`);
        }
        else if (itemNumber === 2) {
            const price = 50;

            if (shopBalances[username] < price) {
                client.say(channel, `❌ @{username}, недостаточно очков магазина! Нужно: ${price}, у вас: ${shopBalances[username]}`);
                return;
            }

            const taxAmount = Math.floor(price * (taxPercent / 100));
            shopBalances[username] -= price;
            storeBank += taxAmount;
            
            const lotteryWin = Math.floor(Math.random() * 101) + 20; 
            playerBalances[username] += lotteryWin;

            client.say(channel, `🎟️ @{username} купил "Счастливый билет" за ${price} очков (${taxAmount} в банк магазина) и выиграл в казино: +${lotteryWin} КРЫШКИ!`);
        }
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

            client.say(channel, `⭐ Поздравляем, @{username}! Вы приобрели VIP-статус за ${price} очков (${taxAmount} в банк магазина)!`);
        } 
        else {
            client.say(channel, `❌ @{username}, товара с таким номером не существует. Посмотрите список командой !шоп`);
        }
        return;
    }

    // --- 9. МОДУЛЬ КАЗИНО (!spin [ставка]) ---
    if (lowerMessage.startsWith('!spin')) {
        if (!isCasinoOpen) {
            client.say(channel, `⏳ @{username}, казино сейчас закрыто. Открытие по расписанию в 14:00!`);
            return;
        }

        const currentDebt = playerDebts[username];
        if (currentDebt > 0 && debtTimestamps[username]) {
            const timePassed = Date.now() - debtTimestamps[username];
            if (timePassed > DEBT_LIMIT_MS) {
                client.say(channel, `🚨 @{username}, ваш долг в размере ${currentDebt} КРЫШКИ просрочен (> 3 дней)! Казино заблокировало для вас игры. Погасите долг командой: !вернутьдолг [сумма]`);
                return;
            }
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
            client.say(channel, `❌ @{username}, у вас недостаточно КРЫШЕК для такой ставки! (Нужно: ${bet}, есть: ${playerBalances[username]}). Подсказка: можно взять в долг через !вдолг [сумма]`);
            return;
        }

        playerBalances[username] -= bet;

        const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
        const r1 = symbols[Math.floor(Math.random() * symbols.length)];
        const r2 = symbols[Math.floor(Math.random() * symbols.length)];
        const r3 = symbols[Math.floor(Math.random() * symbols.length)];

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

            const shopReward = Math.floor(bet / 2) + 5;
            shopBalances[username] += shopReward;

            client.say(channel, `🎰 ДЖЕКПOT!${bonusText} @{username} собрал (${r1} ${r2} ${r3})! Выигрыш: ${rawWin} КРЫШЕК (${taxAmount} в банк казино). На руки: +${playerWin} КРЫШКИ! (+${shopReward} очков магазина). Баланс: ${playerBalances[username]}`);
        } 
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
        else {
            const shopReward = 1; 
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

    if (lowerMessage === '!balance' || lowerMessage === '!крышки') {
        client.say(channel, `💰 @{username}, баланс крышек: ${playerBalances[username]} | Долг: ${playerDebts[username]} | Очки магазина: ${shopBalances[username]}`);
    }

    if (lowerMessage === '!банк' || lowerMessage === '!банкказино') {
        client.say(channel, `🏦 Банк казино: ${casinoBank} КРЫШКИ | Банк магазина: ${storeBank} очков.`);
    }
});

// --- 10. ПРОВЕРКА РАСПИСАНИЯ ПО ВРЕМЕНИ СЕРВЕРА ---
setInterval(() => {
    if (manualOverride) return;

    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    if (hours === 5 && minutes === 0 && isCasinoOpen) {
        isCasinoOpen = false;
        client.channels.forEach(channel => {
            client.say(channel, `🔴 Наступило 05:00. Казино автоматически ЗАКРЫТО до 14:00!`);
        });
        console.log(`[Авто-расписание] Казино закрыто по времени (05:00).`);
    }

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

// --- 11. HTTP-СЕРВЕР ДЛЯ RENDER.COM ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RGROMBOT Twitch Stream Service with Bot Filter is Running!\n');
}).listen(PORT, () => {
    console.log(`HTTP сервер успешно запущен на порту ${PORT}`);
});
