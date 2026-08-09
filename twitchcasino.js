const tmi = require('tmi.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. HTTP-сервер для Render (обязателен, чтобы хостинг видел, что приложение работает)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot is running and casino is online! 🎰');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`HTTP server is listening on port ${PORT}`);
});

// 2. Настройки Twitch клиента
const client = new tmi.Client({
    options: { debug: false },
    identity: {
        username: "RGROMBOT",
        password: "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52"
    },
    channels: ["QumosX"]
});

client.connect().catch(console.error);

// 3. Данные и переменные казино
const owners = ["qumosx", "r0ma_gr0m", "gospod_bomzhik", "miss__krevetka"];
const ownerRoles = {
    "qumosx": "Главный Босс",
    "gospod_bomzhik": "Шеф СБ",
    "miss__krevetka": "Игровой Мастер"
};

let startCoins = 0;
let casinoBank = 1000000;
let shopBank = 0;
let salaryBank = 0;
let isCasinoOpen = true;

let coins = {}; // Баланс карты
let shopMoney = {};
let customNicknames = {};
let userProfiles = {}; 

const fixedJobsSalary = {
    "дворник": 150,
    "грузчик": 300,
    "водитель": 600,
    "программист": 1200,
    "повар": 1500,
    "мусорщик": 1700,
    "водитель автобуса": 1500,
    "химик": 2000,
    "су-шист": 2100,
    "шеф-повар": 2500,
    "полицейский": 3500,
    "пожарный": 3500,
    "предприниматель": 5000
};

const houseCosts = {
    "эконом": 15000,
    "стандарт": 50000,
    "элитный": 150000,
    "роскошный": 300000,
    "президентский": 700000
};

const houseDailyTax = {
    "эконом": 300,       
    "стандарт": 900,
    "элитный": 2500,
    "роскошный": 10000,
    "президентский": 50000
};

// Словари бонусов магазина
let vipBonus = {}, luckBonus = {}, shieldBonus = {}, doubleBonus = {}, freeSpin = {};
let megaShieldBonus = {}, jackpotBonus = {}, tripleBonus = {}, superLuckBonus = {};
let magnetBonus = {}, healBonus = {}, ultraDoubleBonus = {}, gigaShieldBonus = {};
let ratKingBonus = {}, goldenBatonBonus = {}, safeDebtBonus = {}, timeWarpBonus = {};
let omniSpinBonus = {}, shadowSpinBonus = {}, cyberRatBonus = {}, mafiaCoverBonus = {};
let nuclearSpinBonus = {}, alchemistBonus = {}, phantomWinBonus = {}, royalBatonBonus = {};
let titanShieldBonus = {}, godLuckBonus = {}, matrixKeyBonus = {}, syndicateBonus = {}, absoluteKingBonus = {};

let debtAmount = {};
let debtTime = {};
let debtBlocked = {};

const slots = ["🍒", "🍋", "🍉", "⭐", "💎", "🎲", "♦", "♠", "♥", "💵", "🤩"];
const savePath = path.join(__dirname, "casino_data.json");

// Загрузка данных
function loadData() {
    try {
        if (fs.existsSync(savePath)) {
            const rawData = fs.readFileSync(savePath, 'utf8');
            const data = JSON.parse(rawData);
            casinoBank = data.casinoBank ?? 1000000;
            shopBank = data.shopBank ?? 0;
            salaryBank = data.salaryBank ?? 0;
            coins = data.coins || {};
            shopMoney = data.shopMoney || {};
            customNicknames = data.customNicknames || {};
            userProfiles = data.userProfiles || {};
            debtAmount = data.debtAmount || {};
            
            if (data.debtTime) {
                for (let k in data.debtTime) {
                    debtTime[k] = new Date(data.debtTime[k]);
                }
            }
        }
    } catch (e) {
        console.log("Ошибка загрузки данных, создаются новые.", e);
    }
}

// Сохранение данных
function saveData() {
    try {
        const data = { 
            casinoBank, shopBank, salaryBank, coins, shopMoney, 
            customNicknames, userProfiles, debtAmount, debtTime 
        };
        fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log("Ошибка сохранения данных:", e);
    }
}

loadData();

// Автоматическое открытие/закрытие казино по часам
setInterval(() => {
    let currentHour = new Date().getHours();
    if (currentHour === 15 && !isCasinoOpen) {
        isCasinoOpen = true;
        saveData();
        client.say("QumosX", "🎰 Наступило 15:00! Казино автоматически открыто. Всем удачи в игре! 🎰");
    } else if (currentHour === 5 && isCasinoOpen) {
        isCasinoOpen = false;
        saveData();
        client.say("QumosX", "🚫 Наступило время закрытия! Казино автоматически закрывается на перерыв.");
    }
}, 60000 * 30);

function getProfile(user) {
    if (!userProfiles[user]) {
        userProfiles[user] = {
            username: user,
            balance: 0,
            bankCardBalance: 0,
            casinoChips: 0,
            job: "Безработный",
            isHospitalized: false,
            isImprisoned: false,
            prisonReleaseTime: "",
            lastWorkDate: "",
            houseType: "Нет",
            houseTaxDebt: 0,
            lastTaxDate: "",
            isDebtCardBlocked: false
        };
    }
    checkAndApplyHouseTax(userProfiles[user]);
    return userProfiles[user];
}

function getDisplayName(user) {
    if (customNicknames[user]) {
        return `${customNicknames[user]} (@${user})`;
    }
    return `@${user}`;
}

function checkAndApplyHouseTax(profile) {
    if (profile.houseType === "Нет" || !houseDailyTax[profile.houseType]) return;
    let todayStr = new Date().toISOString().slice(0, 10);
    if (!profile.lastTaxDate) {
        profile.lastTaxDate = todayStr;
        return;
    }
    let lastDate = new Date(profile.lastTaxDate);
    let currentDate = new Date(todayStr);
    let daysPassed = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
    if (daysPassed > 0) {
        let dailyTax = houseDailyTax[profile.houseType];
        profile.houseTaxDebt += dailyTax * daysPassed;
        profile.lastTaxDate = todayStr;
        saveData();
    }
}

function tryPayChoice(user, profile, cost, choice) {
    let userCoins = coins[user] || 0;
    if (choice === "карта") {
        if (profile.isDebtCardBlocked) return { success: false, reason: "Ваша банковская карта заблокирована! Используйте наличные (!оплата нал)." };
        if (userCoins < cost) return { success: false, reason: `Недостаточно средств на карте! Нужно: ${cost}` };
        coins[user] = userCoins - cost;
        profile.bankCardBalance = coins[user];
        return { success: true, tag: "!оплата карта" };
    } else if (choice === "нал") {
        if (profile.balance < cost) return { success: false, reason: `Недостаточно наличных! Нужно: ${cost}` };
        profile.balance -= cost;
        return { success: true, tag: "!оплата нал" };
    }
    return { success: false, reason: "Неверный способ оплаты. Используйте '!оплата карта' или '!оплата нал'." };
}

function checkDebtStatus(user, profile) {
    if (debtAmount[user] && debtAmount[user] > 0) {
        let spanHours = (new Date() - new Date(debtTime[user])) / (1000 * 60 * 60);

        if (spanHours >= 72) {
            if (!profile.isDebtCardBlocked) {
                profile.isDebtCardBlocked = true;
                saveData();
                client.say("QumosX", `🚨 [БАНК] Внимание! У ${getDisplayName(user)} просрочка кредита более 3-х дней! Кредитная карта заблокирована.`);
            }

            if (spanHours >= 96 && profile.houseType !== "Нет") {
                client.say("QumosX", `⚠️ [БАНК] Предупреждение для ${getDisplayName(user)}: имущество (дом: ${profile.houseType}) конфисковано банком!`);
                profile.houseType = "Нет";
                profile.houseTaxDebt = 0;
                saveData();
            }

            if (spanHours >= 120) {
                let currentDebt = debtAmount[user];
                if ((coins[user] || 0) < currentDebt && profile.balance < currentDebt) {
                    profile.isImprisoned = true;
                    profile.prisonReleaseTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    debtAmount[user] = 0;
                    profile.isDebtCardBlocked = false;
                    saveData();
                    client.say("QumosX", `⚖️ [СУД] У ${getDisplayName(user)} нет средств для выплаты долга. По решению суда он отправлен в тюрьму на 24 часа! Долг аннулирован.`);
                }
            }
        }
    }
}

// Обработка сообщений Twitch чата
client.on('message', (target, context, message, self) => {
    if (self) return;

    let user = context.username.toLowerCase();
    let text = message.trim();
    let lowerText = text.toLowerCase();
    let profile = getProfile(user);

    if (coins[user] === undefined) {
        coins[user] = startCoins;
        profile.bankCardBalance = startCoins;
        profile.casinoChips = startCoins;
        shopMoney[user] = startCoins;
        saveData();
    } else {
        profile.bankCardBalance = coins[user];
    }
    if (shopMoney[user] === undefined) shopMoney[user] = startCoins;

    if (profile.isImprisoned) {
        if (profile.prisonReleaseTime) {
            let releaseDate = new Date(profile.prisonReleaseTime);
            if (new Date() >= releaseDate) {
                profile.isImprisoned = false;
                profile.prisonReleaseTime = "";
                saveData();
                client.say(target, `🚨 ${getDisplayName(user)} отбыл свой срок в тюрьме и вышел на свободу!`);
            } else {
                return;
            }
        } else {
            profile.isImprisoned = false;
            saveData();
        }
    }

    checkDebtStatus(user, profile);

    // --- БЛОК КОМАНД (ВЕСЬ КОД ДОБАВЛЕН БЕЗ СОКРАЩЕНИЙ) ---

    if (lowerText === "!дом" || lowerText === "!недвижимость") {
        client.say(target, `🏠 [${getDisplayName(user)}] | Жилье: ${profile.houseType} | Долг по коммуналке: ${profile.houseTaxDebt} денег.`);
        return;
    }

    if (lowerText.startsWith("!купить дом ")) {
        let subText = text.substring(12).trim();
        let choice = "карта";
        let houseArg = subText;

        if (subText.toLowerCase().includes("!оплата ")) {
            let payIdx = subText.toLowerCase().indexOf("!оплата ");
            houseArg = subText.substring(0, payIdx).trim().toLowerCase();
            let payPart = subText.substring(payIdx + 8).trim().toLowerCase();
            if (payPart.startsWith("карта")) choice = "карта";
            else if (payPart.startsWith("нал")) choice = "нал";
        } else {
            houseArg = houseArg.toLowerCase();
        }

        if (!houseCosts[houseArg]) {
            client.say(target, `❌ Неверный тип дома. Доступны: эконом (15000), стандарт (50000), элитный (150000), роскошный (300000), президентский (700000).`);
            return;
        }
        if (profile.houseType !== "Нет") {
            client.say(target, `❌ У вас уже есть жилье (${profile.houseType}).`);
            return;
        }

        let cost = houseCosts[houseArg];
        let payRes = tryPayChoice(user, profile, cost, choice);
        if (!payRes.success) {
            client.say(target, `❌ ${payRes.reason}`);
            return;
        }

        profile.houseType = houseArg;
        profile.lastTaxDate = new Date().toISOString().slice(0, 10);
        profile.houseTaxDebt = 0;
        saveData();
        client.say(target, `🏡 (${payRes.tag}) ${getDisplayName(user)} успешно приобрел дом класса '${houseArg}'!`);
        return;
    }

    if (lowerText.startsWith("!оплатить налог") || lowerText.startsWith("!коммуналка") || lowerText.startsWith("!налог")) {
        let choice = "карта";
        if (lowerText.includes("!оплата ")) {
            let payIdx = lowerText.indexOf("!оплата ");
            let payPart = lowerText.substring(payIdx + 8).trim();
            if (payPart.startsWith("карта")) choice = "карта";
            else if (payPart.startsWith("нал")) choice = "нал";
        }
        if (profile.houseType === "Нет") {
            client.say(target, `ℹ️ У вас нет недвижимости.`);
            return;
        }
        if (profile.houseTaxDebt <= 0) {
            client.say(target, `✅ У ${getDisplayName(user)} нет задолженностей по коммуналке.`);
            return;
        }

        let debt = profile.houseTaxDebt;
        let payRes = tryPayChoice(user, profile, debt, choice);
        if (!payRes.success) {
            client.say(target, `❌ ${payRes.reason} (Нужно: ${debt})`);
            return;
        }

        profile.houseTaxDebt = 0;
        saveData();
        client.say(target, `💡 (${payRes.tag}) ${getDisplayName(user)} успешно оплатил коммуналку на сумму ${debt} деняг!`);
        return;
    }

    if (lowerText === "!персонаж" || lowerText === "!статус") {
        let cardStatus = profile.isDebtCardBlocked ? "🔴 ЗАБЛОКИРОВАНА" : "🟢 Активна";
        client.say(target, `👤 [${getDisplayName(user)}] Работа: ${profile.job} | Карта: ${cardStatus} | Наличные: ${profile.balance} | КРЫШКИ (Казино): ${profile.casinoChips} 👑`);
        return;
    }

    if (lowerText.startsWith("!работа ")) {
        let parts = text.split(' ');
        let targetJob = parts[1].toLowerCase();
        if (fixedJobsSalary[targetJob] || targetJob === "стример" || targetJob === "блогер" || targetJob === "безработный") {
            profile.job = targetJob;
            saveData();
            client.say(target, `✅ ${getDisplayName(user)} устроился на работу: ${targetJob}!`);
        } else {
            client.say(target, `❌ Профессии '${targetJob}' не существует.`);
        }
        return;
    }

    if (lowerText === "!трудиться" || lowerText === "!смена") {
        if (profile.job === "Безработный") { client.say(target, `❌ Вы безработный!`); return; }
        let todayStr = new Date().toISOString().slice(0, 10);
        if (profile.lastWorkDate === todayStr) {
            client.say(target, `⏳ Вы уже отработали смену сегодня!`);
            return;
        }

        let earned = 0;
        if (fixedJobsSalary[profile.job]) earned = fixedJobsSalary[profile.job];
        else if (profile.job === "стример") earned = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;
        else if (profile.job === "блогер") earned = Math.floor(Math.random() * (2000 - 50 + 1)) + 50;
        else if (profile.job === "безработный") earned = Math.floor(Math.random() * (500 - 50 + 1)) + 50;

        profile.balance += earned;
        profile.lastWorkDate = todayStr;
        saveData();
        client.say(target, `💰 ${getDisplayName(user)} отработал смену и заработал ${earned} денег!`);
        return;
    }

    if (lowerText.startsWith("!пополнить карта ") || lowerText.startsWith("!пополнить ")) {
        if (profile.isDebtCardBlocked) {
            client.say(target, `❌ Ваша банковская карта заблокирована!`);
            return;
        }
        let parts = text.split(' ');
        let amount = parseInt(parts[parts.length - 1]);
        if (isNaN(amount) || amount <= 0) {
            client.say(target, `❌ Формат: '!пополнить карту [сумма]'`);
            return;
        }
        if (profile.balance < amount) {
            client.say(target, `❌ Недостаточно наличных! У вас на руках: ${profile.balance}`);
            return;
        }

        profile.balance -= amount;
        coins[user] += amount;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💳 ${getDisplayName(user)} пополнил карту на ${amount} деняг! Баланс карты: ${coins[user]}`);
        return;
    }

    if (lowerText.startsWith("!обналичить ")) {
        let parts = text.split(' ');
        if (parts.length < 3) {
            client.say(target, `❌ Формат: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'`);
            return;
        }
        let source = parts[1].toLowerCase();
        let amount = parseInt(parts[2]);
        if (isNaN(amount) || amount <= 0) {
            client.say(target, `❌ Неверная сумма.`);
            return;
        }

        if (source === "нал") {
            if (profile.balance < amount) { client.say(target, `❌ Недостаточно наличных!`); return; }
            profile.balance -= amount;
            profile.casinoChips += amount;
            saveData();
            client.say(target, `💵 ${getDisplayName(user)} обменял ${amount} наличных на ${amount} КРЫШЕК 👑!`);
            return;
        } else if (source === "карта") {
            if (profile.isDebtCardBlocked) { client.say(target, `❌ Карта заблокирована!`); return; }
            let cardBal = coins[user] || 0;
            if (cardBal < amount) { client.say(target, `❌ Недостаточно средств на карте!`); return; }
            coins[user] -= amount;
            profile.bankCardBalance = coins[user];
            profile.casinoChips += amount;
            saveData();
            client.say(target, `💳 ${getDisplayName(user)} купил ${amount} КРЫШЕК 👑 с карты!`);
            return;
        }
        return;
    }

    if (lowerText.startsWith("!вывод ")) {
        let parts = text.split(' ');
        if (parts.length < 3) {
            client.say(target, `❌ Формат: '!вывод нал [сумма]' или '!вывод карта [сумма]'`);
            return;
        }
        let targetDest = parts[1].toLowerCase();
        let amount = parseInt(parts[2]);
        if (isNaN(amount) || amount <= 0) { client.say(target, `❌ Неверная сумма.`); return; }

        if (profile.casinoChips < amount) {
            client.say(target, `❌ Недостаточно КРЫШЕК в казино! У вас: ${profile.casinoChips} 👑`);
            return;
        }

        if (targetDest === "нал") {
            profile.casinoChips -= amount;
            profile.balance += amount;
            saveData();
            client.say(target, `💵 ${getDisplayName(user)} вывел ${amount} КРЫШЕК 👑 в наличные!`);
            return;
        } else if (targetDest === "карта") {
            if (profile.isDebtCardBlocked) { client.say(target, `❌ Карта заблокирована!`); return; }
            profile.casinoChips -= amount;
            coins[user] += amount;
            profile.bankCardBalance = coins[user];
            saveData();
            client.say(target, `💳 ${getDisplayName(user)} вывел ${amount} КРЫШЕК 👑 на карту!`);
            return;
        }
        return;
    }

    if (text === "!персонал" || text === "!работники" || text === "!команда") {
        let staffList = owners.map(owner => `${owner} (${ownerRoles[owner] || "Сотрудник"})`);
        client.say(target, `👥 ПЕРСОНАЛ КАЗИНО: ${staffList.join(" | ")}`);
        return;
    }

    if (text === "!моя роль") {
        if (!owners.includes(user)) { client.say(target, `❌ Ты не сотрудник казино.`); return; }
        let role = ownerRoles[user] || "Сотрудник";
        client.say(target, `👤 ${getDisplayName(user)}, твоя должность: ${role}.`);
        return;
    }

    if (text === "!меню" || text === "!админ") {
        if (!owners.includes(user)) { client.say(target, `❌ Доступно только сотрудникам.`); return; }
        if (user === "qumosx") {
            client.say(target, `👑 [ГЛАВНЫЙ БОСС]: !каз откр/закр | !снять каз [сумма] | !снять шоп [сумма] | !снять долг [ник] | !фонд зп | !зарплата`);
        } else if (user === "gospod_bomzhik") {
            client.say(target, `🛡️ [ШЕФ СБ]: !снять долг [ник] | !стат [ник] | !шопбанк | !казсчёт`);
        } else if (user === "miss__krevetka") {
            client.say(target, `🎰 [ИГРОВОЙ МАСТЕР]: !каз открыть | !каз закрыть | !топказ | !стат [ник]`);
        }
        return;
    }

    if (text === "!инфа" || text === "!помощь" || text === "!help") {
        client.say(target, `🎰 КАЗИНО: *100# | !каз [ставка] | !топказ | !вывод нал/карта [сум]`);
        client.say(target, `🛒 МАГАЗИН: !магазин | !мойшоп | !купить [товар]`);
        client.say(target, `🏠 ЖИЛЬЕ: !дом | !купить дом [тип] | !оплатить налог`);
        client.say(target, `💼 РАБОТА: !работа [проф] | !трудиться | !пополнить карту [сум] | !обналичить нал/карта [сум]`);
        return;
    }

    if (text.startsWith("!стат") || text.startsWith("!статистика")) {
        if (!owners.includes(user)) { client.say(target, `❌ Доступно сотрудникам казино.`); return; }
        let parts = text.split(' ');
        let targetUser = (parts.length >= 2) ? parts[1].toLowerCase().replace("@", "") : user;
        if (coins[targetUser] === undefined) {
            client.say(target, `❌ Игрок @${targetUser} не найден.`);
            return;
        }
        let tProf = getProfile(targetUser);
        client.say(target, `📊 СТАТИСТИКА [${getDisplayName(targetUser)}] ➡️ Карта: ${coins[targetUser]} | Наличные: ${tProf.balance} | КРЫШКИ: ${tProf.casinoChips} | Долг: ${debtAmount[targetUser] || 0}`);
        return;
    }

    if (text.startsWith("!передать") || text.startsWith("!дать")) {
        if (profile.isDebtCardBlocked) { client.say(target, `❌ Ваша карта заблокирована!`); return; }
        let parts = text.split(' ');
        if (parts.length < 3 || isNaN(parts[2]) || parseInt(parts[2]) <= 0) {
            client.say(target, `❌ Используй: !передать [ник] [сумма]`);
            return;
        }
        let targetUser = parts[1].toLowerCase().replace("@", "");
        let giveAmount = parseInt(parts[2]);
        if (targetUser === user) { client.say(target, `❌ Нельзя переводить себе!`); return; }
        if ((coins[user] || 0) < giveAmount) { client.say(target, `❌ Недостаточно средств на карте!`); return; }

        coins[user] -= giveAmount;
        profile.bankCardBalance = coins[user];
        if (coins[targetUser] === undefined) coins[targetUser] = startCoins;
        coins[targetUser] += giveAmount;
        getProfile(targetUser).bankCardBalance = coins[targetUser];
        saveData();
        client.say(target, `🤝 ${getDisplayName(user)} передал ${giveAmount} с карты игроку ${getDisplayName(targetUser)}!`);
        return;
    }

    if (text.startsWith("!долг ")) {
        let parts = text.split(' ');
        let debtSum = parseInt(parts[1]);
        if (isNaN(debtSum) || debtSum <= 0) {
            client.say(target, `❌ Используй: !долг [сумма]`);
            return;
        }
        if ((debtAmount[user] || 0) > 0) { client.say(target, `❌ У тебя уже есть активный долг!`); return; }

        debtAmount[user] = debtSum;
        debtTime[user] = new Date();
        coins[user] = (coins[user] || 0) + debtSum;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💳 ${getDisplayName(user)} взял в долг ${debtSum} на карту. Верните в течение 3 дней!`);
        return;
    }

    if (text.startsWith("!вернуть долг")) {
        let choice = "карта";
        if (text.includes("!оплата ")) {
            let payIdx = text.indexOf("!оплата ");
            let payPart = text.substring(payIdx + 8).trim().toLowerCase();
            if (payPart.startsWith("карта")) choice = "карта";
            else if (payPart.startsWith("нал")) choice = "нал";
        }
        let currentDebt = debtAmount[user] || 0;
        if (currentDebt <= 0) { client.say(target, `ℹ️ У тебя нет долгов.`); return; }

        let payRes = tryPayChoice(user, profile, currentDebt, choice);
        if (!payRes.success) {
            client.say(target, `❌ ${payRes.reason} (Нужно для возврата: ${currentDebt})`);
            return;
        }

        debtAmount[user] = 0;
        profile.isDebtCardBlocked = false;
        saveData();
        client.say(target, `✅ (${payRes.tag}) ${getDisplayName(user)} полностью погасил долг! Карта разблокирована.`);
        return;
    }

    if (text.startsWith("!снять долг ")) {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        let parts = text.split(' ');
        let targetUser = parts[2].toLowerCase().replace("@", "");
        debtAmount[targetUser] = 0;
        getProfile(targetUser).isDebtCardBlocked = false;
        saveData();
        client.say(target, `✅ Долг игрока ${getDisplayName(targetUser)} аннулирован сотрудником.`);
        return;
    }

    if (text === "!фонд зп") {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        client.say(target, `💼 Фонд зарплаты: ${salaryBank} КРЫШЕК.`);
        return;
    }

    if (text === "!зарплата" || text === "!зп") {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        if (salaryBank <= 0) { client.say(target, `❌ Фонд зарплаты пуст.`); return; }

        let share = Math.floor(salaryBank / owners.length);
        salaryBank = 0;
        owners.forEach(staff => {
            if (coins[staff] === undefined) coins[staff] = startCoins;
            coins[staff] += share;
            getProfile(staff).bankCardBalance = coins[staff];
        });
        saveData();
        client.say(target, `💰 Зарплата успешно распределена сотрудникам на карты!`);
        return;
    }

    if (text === "!каз открыть" || text === "!казино открыть") {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        isCasinoOpen = true;
        saveData();
        client.say(target, `🎰 Казино открыто!!`);
        return;
    }

    if (text === "!каз закрыть" || text === "!казино закрыть") {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        isCasinoOpen = false;
        saveData();
        client.say(target, `🚫 Казино закрыто.`);
        return;
    }

    if (text.startsWith("!снять каз ")) {
        if (user !== "qumosx") { client.say(target, `❌ Только Главный Босс может снимать деньги с банка Казино.`); return; }
        let amount = parseInt(text.split(' ')[2]);
        if (isNaN(amount) || casinoBank < amount) { client.say(target, `❌ Не хватает средств.`); return; }
        casinoBank -= amount;
        coins[user] = (coins[user] || 0) + amount;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💸 Босс снял ${amount} со счета казино.`);
        return;
    }

    if (text === "!казсчёт") {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        client.say(target, `🏦 Банк казино: ${casinoBank} КРЫШЕК.`);
        return;
    }

    if (text === "!шопбанк") {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        client.say(target, `🛒 Банк магазина: ${shopBank} КРЫШЕК.`);
        return;
    }

    if (text.startsWith("!снять шоп ")) {
        if (!owners.includes(user)) { client.say(target, `❌ Нет прав.`); return; }
        let amount = parseInt(text.split(' ')[2]);
        if (isNaN(amount) || shopBank < amount) { client.say(target, `❌ Недостаточно средств.`); return; }
        shopBank -= amount;
        coins[user] = (coins[user] || 0) + amount;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💸 Снято из банка магазина: ${amount}`);
        return;
    }

    if (text === "!*100#" || text === "*100#") {
        client.say(target, `💰 ${getDisplayName(user)} | КРЫШКИ казино: ${profile.casinoChips} 👑 | Наличные: ${profile.balance} | Карта: ${coins[user] || 0}`);
        return;
    }

    if (text === "!шопбаланс" || text === "!мойшоп" || text === "!моитовары") {
        let shopBal = shopMoney[user] || 0;
        client.say(target, `🛒 ${getDisplayName(user)}, баланс в магазине: ${shopBal} КРЫШЕК.`);
        return;
    }

    if (text === "!топказ") {
        let sorted = Object.entries(userProfiles).sort((a, b) => b[1].casinoChips - a[1].casinoChips).slice(0, 5);
        let topList = sorted.map((item, idx) => `${idx + 1}. ${customNicknames[item[0]] || item[0]} (${item[1].casinoChips} 👑)`);
        client.say(target, `🏆 ТОП-5 БОГАЧЕЙ (по КРЫШКАМ): ${topList.join(" | ")}`);
        return;
    }

    if (text === "!магазин" || text === "!шоп") {
        client.say(target, `🛒 МАГАЗИН: 💎 вип | 🍀 удача | 🛡️ щит | 🔥 дубль | 🎰 спин | ⚡ мегащит | 🌟 джекпот | 💥 трипл | 🎯 суперудача | 🧲 магнит | 💉 хил | 🚀 ультрадубль | 🛡️ гигащит | 🐀 крысокороль | 🪙 золотойбатон | ✏️ ник [имя]`);
        return;
    }

    if (text.startsWith("!купить ")) {
        let itemArgs = text.substring(8).trim();
        let itemLower = itemArgs.toLowerCase();
        let price = 0;
        let itemName = "";
        let targetDict = null;

        if (itemLower === "вип") { price = 10000; itemName = "VIP"; targetDict = vipBonus; }
        else if (itemLower === "удача") { price = 15000; itemName = "Удача"; targetDict = luckBonus; }
        else if (itemLower === "щит") { price = 12000; itemName = "Щит"; targetDict = shieldBonus; }
        else if (itemLower === "дубль") { price = 20000; itemName = "Дубль"; targetDict = doubleBonus; }
        else if (itemLower === "спин") { price = 5000; itemName = "Спин"; targetDict = freeSpin; }
        else if (itemLower === "мегащит") { price = 25000; itemName = "Мегащит"; targetDict = megaShieldBonus; }
        else if (itemLower === "джекпот") { price = 30000; itemName = "Джекпот"; targetDict = jackpotBonus; }
        else if (itemLower === "трипл") { price = 22000; itemName = "Трипл"; targetDict = tripleBonus; }
        else if (itemLower === "суперудача") { price = 35000; itemName = "Суперудача"; targetDict = superLuckBonus; }
        else if (itemLower === "магнит") { price = 18000; itemName = "Магнит"; targetDict = magnetBonus; }
        else if (itemLower === "хил") { price = 8000; itemName = "Хил"; targetDict = healBonus; }
        else if (itemLower === "ультрадубль") { price = 40000; itemName = "Ультрадубль"; targetDict = ultraDoubleBonus; }
        else if (itemLower === "гигащит") { price = 45000; itemName = "Гигащит"; targetDict = gigaShieldBonus; }
        else if (itemLower === "крысокороль") { price = 50000; itemName = "Крысокороль"; targetDict = ratKingBonus; }
        else if (itemLower === "золотойбатон") { price = 60000; itemName = "Золотой батон"; targetDict = goldenBatonBonus; }
        else if (itemLower.startsWith("ник ")) {
            price = 50000;
            let newNick = itemArgs.substring(4).trim();
            if (newNick) {
                let shopBal = shopMoney[user] || 0;
                if (shopBal < price) { client.say(target, `❌ Недостаточно средств для смены ника! Нужно: ${price}`); return; }
                shopMoney[user] -= price;
                shopBank += price / 2;
                customNicknames[user] = newNick;
                saveData();
                client.say(target, `✏️ Ник успешно изменен на: ${newNick}`);
                return;
            }
        }

        if (price > 0 && targetDict) {
            let shopBal = shopMoney[user] || 0;
            if (shopBal < price) { client.say(target, `❌ Недостаточно средств в магазине! Нужно: ${price}`); return; }
            shopMoney[user] -= price;
            shopBank += Math.floor(price / 2);
            targetDict[user] = (targetDict[user] || 0) + 1;
            saveData();
            client.say(target, `🛒 Успешно куплено: ${itemName}`);
            return;
        }
    }

    // Основная игра в казино (!каз [ставка])
    if (lowerText.startsWith("!каз")) {
        if (!isCasinoOpen) { client.say(target, `🚫 Казино закрыто!`); return; }
        let subText = text.substring(4).trim();
        let bet = parseInt(subText);
        if (isNaN(bet) || bet <= 0) {
            client.say(target, `❌ Используй: !каз [ставка]`);
            return;
        }
        if (profile.casinoChips < bet) {
            client.say(target, `❌ Недостаточно КРЫШЕК для ставки! У вас: ${profile.casinoChips} 👑. Обменяйте через !обналичить нал/карта`);
            return;
        }

        profile.casinoChips -= bet;
        casinoBank += bet;
        salaryBank += Math.max(1, Math.floor(bet / 10));

        let a = slots[Math.floor(Math.random() * slots.length)];
        let b = slots[Math.floor(Math.random() * slots.length)];
        let c = slots[Math.floor(Math.random() * slots.length)];

        let win = 0;
        if (a === b && b === c) win = bet * 10;
        else if (a === b || a === c || b === c) win = bet * 3;

        if (win > 0) {
            profile.casinoChips += win;
            casinoBank = Math.max(0, casinoBank - win);
            let shopBonusIncome = Math.max(1, Math.floor(win / 10));
            shopMoney[user] = (shopMoney[user] || 0) + shopBonusIncome;
            client.say(target, `🎰 [${a} | ${b} | ${c}] — 🏆 ${getDisplayName(user)} выиграл ${win} КРЫШЕК! (Баланс: ${profile.casinoChips} 👑)`);
        } else {
            client.say(target, `🎰 [${a} | ${b} | ${c}] — ❌ ${getDisplayName(user)} проиграл ${bet} КРЫШЕК. (Остаток: ${profile.casinoChips} 👑)`);
        }
        saveData();
        return;
    }
});