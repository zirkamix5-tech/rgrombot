const net = require('net');
const fs = require('fs');
const path = require('path');

class UserProfile {
    constructor(username) {
        this.username = username;
        this.balance = 0;       // Наличные
        this.bankCardBalance = 0; // Банковская карта в Inspector
        this.casinoChips = 0;     // Фишки (отдельный счет для казино)
        this.job = "Безработный";
        this.level = 1;
        this.exp = 0;
        this.expToNextLevel = 100;
        this.hunger = 100;            
        this.health = 100;            
        this.isHospitalized = false; 
        this.isImprisoned = false;   
        this.prisonReleaseTime = ""; 
        this.lastWorkDate = "";    
        
        this.houseType = "Нет";     
        this.houseTaxDebt = 0;       
        this.lastTaxDate = "";     

        this.isDebtCardBlocked = false;
    }
}

class TwitchCasino {
    constructor() {
        this.botName = "RGROMBOT";
        this.oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";
        this.channelName = "QumosX";

        this.twitchClient = null;
        this.writeQueue = [];
        this.isWriting = false;

        this.owners = ["qumosx", "r0ma_gr0m", "gospod_bomzhik", "miss__krevetka"];
        this.ownerRoles = {
            "qumosx": "Главный Босс",
            "gospod_bomzhik": "Шеф СБ",
            "miss__krevetka": "Игровой Мастер"
        };

        this.startCoins = 0;
        this.casinoBank = 1000000;
        this.shopBank = 0; 
        this.salaryBank = 0; 
        this.isCasinoOpen = true;

        this.coins = new Map(); // Баланс карты
        this.shopMoney = new Map();
        
        this.customNicknames = new Map();
        this.userProfiles = new Map();
        
        this.fixedJobsSalary = {
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

        this.houseCosts = {
            "эконом": 15000,
            "стандарт": 50000,
            "элитный": 150000,
            "роскошный": 300000,
            "президентский": 700000
        };
        this.houseDailyTax = {
            "эконом": 300,       
            "стандарт": 900,
            "элитный": 2500,
            "роскошный": 10000,
            "президентский": 50000
        };

        this.lastRobTime = new Map();

        this.debtAmount = new Map();
        this.debtTime = new Map();
        this.debtBlocked = new Map();

        this.vipBonus = new Map();          
        this.luckBonus = new Map();          
        this.shieldBonus = new Map();        
        this.doubleBonus = new Map();        
        this.freeSpin = new Map();          
        this.megaShieldBonus = new Map();    
        this.jackpotBonus = new Map();      
        this.tripleBonus = new Map();        
        this.superLuckBonus = new Map();    
        this.magnetBonus = new Map();        
        this.healBonus = new Map();          
        this.ultraDoubleBonus = new Map();    
        this.gigaShieldBonus = new Map();    
        this.ratKingBonus = new Map();        
        this.goldenBatonBonus = new Map();    
        this.safeDebtBonus = new Map();      
        this.timeWarpBonus = new Map();      
        this.omniSpinBonus = new Map();      
        this.shadowSpinBonus = new Map();    
        this.cyberRatBonus = new Map();      
        this.mafiaCoverBonus = new Map();    
        this.nuclearSpinBonus = new Map();    
        this.alchemistBonus = new Map();      
        this.phantomWinBonus = new Map();    
        this.royalBatonBonus = new Map();    
        this.titanShieldBonus = new Map();    
        this.godLuckBonus = new Map();        
        this.matrixKeyBonus = new Map();      
        this.syndicateBonus = new Map();      
        this.absoluteKingBonus = new Map();  

        this.slots = ["🍒", "🍋", "🍉", "⭐", "💎", "🎲", "♦", "♠", "♥", "💵", "🤩"];
        this.savePath = path.join(process.cwd(), "casino_data.txt");
        this.robSavePath = path.join(process.cwd(), "rob_data.txt");
        
        this.lastCheckedHour = -1;
    }

    start() {
        this.loadData();
        this.connectToTwitch();
        setInterval(() => this.checkAutoCasinoTime(), 60000);
    }

    update() { 
        this.checkAutoCasinoTime(); 
    }

    onApplicationQuit() {
        this.saveData();
        this.closeConnection();
    }

    closeConnection() {
        try {
            if (this.twitchClient) {
                this.twitchClient.end();
            }
        } catch (e) {}
    }

    checkAutoCasinoTime() {
        let currentHour = new Date().getHours();
        if (currentHour !== this.lastCheckedHour) {
            this.lastCheckedHour = currentHour;
            if (currentHour === 15 && !this.isCasinoOpen) {
                this.isCasinoOpen = true;
                this.saveData();
                this.send("🎰 Наступило 15:00! Казино автоматически открыто. Всем удачи в игре! 🎰");
            } else if (currentHour === 5 && this.isCasinoOpen) {
                this.isCasinoOpen = false;
                this.saveData();
                this.send("🚫 Наступило время закрытия! Казино автоматически закрывается на перерыв.");
            }
        }
    }

    connectToTwitch() {
        try {
            this.twitchClient = new net.Socket();
            this.twitchClient.connect(6667, 'irc.chat.twitch.tv', () => {
                this.writeLine("PASS " + this.oauth);
                this.writeLine("NICK " + this.botName);
                this.writeLine("JOIN #" + this.channelName.toLowerCase());
            });

            let buffer = "";
            this.twitchClient.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split('\r\n');
                buffer = lines.pop(); // Keep incomplete line

                for (let line of lines) {
                    if (!line) continue;

                    if (line.startsWith("PING")) {
                        this.writeLine("PONG :tmi.twitch.tv");
                        continue;
                    }

                    if (line.includes("PRIVMSG")) {
                        let userIndex = line.indexOf('!');
                        if (userIndex > 1) {
                            let user = line.substring(1, userIndex - 1).toLowerCase();
                            let messageIndex = line.indexOf(" :", line.indexOf("PRIVMSG"));
                            if (messageIndex !== -1) {
                                let message = line.substring(messageIndex + 2);
                                this.command(user, message);
                            }
                        }
                    }
                }
            });

            this.twitchClient.on('error', (err) => {});
            this.twitchClient.on('close', () => {});
        } catch (e) {}
    }

    writeLine(msg) {
        if (this.twitchClient && !this.twitchClient.destroyed) {
            this.twitchClient.write(msg + "\r\n");
        }
    }

    readChat() {}

    send(msg) {
        if (this.twitchClient && !this.twitchClient.destroyed) {
            this.writeLine("PRIVMSG #" + this.channelName.toLowerCase() + " :" + msg);
        }
    }

    hasRoleOrOwner(user) {
        return this.owners.includes(user);
    }

    getDisplayName(user) {
        if (this.customNicknames.has(user) && this.customNicknames.get(user)) {
            return this.customNicknames.get(user) + " (@" + user + ")";
        }
        return "@" + user;
    }

    getProfile(user) {
        if (!this.userProfiles.has(user)) {
            this.userProfiles.set(user, new UserProfile(user));
        }
        
        let profile = this.userProfiles.get(user);
        this.checkAndApplyHouseTax(profile);
        return profile;
    }

    tryPayChoice(user, profile, cost, choice, payMethodTagObj, failReasonObj) {
        let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;

        if (choice === "карта") {
            if (profile.isDebtCardBlocked) {
                failReasonObj.val = "Ваша банковская карта заблокирована! Ей нельзя оплачивать, используйте наличные (!оплата нал).";
                return false;
            }
            if (userCoins < cost) {
                failReasonObj.val = "Недостаточно средств на банковской карте! Нужно: " + cost;
                return false;
            }

            this.coins.set(user, userCoins - Number(cost));
            profile.bankCardBalance = this.coins.get(user);
            payMethodTagObj.val = "!оплата карта";
            return true;
        } else if (choice === "нал") {
            if (profile.balance < cost) {
                failReasonObj.val = "Недостаточно наличных средств! Нужно: " + cost;
                return false;
            }

            profile.balance -= Number(cost);
            payMethodTagObj.val = "!оплата нал";
            return true;
        }

        failReasonObj.val = "Неверный способ оплаты. Используйте '!оплата карта' или '!оплата нал'.";
        return false;
    }

    tryPay(user, profile, cost, payMethodTagObj) {
        let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;

        let canUseCard = !profile.isDebtCardBlocked && userCoins >= cost;
        let canUseCash = profile.balance >= cost;

        if (!canUseCard && !canUseCash) {
            return false;
        }

        if (canUseCard) {
            this.coins.set(user, userCoins - Number(cost));
            profile.bankCardBalance = this.coins.get(user);
            payMethodTagObj.val = "!оплата карта";
            return true;
        }
        
        if (canUseCash) {
            profile.balance -= Number(cost);
            payMethodTagObj.val = "!оплата нал";
            return true;
        }

        return false;
    }

    checkAndApplyHouseTax(profile) {
        if (profile.houseType === "Нет" || !this.houseDailyTax[profile.houseType]) return;

        let todayStr = new Date().toISOString().split('T')[0];
        if (!profile.lastTaxDate) {
            profile.lastTaxDate = todayStr;
            return;
        }

        let lastDate = new Date(profile.lastTaxDate);
        if (!isNaN(lastDate.getTime())) {
            let nowDate = new Date();
            let diffTime = nowDate.setHours(0,0,0,0) - lastDate.setHours(0,0,0,0);
            let daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (daysPassed > 0) {
                let dailyTax = this.houseDailyTax[profile.houseType];
                profile.houseTaxDebt += dailyTax * daysPassed;
                profile.lastTaxDate = todayStr;
                this.saveData();
            }
        } else {
            profile.lastTaxDate = todayStr;
        }
    }

    command(user, message) {
        let text = message.trim();
        let lowerText = text.toLowerCase();
        let profile = this.getProfile(user); 

        if (!this.coins.has(user)) {
            this.coins.set(user, this.startCoins);
            profile.bankCardBalance = this.startCoins;
            profile.casinoChips = this.startCoins;
            this.shopMoney.set(user, this.startCoins);
            this.saveData();
        } else {
            profile.bankCardBalance = this.coins.get(user);
        }
        if (!this.shopMoney.has(user)) {
            this.shopMoney.set(user, this.startCoins);
        }

        if (profile.isImprisoned) {
            if (profile.prisonReleaseTime) {
                let releaseTime = new Date(profile.prisonReleaseTime);
                if (new Date() >= releaseTime) {
                    profile.isImprisoned = false;
                    profile.prisonReleaseTime = "";
                    this.saveData();
                    this.send("🚨 " + this.getDisplayName(user) + " отбыл свой срок в тюрьме и вышел на свободу!");
                } else {
                    return;
                }
            } else {
                profile.isImprisoned = false;
                this.saveData();
            }
        }

        this.checkDebtStatus(user, profile);

        if (lowerText === "!дом" || lowerText === "!недвижимость") {
            this.send("🏠 [" + this.getDisplayName(user) + "] | Жилье: " + profile.houseType + " | Долг по коммуналке: " + profile.houseTaxDebt + " денег.");
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

            if (!this.houseCosts[houseArg]) {
                this.send("❌ Неверный тип дома. Доступны: эконом (15000), стандарт (50000), элитный (150000), роскошный (30000), президентский (500000). Пример: !купить дом [стандарт] [!оплата нал/карта]");
                return;
            }

            if (profile.houseType !== "Нет") {
                this.send("❌ У вас уже есть жилье (" + profile.houseType + ").");
                return;
            }

            let cost = this.houseCosts[houseArg];
            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.tryPayChoice(user, profile, cost, choice, payMethodObj, failReasonObj)) {
                this.send("❌ " + failReasonObj.val);
                return;
            }

            profile.houseType = houseArg;
            profile.lastTaxDate = new Date().toISOString().split('T')[0];
            profile.houseTaxDebt = 0;
            this.saveData();

            this.send("🏡 (" + payMethodObj.val + ") " + this.getDisplayName(user) + " успешно приобрел дом класса '" + houseArg + "'!");
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
                this.send("ℹ️ У вас нет недвижимости.");
                return;
            }

            if (profile.houseTaxDebt <= 0) {
                this.send("✅ У " + this.getDisplayName(user) + " нет задолженностей по коммуналке.");
                return;
            }

            let debt = profile.houseTaxDebt;
            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.tryPayChoice(user, profile, debt, choice, payMethodObj, failReasonObj)) {
                this.send("❌ " + failReasonObj.val + " (Нужно: " + debt + ")");
                return;
            }

            profile.houseTaxDebt = 0;
            this.saveData();

            this.send("💡 (" + payMethodObj.val + ") " + this.getDisplayName(user) + " успешно оплатил коммуналку на сумму " + debt + " деняг!");
            return;
        }

        if (lowerText === "!персонаж" || lowerText === "!статус") {
            let cardStatus = profile.isDebtCardBlocked ? "🔴 ЗАБЛОКИРОВАНА" : "🟢 Активна";
            this.send("👤 [" + this.getDisplayName(user) + "] Работа: " + profile.job + " | Карта: " + cardStatus + " | Наличные: " + profile.balance + " | Крышки (Казино): " + profile.casinoChips + " 👑");
            return;
        }

        if (lowerText.startsWith("!работа ")) {
            let parts = text.split(' ');
            let targetJob = parts[1].toLowerCase();
            if (this.fixedJobsSalary[targetJob] || targetJob === "стример" || targetJob === "блогер" || targetJob === "безработный") {
                profile.job = targetJob;
                this.saveData();
                this.send("✅ " + this.getDisplayName(user) + " устроился на работу: " + targetJob + "!");
            } else {
                this.send("❌ Профессии '" + targetJob + "' не существует.");
            }
            return;
        }

        if (lowerText === "!трудиться" || lowerText === "!смена") {
            if (profile.job === "Безработный") { this.send("❌ Вы безработный!"); return; }
            
            let todayStr = new Date().toISOString().split('T')[0];
            if (profile.lastWorkDate === todayStr) {
                this.send("⏳ Вы уже отработали смену сегодня!");
                return;
            }

            let earned = 0;
            if (this.fixedJobsSalary[profile.job]) earned = this.fixedJobsSalary[profile.job];
            else if (profile.job === "стример") earned = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;
            else if (profile.job === "блогер") earned = Math.floor(Math.random() * (2000 - 50 + 1)) + 50;
            else if (profile.job === "безработный") earned = Math.floor(Math.random() * (500 - 50 + 1)) + 50;

            profile.balance += earned;
            profile.lastWorkDate = todayStr; 
            this.saveData();

            this.send("💰 " + this.getDisplayName(user) + " отработал смену и заработал " + earned + " денег!");
            return;
        }

        if (lowerText.startsWith("!пополнить карту ") || lowerText.startsWith("!пополнить ")) {
            if (profile.isDebtCardBlocked) {
                this.send("❌ Ваша банковская карта заблокирована! Пополнение счета невозможно.");
                return;
            }

            let argString = text.substring(text.indexOf(' ') + 1).trim();
            let parts = argString.split(' ');
            let amount = parseInt(parts[0], 10);
            if (parts.length < 1 || isNaN(amount) || amount <= 0) {
                this.send("❌ Формат: '!пополнить карту [сумма]'");
                return;
            }

            if (profile.balance < amount) {
                this.send("❌ Недостаточно наличных для пополнения карты! У вас наличными: " + profile.balance);
                return;
            }

            profile.balance -= amount;
            let currentCoins = this.coins.get(user) || 0;
            this.coins.set(user, currentCoins + amount);
            profile.bankCardBalance = this.coins.get(user);
            this.saveData();
            this.send("💳 " + this.getDisplayName(user) + " успешно пополнил банковскую карту на " + amount + " деняг! Баланс карты: " + this.coins.get(user));
            return;
        }

        if (lowerText.startsWith("!обналичить ")) {
            let subText = text.substring(11).trim().toLowerCase();
            let parts = subText.split(' ');

            if (parts.length < 2) {
                this.send("❌ Формат: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'");
                return;
            }

            let source = parts[0];
            let amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                this.send("❌ Неверная сумма. Формат: '!обналичить нал 500' или '!обналичить карта 500'");
                return;
            }

            if (source === "нал") {
                if (profile.balance < amount) {
                    this.send("❌ Недостаточно наличных! У вас на руках: " + profile.balance);
                    return;
                }

                profile.balance -= amount;
                profile.casinoChips += amount;
                this.saveData();
                this.send("💵 " + this.getDisplayName(user) + " обменял " + amount + " наличных на " + amount + " фишек 👑!");
                return;
            } else if (source === "карта") {
                if (profile.isDebtCardBlocked) {
                    this.send("❌ Карта заблокирована! Снятие с карты запрещено.");
                    return;
                }

                let cardBal = this.coins.has(user) ? this.coins.get(user) : 0;
                if (cardBal < amount) {
                    this.send("❌ Недостаточно средств на карте! На карте: " + cardBal);
                    return;
                }

                this.coins.set(user, cardBal - amount);
                profile.bankCardBalance = this.coins.get(user);
                profile.casinoChips += amount;
                this.saveData();
                this.send("💳 " + this.getDisplayName(user) + " купил " + amount + " фишек 👑 с банковской карты! Баланс карты: " + this.coins.get(user));
                return;
            } else {
                this.send("❌ Укажите источник: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'");
                return;
            }
        }

        if (lowerText.startsWith("!вывод ")) {
            let subText = text.substring(7).trim().toLowerCase();
            let parts = subText.split(' ');

            if (parts.length < 2) {
                this.send("❌ Формат: '!вывод нал [сумма]' или '!вывод карта [сумма]'");
                return;
            }

            let targetDest = parts[0];
            let amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                this.send("❌ Неверная сумма. Формат: '!вывод нал 500' или '!вывод карта 500'");
                return;
            }

            if (profile.casinoChips < amount) {
                this.send("❌ Недостаточно фишек в казино! У вас на балансе: " + profile.casinoChips + " 👑");
                return;
            }

            if (targetDest === "нал") {
                profile.casinoChips -= amount;
                profile.balance += amount;
                this.saveData();
                this.send("💵 " + this.getDisplayName(user) + " вывел " + amount + " фишек 👑 в наличные! Баланс на руках: " + profile.balance);
                return;
            } else if (targetDest === "карта") {
                if (profile.isDebtCardBlocked) {
                    this.send("❌ Ваша банковская карта заблокирована! Вывод на карту невозможен.");
                    return;
                }

                profile.casinoChips -= amount;
                let currentCoins = this.coins.get(user) || 0;
                this.coins.set(user, currentCoins + amount);
                profile.bankCardBalance = this.coins.get(user);
                this.saveData();
                this.send("💳 " + this.getDisplayName(user) + " вывел " + amount + " фишек 👑 на банковскую карту! Баланс карты: " + this.coins.get(user));
                return;
            } else {
                this.send("❌ Укажите направление: '!вывод нал [сумма]' или '!вывод карта [сумма]'");
                return;
            }
        }

        if (text === "!персонал" || text === "!работники" || text === "!команда") {
            let staffList = [];
            for (let owner of this.owners) {
                let role = this.ownerRoles[owner] ? this.ownerRoles[owner] : "Сотрудник";
                staffList.push(owner + " (" + role + ")");
            }
            this.send("👥 ПЕРСОНАЛ КАЗИНО: " + staffList.join(" | "));
            return;
        }

        if (text === "!моя роль") {
            if (!this.owners.includes(user)) { this.send("❌ Ты не сотрудник казино."); return; }
            let role = this.ownerRoles[user] ? this.ownerRoles[user] : "Сотрудник";
            this.send("👤 " + this.getDisplayName(user) + ", твоя должность: " + role + ".");
            return;
        }

        if (text === "!меню" || text === "!админ") {
            if (!this.owners.includes(user)) { this.send("❌ Доступно только сотрудникам."); return; }
            
            if (user === "qumosx") {
                this.send("👑 [ГЛАВНЫЙ БОСС]: !каз откр/закр | !снять каз [сумма] | !снять шоп [сумма] | !снять долг [ник] | !фонд зп | !зарплата");
            } else if (user === "gospod_bomzhik") {
                this.send("🛡️ [ШЕФ СБ]: !снять долг [ник] | !стат [ник] | !шопбанк | !казсчёт");
            } else if (user === "miss__krevetka") {
                this.send("🎰 [ИГРОВОЙ МАСТЕР]: !каз открыть | !каз закрыть | !топказ | !стат [ник]");
            }
            return;
        }

        if (text === "!инфа" || text === "!помощь" || text === "!help") {
            this.send("🎰 КАЗИНО: *100# | !каз [ставка] (!оплата карта / !оплата нал) | !топказ | !вывод нал/карта [сум]");
            this.send("🛒 МАГАЗИН: !магазин | !мойшоп | !чек [товар] | !купить [товар/ник]");
            this.send("🏠 ЖИЛЬЕ: !дом | !купить дом [тип] (!оплата карта/нал) | !оплатить налог (!оплата карта/нал)");
            this.send("💼 РАБОТА: !работа [проф] | !трудиться | !пополнить карту [сум] | !обналичить нал/карта [сум]");
            this.send("❓ ПРОЧЕЕ: !передать [ник] [сум] | !долг [сум] | !вернуть долг (!оплата карта/нал) | !персонаж");
            return;
        }

        if (text.startsWith("!стат") || text.startsWith("!статистика")) {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Доступно сотрудникам казино."); return; }

            let parts = text.split(' ');
            let targetUser = (parts.length >= 2) ? parts[1].toLowerCase().replace("@", "") : user;

            if (!this.coins.has(targetUser)) {
                this.send("❌ Игрок @" + targetUser + " не найден.");
                return;
            }

            let balance = this.coins.get(targetUser);
            let targetProfile = this.getProfile(targetUser);
            let cardSt = targetProfile.isDebtCardBlocked ? "🔴 Заблокирована" : "🟢 Активна";
            let currentDebt = this.debtAmount.has(targetUser) ? this.debtAmount.get(targetUser) : 0;

            this.send("📊 СТАТИСТИКА [" + this.getDisplayName(targetUser) + "] ➡️ Карта: " + balance + " | Наличные: " + targetProfile.balance + " | Фишки: " + targetProfile.casinoChips + " | Статус карты: " + cardSt + " | Долг: " + currentDebt);
            return;
        }

        if (text.startsWith("!передать") || text.startsWith("!дать")) {
            if (profile.isDebtCardBlocked) {
                this.send("❌ Ваша карта заблокирована, переводы недоступны!");
                return;
            }

            let parts = text.split(' ');
            let giveAmount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(giveAmount) || giveAmount <= 0) {
                this.send("❌ Используй: !передать [ник] [сумма]");
                return;
            }

            let targetUser = parts[1].toLowerCase().replace("@", "");
            if (targetUser === user) { this.send("❌ Нельзя переводить себе!"); return; }
            let userCoins = this.coins.get(user) || 0;
            if (userCoins < giveAmount) { this.send("❌ Недостаточно средств на карте!"); return; }

            if (!this.coins.has(targetUser)) { 
                this.coins.set(targetUser, this.startCoins); 
                this.shopMoney.set(targetUser, this.startCoins); 
            }

            this.coins.set(user, userCoins - giveAmount);
            profile.bankCardBalance = this.coins.get(user);
            
            let targetCoins = this.coins.get(targetUser);
            this.coins.set(targetUser, targetCoins + giveAmount);
            
            let targetProf = this.getProfile(targetUser);
            targetProf.bankCardBalance = this.coins.get(targetUser);
            this.saveData();

            this.send("🤝 " + this.getDisplayName(user) + " передал " + giveAmount + " с карты игроку " + this.getDisplayName(targetUser) + "!");
            return;
        }

        if (text.startsWith("!долг")) {
            let parts = text.split(' ');
            let debtSum = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(debtSum) || debtSum <= 0) {
                this.send("❌ Используй: !долг [сумма]");
                return;
            }

            let currentDebt = this.debtAmount.has(user) ? this.debtAmount.get(user) : 0;
            if (currentDebt > 0) { this.send("❌ У тебя уже есть активный долг: " + currentDebt); return; }

            this.debtAmount.set(user, debtSum);
            this.debtTime.set(user, new Date());
            this.debtBlocked.set(user, false);
            
            let userCoins = this.coins.get(user) || 0;
            this.coins.set(user, userCoins + debtSum); 
            profile.bankCardBalance = this.coins.get(user);
            this.saveData();

            this.send("💳 " + this.getDisplayName(user) + " взял в долг " + debtSum + " на карту. Верните в течение 3 дней, иначе карту заблокируют!");
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

            let currentDebt = this.debtAmount.has(user) ? this.debtAmount.get(user) : 0;
            if (currentDebt <= 0) { this.send("ℹ️ У тебя нет долгов."); return; }

            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.tryPayChoice(user, profile, currentDebt, choice, payMethodObj, failReasonObj)) {
                this.send("❌ " + failReasonObj.val + " (Нужно для возврата: " + currentDebt + ")");
                return;
            }

            this.debtAmount.set(user, 0);
            this.debtBlocked.set(user, false);
            profile.isDebtCardBlocked = false; 
            this.saveData();
            this.send("✅ (" + payMethodObj.val + ") " + this.getDisplayName(user) + " полностью погасил долг! Карта разблокирована.");
            return;
        }

        if (text.startsWith("!снять долг")) {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            let parts = text.split(' ');
            if (parts.length < 3) { this.send("❌ Используй: !снять долг [ник]"); return; }

            let targetUser = parts[2].toLowerCase().replace("@", "");
            this.debtAmount.set(targetUser, 0);
            this.debtBlocked.set(targetUser, false);
            this.getProfile(targetUser).isDebtCardBlocked = false;
            this.saveData();
            this.send("✅ Долг игрока " + this.getDisplayName(targetUser) + " аннулирован сотрудником.");
            return;
        }

        if (text === "!фонд зп") {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            this.send("💼 Фонд зарплаты: " + this.salaryBank + " крышек.");
            return;
        }

        if (text === "!зарплата" || text === "!зп") {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            if (this.salaryBank <= 0) { this.send("❌ Фонд зарплаты пуст."); return; }

            let totalBank = this.salaryBank;
            let count = this.owners.length;
            let share = Math.floor(totalBank / count);
            let remainder = totalBank % count;

            this.salaryBank = 0;

            for (let i = 0; i < this.owners.length; i++) {
                let staff = this.owners[i];
                if (!this.coins.has(staff)) {
                    this.coins.set(staff, this.startCoins);
                    this.shopMoney.set(staff, this.startCoins);
                }
                let personalShare = share + (i === 0 ? remainder : 0);
                let currentCoins = this.coins.get(staff);
                this.coins.set(staff, currentCoins + personalShare);
                this.getProfile(staff).bankCardBalance = this.coins.get(staff);
            }

            this.saveData();
            this.send("💰 Зарплата успешно распределена сотрудникам на карты!");
            return;
        }

        if (text === "!каз открыть" || text === "!казино открыть") {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            this.isCasinoOpen = true;
            this.saveData();
            this.send("🎰 Казино открыто!!");
            return;
        }

        if (text === "!каз закрыть" || text === "!казино закрыть") {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            this.isCasinoOpen = false;
            this.saveData();
            this.send("🚫 Казино закрыто.");
            return;
        }

        if (text.startsWith("!снять каз")) {
            if (user !== "qumosx") { this.send("❌ Только Главный Босс может снимать деньги с банка Казино."); return; }
            let parts = text.split(' ');
            let amount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(amount) || amount <= 0) return;
            if (this.casinoBank < amount) { this.send("❌ Не хватает средств в казне."); return; }
            this.casinoBank -= amount;
            let userCoins = this.coins.get(user) || 0;
            this.coins.set(user, userCoins + amount);
            profile.bankCardBalance = this.coins.get(user);
            this.saveData();
            this.send("💸 Босс снял " + amount + " со счета казино.");
            return;
        }

        if (text === "!казсчёт") {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            this.send("🏦 Банк казино: " + this.casinoBank + " крышек.");
            return;
        }

        if (text === "!шопбанк") {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            this.send("🛒 Банк магазина: " + this.shopBank + " крышек.");
            return;
        }

        if (text.startsWith("!снять шоп")) {
            if (!this.hasRoleOrOwner(user)) { this.send("❌ Нет прав."); return; }
            let parts = text.split(' ');
            let amount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(amount) || amount <= 0) return;
            if (this.shopBank < amount) { this.send("❌ Недостаточно средств."); return; }
            this.shopBank -= amount;
            let userCoins = this.coins.get(user) || 0;
            this.coins.set(user, userCoins + amount);
            profile.bankCardBalance = this.coins.get(user);
            this.saveData();
            this.send("💸 Снято из банка магазина: " + amount);
            return;
        }

        if (text === "!*100#" || text === "*100#") {
            let userCoins = this.coins.get(user) || 0;
            this.send("💰 " + this.getDisplayName(user) + " | Фишки казино: " + profile.casinoChips + " 👑 | Наличные: " + profile.balance + " | Карта: " + userCoins);
            return;
        }

        if (text === "!шопбаланс" || text === "!мойшоп" || text === "!моитовары") {
            let shopBal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
            this.send("🛒 " + this.getDisplayName(user) + ", баланс в магазине: " + shopBal + " крышек.");
            return;
        }

        if (text === "!топказ") {
            let sortedProfiles = Array.from(this.userProfiles.entries()).sort((a, b) => b[1].casinoChips - a[1].casinoChips);
            let topPlayers = sortedProfiles.slice(0, 5);
            let topList = [];
            for (let i = 0; i < topPlayers.length; i++) {
                let playerName = topPlayers[i][0];
                let displayN = this.customNicknames.has(playerName) ? this.customNicknames.get(playerName) : playerName;
                topList.push((i + 1) + ". " + displayN + " (" + topPlayers[i][1].casinoChips + " 👑)");
            }
            this.send("🏆 ТОП-5 БОГАЧЕЙ (по фишкам): " + topList.join(" | "));
            return;
        }

        if (text === "!магазин" || text === "!шоп") {
            this.send("🛒 МАГАЗИН: 💎 вип | 🍀 удача | 🛡️ щит | 🔥 дубль | 🎰 спин | ⚡ мегащит | 🌟 джекпот | 💥 трипл | 🎯 суперудача | 🧲 магнит | 💉 хил | 🚀 ультрадубль | 🛡️ гигащит | 🐀 крысокороль | 🪙 золотойбатон | 💼 сейфдолг | ⏳ таймварп | 🌀 омниспин | 🥷 теневойспин | 🤖 киберкрыса | 🕵️ мафия | ☢️ ядерныйспин | ⚗️ алхимик | 👻 фантом | 👑 роялбатон | 🧱 титанщит | ⚡ богудача | 🔑 матрица | 🏴 синдикат | 👑 абсолют | ✏️ ник [имя]");
            return;
        }

        if (text.startsWith("!чек")) {
            let arg = text.substring(4).trim().toLowerCase();
            if (arg === "вип") { this.send("💎 ВИП (10k): Статус элитного игрока."); return; }
            if (arg === "удача") { this.send("🍀 Удача (15k): Выше шанс выигрыша."); return; }
            this.send("ℹ️ Используй: !чек [название бонуса]");
            return;
        }

        if (text.startsWith("!купить ")) {
            let itemArgs = text.substring(8).trim();
            let itemLower = itemArgs.toLowerCase();
            let price = 10000; 
            let itemName = "";
            let targetMap = null;

            if (itemLower === "вип") { price = 10000; itemName = "VIP"; targetMap = this.vipBonus; }
            else if (itemLower === "удача") { price = 15000; itemName = "Удача"; targetMap = this.luckBonus; }
            else if (itemLower === "щит") { price = 12000; itemName = "Щит"; targetMap = this.shieldBonus; }
            else if (itemLower === "дубль") { price = 20000; itemName = "Дубль"; targetMap = this.doubleBonus; }
            else if (itemLower === "спин") { price = 5000; itemName = "Спин"; targetMap = this.freeSpin; }
            else if (itemLower === "мегащит") { price = 25000; itemName = "Мегащит"; targetMap = this.megaShieldBonus; }
            else if (itemLower === "джекпот") { price = 30000; itemName = "Джекпот"; targetMap = this.jackpotBonus; }
            else if (itemLower === "трипл") { price = 22000; itemName = "Трипл"; targetMap = this.tripleBonus; }
            else if (itemLower === "суперудача") { price = 35000; itemName = "Суперудача"; targetMap = this.superLuckBonus; }
            else if (itemLower === "магнит") { price = 18000; itemName = "Магнит"; targetMap = this.magnetBonus; }
            else if (itemLower === "хил") { price = 8000; itemName = "Хил"; targetMap = this.healBonus; }
            else if (itemLower === "ультрадубль") { price = 40000; itemName = "Ультрадубль"; targetMap = this.ultraDoubleBonus; }
            else if (itemLower === "гигащит") { price = 45000; itemName = "Гигащит"; targetMap = this.gigaShieldBonus; }
            else if (itemLower === "крысокороль") { price = 50000; itemName = "Крысокороль"; targetMap = this.ratKingBonus; }
            else if (itemLower === "золотойбатон") { price = 60000; itemName = "Золотой батон"; targetMap = this.goldenBatonBonus; }
            else if (itemLower === "сейфдолг") { price = 15000; itemName = "Сейфдолг"; targetMap = this.safeDebtBonus; }
            else if (itemLower === "таймварп") { price = 35000; itemName = "Таймварп"; targetMap = this.timeWarpBonus; }
            else if (itemLower === "омниспин") { price = 55000; itemName = "Омниспин"; targetMap = this.omniSpinBonus; }
            else if (itemLower === "теневойспин") { price = 30000; itemName = "Теневой спин"; targetMap = this.shadowSpinBonus; }
            else if (itemLower === "киберкрыса") { price = 45000; itemName = "Киберкрыса"; targetMap = this.cyberRatBonus; }
            else if (itemLower === "мафия") { price = 50000; itemName = "Мафия"; targetMap = this.mafiaCoverBonus; }
            else if (itemLower === "ядерныйспин") { price = 100000; itemName = "Ядерный спин"; targetMap = this.nuclearSpinBonus; }
            else if (itemLower === "алхимик") { price = 25000; itemName = "Алхимик"; targetMap = this.alchemistBonus; }
            else if (itemLower === "фантом") { price = 20000; itemName = "Фантом"; targetMap = this.phantomWinBonus; }
            else if (itemLower === "роялбатон") { price = 75000; itemName = "Роял батон"; targetMap = this.royalBatonBonus; }
            else if (itemLower === "титанщит") { price = 60000; itemName = "Титан щит"; targetMap = this.titanShieldBonus; }
            else if (itemLower === "богудача") { price = 90000; itemName = "Бог удача"; targetMap = this.godLuckBonus; }
            else if (itemLower === "матрица") { price = 70000; itemName = "Матрица"; targetMap = this.matrixKeyBonus; }
            else if (itemLower === "синдикат") { price = 85000; itemName = "Синдикат"; targetMap = this.syndicateBonus; }
            else if (itemLower === "абсолют") { price = 150000; itemName = "Абсолют"; targetMap = this.absoluteKingBonus; }
            else if (itemLower.startsWith("ник ")) {
                price = 50000;
                let newNick = itemArgs.substring(4).trim();
                if (newNick) {
                    let shopBal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
                    if (shopBal < price) {
                        this.send("❌ Недостаточно средств для смены ника! Нужно: " + price);
                        return;
                    }
                    this.shopMoney.set(user, shopBal - price);
                    this.shopBank += Math.floor(price / 2);
                    this.customNicknames.set(user, newNick);
                    this.saveData();
                    this.send("✏️ Ник успешно изменен на: " + newNick);
                    return;
                }
            }

            if (price > 0 && targetMap !== null) {
                let shopBal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
                if (shopBal < price) {
                    this.send("❌ Недостаточно средств в магазине! Нужно: " + price);
                    return;
                }
                this.shopMoney.set(user, shopBal - price);
                this.shopBank += Math.floor(price / 2);
                let currentVal = targetMap.has(user) ? targetMap.get(user) : 0;
                targetMap.set(user, currentVal + 1);
                this.saveData();
                this.send("🛒 Успешно куплено: " + itemName);
                return;
            }
        }

        if (text.startsWith("!каз")) {
            if (!this.isCasinoOpen) { this.send("🚫 Казино закрыто!"); return; }

            let subText = text.substring(4).trim();
            let bet = parseInt(subText, 10);
            if (isNaN(bet) || bet <= 0) { 
                this.send("❌ Используй: !каз [ставка]"); 
                return; 
            }

            if (profile.casinoChips < bet) {
                this.send("❌ Недостаточно фишек для ставки! У вас фишек: " + profile.casinoChips + " 👑. Обменяйте наличные или карту через !обналичить нал/карта [сумма]");
                return;
            }

            profile.casinoChips -= bet;
            this.casinoBank += bet;
            this.salaryBank += Math.max(1, Math.floor(bet / 10));

            let a = this.slots[Math.floor(Math.random() * this.slots.length)];
            let b = this.slots[Math.floor(Math.random() * this.slots.length)];
            let c = this.slots[Math.floor(Math.random() * this.slots.length)];

            let win = 0;
            if (a === b && b === c) win = bet * 10;
            else if (a === b || a === c || b === c) win = bet * 3;

            if (win > 0) {
                profile.casinoChips += win; 
                this.casinoBank = Math.max(0, this.casinoBank - win);
                let shopBonusIncome = Math.max(1, Math.floor(win / 10));
                let userShopMoney = this.shopMoney.has(user) ? this.shopMoney.get(user) : this.startCoins;
                this.shopMoney.set(user, userShopMoney + shopBonusIncome);
                this.send("🎰 [" + a + " | " + b + " | " + c + "] — 🏆 " + this.getDisplayName(user) + " выиграл " + win + " фишек! (Баланс: " + profile.casinoChips + " 👑)");
            } else {
                this.send("🎰 [" + a + " | " + b + " | " + c + "] — ❌ " + this.getDisplayName(user) + " проиграл " + bet + " фишек. (Остаток: " + profile.casinoChips + " 👑)");
            }
            this.saveData();
            return;
        }
    }

    checkDebtStatus(user, profile) {
        if (this.debtAmount.has(user) && this.debtAmount.get(user) > 0) {
            let debtDate = this.debtTime.get(user);
            let spanHours = (new Date() - debtDate) / (1000 * 60 * 60);

            if (spanHours >= 72) {
                if (!profile.isDebtCardBlocked) {
                    profile.isDebtCardBlocked = true;
                    this.saveData();
                    this.send("🚨 [БАНК] Внимание! У " + this.getDisplayName(user) + " просрочка кредита более 3-х дней! Кредитная карта заблокирована. Ей больше нельзя оплачивать, только наличными!");
                }

                if (spanHours >= 96 && profile.houseType !== "Нет") {
                    this.send("⚠️ [БАНК] Предупреждение для " + this.getDisplayName(user) + ": в связи с неуплатой долга ваше имущество (дом: " + profile.houseType + ") конфисковано банком!");
                    profile.houseType = "Нет";
                    profile.houseTaxDebt = 0;
                    this.saveData();
                }

                if (spanHours >= 120) {
                    let currentDebt = this.debtAmount.get(user);
                    let userCoins = this.coins.get(user) || 0;
                    if (userCoins < currentDebt && profile.balance < currentDebt) {
                        profile.isImprisoned = true;
                        profile.prisonReleaseTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
                        
                        this.debtAmount.set(user, 0);
                        profile.isDebtCardBlocked = false;
                        this.saveData();

                        this.send("⚖️ [СУД] У " + this.getDisplayName(user) + " нет средств для выплаты долга. По решению суда он отправлен в тюрьму на 24 часа! Долг аннулирован.");
                    }
                }
            } else if (this.debtBlocked.has(user) && this.debtBlocked.get(user)) {
                if (spanHours > 23 && !profile.isDebtCardBlocked) {
                    this.debtBlocked.set(user, true);
                    let userCoins = this.coins.get(user) || 0;
                    this.coins.set(user, Math.max(0, userCoins - this.debtAmount.get(user)));
                    profile.bankCardBalance = this.coins.get(user);
                    this.saveData();
                }
            }
        }
    }

    loadData() {
        try {
            if (fs.existsSync(this.savePath)) {
                let data = fs.readFileSync(this.savePath, 'utf8');
                let lines = data.split(/\r?\n/);
                for (let line of lines) {
                    let parts = line.split(':');
                    if (parts.length >= 2) {
                        if (parts[0] === "COIN" && parts.length >= 3) {
                            this.coins.set(parts[1], parseInt(parts[2], 10));
                            this.getProfile(parts[1]).bankCardBalance = parseInt(parts[2], 10);
                        } else if (parts[0] === "SHOP" && parts.length >= 3) this.shopMoney.set(parts[1], parseInt(parts[2], 10));
                        else if (parts[0] === "CBANK" && parts.length >= 2) this.casinoBank = parseInt(parts[1], 10);
                        else if (parts[0] === "SBANK" && parts.length >= 2) this.shopBank = parseInt(parts[1], 10);
                        else if (parts[0] === "SALARY" && parts.length >= 2) this.salaryBank = parseInt(parts[1], 10);
                        else if (parts[0] === "NICK" && parts.length >= 3) this.customNicknames.set(parts[1], parts[2]);
                        else if (parts[0] === "JOB" && parts.length >= 3) this.getProfile(parts[1]).job = parts[2];
                        else if (parts[0] === "MONEY" && parts.length >= 3) this.getProfile(parts[1]).balance = parseInt(parts[2], 10);
                        else if (parts[0] === "CHIPS" && parts.length >= 3) this.getProfile(parts[1]).casinoChips = parseInt(parts[2], 10);
                        else if (parts[0] === "WORKDATE" && parts.length >= 3) this.getProfile(parts[1]).lastWorkDate = parts[2];
                        else if (parts[0] === "HOUSETYPE" && parts.length >= 3) this.getProfile(parts[1]).houseType = parts[2];
                        else if (parts[0] === "HOUSEDEDB" && parts.length >= 3) this.getProfile(parts[1]).houseTaxDebt = parseInt(parts[2], 10);
                        else if (parts[0] === "HOUSETDATE" && parts.length >= 3) this.getProfile(parts[1]).lastTaxDate = parts[2];
                        else if (parts[0] === "CARDLOCK" && parts.length >= 3) this.getProfile(parts[1]).isDebtCardBlocked = (parts[2] === 'True' || parts[2] === 'true');
                        else if (parts[0] === "PRISON" && parts.length >= 3) this.getProfile(parts[1]).isImprisoned = (parts[2] === 'True' || parts[2] === 'true');
                        else if (parts[0] === "PRISONT" && parts.length >= 3) this.getProfile(parts[1]).prisonReleaseTime = parts[2];
                    }
                }
            }
        } catch (e) {}
    }

    saveData() {
        try {
            let lines = [];
            lines.push("CBANK:" + this.casinoBank);
            lines.push("SBANK:" + this.shopBank);
            lines.push("SALARY:" + this.salaryBank);

            for (let [key, val] of this.coins.entries()) lines.push("COIN:" + key + ":" + val);
            for (let [key, val] of this.shopMoney.entries()) lines.push("SHOP:" + key + ":" + val);
            for (let [key, val] of this.customNicknames.entries()) lines.push("NICK:" + key + ":" + val);
            for (let [key, val] of this.userProfiles.entries()) {
                lines.push("JOB:" + key + ":" + val.job);
                lines.push("MONEY:" + key + ":" + val.balance);
                lines.push("CHIPS:" + key + ":" + val.casinoChips);
                if (val.lastWorkDate) {
                    lines.push("WORKDATE:" + key + ":" + val.lastWorkDate);
                }
                if (val.houseType) {
                    lines.push("HOUSETYPE:" + key + ":" + val.houseType);
                    lines.push("HOUSEDEDB:" + key + ":" + val.houseTaxDebt);
                    lines.push("HOUSETDATE:" + key + ":" + val.lastTaxDate);
                }
                if (val.isDebtCardBlocked) {
                    lines.push("CARDLOCK:" + key + ":" + val.isDebtCardBlocked);
                }
                if (val.isImprisoned) {
                    lines.push("PRISON:" + key + ":" + val.isImprisoned);
                    lines.push("PRISONT:" + key + ":" + val.prisonReleaseTime);
                }
            }

            fs.writeFileSync(this.savePath, lines.join('\n'), 'utf8');
        } catch (e) {}
    }
}

// Автозапуск при подключении к рендеру
const bot = new TwitchCasino();
bot.start();

module.exports = TwitchCasino;