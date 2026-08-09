const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');

// Настройки Twitch
const client = new tmi.Client({
    options: { debug: false },
    identity: {
        username: "RGROMBOT",
        password: "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52"
    },
    channels: ["QumosX"]
});

client.connect().catch(console.error);

client.on('connected', (address, port) => {
    console.log(`* Подключено к Twitch чату: ${address}:${port}`);
});

// Настройки Казино и Ролей
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

// Базы данных и словари
let coins = {};           // Баланс карты
let shopMoney = {};       // Баланс магазина
let customNicknames = {}; // Кастомные никнеймы
let userProfiles = {};    // Профили игроков

const fixedJobsSalary = {
    "дворник": 150,
    "грузчик": 300,
    "водитель": 600,
    "программист": 1200,
    "водитель автобуса": 1500,
    "химик": 2000,
    "сушист": 2100,
    "шеф-повар": 2500,
    "полицейским": 3500,
    "пожарный": 3500,
    "предпрениматель": 5000
};

const houseCosts = {
    "эконом": 15000,
    "стандарт": 50000,
    "элитный": 150000,
    "пент-хаус": 300000
};

const houseDailyTax = {
    "эконом": 300,
    "стандарт": 900,
    "элитный": 2500,
    "роскошный": 10000
};

let debtAmount = {};
let debtTime = {};
let debtBlocked = {};

// Все бонусы из вашего оригинального кода
let vipBonus = {};          
let luckBonus = {};          
let shieldBonus = {};        
let doubleBonus = {};        
let freeSpin = {};          
let megaShieldBonus = {};    
let jackpotBonus = {};      
let tripleBonus = {};        
let superLuckBonus = {};    
let magnetBonus = {};        
let healBonus = {};          
let ultraDoubleBonus = {};    
let gigaShieldBonus = {};    
let ratKingBonus = {};        
let goldenBatonBonus = {};    
let safeDebtBonus = {};      
let timeWarpBonus = {};      
let omniSpinBonus = {};      
let shadowSpinBonus = {};    
let cyberRatBonus = {};      
let mafiaCoverBonus = {};    
let nuclearSpinBonus = {};    
let alchemistBonus = {};      
let phantomWinBonus = {};    
let royalBatonBonus = {};    
let titanShieldBonus = {};    
let godLuckBonus = {};        
let matrixKeyBonus = {};      
let syndicateBonus = {};      
let absoluteKingBonus = {};  

const slots = ["🍒", "🍋", "🍉", "⭐", "💎", "🎲", "♦", "♠", "♥", "💵", "🤩"];
const savePath = path.join(__dirname, 'casino_data.json');

// Загрузка и сохранение данных
function loadData() {
    try {
        if (fs.existsSync(savePath)) {
            const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
            casinoBank = data.casinoBank ?? 1000000;
            shopBank = data.shopBank ?? 0;
            salaryBank = data.salaryBank ?? 0;
            coins = data.coins || {};
            shopMoney = data.shopMoney || {};
            customNicknames = data.customNicknames || {};
            userProfiles = data.userProfiles || {};
            debtAmount = data.debtAmount || {};
            debtBlocked = data.debtBlocked || {};
        }
    } catch (e) {
        console.log("Ошибка загрузки данных:", e);
    }
}

function saveData() {
    try {
        const data = {
            casinoBank,
            shopBank,
            salaryBank,
            coins,
            shopMoney,
            customNicknames,
            userProfiles,
            debtAmount,
            debtBlocked
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
    if (currentHour === 20 && !isCasinoOpen) {
        isCasinoOpen = true;
        saveData();
        client.say("QumosX", "🎰 Наступило 20:05! Казино автоматически открыто. Всем удачи в игре! 🎰");
    } else if (currentHour === 10 && isCasinoOpen) {
        isCasinoOpen = false;
        saveData();
        client.say("QumosX", "🚫 Наступило время закрытия! Казино автоматически закрывается на перерыв.");
    }
}, 60000);

function getProfile(user) {
    if (!userProfiles[user]) {
        userProfiles[user] = {
            username: user,
            balance: 0,
            bankCardBalance: 0,
            casinoChips: 0,
            job: "Безработный",
            level: 1,
            exp: 0,
            expToNextLevel: 100,
            hunger: 100,
            health: 100,
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

function hasRoleOrOwner(user) {
    return owners.includes(user);
}

function checkAndApplyHouseTax(profile) {
    if (profile.houseType === "Нет" || !houseDailyTax[profile.houseType]) return;
    let todayStr = new Date().toISOString().split('T')[0];
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
        if (profile.isDebtCardBlocked) {
            return { success: false, reason: "Ваша банковская карта заблокирована! Ей нельзя оплачивать, используйте наличные (!оплата нал)." };
        }
        if (userCoins < cost) {
            return { success: false, reason: `Недостаточно средств на банковской карте! Нужно: ${cost}` };
        }
        coins[user] = userCoins - cost;
        profile.bankCardBalance = coins[user];
        return { success: true, tag: "!оплата карта" };
    } else if (choice === "нал") {
        if (profile.balance < cost) {
            return { success: false, reason: `Недостаточно наличных средств! Нужно: ${cost}` };
        }
        profile.balance -= cost;
        return { success: true, tag: "!оплата нал" };
    }
    return { success: false, reason: "Неверный способ оплаты. Используйте '!оплата карта' или '!оплата нал'." };
}

function checkDebtStatus(user, profile) {
    if (debtAmount[user] && debtAmount[user] > 0) {
        let debtStartTime = debtTime[user] ? new Date(debtTime[user]) : new Date();
        let hoursPassed = (new Date() - debtStartTime) / (1000 * 60 * 60);

        if (hoursPassed >= 72) {
            if (!profile.isDebtCardBlocked) {
                profile.isDebtCardBlocked = true;
                saveData();
                client.say("QumosX", `🚨 [БАНК] Внимание! У ${getDisplayName(user)} просрочка кредита более 3-х дней! Кредитная карта заблокирована.`);
            }
            if (hoursPassed >= 96 && profile.houseType !== "Нет") {
                client.say("QumosX", `⚠️ [БАНК] Предупреждение для ${getDisplayName(user)}: в связи с неуплатой долга ваше имущество (дом: ${profile.houseType}) конфисковано банком!`);
                profile.houseType = "Нет";
                profile.houseTaxDebt = 0;
                saveData();
            }
            if (hoursPassed >= 120) {
                let currentDebt = debtAmount[user];
                if ((coins[user] || 0) < currentDebt && profile.balance < currentDebt) {
                    profile.isImprisoned = true;
                    let releaseDate = new Date();
                    releaseDate.setHours(releaseDate.getHours() + 24);
                    profile.prisonReleaseTime = releaseDate.toISOString().replace('T', ' ').substring(0, 19);
                    debtAmount[user] = 0;
                    profile.isDebtCardBlocked = false;
                    saveData();
                    client.say("QumosX", `⚖️ [СУД] У ${getDisplayName(user)} нет средств для выплаты долга. По решению суда он отправлен в тюрьму на 24 часа! Долг аннулирован.`);
                }
            }
        }
    }
}

// Обработка всех команд чата
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
    if (shopMoney[user] === undefined) {
        shopMoney[user] = startCoins;
    }

    // Проверка тюрьмы
    if (profile.isImprisoned) {
        if (profile.prisonReleaseTime) {
            let releaseTime = new Date(profile.prisonReleaseTime);
            if (new Date() >= releaseTime) {
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

    // Дома и недвижимость
    if (lowerText === "!дом" || lowerText === "!недвижимость") {
        client.say(target, `🏠 [${getDisplayName(user)}] | Жилье: ${profile.houseType} | Долг по коммуналке: ${profile.houseTaxDebt} монет.`);
        return;
    }

    if (lowerText.startsWith("!купить дом ")) {
        let subText = text.substring(12).trim();
        let choice = "карта";
        let houseArg = subText;

        if (subText.includes("!оплата ")) {
            let payIdx = subText.indexOf("!оплата ");
            houseArg = subText.substring(0, payIdx).trim().toLowerCase();
            let payPart = subText.substring(payIdx + 8).trim().toLowerCase();
            if (payPart.startsWith("карта")) choice = "карта";
            else if (payPart.startsWith("нал")) choice = "нал";
        } else {
            houseArg = houseArg.toLowerCase();
        }

        if (!houseCosts[houseArg]) {
            client.say(target, `❌ Неверный тип дома. Доступны: эконом (15000), стандарт (50000), элитный (150000), Пент-Хаус (300000). Пример: !купить дом стандарт !оплата нал`);
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
        profile.lastTaxDate = new Date().toISOString().split('T')[0];
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

        if (profile.houseType === "Нет") { client.say(target, `ℹ️ У вас нет недвижимости.`); return; }
        if (profile.houseTaxDebt <= 0) { client.say(target, `✅ У ${getDisplayName(user)} нет задолженностей по коммуналке.`); return; }

        let debt = profile.houseTaxDebt;
        let payRes = tryPayChoice(user, profile, debt, choice);
        if (!payRes.success) {
            client.say(target, `❌ ${payRes.reason} (Нужно: ${debt})`);
            return;
        }

        profile.houseTaxDebt = 0;
        saveData();
        client.say(target, `💡 (${payRes.tag}) ${getDisplayName(user)} успешно оплатил коммуналку на сумму ${debt} монет!`);
        return;
    }

    // Персонаж и работа
    if (lowerText === "!персонаж" || lowerText === "!статус") {
        let cardStatus = profile.isDebtCardBlocked ? "🔴 ЗАБЛОКИРОВАНА" : "🟢 Активна";
        client.say(target, `👤 [${getDisplayName(user)}] Работа: ${profile.job} | Карта: ${cardStatus} | Наличные: ${profile.balance} | Фишки (Казино): ${profile.casinoChips} 👑`);
        return;
    }

    if (lowerText.startsWith("!работа ")) {
        let targetJob = text.substring(8).trim().toLowerCase();
        if (fixedJobsSalary[targetJob] || targetJob === "стример" || targetJob === "блогер") {
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
        let todayStr = new Date().toISOString().split('T')[0];
        if (profile.lastWorkDate === todayStr) {
            client.say(target, `⏳ Вы уже отработали смену сегодня!`);
            return;
        }

        let earned = 0;
        if (fixedJobsSalary[profile.job]) earned = fixedJobsSalary[profile.job];
        else if (profile.job === "стример") earned = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;
        else if (profile.job === "блогер") earned = Math.floor(Math.random() * (2000 - 50 + 1)) + 50;

        profile.balance += earned;
        profile.lastWorkDate = todayStr;
        saveData();
        client.say(target, `💰 ${getDisplayName(user)} отработал смену и заработал ${earned} наличных монет!`);
        return;
    }

    // Банк и финансы
    if (lowerText.startsWith("!пополнить карту ") || lowerText.startsWith("!пополнить ")) {
        if (profile.isDebtCardBlocked) { client.say(target, `❌ Ваша карта заблокирована!`); return; }
        let argString = text.substring(text.indexOf(' ') + 1).trim();
        let amount = parseInt(argString.split(' ')[0]);
        if (isNaN(amount) || amount <= 0) { client.say(target, `❌ Формат: '!пополнить карту [сумма]'`); return; }

        if (profile.balance < amount) { client.say(target, `❌ Недостаточно наличных! У вас на руках: ${profile.balance}`); return; }

        profile.balance -= amount;
        coins[user] += amount;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💳 ${getDisplayName(user)} пополнил карту на ${amount} монет! Баланс карты: ${coins[user]}`);
        return;
    }

    if (lowerText.startsWith("!обналичить ")) {
        let subText = text.substring(11).trim().toLowerCase();
        let parts = subText.split(' ');
        if (parts.length < 2) { client.say(target, `❌ Формат: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'`); return; }

        let source = parts[0];
        let amount = parseInt(parts[1]);
        if (isNaN(amount) || amount <= 0) { client.say(target, `❌ Неверная сумма.`); return; }

        if (source === "нал") {
            if (profile.balance < amount) { client.say(target, `❌ Недостаточно наличных! У вас на руках: ${profile.balance}`); return; }
            profile.balance -= amount;
            profile.casinoChips += amount;
            saveData();
            client.say(target, `💵 ${getDisplayName(user)} обменял ${amount} наличных на ${amount} фишек 👑!`);
            return;
        } else if (source === "карта") {
            if (profile.isDebtCardBlocked) { client.say(target, `❌ Карта заблокирована!`); return; }
            let cardBal = coins[user] || 0;
            if (cardBal < amount) { client.say(target, `❌ Недостаточно средств на карте!`); return; }
            coins[user] -= amount;
            profile.bankCardBalance = coins[user];
            profile.casinoChips += amount;
            saveData();
            client.say(target, `💳 ${getDisplayName(user)} купил ${amount} фишек 👑 с карты! Баланс карты: ${coins[user]}`);
            return;
        }
        return;
    }

    // Персонал и Админка
    if (text === "!персонал" || text === "!работники" || text === "!команда") {
        let staffList = owners.map(owner => `${owner} (${ownerRoles[owner] || "Сотрудник"})`);
        client.say(target, `👥 ПЕРСОНАЛ КАЗИНО: ${staffList.join(" | ")}`);
        return;
    }

    if (text === "!моя роль") {
        if (!owners.includes(user)) { client.say(target, `❌ Ты не сотрудник казино.`); return; }
        client.say(target, `👤 ${getDisplayName(user)}, твоя должность: ${ownerRoles[user] || "Сотрудник"}.`);
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
        client.say(target, `🎰 КАЗИНО: *100# | !каз [ставка] (!оплата карта / !оплата нал) | !топказ`);
        client.say(target, `🛒 МАГАЗИН: !магазин | !мойшоп | !чек [товар] | !купить [товар/ник]`);
        client.say(target, `🏠 ЖИЛЬЕ: !дом | !купить дом [тип] (!оплата карта/нал) | !оплатить налог`);
        client.say(target, `💼 РАБОТА: !работа [проф] | !трудиться | !пополнить карту [сум] | !обналичить нал/карта [сум]`);
        return;
    }

    if (text.startsWith("!стат") || text.startsWith("!статистика")) {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Доступно сотрудникам казино.`); return; }
        let parts = text.split(' ');
        let targetUser = (parts.length >= 2) ? parts[1].toLowerCase().replace("@", "") : user;
        if (coins[targetUser] === undefined) { client.say(target, `❌ Игрок @${targetUser} не найден.`); return; }

        let balance = coins[targetUser];
        let targetProfile = getProfile(targetUser);
        let cardSt = targetProfile.isDebtCardBlocked ? "🔴 Заблокирована" : "🟢 Активна";
        client.say(target, `📊 СТАТИСТИКА [${getDisplayName(targetUser)}] ➡️ Карта: ${balance} | Нал: ${targetProfile.balance} | Фишки: ${targetProfile.casinoChips} | Карта: ${cardSt} | Долг: ${debtAmount[targetUser] || 0}`);
        return;
    }

    if (text.startsWith("!передать") || text.startsWith("!дать")) {
        if (profile.isDebtCardBlocked) { client.say(target, `❌ Ваша карта заблокирована!`); return; }
        let parts = text.split(' ');
        let giveAmount = parseInt(parts[2]);
        if (parts.length < 3 || isNaN(giveAmount) || giveAmount <= 0) { client.say(target, `❌ Используй: !передать [ник] [сумма]`); return; }

        let targetUser = parts[1].toLowerCase().replace("@", "");
        if (targetUser === user) { client.say(target, `❌ Нельзя переводить себе!`); return; }
        if (coins[user] < giveAmount) { client.say(target, `❌ Недостаточно средств на карте!`); return; }

        if (coins[targetUser] === undefined) { coins[targetUser] = startCoins; shopMoney[targetUser] = startCoins; }
        coins[user] -= giveAmount;
        profile.bankCardBalance = coins[user];
        coins[targetUser] += giveAmount;
        getProfile(targetUser).bankCardBalance = coins[targetUser];
        saveData();
        client.say(target, `🤝 ${getDisplayName(user)} передал ${giveAmount} с карты игроку ${getDisplayName(targetUser)}!`);
        return;
    }

    if (text.startsWith("!долг ")) {
        let debtSum = parseInt(text.split(' ')[2]);
        if (isNaN(debtSum) || debtSum <= 0) { client.say(target, `❌ Используй: !долг [сумма]`); return; }
        if ((debtAmount[user] || 0) > 0) { client.say(target, `❌ У тебя уже есть активный долг: ${debtAmount[user]}`); return; }

        debtAmount[user] = debtSum;
        debtTime[user] = new Date().toISOString();
        debtBlocked[user] = false;
        coins[user] += debtSum;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💳 ${getDisplayName(user)} взял в долг ${debtSum}. Верните в течение 3 дней!`);
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
        if (!payRes.success) { client.say(target, `❌ ${payRes.reason} (Нужно: ${currentDebt})`); return; }

        debtAmount[user] = 0;
        debtBlocked[user] = false;
        profile.isDebtCardBlocked = false;
        saveData();
        client.say(target, `✅ (${payRes.tag}) ${getDisplayName(user)} погасил долг! Карта разблокирована.`);
        return;
    }

    if (text.startsWith("!снять долг")) {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        let targetUser = text.split(' ')[2]?.toLowerCase().replace("@", "");
        if (!targetUser) { client.say(target, `❌ Используй: !снять долг [ник]`); return; }
        debtAmount[targetUser] = 0;
        debtBlocked[targetUser] = false;
        getProfile(targetUser).isDebtCardBlocked = false;
        saveData();
        client.say(target, `✅ Долг игрока ${getDisplayName(targetUser)} аннулирован.`);
        return;
    }

    if (text === "!фонд зп") {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        client.say(target, `💼 Фонд зарплаты: ${salaryBank} крышек.`);
        return;
    }

    if (text === "!зарплата" || text === "!зп") {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        if (salaryBank <= 0) { client.say(target, `❌ Фонд зарплаты пуст.`); return; }

        let totalBank = salaryBank;
        let count = owners.length;
        let share = Math.floor(totalBank / count);
        let remainder = totalBank % count;
        salaryBank = 0;

        for (let i = 0; i < owners.length; i++) {
            let staff = owners[i];
            if (coins[staff] === undefined) { coins[staff] = startCoins; shopMoney[staff] = startCoins; }
            let personalShare = share + (i === 0 ? remainder : 0);
            coins[staff] += personalShare;
            getProfile(staff).bankCardBalance = coins[staff];
        }
        saveData();
        client.say(target, `💰 Зарплата успешно распределена сотрудникам на карты!`);
        return;
    }

    if (text === "!каз открыть" || text === "!казино открыть") {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        isCasinoOpen = true;
        saveData();
        client.say(target, `🎰 Казино открыто!!`);
        return;
    }

    if (text === "!каз закрыть" || text === "!казино закрыть") {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        isCasinoOpen = false;
        saveData();
        client.say(target, `🚫 Казино закрыто.`);
        return;
    }

    if (text.startsWith("!снять каз")) {
        if (user !== "qumosx") { client.say(target, `❌ Только Главный Босс!`); return; }
        let amount = parseInt(text.split(' ')[2]);
        if (isNaN(amount) || amount <= 0) return;
        if (casinoBank < amount) { client.say(target, `❌ Не хватает средств в казне.`); return; }
        casinoBank -= amount;
        coins[user] += amount;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💸 Босс снял ${amount} со счета казино.`);
        return;
    }

    if (text === "!казсчёт") {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        client.say(target, `🏦 Банк казино: ${casinoBank} крышек.`);
        return;
    }

    if (text === "!шопбанк") {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        client.say(target, `🛒 Банк магазина: ${shopBank} крышек.`);
        return;
    }

    if (text.startsWith("!снять шоп")) {
        if (!hasRoleOrOwner(user)) { client.say(target, `❌ Нет прав.`); return; }
        let amount = parseInt(text.split(' ')[2]);
        if (isNaN(amount) || amount <= 0) return;
        if (shopBank < amount) { client.say(target, `❌ Недостаточно средств.`); return; }
        shopBank -= amount;
        coins[user] += amount;
        profile.bankCardBalance = coins[user];
        saveData();
        client.say(target, `💸 Снято из банка магазина: ${amount}`);
        return;
    }

    if (text === "!*100#" || text === "*100#") {
        client.say(target, `💰 ${getDisplayName(user)} | Фишки: ${profile.casinoChips} 👑 | Нал: ${profile.balance} | Карта: ${coins[user]}`);
        return;
    }

    if (text === "!шопбаланс" || text === "!мойшоп" || text === "!моитовары") {
        let shopBal = shopMoney[user] || 0;
        client.say(target, `🛒 ${getDisplayName(user)}, баланс в магазине: ${shopBal} крышек.`);
        return;
    }

    if (text === "!топказ") {
        let topPlayers = Object.entries(userProfiles)
            .sort((a, b) => b[1].casinoChips - a[1].casinoChips)
            .slice(0, 5);
        let topList = topPlayers.map((p, idx) => `${idx + 1}. ${customNicknames[p[0]] || p[0]} (${p[1].casinoChips} 👑)`);
        client.say(target, `🏆 ТОП-5 БОГАЧЕЙ (по фишкам): ${topList.join(" | ")}`);
        return;
    }

    // Магазин со всеми бонусами
    if (text === "!магазин" || text === "!шоп") {
        client.say(target, `🛒 МАГАЗИН: 💎 вип | 🍀 удача | 🛡️ щит | 🔥 дубль | 🎰 спин | ⚡ мегащит | 🌟 джекпот | 💥 трипл | 🎯 суперудача | 🧲 магнит | 💉 хил | 🚀 ультрадубль | 🛡️ гигащит | 🐀 крысокороль | 🪙 золотойбатон | 💼 сейфдолг | ⏳ таймварп | 🌀 омниспин | 🥷 теневойспин | 🤖 киберкрыса | 🕵️ мафия | ☢️ ядерныйспин | ⚗️ алхимик | 👻 фантом | 👑 роялбатон | 🧱 титанщит | ⚡ богудача | 🔑 матрица | 🏴 синдикат | 👑 абсолют | ✏️ ник [имя]`);
        return;
    }

    if (text.startsWith("!чек")) {
        let arg = text.substring(4).trim().toLowerCase();
        if (arg === "вип") { client.say(target, `💎 ВИП (10k): Статус элитного игрока.`); return; }
        if (arg === "удача") { client.say(target, `🍀 Удача (15k): Выше шанс выигрыша.`); return; }
        client.say(target, `ℹ️ Используй: !чек [название бонуса]`);
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
        else if (itemLower === "спин") { price = 8000; itemName = "Спин"; targetDict = freeSpin; }
        else if (itemLower === "мегащит") { price = 30000; itemName = "Мегащит"; targetDict = megaShieldBonus; }
        else if (itemLower === "джекпот") { price = 50000; itemName = "Джекпот"; targetDict = jackpotBonus; }
        else if (itemLower === "трипл") { price = 25000; itemName = "Трипл"; targetDict = tripleBonus; }
        else if (itemLower === "суперудача") { price = 40000; itemName = "Суперудача"; targetDict = superLuckBonus; }
        else if (itemLower === "магнит") { price = 18000; itemName = "Магнит"; targetDict = magnetBonus; }
        else if (itemLower === "хил") { price = 5000; itemName = "Хил"; targetDict = healBonus; }
        else if (itemLower === "ультрадубль") { price = 60000; itemName = "Ультрадубль"; targetDict = ultraDoubleBonus; }
        else if (itemLower === "гигащит") { price = 70000; itemName = "Гигащит"; targetDict = gigaShieldBonus; }
        else if (itemLower === "крысокороль") { price = 100000; itemName = "Крысокороль"; targetDict = ratKingBonus; }
        else if (itemLower === "золотойбатон") { price = 150000; itemName = "Золотой батон"; targetDict = goldenBatonBonus; }
        else if (itemLower === "сейфдолг") { price = 35000; itemName = "Сейфдолг"; targetDict = safeDebtBonus; }
        else if (itemLower === "таймварп") { price = 45000; itemName = "Таймварп"; targetDict = timeWarpBonus; }
        else if (itemLower === "омниспин") { price = 55000; itemName = "Омниспин"; targetDict = omniSpinBonus; }
        else if (itemLower === "теневойспин") { price = 65000; itemName = "Теневой спин"; targetDict = shadowSpinBonus; }
        else if (itemLower === "киберкрыса") { price = 85000; itemName = "Киберкрыса"; targetDict = cyberRatBonus; }
        else if (itemLower === "мафия") { price = 90000; itemName = "Мафия"; targetDict = mafiaCoverBonus; }
        else if (itemLower === "ядерныйспин") { price = 200000; itemName = "Ядерный спин"; targetDict = nuclearSpinBonus; }
        else if (itemLower === "алхимик") { price = 75000; itemName = "Алхимик"; targetDict = alchemistBonus; }
        else if (itemLower === "фантом") { price = 95000; itemName = "Фантом"; targetDict = phantomWinBonus; }
        else if (itemLower === "роялбатон") { price = 300000; itemName = "Роял батон"; targetDict = royalBatonBonus; }
        else if (itemLower === "титанщит") { price = 120000; itemName = "Титан щит"; targetDict = titanShieldBonus; }
        else if (itemLower === "богудача") { price = 250000; itemName = "Бог удача"; targetDict = godLuckBonus; }
        else if (itemLower === "матрица") { price = 180000; itemName = "Матрица"; targetDict = matrixKeyBonus; }
        else if (itemLower === "синдикат") { price = 220000; itemName = "Синдикат"; targetDict = syndicateBonus; }
        else if (itemLower === "абсолют") { price = 500000; itemName = "Абсолют"; targetDict = absoluteKingBonus; }
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
            shopBank += price / 2;
            targetDict[user] = (targetDict[user] || 0) + 1;
            saveData();
            client.say(target, `🛒 Успешно куплено: ${itemName}`);
            return;
        }
    }

    // Основная игра в казино (!каз)
    if (lowerText.startsWith("!каз ")) {
        if (!isCasinoOpen) { client.say(target, `🚫 Казино закрыто!`); return; }

        let bet = parseInt(text.substring(5).trim());
        if (isNaN(bet) || bet <= 0) { client.say(target, `❌ Используй: !каз [ставка]`); return; }

        if (profile.casinoChips < bet) {
            client.say(target, `❌ Недостаточно фишек! У вас: ${profile.casinoChips} 👑. Обменяйте через !обналичить нал/карта [сумма]`);
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
            client.say(target, `🎰 [${a} | ${b} | ${c}] — 🏆 ${getDisplayName(user)} выиграл ${win} фишек! (Баланс: ${profile.casinoChips} 👑)`);
        } else {
            client.say(target, `🎰 [${a} | ${b} | ${c}] — ❌ ${getDisplayName(user)} проиграл ${bet} фишек. (Остаток: ${profile.casinoChips} 👑)`);
        }
        saveData();
        return;
    }
});