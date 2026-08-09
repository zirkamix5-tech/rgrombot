const net = require('net');
const fs = require('fs');
const path = require('path');

class UserProfile {
    constructor() {
        this.username = "";
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

        // Поля для викторины
        this.quizScore = 0;

        // Поля для семьи
        this.spouse = null;
        this.familyHouse = "Нет";
    }
}

// ==========================================
// 1. МОДУЛЬ: КАЗИНО (TwitchCasino)
// ==========================================
class TwitchCasino {
    constructor(masterBot) {
        this.master = masterBot;
        
        this.owners = ["qumosx", "r0ma_gr0m", "gospod_bomzhik", "miss__krevetka"];
        this.ownerRoles = {
            "qumosx": "Главный Босс",
            "gospod_bomzhik": "Шеф СБ",
            "miss__krevetka": "Игровой Мастер"
        };

        this.casinoBank = 1000000;
        this.shopBank = 0; 
        this.salaryBank = 0; 
        this.isCasinoOpen = true;
        this.lastCheckedHour = -1;

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

        this.slots = ["🍒", "🍋", "🍉", "⭐", "💎", "🎲", "♦", "♠", "♥", "💵", "🤩"];
    }

    CheckAutoCasinoTime() {
        let currentHour = new Date().getHours();
        if (currentHour !== this.lastCheckedHour) {
            this.lastCheckedHour = currentHour;
            if (currentHour === 15 && !this.isCasinoOpen) {
                this.isCasinoOpen = true;
                this.master.SaveData();
                this.master.Send("🎰 Наступило 15:00! Казино автоматически открыто. Всем удачи в игре! 🎰");
            } else if (currentHour === 5 && this.isCasinoOpen) {
                this.isCasinoOpen = false;
                this.master.SaveData();
                this.master.Send("🚫 Наступило время закрытия! Казино автоматически закрывается на перерыв.");
            }
        }
    }

    HasRoleOrOwner(user) {
        return this.owners.includes(user);
    }

    CheckAndApplyHouseTax(profile) {
        if (profile.houseType === "Нет" || !this.houseDailyTax[profile.houseType]) return;

        let todayStr = new Date().toISOString().split('T')[0];
        if (!profile.lastTaxDate) {
            profile.lastTaxDate = todayStr;
            return;
        }

        let lastDate = new Date(profile.lastTaxDate);
        let currentDate = new Date();
        let diffTime = currentDate.setHours(0,0,0,0) - lastDate.setHours(0,0,0,0);
        let daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (daysPassed > 0) {
            let dailyTax = this.houseDailyTax[profile.houseType];
            profile.houseTaxDebt += dailyTax * daysPassed;
            profile.lastTaxDate = todayStr;
            this.master.SaveData();
        }
    }

    Command(user, text, lowerText, profile) {
        if (lowerText === "!дом" || lowerText === "!недвижимость") {
            this.master.Send("🏠 [" + this.master.GetDisplayName(user) + "] | Жилье: " + profile.houseType + " | Долг по коммуналке: " + profile.houseTaxDebt + " денег.");
            return true;
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
                this.master.Send("❌ Неверный тип дома. Доступны: эконом (15000), стандарт (50000), элитный (150000), роскошный (300000), президентский (700000). Пример: !купить дом [стандарт] [!оплата нал/карта]");
                return true;
            }

            if (profile.houseType !== "Нет") {
                this.master.Send("❌ У вас уже есть жилье (" + profile.houseType + ").");
                return true;
            }

            let cost = this.houseCosts[houseArg];
            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.master.TryPayChoice(user, profile, cost, choice, payMethodObj, failReasonObj)) {
                this.master.Send("❌ " + failReasonObj.val);
                return true;
            }

            profile.houseType = houseArg;
            profile.lastTaxDate = new Date().toISOString().split('T')[0];
            profile.houseTaxDebt = 0;
            this.master.SaveData();

            this.master.Send("🏡 (" + payMethodObj.val + ") " + this.master.GetDisplayName(user) + " успешно приобрел дом класса '" + houseArg + "'!");
            return true;
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
                this.master.Send("ℹ️ У вас нет недвижимости.");
                return true;
            }

            if (profile.houseTaxDebt <= 0) {
                this.master.Send("✅ У " + this.master.GetDisplayName(user) + " нет задолженностей по коммуналке.");
                return true;
            }

            let debt = profile.houseTaxDebt;
            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.master.TryPayChoice(user, profile, debt, choice, payMethodObj, failReasonObj)) {
                this.master.Send("❌ " + failReasonObj.val + " (Нужно: " + debt + ")");
                return true;
            }

            profile.houseTaxDebt = 0;
            this.master.SaveData();

            this.master.Send("💡 (" + payMethodObj.val + ") " + this.master.GetDisplayName(user) + " успешно оплатил коммуналку на сумму " + debt + " деняг!");
            return true;
        }

        if (lowerText === "!персонаж" || lowerText === "!статус") {
            let cardStatus = profile.isDebtCardBlocked ? "🔴 ЗАБЛОКИРОВАНА" : "🟢 Активна";
            this.master.Send("👤 [" + this.master.GetDisplayName(user) + "] Работа: " + profile.job + " | Карта: " + cardStatus + " | Наличные: " + profile.balance + " | Крышки (Казино): " + profile.casinoChips + " 👑");
            return true;
        }

        if (lowerText.startsWith("!работа ")) {
            let parts = text.split(' ');
            let targetJob = parts[1].toLowerCase();
            if (this.fixedJobsSalary[targetJob] !== undefined || targetJob === "стример" || targetJob === "блогер" || targetJob === "безработный") {
                profile.job = targetJob;
                this.master.SaveData();
                this.master.Send("✅ " + this.master.GetDisplayName(user) + " устроился на работу: " + targetJob + "!");
            } else {
                this.master.Send("❌ Профессии '" + targetJob + "' не существует.");
            }
            return true;
        }

        if (lowerText === "!трудиться" || lowerText === "!смена") {
            if (profile.job === "Безработный") { 
                this.master.Send("❌ Вы безработный!"); 
                return true; 
            }
            
            let todayStr = new Date().toISOString().split('T')[0];
            if (profile.lastWorkDate === todayStr) {
                this.master.Send("⏳ Вы уже отработали смену сегодня!");
                return true;
            }

            let earned = 0;
            if (this.fixedJobsSalary[profile.job] !== undefined) {
                earned = this.fixedJobsSalary[profile.job];
            } else if (profile.job === "стример") {
                earned = Math.floor(Math.random() * (1500 - 100 + 1)) + 100;
            } else if (profile.job === "блогер") {
                earned = Math.floor(Math.random() * (2000 - 50 + 1)) + 50;
            } else if (profile.job === "безработный") {
                earned = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
            }

            profile.balance += earned;
            profile.lastWorkDate = todayStr; 
            this.master.SaveData();

            this.master.Send("💰 " + this.master.GetDisplayName(user) + " отработал смену и заработал " + earned + " денег!");
            return true;
        }

        if (lowerText.startsWith("!пополнить карту ") || lowerText.startsWith("!пополнить ")) {
            if (profile.isDebtCardBlocked) {
                this.master.Send("❌ Ваша банковская карта заблокирована! Пополнение счета невозможно.");
                return true;
            }

            let argString = text.substring(text.indexOf(' ') + 1).trim();
            let parts = argString.split(' ');
            let amount = parseInt(parts[0], 10);
            if (parts.length < 1 || isNaN(amount) || amount <= 0) {
                this.master.Send("❌ Формат: '!пополнить карту [сумма]'");
                return true;
            }

            if (profile.balance < amount) {
                this.master.Send("❌ Недостаточно наличных для пополнения карты! У вас наличными: " + profile.balance);
                return true;
            }

            profile.balance -= amount;
            this.master.coins[user] += amount;
            profile.bankCardBalance = this.master.coins[user];
            this.master.SaveData();
            this.master.Send("💳 " + this.master.GetDisplayName(user) + " успешно пополнил банковскую карту на " + amount + " деняг! Баланс карты: " + this.master.coins[user]);
            return true;
        }

        if (lowerText.startsWith("!обналичить ")) {
            let subText = text.substring(11).trim().toLowerCase();
            let parts = subText.split(' ');

            if (parts.length < 2) {
                this.master.Send("❌ Формат: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'");
                return true;
            }

            let source = parts[0];
            let amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                this.master.Send("❌ Неверная сумма. Формат: '!обналичить нал 500' или '!обналичить карта 500'");
                return true;
            }

            if (source === "нал") {
                if (profile.balance < amount) {
                    this.master.Send("❌ Недостаточно наличных! У вас на руках: " + profile.balance);
                    return true;
                }

                profile.balance -= amount;
                profile.casinoChips += amount;
                this.master.SaveData();
                this.master.Send("💵 " + this.master.GetDisplayName(user) + " обменял " + amount + " наличных на " + amount + " фишек 👑!");
                return true;
            } else if (source === "карта") {
                if (profile.isDebtCardBlocked) {
                    this.master.Send("❌ Карта заблокирована! Снятие с карты запрещено.");
                    return true;
                }

                let cardBal = this.master.coins[user] !== undefined ? this.master.coins[user] : 0;
                if (cardBal < amount) {
                    this.master.Send("❌ Недостаточно средств на карте! На карте: " + cardBal);
                    return true;
                }

                this.master.coins[user] -= amount;
                profile.bankCardBalance = this.master.coins[user];
                profile.casinoChips += amount;
                this.master.SaveData();
                this.master.Send("💳 " + this.master.GetDisplayName(user) + " купил " + amount + " фишек 👑 с банковской карты! Баланс карты: " + this.master.coins[user]);
                return true;
            } else {
                this.master.Send("❌ Укажите источник: '!обналичить нал [сумма]' или '!обналичить карта [сумма]'");
                return true;
            }
        }

        if (lowerText.startsWith("!вывод ")) {
            let subText = text.substring(7).trim().toLowerCase();
            let parts = subText.split(' ');

            if (parts.length < 2) {
                this.master.Send("❌ Формат: '!вывод нал [сумма]' или '!вывод карта [сумма]'");
                return true;
            }

            let targetDest = parts[0];
            let amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                this.master.Send("❌ Неверная сумма. Формат: '!вывод нал 500' или '!вывод карта 500'");
                return true;
            }

            if (profile.casinoChips < amount) {
                this.master.Send("❌ Недостаточно фишек в казино! У вас на балансе: " + profile.casinoChips + " 👑");
                return true;
            }

            if (targetDest === "нал") {
                profile.casinoChips -= amount;
                profile.balance += amount;
                this.master.SaveData();
                this.master.Send("💵 " + this.master.GetDisplayName(user) + " вывел " + amount + " фишек 👑 в наличные! Баланс на руках: " + profile.balance);
                return true;
            } else if (targetDest === "карта") {
                if (profile.isDebtCardBlocked) {
                    this.master.Send("❌ Ваша банковская карта заблокирована! Вывод на карту невозможен.");
                    return true;
                }

                profile.casinoChips -= amount;
                this.master.coins[user] += amount;
                profile.bankCardBalance = this.master.coins[user];
                this.master.SaveData();
                this.master.Send("💳 " + this.master.GetDisplayName(user) + " вывел " + amount + " фишек 👑 на банковскую карту! Баланс карты: " + this.master.coins[user]);
                return true;
            } else {
                this.master.Send("❌ Укажите направление: '!вывод нал [сумма]' или '!вывод карта [сумма]'");
                return true;
            }
        }

        if (text === "!персонал" || text === "!работники" || text === "!команда") {
            let staffList = [];
            for (let owner of this.owners) {
                let role = this.ownerRoles[owner] ? this.ownerRoles[owner] : "Сотрудник";
                staffList.push(owner + " (" + role + ")");
            }
            this.master.Send("👥 ПЕРСОНАЛ КАЗИНО: " + staffList.join(" | "));
            return true;
        }

        if (text === "!моя роль") {
            if (!this.owners.includes(user)) { 
                this.master.Send("❌ Ты не сотрудник казино."); 
                return true; 
            }
            let role = this.ownerRoles[user] ? this.ownerRoles[user] : "Сотрудник";
            this.master.Send("👤 " + this.master.GetDisplayName(user) + ", твоя должность: " + role + ".");
            return true;
        }

        if (text === "!меню" || text === "!админ") {
            if (!this.owners.includes(user)) { 
                this.master.Send("❌ Доступно только сотрудникам."); 
                return true; 
            }
            
            if (user === "qumosx") {
                this.master.Send("👑 [ГЛАВНЫЙ БОСС]: !каз откр/закр | !снять каз [сумма] | !снять шоп [сумма] | !снять долг [ник] | !фонд зп | !зарплата");
            } else if (user === "gospod_bomzhik") {
                this.master.Send("🛡️ [ШЕФ СБ]: !снять долг [ник] | !стат [ник] | !шопбанк | !казсчёт");
            } else if (user === "miss__krevetka") {
                this.master.Send("🎰 [ИГРОВОЙ МАСТЕР]: !каз открыть | !каз закрыть | !топказ | !стат [ник]");
            }
            return true;
        }

        if (text === "!инфа" || text === "!помощь" || text === "!help") {
            this.master.Send("🎰 КАЗИНО: *100# | !каз [ставка] (!оплата карта / !оплата нал) | !топказ | !вывод нал/карта [сум]");
            this.master.Send("🛒 МАГАЗИН: !магазин | !мойшоп | !чек [товар] | !купить [товар/ник]");
            this.master.Send("🏠 ЖИЛЬЕ: !дом | !купить дом [тип] (!оплата карта/нал) | !оплатить налог (!оплата карта/нал)");
            this.master.Send("💼 РАБОТА: !работа [проф] | !трудиться | !пополнить карту [сум] | !обналичить нал/карта [сум]");
            this.master.Send("❓ ПРОЧЕЕ: !передать [ник] [сум] | !долг [сум] | !вернуть долг (!оплата карта/нал) | !персонаж | !викторина | !семья");
            return true;
        }

        if (text.startsWith("!стат") || text.startsWith("!статистика")) {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Доступно сотрудникам казино."); 
                return true; 
            }

            let parts = text.split(' ');
            let targetUser = (parts.length >= 2) ? parts[1].toLowerCase().replace("@", "") : user;

            if (this.master.coins[targetUser] === undefined) {
                this.master.Send("❌ Игрок @" + targetUser + " не найден.");
                return true;
            }

            let balance = this.master.coins[targetUser];
            let targetProfile = this.master.GetProfile(targetUser);
            let cardSt = targetProfile.isDebtCardBlocked ? "🔴 Заблокирована" : "🟢 Активна";

            this.master.Send("📊 СТАТИСТИКА [" + this.master.GetDisplayName(targetUser) + "] ➡️ Карта: " + balance + " | Наличные: " + targetProfile.balance + " | Фишки: " + targetProfile.casinoChips + " | Статус карты: " + cardSt + " | Долг: " + (this.master.debtAmount[targetUser] ? this.master.debtAmount[targetUser] : 0));
            return true;
        }

        if (text.startsWith("!передать") || text.startsWith("!дать")) {
            if (profile.isDebtCardBlocked) {
                this.master.Send("❌ Ваша карта заблокирована, переводы недоступны!");
                return true;
            }

            let parts = text.split(' ');
            let giveAmount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(giveAmount) || giveAmount <= 0) {
                this.master.Send("❌ Используй: !передать [ник] [сумма]");
                return true;
            }

            let targetUser = parts[1].toLowerCase().replace("@", "");
            if (targetUser === user) { 
                this.master.Send("❌ Нельзя переводить себе!"); 
                return true; 
            }
            if (this.master.coins[user] < giveAmount) { 
                this.master.Send("❌ Недостаточно средств на карте!"); 
                return true; 
            }

            if (this.master.coins[targetUser] === undefined) { 
                this.master.coins[targetUser] = this.master.startCoins; 
                this.master.shopMoney[targetUser] = this.master.startCoins; 
            }

            this.master.coins[user] -= giveAmount;
            profile.bankCardBalance = this.master.coins[user];
            this.master.coins[targetUser] += giveAmount;
            let targetProf = this.master.GetProfile(targetUser);
            targetProf.bankCardBalance = this.master.coins[targetUser];
            this.master.SaveData();

            this.master.Send("🤝 " + this.master.GetDisplayName(user) + " передал " + giveAmount + " с карты игроку " + this.master.GetDisplayName(targetUser) + "!");
            return true;
        }

        if (text.startsWith("!долг")) {
            let parts = text.split(' ');
            let debtSum = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(debtSum) || debtSum <= 0) {
                this.master.Send("❌ Используй: !долг [сумма]");
                return true;
            }

            let currentDebt = this.master.debtAmount[user] ? this.master.debtAmount[user] : 0;
            if (currentDebt > 0) { 
                this.master.Send("❌ У тебя уже есть активный долг: " + currentDebt); 
                return true; 
            }

            this.master.debtAmount[user] = debtSum;
            this.master.debtTime[user] = new Date();
            this.master.debtBlocked[user] = false;
            this.master.coins[user] += debtSum; 
            profile.bankCardBalance = this.master.coins[user];
            this.master.SaveData();

            this.master.Send("💳 " + this.master.GetDisplayName(user) + " взял в долг " + debtSum + " на карту. Верните в течение 3 дней, иначе карту заблокируют!");
            return true;
        }

        if (text.startsWith("!вернуть долг")) {
            let choice = "карта";
            if (text.includes("!оплата ")) {
                let payIdx = text.indexOf("!оплата ");
                let payPart = text.substring(payIdx + 8).trim().toLowerCase();
                if (payPart.startsWith("карта")) choice = "карта";
                else if (payPart.startsWith("нал")) choice = "нал";
            }

            let currentDebt = this.master.debtAmount[user] ? this.master.debtAmount[user] : 0;
            if (currentDebt <= 0) { 
                this.master.Send("ℹ️ У тебя нет долгов."); 
                return true; 
            }

            let payMethodObj = { val: "" };
            let failReasonObj = { val: "" };
            if (!this.master.TryPayChoice(user, profile, currentDebt, choice, payMethodObj, failReasonObj)) {
                this.master.Send("❌ " + failReasonObj.val + " (Нужно для возврата: " + currentDebt + ")");
                return true;
            }

            this.master.debtAmount[user] = 0;
            this.master.debtBlocked[user] = false;
            profile.isDebtCardBlocked = false; 
            this.master.SaveData();
            this.master.Send("✅ (" + payMethodObj.val + ") " + this.master.GetDisplayName(user) + " полностью погасил долг! Карта разблокирована.");
            return true;
        }

        if (text.startsWith("!снять долг")) {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            let parts = text.split(' ');
            if (parts.length < 3) { 
                this.master.Send("❌ Используй: !снять долг [ник]"); 
                return true; 
            }

            let targetUser = parts[2].toLowerCase().replace("@", "");
            this.master.debtAmount[targetUser] = 0;
            this.master.debtBlocked[targetUser] = false;
            this.master.GetProfile(targetUser).isDebtCardBlocked = false;
            this.master.SaveData();
            this.master.Send("✅ Долг игрока " + this.master.GetDisplayName(targetUser) + " аннулирован сотрудником.");
            return true;
        }

        if (text === "!фонд зп") {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            this.master.Send("💼 Фонд зарплаты: " + this.salaryBank + " крышек.");
            return true;
        }

        if (text === "!зарплата" || text === "!зп") {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            if (this.salaryBank <= 0) { 
                this.master.Send("❌ Фонд зарплаты пуст."); 
                return true; 
            }

            let totalBank = this.salaryBank;
            let count = this.owners.length;
            let share = Math.floor(totalBank / count);
            let remainder = totalBank % count;

            this.salaryBank = 0;

            for (let i = 0; i < this.owners.length; i++) {
                let staff = this.owners[i];
                if (this.master.coins[staff] === undefined) {
                    this.master.coins[staff] = this.master.startCoins;
                    this.master.shopMoney[staff] = this.master.startCoins;
                }
                let personalShare = share + (i === 0 ? remainder : 0);
                this.master.coins[staff] += personalShare;
                this.master.GetProfile(staff).bankCardBalance = this.master.coins[staff];
            }

            this.master.SaveData();
            this.master.Send("💰 Зарплата успешно распределена сотрудникам на карты!");
            return true;
        }

        if (text === "!каз открыть" || text === "!казино открыть") {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            this.isCasinoOpen = true;
            this.master.SaveData();
            this.master.Send("🎰 Казино открыто!!");
            return true;
        }

        if (text === "!каз закрыть" || text === "!казино закрыть") {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            this.isCasinoOpen = false;
            this.master.SaveData();
            this.master.Send("🚫 Казино закрыто.");
            return true;
        }

        if (text.startsWith("!снять каз")) {
            if (user !== "qumosx") { 
                this.master.Send("❌ Только Главный Босс может снимать деньги с банка Казино."); 
                return true; 
            }
            let parts = text.split(' ');
            let amount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(amount) || amount <= 0) return true;
            if (this.casinoBank < amount) { 
                this.master.Send("❌ Не хватает средств в казне."); 
                return true; 
            }
            this.casinoBank -= amount;
            this.master.coins[user] += amount;
            profile.bankCardBalance = this.master.coins[user];
            this.master.SaveData();
            this.master.Send("💸 Босс снял " + amount + " со счета казино.");
            return true;
        }

        if (text === "!казсчёт") {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            this.master.Send("🏦 Банк казино: " + this.casinoBank + " крышек.");
            return true;
        }

        if (text === "!шопбанк") {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            this.master.Send("🛒 Банк магазина: " + this.shopBank + " крышек.");
            return true;
        }

        if (text.startsWith("!снять шоп")) {
            if (!this.HasRoleOrOwner(user)) { 
                this.master.Send("❌ Нет прав."); 
                return true; 
            }
            let parts = text.split(' ');
            let amount = parseInt(parts[2], 10);
            if (parts.length < 3 || isNaN(amount) || amount <= 0) return true;
            if (this.shopBank < amount) { 
                this.master.Send("❌ Недостаточно средств."); 
                return true; 
            }
            this.shopBank -= amount;
            this.master.coins[user] += amount;
            profile.bankCardBalance = this.master.coins[user];
            this.master.SaveData();
            this.master.Send("💸 Снято из банка магазина: " + amount);
            return true;
        }

        if (text === "!*100#" || text === "*100#") {
            this.master.Send("💰 " + this.master.GetDisplayName(user) + " | Фишки казино: " + profile.casinoChips + " 👑 | Наличные: " + profile.balance + " | Карта: " + this.master.coins[user]);
            return true;
        }

        if (text === "!шопбаланс" || text === "!мойшоп" || text === "!моитовары") {
            let shopBal = this.master.shopMoney[user] !== undefined ? this.master.shopMoney[user] : 0;
            this.master.Send("🛒 " + this.master.GetDisplayName(user) + ", баланс в магазине: " + shopBal + " крышек.");
            return true;
        }

        if (text === "!топказ") {
            let topPlayers = Object.entries(this.master.userProfiles)
                .sort((a, b) => b[1].casinoChips - a[1].casinoChips)
                .slice(0, 5);
                
            let topList = [];
            for (let i = 0; i < topPlayers.length; i++) {
                let playerName = topPlayers[i][0];
                let displayN = this.master.customNicknames[playerName] ? this.master.customNicknames[playerName] : playerName;
                topList.push((i + 1) + ". " + displayN + " (" + topPlayers[i][1].casinoChips + " 👑)");
            }
            this.master.Send("🏆 ТОП-5 БОГАЧЕЙ (по фишкам): " + topList.join(" | "));
            return true;
        }

        if (text === "!магазин" || text === "!шоп") {
            this.master.Send("🛒 МАГАЗИН: 💎 вип | 🍀 удача | 🛡️ щит | 🔥 дубль | 🎰 спин | ⚡ мегащит | 🌟 джекпот | 💥 трипл | 🎯 суперудача | 🧲 магнит | 💉 хил | 🚀 ультрадубль | 🛡️ гигащит | 🐀 крысокороль | 🪙 золотойбатон | 💼 сейфдолг | ⏳ таймварп | 🌀 омниспин | 🥷 теневойспин | 🤖 киберкрыса | 🕵️ мафия | ☢️ ядерныйспин | ⚗️ алхимик | 👻 фантом | 👑 роялбатон | 🧱 титанщит | ⚡ богудача | 🔑 матрица | 🏴 синдикат | 👑 абсолют | ✏️ ник [имя]");
            return true;
        }

        if (text.startsWith("!чек")) {
            let arg = text.substring(4).trim().toLowerCase();
            if (arg === "вип") { 
                this.master.Send("💎 ВИП (10k): Статус элитного игрока."); 
                return true; 
            }
            if (arg === "удача") { 
                this.master.Send("🍀 Удача (15k): Выше шанс выигрыша."); 
                return true; 
            }
            this.master.Send("ℹ️ Используй: !чек [название бонуса]");
            return true;
        }

        if (text.startsWith("!купить ")) {
            let itemArgs = text.substring(8).trim();
            let itemLower = itemArgs.toLowerCase();
            let price = 10000; 
            let itemName = "";
            let targetDict = null;

            if (itemLower === "вип") { price = 10000; itemName = "VIP"; targetDict = this.master.vipBonus; }
            else if (itemLower === "удача") { price = 15000; itemName = "Удача"; targetDict = this.master.luckBonus; }
            else if (itemLower === "щит") { price = 12000; itemName = "Щит"; targetDict = this.master.shieldBonus; }
            else if (itemLower === "дубль") { price = 20000; itemName = "Дубль"; targetDict = this.master.doubleBonus; }
            else if (itemLower === "спин") { price = 5000; itemName = "Спин"; targetDict = this.master.freeSpin; }
            else if (itemLower === "мегащит") { price = 25000; itemName = "Мегащит"; targetDict = this.master.megaShieldBonus; }
            else if (itemLower === "джекпот") { price = 30000; itemName = "Джекпот"; targetDict = this.master.jackpotBonus; }
            else if (itemLower === "трипл") { price = 22000; itemName = "Трипл"; targetDict = this.master.tripleBonus; }
            else if (itemLower === "суперудача") { price = 35000; itemName = "Суперудача"; targetDict = this.master.superLuckBonus; }
            else if (itemLower === "магнит") { price = 18000; itemName = "Магнит"; targetDict = this.master.magnetBonus; }
            else if (itemLower === "хил") { price = 8000; itemName = "Хил"; targetDict = this.master.healBonus; }
            else if (itemLower === "ультрадубль") { price = 40000; itemName = "Ультрадубль"; targetDict = this.master.ultraDoubleBonus; }
            else if (itemLower === "гигащит") { price = 45000; itemName = "Гигащит"; targetDict = this.master.gigaShieldBonus; }
            else if (itemLower === "крысокороль") { price = 50000; itemName = "Крысокороль"; targetDict = this.master.ratKingBonus; }
            else if (itemLower === "золотойбатон") { price = 60000; itemName = "Золотой батон"; targetDict = this.master.goldenBatonBonus; }
            else if (itemLower === "сейфдолг") { price = 15000; itemName = "Сейфдолг"; targetDict = this.master.safeDebtBonus; }
            else if (itemLower === "таймварп") { price = 35000; itemName = "Таймварп"; targetDict = this.master.timeWarpBonus; }
            else if (itemLower === "омниспин") { price = 55000; itemName = "Омниспин"; targetDict = this.master.omniSpinBonus; }
            else if (itemLower === "теневойспин") { price = 30000; itemName = "Теневой спин"; targetDict = this.master.shadowSpinBonus; }
            else if (itemLower === "киберкрыса") { price = 45000; itemName = "Киберкрыса"; targetDict = this.master.cyberRatBonus; }
            else if (itemLower === "мафия") { price = 50000; itemName = "Мафия"; targetDict = this.master.mafiaCoverBonus; }
            else if (itemLower === "ядерныйспин") { price = 100000; itemName = "Ядерный спин"; targetDict = this.master.nuclearSpinBonus; }
            else if (itemLower === "алхимик") { price = 25000; itemName = "Алхимик"; targetDict = this.master.alchemistBonus; }
            else if (itemLower === "фантом") { price = 20000; itemName = "Фантом"; targetDict = this.master.phantomWinBonus; }
            else if (itemLower === "роялбатон") { price = 75000; itemName = "Роял батон"; targetDict = this.master.royalBatonBonus; }
            else if (itemLower === "титанщит") { price = 60000; itemName = "Титан щит"; targetDict = this.master.titanShieldBonus; }
            else if (itemLower === "богудача") { price = 90000; itemName = "Бог удача"; targetDict = this.master.godLuckBonus; }
            else if (itemLower === "матрица") { price = 70000; itemName = "Матрица"; targetDict = this.master.matrixKeyBonus; }
            else if (itemLower === "синдикат") { price = 85000; itemName = "Синдикат"; targetDict = this.master.syndicateBonus; }
            else if (itemLower === "абсолют") { price = 150000; itemName = "Абсолют"; targetDict = this.master.absoluteKingBonus; }
            else if (itemLower.startsWith("ник ")) {
                price = 50000;
                let newNick = itemArgs.substring(4).trim();
                if (newNick && newNick !== "") {
                    let shopBal = this.master.shopMoney[user] !== undefined ? this.master.shopMoney[user] : 0;
                    if (shopBal < price) {
                        this.master.Send("❌ Недостаточно средств для смены ника! Нужно: " + price);
                        return true;
                    }
                    this.master.shopMoney[user] -= price;
                    this.shopBank += Math.floor(price / 2);
                    this.master.customNicknames[user] = newNick;
                    this.master.SaveData();
                    this.master.Send("✏️ Ник успешно изменен на: " + newNick);
                    return true;
                }
            }

            if (price > 0 && targetDict) {
                let shopBal = this.master.shopMoney[user] !== undefined ? this.master.shopMoney[user] : 0;
                if (shopBal < price) {
                    this.master.Send("❌ Недостаточно средств в магазине! Нужно: " + price);
                    return true;
                }
                this.master.shopMoney[user] -= price;
                this.shopBank += Math.floor(price / 2);
                if (targetDict[user] === undefined) targetDict[user] = 0;
                targetDict[user]++;
                this.master.SaveData();
                this.master.Send("🛒 Успешно куплено: " + itemName);
                return true;
            }
        }

        if (text.startsWith("!каз")) {
            if (!this.isCasinoOpen) { 
                this.master.Send("🚫 Казино закрыто!"); 
                return true; 
            }

            let subText = text.substring(4).trim();
            let bet = parseInt(subText, 10);
            if (isNaN(bet) || bet <= 0) { 
                this.master.Send("❌ Используй: !каз [ставка]"); 
                return true; 
            }

            if (profile.casinoChips < bet) {
                this.master.Send("❌ Недостаточно фишек для ставки! У вас фишек: " + profile.casinoChips + " 👑. Обменяйте наличные или карту через !обналичить нал/карта [сумма]");
                return true;
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
                if (this.master.shopMoney[user] === undefined) this.master.shopMoney[user] = this.master.startCoins;
                this.master.shopMoney[user] += shopBonusIncome;
                this.master.Send("🎰 [" + a + " | " + b + " | " + c + "] — 🏆 " + this.master.GetDisplayName(user) + " выиграл " + win + " фишек! (Баланс: " + profile.casinoChips + " 👑)");
            } else {
                this.master.Send("🎰 [" + a + " | " + b + " | " + c + "] — ❌ " + this.master.GetDisplayName(user) + " проиграл " + bet + " фишек. (Остаток: " + profile.casinoChips + " 👑)");
            }
            this.master.SaveData();
            return true;
        }

        return false;
    }
}


// ==========================================
// 2. МОДУЛЬ: ВИКТОРИНА (TwitchQuiz)
// ==========================================
class TwitchQuiz {
    constructor(masterBot) {
        this.master = masterBot;
        this.questions = [
            { q: "Столица Украины?", a: "киев" },
            { q: "Сколько будет 2 + 2 * 2?", a: "6" },
            { q: "Самая большая планета Солнечной системы?", a: "юпитер" },
            { q: "Какой язык программирования используется для этого бота?", a: "javascript" },
            { q: "На какой платформе идут эти стримы?", a: "twitch" }
        ];
        this.currentQuestion = null;
        this.isQuizActive = false;
    }

    StartQuiz() {
        if (this.isQuizActive) return;
        let randomIndex = Math.floor(Math.random() * this.questions.length);
        this.currentQuestion = this.questions[randomIndex];
        this.isQuizActive = true;
        this.master.Send("❓ [ВИКТОРИНА] Вопрос: " + this.currentQuestion.q + " (Ответьте в чате через '!ответ [ваш ответ]')");
    }

    Command(user, text, lowerText, profile) {
        if (lowerText === "!викторина" || lowerText === "!квиз") {
            if (!this.isQuizActive) {
                this.StartQuiz();
            } else {
                this.master.Send("❓ Активный вопрос: " + this.currentQuestion.q);
            }
            return true;
        }

        if (lowerText.startsWith("!ответ ")) {
            if (!this.isQuizActive) {
                this.master.Send("❌ Сейчас нет активной викторины. Запустите ее командой '!викторина'.");
                return true;
            }

            let userAnswer = text.substring(7).trim().toLowerCase();
            if (userAnswer === this.currentQuestion.a) {
                profile.quizScore += 1;
                profile.casinoChips += 500; // Награда за правильный ответ
                this.master.SaveData();
                this.master.Send("🎉 Верно! " + this.master.GetDisplayName(user) + " отгадал загадку и получает 500 фишек 👑! (Счет квиза: " + profile.quizScore + ")");
                this.isQuizActive = false;
                this.currentQuestion = null;
            } else {
                this.master.Send("❌ Неправильно, " + this.master.GetDisplayName(user) + ". Попробуйте еще раз!");
            }
            return true;
        }

        if (lowerText === "!топквиз" || lowerText === "!топвикторина") {
            let topQuiz = Object.entries(this.master.userProfiles)
                .sort((a, b) => b[1].quizScore - a[1].quizScore)
                .slice(0, 5);
                
            let topList = [];
            for (let i = 0; i < topQuiz.length; i++) {
                let playerName = topQuiz[i][0];
                let displayN = this.master.customNicknames[playerName] ? this.master.customNicknames[playerName] : playerName;
                topList.push((i + 1) + ". " + displayN + " (" + topQuiz[i][1].quizScore + " очков)");
            }
            this.master.Send("🏆 ТОП ЗНАТОКОВ ВИКТОРИНЫ: " + topList.join(" | "));
            return true;
        }

        return false;
    }
}


// ==========================================
// 3. МОДУЛЬ: СЕМЬЯ (TwitchFamily)
// ==========================================
class TwitchFamily {
    constructor(masterBot) {
        this.master = masterBot;
        this.proposals = {}; // кто кому предложил
    }

    Command(user, text, lowerText, profile) {
        if (lowerText === "!семья" || lowerText === "!брак") {
            let spouseName = profile.spouse ? this.master.GetDisplayName(profile.spouse) : "Нет";
            this.master.Send("💍 [" + this.master.GetDisplayName(user) + "] | Супруг(а): " + spouseName + " | Семейный дом: " + profile.familyHouse);
            return true;
        }

        if (lowerText.startsWith("!предложение ") || lowerText.startsWith("!жениться ")) {
            let targetUser = text.substring(text.indexOf(' ') + 1).trim().toLowerCase().replace("@", "");
            if (targetUser === user) {
                this.master.Send("❌ Нельзя жениться на самом себе!");
                return true;
            }

            if (profile.spouse) {
                this.master.Send("❌ Вы уже состоите в браке!");
                return true;
            }

            let targetProf = this.master.GetProfile(targetUser);
            if (targetProf.spouse) {
                this.master.Send("❌ Этот пользователь уже состоит в браке!");
                return true;
            }

            this.proposals[targetUser] = user;
            this.master.Send("💌 " + this.master.GetDisplayName(user) + " сделал предложение руки и сердца игроку " + this.master.GetDisplayName(targetUser) + "! Напишите '!согласиться' для свадьбы.");
            return true;
        }

        if (lowerText === "!согласиться" || lowerText === "!принять") {
            let proposer = this.proposals[user];
            if (!proposer) {
                this.master.Send("❌ Вам никто не делал предложений.");
                return true;
            }

            let proposerProf = this.master.GetProfile(proposer);
            if (proposerProf.spouse || profile.spouse) {
                this.master.Send("❌ Кто-то из вас уже состоит в браке.");
                delete this.proposals[user];
                return true;
            }

            profile.spouse = proposer;
            proposerProf.spouse = user;
            delete this.proposals[user];
            this.master.SaveData();

            this.master.Send("🔔 💒 ГОРЬКО! Игрок " + this.master.GetDisplayName(proposer) + " и игроком " + this.master.GetDisplayName(user) + " официально поженились!");
            return true;
        }

        if (lowerText === "!развод") {
            if (!profile.spouse) {
                this.master.Send("❌ Вы не состоите в браке.");
                return true;
            }

            let exSpouse = profile.spouse;
            let exSpouseProf = this.master.GetProfile(exSpouse);

            profile.spouse = null;
            if (exSpouseProf) exSpouseProf.spouse = null;
            this.master.SaveData();

            this.master.Send("💔 " + this.master.GetDisplayName(user) + " развелся с игроком " + this.master.GetDisplayName(exSpouse) + ".");
            return true;
        }

        return false;
    }
}


// ==========================================
// 4. МОДУЛЬ: ПРИВЕТСТВИЕ (TwitchGreetings)
// ==========================================
class TwitchGreetings {
    constructor(masterBot) {
        this.master = masterBot;
        this.greetedUsers = {};
    }

    CheckGreeting(user) {
        let todayStr = new Date().toISOString().split('T')[0];
        if (!this.greetedUsers[user] || this.greetedUsers[user] !== todayStr) {
            this.greetedUsers[user] = todayStr;
            this.master.Send("👋 Приветствуем на стриме, " + this.master.GetDisplayName(user) + "! Рады видеть вас в чате! Напишите '!помощь' для списка команд.");
        }
    }

    Command(user, text, lowerText, profile) {
        if (lowerText === "!привет" || lowerText === "!хай" || lowerText === "!ку") {
            this.master.Send("👋 Привет-привет, " + this.master.GetDisplayName(user) + "! Отличного настроения на трансляции!");
            return true;
        }
        return false;
    }
}


// ==========================================
// ГЛАВНЫЙ КЛАСС БОТА (Интегратор всех 4 скриптов)
// ==========================================
class MasterTwitchBot {
    constructor() {
        // Настройки Twitch
        this.botName = "RGROMBOT";
        this.oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";
        this.channelName = "QumosX";

        this.twitchClient = null;
        this.readBuffer = "";

        this.startCoins = 0;
        this.coins = {}; // Баланс карты
        this.shopMoney = {};
        this.customNicknames = {};
        this.userProfiles = {};

        this.debtAmount = {};
        this.debtTime = {};
        this.debtBlocked = {};

        this.vipBonus = {};          
        this.luckBonus = {};          
        this.shieldBonus = {};        
        this.doubleBonus = {};        
        this.freeSpin = {};          
        this.megaShieldBonus = {};    
        this.jackpotBonus = {};      
        this.tripleBonus = {};        
        this.superLuckBonus = {};    
        this.magnetBonus = {};        
        this.healBonus = {};          
        this.ultraDoubleBonus = {};    
        this.gigaShieldBonus = {};    
        this.ratKingBonus = {};        
        this.goldenBatonBonus = {};    
        this.safeDebtBonus = {};      
        this.timeWarpBonus = {};      
        this.omniSpinBonus = {};      
        this.shadowSpinBonus = {};    
        this.cyberRatBonus = {};      
        this.mafiaCoverBonus = {};    
        this.nuclearSpinBonus = {};    
        this.alchemistBonus = {};      
        this.phantomWinBonus = {};    
        this.royalBatonBonus = {};    
        this.titanShieldBonus = {};    
        this.godLuckBonus = {};        
        this.matrixKeyBonus = {};      
        this.syndicateBonus = {};      
        this.absoluteKingBonus = {};  

        this.savePath = path.join(process.cwd(), "casino_data.txt");

        // Инициализация 4 модулей
        this.casinoModule = new TwitchCasino(this);
        this.quizModule = new TwitchQuiz(this);
        this.familyModule = new TwitchFamily(this);
        this.greetingsModule = new TwitchGreetings(this);

        this.init();
    }

    init() {
        this.LoadData();
        this.ConnectToTwitch();
        
        setInterval(() => {
            this.casinoModule.CheckAutoCasinoTime();
        }, 60000);

        process.on('SIGINT', () => {
            this.SaveData();
            process.exit();
        });
    }

    ConnectToTwitch() {
        try {
            this.twitchClient = new net.Socket();
            this.twitchClient.connect(6667, 'irc.chat.twitch.tv', () => {
                this.twitchClient.write("PASS " + this.oauth + "\r\n");
                this.twitchClient.write("NICK " + this.botName + "\r\n");
                this.twitchClient.write("JOIN #" + this.channelName.toLowerCase() + "\r\n");
            });

            this.twitchClient.on('data', (data) => {
                this.readBuffer += data.toString();
                let lines = this.readBuffer.split("\r\n");
                this.readBuffer = lines.pop();

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
                                this.RouteCommand(user, message);
                            }
                        }
                    }
                }
            });

            this.twitchClient.on('error', (err) => {});
            this.twitchClient.on('close', () => {
                setTimeout(() => {
                    this.ConnectToTwitch();
                }, 5000);
            });
        } catch (e) {}
    }

    Send(msg) {
        if (this.twitchClient && this.twitchClient.writable) {
            this.twitchClient.write("PRIVMSG #" + this.channelName.toLowerCase() + " :" + msg + "\r\n");
        }
    }

    GetDisplayName(user) {
        if (this.customNicknames[user] && this.customNicknames[user].trim() !== "") {
            return this.customNicknames[user] + " (@" + user + ")";
        }
        return "@" + user;
    }

    GetProfile(user) {
        if (!this.userProfiles[user]) {
            let p = new UserProfile();
            p.username = user;
            this.userProfiles[user] = p;
        }
        
        this.casinoModule.CheckAndApplyHouseTax(this.userProfiles[user]);
        return this.userProfiles[user];
    }

    TryPayChoice(user, profile, cost, choice, payMethodTagObj, failReasonObj) {
        let userCoins = this.coins[user] !== undefined ? this.coins[user] : 0;

        if (choice === "карта") {
            if (profile.isDebtCardBlocked) {
                failReasonObj.val = "Ваша банковская карта заблокирована! Ей нельзя оплачивать, используйте наличные (!оплата нал).";
                return false;
            }
            if (userCoins < cost) {
                failReasonObj.val = "Недостаточно средств на банковской карте! Нужно: " + cost;
                return false;
            }

            this.coins[user] = userCoins - Number(cost);
            profile.bankCardBalance = this.coins[user];
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

    RouteCommand(user, message) {
        let text = message.trim();
        let lowerText = text.toLowerCase();
        let profile = this.GetProfile(user); 

        if (this.coins[user] === undefined) {
            this.coins[user] = this.startCoins;
            profile.bankCardBalance = this.startCoins;
            profile.casinoChips = this.startCoins;
            this.shopMoney[user] = this.startCoins;
            this.SaveData();
        } else {
            profile.bankCardBalance = this.coins[user];
        }
        if (this.shopMoney[user] === undefined) {
            this.shopMoney[user] = this.startCoins;
        }

        // Проверка приветствия при первом сообщении за день
        this.greetingsModule.CheckGreeting(user);

        if (profile.isImprisoned) {
            if (profile.prisonReleaseTime && profile.prisonReleaseTime !== "") {
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

        // Проверка статуса долгов
        this.CheckDebtStatus(user, profile);

        // Распределение команд по 4 подключенным скриптам/модулям:
        // 1. Приветствие
        if (this.greetingsModule.Command(user, text, lowerText, profile)) return;
        // 2. Викторина
        if (this.quizModule.Command(user, text, lowerText, profile)) return;
        // 3. Семья
        if (this.familyModule.Command(user, text, lowerText, profile)) return;
        // 4. Казино (и основные фин./рабочие команды)
        if (this.casinoModule.Command(user, text, lowerText, profile)) return;
    }

    CheckDebtStatus(user, profile) {
        if (this.debtAmount[user] && this.debtAmount[user] > 0) {
            let debtTimeVal = new Date(this.debtTime[user]);
            let diffHours = (new Date() - debtTimeVal) / (1000 * 60 * 60);

            if (diffHours >= 72) {
                if (!profile.isDebtCardBlocked) {
                    profile.isDebtCardBlocked = true;
                    this.SaveData();
                    this.Send("🚨 [БАНК] Внимание! У " + this.GetDisplayName(user) + " просрочка кредита более 3-х дней! Кредитная карта заблокирована. Ей больше нельзя оплачивать, только наличными!");
                }

                if (diffHours >= 96 && profile.houseType !== "Нет") {
                    this.Send("⚠️ [БАНК] Предупреждение для " + this.GetDisplayName(user) + ": в связи с неуплатой долга ваше имущество (дом: " + profile.houseType + ") конфисковано банком!");
                    profile.houseType = "Нет";
                    profile.houseTaxDebt = 0;
                    this.SaveData();
                }

                if (diffHours >= 120) {
                    let currentDebt = this.debtAmount[user];
                    if (this.coins[user] < currentDebt && profile.balance < currentDebt) {
                        profile.isImprisoned = true;
                        let releaseDate = new Date();
                        releaseDate.setHours(releaseDate.getHours() + 24);
                        profile.prisonReleaseTime = releaseDate.toISOString().replace('T', ' ').substring(0, 19);
                        
                        this.debtAmount[user] = 0;
                        profile.isDebtCardBlocked = false;
                        this.SaveData();

                        this.Send("⚖️ [СУД] У " + this.GetDisplayName(user) + " нет средств для выплаты долга. По решению суда он отправлен в тюрьму на 24 часа! Долг аннулирован.");
                    }
                }
            } else if (this.debtBlocked[user] && this.debtBlocked[user]) {
                if (diffHours > 23 && !profile.isDebtCardBlocked) {
                    this.debtBlocked[user] = true;
                    this.coins[user] = Math.max(0, this.coins[user] - this.debtAmount[user]);
                    profile.bankCardBalance = this.coins[user];
                    this.SaveData();
                }
            }
        }
    }

    LoadData() {
        try {
            if (fs.existsSync(this.savePath)) {
                let data = fs.readFileSync(this.savePath, 'utf8');
                let lines = data.split(/\r?\n/);
                for (let line of lines) {
                    let parts = line.split(':');
                    if (parts.length >= 2) {
                        if (parts[0] === "COIN" && parts.length >= 3) {
                            this.coins[parts[1]] = parseInt(parts[2], 10);
                            this.GetProfile(parts[1]).bankCardBalance = parseInt(parts[2], 10);
                        } else if (parts[0] === "SHOP" && parts.length >= 3) {
                            this.shopMoney[parts[1]] = parseInt(parts[2], 10);
                        } else if (parts[0] === "CBANK" && parts.length >= 2) {
                            this.casinoModule.casinoBank = parseInt(parts[1], 10);
                        } else if (parts[0] === "SBANK" && parts.length >= 2) {
                            this.casinoModule.shopBank = parseInt(parts[1], 10);
                        } else if (parts[0] === "SALARY" && parts.length >= 2) {
                            this.casinoModule.salaryBank = parseInt(parts[1], 10);
                        } else if (parts[0] === "NICK" && parts.length >= 3) {
                            this.customNicknames[parts[1]] = parts.slice(2).join(":");
                        } else if (parts[0] === "JOB" && parts.length >= 3) {
                            this.GetProfile(parts[1]).job = parts.slice(2).join(":");
                        } else if (parts[0] === "MONEY" && parts.length >= 3) {
                            this.GetProfile(parts[1]).balance = parseInt(parts[2], 10);
                        } else if (parts[0] === "CHIPS" && parts.length >= 3) {
                            this.GetProfile(parts[1]).casinoChips = parseInt(parts[2], 10);
                        } else if (parts[0] === "WORKDATE" && parts.length >= 3) {
                            this.GetProfile(parts[1]).lastWorkDate = parts[2];
                        } else if (parts[0] === "HOUSETYPE" && parts.length >= 3) {
                            this.GetProfile(parts[1]).houseType = parts[2];
                        } else if (parts[0] === "HOUSEDEDB" && parts.length >= 3) {
                            this.GetProfile(parts[1]).houseTaxDebt = parseInt(parts[2], 10);
                        } else if (parts[0] === "HOUSETDATE" && parts.length >= 3) {
                            this.GetProfile(parts[1]).lastTaxDate = parts[2];
                        } else if (parts[0] === "CARDLOCK" && parts.length >= 3) {
                            this.GetProfile(parts[1]).isDebtCardBlocked = (parts[2] === "true");
                        } else if (parts[0] === "PRISON" && parts.length >= 3) {
                            this.GetProfile(parts[1]).isImprisoned = (parts[2] === "true");
                        } else if (parts[0] === "PRISONT" && parts.length >= 3) {
                            this.GetProfile(parts[1]).prisonReleaseTime = parts.slice(2).join(":");
                        } else if (parts[0] === "QUIZ" && parts.length >= 3) {
                            this.GetProfile(parts[1]).quizScore = parseInt(parts[2], 10);
                        } else if (parts[0] === "SPOUSE" && parts.length >= 3) {
                            this.GetProfile(parts[1]).spouse = parts[2];
                        }
                    }
                }
            }
        } catch (e) {}
    }

    SaveData() {
        try {
            let lines = [];
            lines.push("CBANK:" + this.casinoModule.casinoBank);
            lines.push("SBANK:" + this.casinoModule.shopBank);
            lines.push("SALARY:" + this.casinoModule.salaryBank);

            for (let key in this.coins) {
                lines.push("COIN:" + key + ":" + this.coins[key]);
            }
            for (let key in this.shopMoney) {
                lines.push("SHOP:" + key + ":" + this.shopMoney[key]);
            }
            for (let key in this.customNicknames) {
                lines.push("NICK:" + key + ":" + this.customNicknames[key]);
            }
            for (let key in this.userProfiles) {
                let p = this.userProfiles[key];
                lines.push("JOB:" + key + ":" + p.job);
                lines.push("MONEY:" + key + ":" + p.balance);
                lines.push("CHIPS:" + key + ":" + p.casinoChips);
                if (p.quizScore > 0) {
                    lines.push("QUIZ:" + key + ":" + p.quizScore);
                }
                if (p.spouse) {
                    lines.push("SPOUSE:" + key + ":" + p.spouse);
                }
                if (p.lastWorkDate && p.lastWorkDate !== "") {
                    lines.push("WORKDATE:" + key + ":" + p.lastWorkDate);
                }
                if (p.houseType && p.houseType !== "") {
                    lines.push("HOUSETYPE:" + key + ":" + p.houseType);
                    lines.push("HOUSEDEDB:" + key + ":" + p.houseTaxDebt);
                    lines.push("HOUSETDATE:" + key + ":" + p.lastTaxDate);
                }
                if (p.isDebtCardBlocked) {
                    lines.push("CARDLOCK:" + key + ":" + p.isDebtCardBlocked);
                }
                if (p.isImprisoned) {
                    lines.push("PRISON:" + key + ":" + p.isImprisoned);
                    lines.push("PRISONT:" + key + ":" + p.prisonReleaseTime);
                }
            }

            fs.writeFileSync(this.savePath, lines.join("\n"), 'utf8');
        } catch (e) {}
    }
}

// Запуск единого объединенного бота, объединяющего все 4 скрипта (Казино, Викторина, Семья, Приветствие)
const bot = new MasterTwitchBot();
```[cite: 7]