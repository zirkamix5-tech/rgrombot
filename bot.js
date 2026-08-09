const net = require('net');
const fs = require('fs');
const http = require('http');

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
        // Настройки Twitch
        this.botName = "RGROMBOT";
        this.oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";
        this.channelName = "QumosX";

        this.twitchClient = null;
        this.reader = null;
        this.writer = null;
        this.readThread = null;
        this.writeLock = {};

        // Настройки Казино
        this.owners = ["qumosx", "r0ma_gr0m", "gospod_bomzhik", "miss__krevetka"];
        this.ownerRoles = new Map([
            [ "qumosx", "Главный Босс" ],
            [ "gospod_bomzhik", "Шеф СБ" ],
            [ "miss__krevetka", "Игровой Мастер" ]
        ]);

        this.startCoins = 0;
        this.casinoBank = 1000000;
        this.shopBank = 0; 
        this.salaryBank = 0; 
        this.isCasinoOpen = true;

        this.coins = new Map(); // Баланс карты
        this.shopMoney = new Map();
        
        this.customNicknames = new Map();
        this.userProfiles = new Map();
        
        this.fixedJobsSalary = new Map([
            [ "дворник", 150 ],
            [ "грузчик", 300 ],
            [ "водитель", 600 ],
            [ "программист", 1200 ],
            [ "повар", 1500 ],
            [ "мусорщик", 1700 ],
            [ "водитель автобуса", 1500 ],
            [ "химик", 2000 ],
            [ "су-шист", 2100 ],
            [ "шеф-повар", 2500 ],
            [ "полицейский", 3500 ],
            [ "пожарный", 3500 ],
            [ "предприниматель", 5000 ]
        ]);

        this.houseCosts = new Map([
            [ "эконом", 15000 ],
            [ "стандарт", 50000 ],
            [ "элитный", 150000 ],
            [ "роскошный", 300000 ],
            [ "президентский", 700000 ]
        ]);
        
        this.houseDailyTax = new Map([
            [ "эконом", 300 ],       
            [ "стандарт", 900 ],
            [ "элитный", 2500 ],
            [ "роскошный", 10000 ],
            [ "президентский", 50000 ]
        ]);

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

        this.slots = [ "🍒", "🍋", "🍉", "⭐", "💎", "🎲", "♦", "♠", "♥", "💵", "🤩"];
        this.savePath = "./casino_data.txt";
        this.robSavePath = "./rob_data.txt";
        this.lastCheckedHour = -1;
    }

    Start() {
        // Подключение Render.com: запускаем HTTP-сервер, чтобы Render не закрывал процесс по таймауту
        const PORT = process.env.PORT || 3000;
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Bot is running on Render.com!\n');
        });
        server.listen(PORT, () => {
            console.log(`HTTP server is listening on port ${PORT} for Render.com`);
        });

        this.LoadData();
        this.ConnectToTwitch();

        // Запуск симуляции Unity Update каждые 1000мс для проверки авто-времени казино
        setInterval(() => {
            this.Update();
        }, 1000);
    }

    Update() { 
        this.CheckAutoCasinoTime(); 
    }

    OnApplicationQuit() {
        this.SaveData();
        this.CloseConnection();
    }

    CloseConnection() {
        try {
            if (this.twitchClient) {
                this.twitchClient.destroy();
            }
        } catch (e) { }
    }

    CheckAutoCasinoTime() {
        let currentHour = new Date().getHours();
        if (currentHour !== this.lastCheckedHour) {
            this.lastCheckedHour = currentHour;
            if (currentHour === 15 && !this.isCasinoOpen) {
                this.isCasinoOpen = true;
                this.SaveData();
                this.Send("🎰 Наступило 15:00! Казино автоматически открыто. Всем удачи в игре! 🎰");
            }
            else if (currentHour === 5 && this.isCasinoOpen) {
                this.isCasinoOpen = false;
                this.SaveData();
                this.Send("🚫 Наступило время закрытия! Казино автоматически закрывается на перерыв.");
            }
        }
    }

    ConnectToTwitch() {
        try {
            this.twitchClient = new net.Socket();
            this.twitchClient.connect(6667, "irc.chat.twitch.tv", () => {
                this.twitchClient.write("PASS " + this.oauth + "\r\n");
                this.twitchClient.write("NICK " + this.botName + "\r\n");
                this.twitchClient.write("JOIN #" + this.channelName.toLowerCase() + "\r\n");
            });

            let buffer = "";
            this.twitchClient.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split("\r\n");
                buffer = lines.pop();

                for (let line of lines) {
                    if (!line) continue;

                    if (line.startsWith("PING")) {
                        this.twitchClient.write("PONG :tmi.twitch.tv\r\n");
                        continue;
                    }

                    if (line.includes("PRIVMSG")) {
                        let userIndex = line.indexOf('!');
                        if (userIndex > 1) {
                            let user = line.substring(1, userIndex).toLowerCase();
                            let messageIndex = line.indexOf(" :", line.indexOf("PRIVMSG"));
                            if (messageIndex !== -1) {
                                let message = line.substring(messageIndex + 2);
                                this.Command(user, message);
                            }
                        }
                    }
                }
            });

            this.twitchClient.on('error', (err) => {
                console.error("Twitch error: " + err.message);
            });
        } catch (e) { }
    }

    Send(msg) {
        if (this.twitchClient && this.twitchClient.writable) {
            this.twitchClient.write("PRIVMSG #" + this.channelName.toLowerCase() + " :" + msg + "\r\n");
        }
    }

    HasRoleOrOwner(user) {
        return this.owners.includes(user);
    }

    GetDisplayName(user) {
        if (this.customNicknames.has(user) && this.customNicknames.get(user)) {
            return this.customNicknames.get(user) + " (@" + user + ")";
        }
        return "@" + user;
    }

    GetProfile(user) {
        if (!this.userProfiles.has(user)) {
            this.userProfiles.set(user, new UserProfile(user));
        }
        
        let profile = this.userProfiles.get(user);
        this.CheckAndApplyHouseTax(profile);
        return profile;
    }

    TryPayChoice(user, profile, cost, choice, payMethodTagObj, failReasonObj) {
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
        }
        else if (choice === "нал") {
            if (profile.balance < cost) {
                failReasonObj.val = "Недостаточно наличных средств! Нужно: " + cost;
                return false;
            }

            profile.balance -= cost;
            payMethodTagObj.val = "!оплата нал";
            return true;
        }

        failReasonObj.val = "Неверный способ оплаты. Используйте '!оплата карта' или '!оплата нал'.";
        return false;
    }

    TryPay(user, profile, cost, payMethodTagObj) {
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
            profile.balance -= cost;
            payMethodTagObj.val = "!оплата нал";
            return true;
        }

        return false;
    }

    CheckAndApplyHouseTax(profile) {
        if (profile.houseType === "Нет" || !this.houseDailyTax.has(profile.houseType)) return;

        let todayStr = new Date().toISOString().slice(0, 10);
        if (!profile.lastTaxDate) {
            profile.lastTaxDate = todayStr;
            return;
        }

        let lastDate = new Date(profile.lastTaxDate);
        let currentDate = new Date();
        let diffTime = Math.abs(currentDate - lastDate);
        let daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (daysPassed > 0) {
            let dailyTax = this.houseDailyTax.get(profile.houseType);
            profile.houseTaxDebt += dailyTax * daysPassed;
            profile.lastTaxDate = todayStr;
            this.SaveData();
        }
    }

    Command(user, message) {
        let text = message.trim();
        let lowerText = text.toLowerCase();
        let profile = this.GetProfile(user); 

        if (!this.coins.has(user)) {
            this.coins.set(user, this.startCoins);
            profile.bankCardBalance = this.startCoins;
            profile.casinoChips = this.startCoins;
            this.shopMoney.set(user, this.startCoins);
            this.SaveData();
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
                    this.SaveData();
                    this.Send("🚨 " + this.GetDisplayName(user) + " отбыл свой срок в тюрьме и вышел на свободу!");
                } else {
                    return;
                }
            } else {
                profile.isImprisoned = false;
                this.SaveData();
            }
        }

        this.CheckDebtStatus(user, profile);

        if (lowerText === "!дом" || lowerText === "!недвижимость") {
            this.Send("🏠 [" + this.GetDisplayName(user) + "] | Жилье: " + profile.houseType + " | Долг по коммуналке: " + profile.houseTaxDebt + " денег.");
            return;
        }

        if (lowerText.startsWith("!купить дом ")) {
            let subText = text.substring(12).Trim();
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

            if (!this.houseCosts.has(houseArg)) {
                this.Send("❌ Неверный тип дома. Доступны: эконом (15000), стандарт (50000), элитный (150000), роскошный (30000), президентский (500000). Пример: !купить дом [стандарт] [!оплата нал/карта]");
                return;
            }

            if (profile.houseType !== "Нет") {
                this.Send("❌ У вас уже есть жилье (" + profile.houseType + ").");
                return;
            }

            let cost = this.houseCosts.get(houseArg);
            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.TryPayChoice(user, profile, cost, choice, payMethodObj, failReasonObj)) {
                this.Send("❌ " + failReasonObj.val);
                return;
            }

            profile.houseType = houseArg;
            profile.lastTaxDate = new Date().toISOString().slice(0, 10);
            profile.houseTaxDebt = 0;
            this.SaveData();

            this.Send("🏡 (" + payMethodObj.val + ") " + this.GetDisplayName(user) + " успешно приобрел дом класса '" + houseArg + "'!");
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
                this.Send("ℹ️ У вас нет недвижимости.");
                return;
            }

            if (profile.houseTaxDebt <= 0) {
                this.Send("✅ У " + this.GetDisplayName(user) + " нет задолженностей по коммуналке.");
                return;
            }

            let debt = profile.houseTaxDebt;
            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.TryPayChoice(user, profile, debt, choice, payMethodObj, failReasonObj)) {
                this.Send("❌ " + failReasonObj.val + " (Нужно: " + debt + ")");
                return;
            }

            profile.houseTaxDebt = 0;
            this.SaveData();

            this.Send("💡 (" + payMethodObj.val + ") " + this.GetDisplayName(user) + " успешно оплатил коммуналку на сумму " + debt + " деняг!");
            return;
        }

        if (lowerText === "!персонаж" || lowerText === "!статус") {
            let cardStatus = profile.isDebtCardBlocked ? "🔴 ЗАБЛОКИРОВАНА" : "🟢 Активна";
            this.Send("👤 [" + this.GetDisplayName(user) + "] Работа: " + profile.job + " | Карта: " + cardStatus + " | Наличные: " + profile.balance + " | Крышки (Казино): " + profile.casinoChips + " 👑");
            return;
        }

        if (lowerText.startsWith("!работа ")) {
            let parts = text.split(' ');
            let targetJob = parts[1].toLowerCase();
            if (this.fixedJobsSalary.has(targetJob) || targetJob === "стример" || targetJob === "блогер" || targetJob === "безработный") {
                profile.job = targetJob;
                this.SaveData();
                this.Send("✅ " + this.GetDisplayName(user) + " устроился на работу: " + targetJob + "!");
            }
            else this.Send("❌ Профессии '" + targetJob + "' не существует.");
            return;
        }

        if (lowerText === "!трудиться" || lowerText === "!смена") {
            if (profile.job === "Безработный") { this.Send("❌ Вы безработный!"); return; }
            
            let todayStr = new Date().toISOString().slice(0, 10);
            if (profile.lastWorkDate === todayStr) {
                this.Send("⏳ Вы уже отработали смену сегодня!");
                return;
            }

            let earned = 0;
            if (this.fixedJobsSalary.has(profile.job)) earned = this.fixedJobsSalary.get(profile.job);
            else if (profile.job === "стример") earned = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;
            else if (profile.job === "блогер") earned = Math.floor(Math.random() * (2000 - 50 + 1)) + 50;
            else if (profile.job === "безработный") earned = Math.floor(Math.random() * (500 - 50 + 1)) + 50;

            profile.balance += earned;
            profile.lastWorkDate = todayStr; 
            this.SaveData();

            this.Send("💰 " + this.GetDisplayName(user) + " отработал смену и заработал " + earned + " денег!");
            return;
        }

        if (lowerText.startsWith("!пополнить карту ") || lowerText.startsWith("!пополнить ")) {
            if (profile.isDebtCardBlocked) {
                this.Send("❌ Ваша банковская карта заблокирована! Пополнение счета невозможно.");
                return;
            }

            let argString = text.substring(text.indexOf(' ') + 1).trim();
            let parts = argString.split(' ');
            let amount = parseInt(parts[0], 10);
            if (parts.length < 1 || isNaN(amount) || amount <= 0) {
                this.Send("❌ Формат: '!пополнить карту [сумма]'");
                return;
            }

            if (profile.balance < amount) {
                this.Send("❌ Недостаточно наличных для пополнения карты! У вас наличными: " + profile.balance);
                return;
            }

            profile.balance -= amount;
            let currentCoins = this.coins.has(user) ? this.coins.get(user) : 0;
            this.coins.set(user, currentCoins + amount);
            profile.bankCardBalance = this.coins.get(user);
            this.SaveData();
            this.Send("💳 " + this.GetDisplayName(user) + " успешно пополнил банковскую карту на " + amount + " деняг! Баланс карты: " + this.coins.get(user));
            return;
        }

        if (lowerText.startsWith("!обналичить ")) {
            let subText = text.substring(11).trim().toLowerCase();
            let parts = subText.split(' ');

            if (parts.length < 2) {
                this.Send("❌ Формат: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'");
                return;
            }

            let source = parts[0];
            let amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                this.Send("❌ Неверная сумма. Формат: '!обналичить нал 500' или '!обналичить карта 500'");
                return;
            }

            if (source === "нал") {
                if (profile.balance < amount) {
                    this.Send("❌ Недостаточно наличных! У вас на руках: " + profile.balance);
                    return;
                }

                profile.balance -= amount;
                profile.casinoChips += amount;
                this.SaveData();
                this.Send("💵 " + this.GetDisplayName(user) + " обменял " + amount + " наличных на " + amount + " фишек 👑!");
                return;
            }
            else if (source === "карта") {
                if (profile.isDebtCardBlocked) {
                    this.Send("❌ Карта заблокирована! Снятие с карты запрещено.");
                    return;
                }

                let cardBal = this.coins.has(user) ? this.coins.get(user) : 0;
                if (cardBal < amount) {
                    this.Send("❌ Недостаточно средств на карте! На карте: " + cardBal);
                    return;
                }

                this.coins.set(user, cardBal - amount);
                profile.bankCardBalance = this.coins.get(user);
                profile.casinoChips += amount;
                this.SaveData();
                this.Send("💳 " + this.GetDisplayName(user) + " купил " + amount + " фишек 👑 с банковской карты! Баланс карты: " + this.coins.get(user));
                return;
            }
            else {
                this.Send("❌ Укажите источник: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'");
                return;
            }
        }

        if (lowerText.startsWith("!вывод ")) {
            let subText = text.substring(7).trim().toLowerCase();
            let parts = subText.split(' ');

            if (parts.length < 2) {
                this.Send("❌ Формат: '!вывод нал [сумма]' или '!вывод карта [сумма]'");
                return;
            }

            let targetDest = parts[0];
            let amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                this.Send("❌ Неверная сумма. Формат: '!вывод нал 500' или '!вывод карта 500'");
                return;
            }

            if (profile.casinoChips < amount) {
                this.Send("❌ Недостаточно фишек в казино! У вас на балансе: " + profile.casinoChips + " 👑");
                return;
            }

            if (targetDest === "нал") {
                profile.casinoChips -= amount;
                profile.balance += amount;
                this.SaveData();
                this.Send("💵 " + this.GetDisplayName(user) + " вывел " + amount + " фишек 👑 в наличные! Баланс на руках: " + profile.balance);
                return;
            }
            else if (targetDest === "карта") {
                if (profile.isDebtCardBlocked) {
                    this.Send("❌ Ваша банковская карта заблокирована! Вывод на карту невозможен.");
                    return;
                }

                profile.casinoChips -= amount;
                let currentCoins = this.coins.has(user) ? this.coins.get(user) : 0;
                this.coins.set(user, currentCoins + amount);
                profile.bankCardBalance = this.coins.get(user);
                this.SaveData();
                this.Send("💳 " + this.GetDisplayName(user) + " вывел " + amount + " фишек 👑 на банковскую карту! Баланс карты: " + this.coins.get(user));
                return;
            }
            else {
                this.Send("❌ Укажите направление: '!вывод нал [сумма]' или '!вывод карта [сумма]'");
                return;
            }
        }

        if (text === "!персонал" || text === "!работники" || text === "!команда") {
            let staffList = [];
            for (let owner of this.owners) {
                let role = this.ownerRoles.has(owner) ? this.ownerRoles.get(owner) : "Сотрудник";
                staffList.push(owner + " (" + role + ")");
            }
            this.Send("👥 ПЕРСОНАЛ КАЗИНО: " + staffList.join(" | "));
            return;
        }

        if (text === "!моя роль") {
            if (!this.owners.includes(user)) { this.Send("❌ Ты не сотрудник казино."); return; }
            let role = this.ownerRoles.has(user) ? this.ownerRoles.get(user) : "Сотрудник";
            this.Send("👤 " + this.GetDisplayName(user) + ", твоя должность: " + role + ".");
            return;
        }

        if (text === "!меню" || text === "!админ") {
            if (!this.owners.includes(user)) { this.Send("❌ Доступно только сотрудникам."); return; }
            
            if (user === "qumosx") {
                this.Send("👑 [ГЛАВНЫЙ БОСС]: !каз откр/закр | !снять каз [сумма] | !снять шоп [сумма] | !снять долг [ник] | !фонд зп | !зарплата");
            }
            else if (user === "gospod_bomzhik") {
                this.Send("🛡️ [ШЕФ СБ]: !снять долг [ник] | !стат [ник] | !шопбанк | !казсчёт");
            }
            else if (user === "miss__krevetka") {
                this.Send("🎰 [ИГРОВОЙ МАСТЕР]: !каз открыть | !каз закрыть | !топказ | !стат [ник]");
            }
            return;
        }

        if (text === "!инфа" || text === "!помощь" || text === "!help") {
            this.Send("🎰 КАЗИНО: *100# | !каз [ставка] (!оплата карта / !оплата нал) | !топказ | !вывод нал/карта [сум]");
            this.Send("🛒 МАГАЗИН: !магазин | !мойшоп | !чек [товар] | !купить [товар/ник]");
            this.Send("🏠 ЖИЛЬЕ: !дом | !купить дом [тип] (!оплата карта/нал) | !оплатить налог (!оплата карта/нал)");
            this.Send("💼 РАБОТА: !работа [проф] | !трудиться | !пополнить карту [сум] | !обналичить нал/карта [сум]");
            this.Send("❓ ПРОЧЕЕ: !передать [ник] [сум] | !долг [сум] | !вернуть долг (!оплата карта/нал) | !персонаж");
            return;
        }

        if (text.startsWith("!стат") || text.startsWith("!статистика")) {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Доступно сотрудникам казино."); return; }

            let parts = text.split(' ');
            let targetUser = (parts.length >= 2) ? parts[1].toLowerCase().replace("@", "") : user;

            if (!this.coins.has(targetUser)) {
                this.Send("❌ Игрок @" + targetUser + " не найден.");
                return;
            }

            let balance = this.coins.get(targetUser);
            let targetProfile = this.GetProfile(targetUser);
            let cardSt = targetProfile.isDebtCardBlocked ? "🔴 Заблокирована" : "🟢 Активна";

            this.Send("📊 СТАТИСТИКА [" + this.GetDisplayName(targetUser) + "] ➡️ Карта: " + balance + " | Наличные: " + targetProfile.balance + " | Фишки: " + targetProfile.casinoChips + " | Статус карты: " + cardSt + " | Долг: " + (this.debtAmount.has(targetUser) ? this.debtAmount.get(targetUser) : 0));
            return;
        }

        if (text.startsWith("!передать") || text.startsWith("!дать")) {
            if (profile.isDebtCardBlocked) {
                this.Send("❌ Ваша карта заблокирована, переводы недоступны!");
                return;
            }

            let parts = text.split(' ');
            let giveAmount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(giveAmount) || giveAmount <= 0) {
                this.Send("❌ Используй: !передать [ник] [сумма]");
                return;
            }

            let targetUser = parts[1].toLowerCase().replace("@", "");
            if (targetUser === user) { this.Send("❌ Нельзя переводить себе!"); return; }
            let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
            if (userCoins < giveAmount) { this.Send("❌ Недостаточно средств на карте!"); return; }

            if (!this.coins.has(targetUser)) { 
                this.coins.set(targetUser, this.startCoins); 
                this.shopMoney.set(targetUser, this.startCoins); 
            }

            this.coins.set(user, userCoins - giveAmount);
            profile.bankCardBalance = this.coins.get(user);
            let targetCoins = this.coins.get(targetUser);
            this.coins.set(targetUser, targetCoins + giveAmount);
            let targetProf = this.GetProfile(targetUser);
            targetProf.bankCardBalance = this.coins.get(targetUser);
            this.SaveData();

            this.Send("🤝 " + this.GetDisplayName(user) + " передал " + giveAmount + " с карты игроку " + this.GetDisplayName(targetUser) + "!");
            return;
        }

        if (text.startsWith("!долг")) {
            let parts = text.split(' ');
            let debtSum = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(debtSum) || debtSum <= 0) {
                this.Send("❌ Используй: !долг [сумма]");
                return;
            }

            let currentDebt = this.debtAmount.has(user) ? this.debtAmount.get(user) : 0;
            if (currentDebt > 0) { this.Send("❌ У тебя уже есть активный долг: " + currentDebt); return; }

            this.debtAmount.set(user, debtSum);
            this.debtTime.set(user, new Date());
            this.debtBlocked.set(user, false);
            let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
            this.coins.set(user, userCoins + debtSum); 
            profile.bankCardBalance = this.coins.get(user);
            this.SaveData();

            this.Send("💳 " + this.GetDisplayName(user) + " взял в долг " + debtSum + " на карту. Верните в течение 3 дней, иначе карту заблокируют!");
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
            if (currentDebt <= 0) { this.Send("ℹ️ У тебя нет долгов."); return; }

            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.TryPayChoice(user, profile, currentDebt, choice, payMethodObj, failReasonObj)) {
                this.Send("❌ " + failReasonObj.val + " (Нужно для возврата: " + currentDebt + ")");
                return;
            }

            this.debtAmount.set(user, 0);
            this.debtBlocked.set(user, false);
            profile.isDebtCardBlocked = false; 
            this.SaveData();
            this.Send("✅ (" + payMethodObj.val + ") " + this.GetDisplayName(user) + " полностью погасил долг! Карта разблокирована.");
            return;
        }

        if (text.startsWith("!снять долг")) {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            let parts = text.split(' ');
            if (parts.length < 3) { this.Send("❌ Используй: !снять долг [ник]"); return; }

            let targetUser = parts[2].toLowerCase().replace("@", "");
            this.debtAmount.set(targetUser, 0);
            this.debtBlocked.set(targetUser, false);
            this.GetProfile(targetUser).isDebtCardBlocked = false;
            this.SaveData();
            this.Send("✅ Долг игрока " + this.GetDisplayName(targetUser) + " аннулирован сотрудником.");
            return;
        }

        if (text === "!фонд зп") {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            this.Send("💼 Фонд зарплаты: " + this.salaryBank + " крышек.");
            return;
        }

        if (text === "!зарплата" || text === "!зп") {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            if (this.salaryBank <= 0) { this.Send("❌ Фонд зарплаты пуст."); return; }

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
                let staffCoins = this.coins.get(staff);
                this.coins.set(staff, staffCoins + personalShare);
                this.GetProfile(staff).bankCardBalance = this.coins.get(staff);
            }

            this.SaveData();
            this.Send("💰 Зарплата успешно распределена сотрудникам на карты!");
            return;
        }

        if (text === "!каз открыть" || text === "!казино открыть") {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            this.isCasinoOpen = true;
            this.SaveData();
            this.Send("🎰 Казино открыто!!");
            return;
        }

        if (text === "!каз закрыть" || text === "!казино закрыть") {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            this.isCasinoOpen = false;
            this.SaveData();
            this.Send("🚫 Казино закрыто.");
            return;
        }

        if (text.startsWith("!снять каз")) {
            if (user !== "qumosx") { this.Send("❌ Только Главный Босс может снимать деньги с банка Казино."); return; }
            let parts = text.split(' ');
            let amount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(amount) || amount <= 0) return;
            if (this.casinoBank < amount) { this.Send("❌ Не хватает средств в казне."); return; }
            this.casinoBank -= amount;
            let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
            this.coins.set(user, userCoins + amount);
            profile.bankCardBalance = this.coins.get(user);
            this.SaveData();
            this.Send("💸 Босс снял " + amount + " со счета казино.");
            return;
        }

        if (text === "!казсчёт") {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            this.Send("🏦 Банк казино: " + this.casinoBank + " крышек.");
            return;
        }

        if (text === "!шопбанк") {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            this.Send("🛒 Банк магазина: " + this.shopBank + " крышек.");
            return;
        }

        if (text.startsWith("!снять шоп")) {
            if (!this.HasRoleOrOwner(user)) { this.Send("❌ Нет прав."); return; }
            let parts = text.split(' ');
            let amount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(amount) || amount <= 0) return;
            if (this.shopBank < amount) { this.Send("❌ Недостаточно средств."); return; }
            this.shopBank -= amount;
            let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
            this.coins.set(user, userCoins + amount);
            profile.bankCardBalance = this.coins.get(user);
            this.SaveData();
            this.Send("💸 Снято из банка магазина: " + amount);
            return;
        }

        if (text === "!*100#" || text === "*100#") {
            let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
            this.Send("💰 " + this.GetDisplayName(user) + " | Фишки казино: " + profile.casinoChips + " 👑 | Наличные: " + profile.balance + " | Карта: " + userCoins);
            return;
        }

        if (text === "!шопбаланс" || text === "!мойшоп" || text === "!моитовары") {
            let shopBal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
            this.Send("🛒 " + this.GetDisplayName(user) + ", баланс в магазине: " + shopBal + " крышек.");
            return;
        }

        if (text === "!топказ") {
            let topPlayers = Array.from(this.userProfiles.entries()).sort((a, b) => b[1].casinoChips - a[1].casinoChips).slice(0, 5);
            let topList = [];
            for (let i = 0; i < topPlayers.length; i++) {
                let playerName = topPlayers[i][0];
                let displayN = this.customNicknames.has(playerName) ? this.customNicknames.get(playerName) : playerName;
                topList.push((i + 1) + ". " + displayN + " (" + topPlayers[i][1].casinoChips + " 👑)");
            }
            this.Send("🏆 ТОП-5 БОГАЧЕЙ (по фишкам): " + topList.join(" | "));
            return;
        }

        if (text === "!магазин" || text === "!шоп") {
            this.Send("🛒 МАГАЗИН: 💎 вип | 🍀 удача | 🛡️ щит | 🔥 дубль | 🎰 спин | ⚡ мегащит | 🌟 джекпот | 💥 трипл | 🎯 суперудача | 🧲 магнит | 💉 хил | 🚀 ультрадубль | 🛡️ гигащит | 🐀 крысокороль | 🪙 золотойбатон | 💼 сейфдолг | ⏳ таймварп | 🌀 омниспин | 🥷 теневойспин | 🤖 киберкрыса | 🕵️ мафия | ☢️ ядерныйспин | ⚗️ алхимик | 👻 фантом | 👑 роялбатон | 🧱 титанщит | ⚡ богудача | 🔑 матрица | 🏴 синдикат | 👑 абсолют | ✏️ ник [имя]");
            return;
        }

        if (text.startsWith("!чек")) {
            let arg = text.substring(4).trim().toLowerCase();
            if (arg === "вип") { this.Send("💎 ВИП (10k): Статус элитного игрока."); return; }
            if (arg === "удача") { this.Send("🍀 Удача (15k): Выше шанс выигрыша."); return; }
            this.Send("ℹ️ Используй: !чек [название бонуса]");
            return;
        }

        if (text.startsWith("!купить ")) {
            let itemArgs = text.substring(8).trim();
            let itemLower = itemArgs.toLowerCase();
            let price = 10000; 
            let itemName = "";
            let targetDict = null;

            if (itemLower === "вип") { price = 10000; itemName = "VIP"; targetDict = this.vipBonus; }
            else if (itemLower === "удача") { price = 15000; itemName = "Удача"; targetDict = this.luckBonus; }
            else if (itemLower === "щит") { price = 12000; itemName = "Щит"; targetDict = this.shieldBonus; }
            else if (itemLower === "дубль") { price = 20000; itemName = "Дубль"; targetDict = this.doubleBonus; }
            else if (itemLower === "спин") { price = 5000; itemName = "Спин"; targetDict = this.freeSpin; }
            else if (itemLower === "мегащит") { price = 25000; itemName = "Мегащит"; targetDict = this.megaShieldBonus; }
            else if (itemLower === "джекпот") { price = 30000; itemName = "Джекпот"; targetDict = this.jackpotBonus; }
            else if (itemLower === "трипл") { price = 22000; itemName = "Трипл"; targetDict = this.tripleBonus; }
            else if (itemLower === "суперудача") { price = 35000; itemName = "Суперудача"; targetDict = this.superLuckBonus; }
            else if (itemLower === "магнит") { price = 18000; itemName = "Магнит"; targetDict = this.magnetBonus; }
            else if (itemLower === "хил") { price = 8000; itemName = "Хил"; targetDict = this.healBonus; }
            else if (itemLower === "ультрадубль") { price = 40000; itemName = "Ультрадубль"; targetDict = this.ultraDoubleBonus; }
            else if (itemLower === "гигащит") { price = 45000; itemName = "Гигащит"; targetDict = this.gigaShieldBonus; }
            else if (itemLower === "крысокороль") { price = 50000; itemName = "Крысокороль"; targetDict = this.ratKingBonus; }
            else if (itemLower === "золотойбатон") { price = 60000; itemName = "Золотой батон"; targetDict = this.goldenBatonBonus; }
            else if (itemLower === "сейфдолг") { price = 15000; itemName = "Сейфдолг"; targetDict = this.safeDebtBonus; }
            else if (itemLower === "таймварп") { price = 35000; itemName = "Таймварп"; targetDict = this.timeWarpBonus; }
            else if (itemLower === "омниспин") { price = 55000; itemName = "Омниспин"; targetDict = this.omniSpinBonus; }
            else if (itemLower === "теневойспин") { price = 30000; itemName = "Теневой спин"; targetDict = this.shadowSpinBonus; }
            else if (itemLower === "киберкрыса") { price = 45000; itemName = "Киберкрыса"; targetDict = this.cyberRatBonus; }
            else if (itemLower === "мафия") { price = 50000; itemName = "Мафия"; targetDict = this.mafiaCoverBonus; }
            else if (itemLower === "ядерныйспин") { price = 100000; itemName = "Ядерный спин"; targetDict = this.nuclearSpinBonus; }
            else if (itemLower === "алхимик") { price = 25000; itemName = "Алхимик"; targetDict = this.alchemistBonus; }
            else if (itemLower === "фантом") { price = 20000; itemName = "Фантом"; targetDict = this.phantomWinBonus; }
            else if (itemLower === "роялбатон") { price = 75000; itemName = "Роял батон"; targetDict = this.royalBatonBonus; }
            else if (itemLower === "титанщит") { price = 60000; itemName = "Титан щит"; targetDict = this.titanShieldBonus; }
            else if (itemLower === "богудача") { price = 90000; itemName = "Бог удача"; targetDict = this.godLuckBonus; }
            else if (itemLower === "матрица") { price = 70000; itemName = "Матрица"; targetDict = this.matrixKeyBonus; }
            else if (itemLower === "синдикат") { price = 85000; itemName = "Синдикат"; targetDict = this.syndicateBonus; }
            else if (itemLower === "абсолют") { price = 150000; itemName = "Абсолют"; targetDict = this.absoluteKingBonus; }
            else if (itemLower.startsWith("ник ")) {
                price = 50000;
                let newNick = itemArgs.Substring(4).trim();
                if (newNick) {
                    let shopBal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
                    if (shopBal < price) {
                        this.Send("❌ Недостаточно средств для смены ника! Нужно: " + price);
                        return;
                    }
                    this.shopMoney.set(user, shopBal - price);
                    this.shopBank += Math.floor(price / 2);
                    this.customNicknames.set(user, newNick);
                    this.SaveData();
                    this.Send("✏️ Ник успешно изменен на: " + newNick);
                    return;
                }
            }

            if (price > 0 && targetDict !== null) {
                let shopBal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
                if (shopBal < price) {
                    this.Send("❌ Недостаточно средств в магазине! Нужно: " + price);
                    return;
                }
                this.shopMoney.set(user, shopBal - price);
                this.shopBank += Math.floor(price / 2);
                let currentBonus = targetDict.has(user) ? targetDict.get(user) : 0;
                targetDict.set(user, currentBonus + 1);
                this.SaveData();
                this.Send("🛒 Успешно куплено: " + itemName);
                return;
            }
        }

        if (text.startsWith("!каз")) {
            if (!this.isCasinoOpen) { this.Send("🚫 Казино закрыто!"); return; }

            let subText = text.substring(4).trim();
            let bet = parseInt(subText, 10);
            if (isNaN(bet) || bet <= 0) { 
                this.Send("❌ Используй: !каз [ставка]"); 
                return; 
            }

            if (profile.casinoChips < bet) {
                this.Send("❌ Недостаточно фишек для ставки! У вас фишек: " + profile.casinoChips + " 👑. Обменяйте наличные или карту через !обналичить нал/карта [сумма]");
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
                let currentShopMoney = this.shopMoney.has(user) ? this.shopMoney.get(user) : this.startCoins;
                this.shopMoney.set(user, currentShopMoney + shopBonusIncome);
                this.Send("🎰 [" + a + " | " + b + " | " + c + "] — 🏆 " + this.GetDisplayName(user) + " выиграл " + win + " фишек! (Баланс: " + profile.casinoChips + " 👑)");
            } else {
                this.Send("🎰 [" + a + " | " + b + " | " + c + "] — ❌ " + this.GetDisplayName(user) + " проиграл " + bet + " фишек. (Остаток: " + profile.casinoChips + " 👑)");
            }
            this.SaveData();
            return;
        }
    }

    CheckDebtStatus(user, profile) {
        if (this.debtAmount.has(user) && this.debtAmount.get(user) > 0) {
            let debtStartTime = this.debtTime.get(user);
            let spanHours = (new Date() - debtStartTime) / (1000 * 60 * 60);

            if (spanHours >= 72) {
                if (!profile.isDebtCardBlocked) {
                    profile.isDebtCardBlocked = true;
                    this.SaveData();
                    this.Send("🚨 [БАНК] Внимание! У " + this.GetDisplayName(user) + " просрочка кредита более 3-х дней! Кредитная карта заблокирована. Ей больше нельзя оплачивать, только наличными!");
                }

                if (spanHours >= 96 && profile.houseType !== "Нет") {
                    this.Send("⚠️ [БАНК] Предупреждение для " + this.GetDisplayName(user) + ": в связи с неуплатой долга ваше имущество (дом: " + profile.houseType + ") конфисковано банком!");
                    profile.houseType = "Нет";
                    profile.houseTaxDebt = 0;
                    this.SaveData();
                }

                if (spanHours >= 120) {
                    let currentDebt = this.debtAmount.get(user);
                    let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
                    if (userCoins < currentDebt && profile.balance < currentDebt) {
                        profile.isImprisoned = true;
                        
                        let releaseDate = new Date();
                        releaseDate.setHours(releaseDate.getHours() + 24);
                        profile.prisonReleaseTime = releaseDate.toISOString().slice(0, 19).replace('T', ' ');
                        
                        this.debtAmount.set(user, 0);
                        profile.isDebtCardBlocked = false;
                        this.SaveData();

                        this.Send("⚖️ [СУД] У " + this.GetDisplayName(user) + " нет средств для выплаты долга. По решению суда он отправлен в тюрьму на 24 часа! Долг аннулирован.");
                    }
                }
            } else if (this.debtBlocked.has(user) && this.debtBlocked.get(user)) {
                if (spanHours > 23 && !profile.isDebtCardBlocked) {
                    this.debtBlocked.set(user, true);
                    let userCoins = this.coins.has(user) ? this.coins.get(user) : 0;
                    this.coins.set(user, Math.max(0, userCoins - this.debtAmount.get(user)));
                    profile.bankCardBalance = this.coins.get(user);
                    this.SaveData();
                }
            }
        }
    }

    LoadData() {
        try {
            if (fs.existsSync(this.savePath)) {
                let fileContent = fs.readFileSync(this.savePath, 'utf8');
                let lines = fileContent.split(/\r?\n/);
                for (let line of lines) {
                    let parts = line.split(':');
                    if (parts.length >= 2) {
                        if (parts[0] === "COIN" && parts.length >= 3) {
                            this.coins.set(parts[1], parseInt(parts[2], 10));
                            this.GetProfile(parts[1]).bankCardBalance = parseInt(parts[2], 10);
                        }
                        else if (parts[0] === "SHOP" && parts.length >= 3) this.shopMoney.set(parts[1], parseInt(parts[2], 10));
                        else if (parts[0] === "CBANK" && parts.length >= 2) this.casinoBank = parseInt(parts[1], 10);
                        else if (parts[0] === "SBANK" && parts.length >= 2) this.shopBank = parseInt(parts[1], 10);
                        else if (parts[0] === "SALARY" && parts.length >= 2) this.salaryBank = parseInt(parts[1], 10);
                        else if (parts[0] === "NICK" && parts.length >= 3) this.customNicknames.set(parts[1], parts[2]);
                        else if (parts[0] === "JOB" && parts.length >= 3) this.GetProfile(parts[1]).job = parts[2];
                        else if (parts[0] === "MONEY" && parts.length >= 3) this.GetProfile(parts[1]).balance = parseInt(parts[2], 10);
                        else if (parts[0] === "CHIPS" && parts.length >= 3) this.GetProfile(parts[1]).casinoChips = parseInt(parts[2], 10);
                        else if (parts[0] === "WORKDATE" && parts.length >= 3) this.GetProfile(parts[1]).lastWorkDate = parts[2];
                        else if (parts[0] === "HOUSETYPE" && parts.length >= 3) this.GetProfile(parts[1]).houseType = parts[2];
                        else if (parts[0] === "HOUSEDEDB" && parts.length >= 3) this.GetProfile(parts[1]).houseTaxDebt = parseInt(parts[2], 10);
                        else if (parts[0] === "HOUSETDATE" && parts.length >= 3) this.GetProfile(parts[1]).lastTaxDate = parts[2];
                        else if (parts[0] === "CARDLOCK" && parts.length >= 3) this.GetProfile(parts[1]).isDebtCardBlocked = (parts[2] === 'true');
                        else if (parts[0] === "PRISON" && parts.length >= 3) this.GetProfile(parts[1]).isImprisoned = (parts[2] === 'true');
                        else if (parts[0] === "PRISONT" && parts.length >= 3) this.GetProfile(parts[1]).prisonReleaseTime = parts[2];
                    }
                }
            }
        } catch (e) { }
    }

    SaveData() {
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

            fs.writeFileSync(this.savePath, lines.join("\n"), 'utf8');
        } catch (e) { }
    }
}

const casino = new TwitchCasino();
casino.Start();