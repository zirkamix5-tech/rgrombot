const net = require('net');
const fs = require('fs');

class TwitchCasino {
    constructor() {
        this.client = null;
        this.reader = null; // В JS заменяется на буферизацию данных из socket
        this.writer = null;
        this.chatThread = null; // В Node.js асинхронная модель на событиях, отдельный поток не нужен

        this.running = false;

        // Входящие IRC-сообщения складываются сюда фоновым потоком
        // и разбираются в Update() на главном потоке, чтобы не было
        // гонки за доступ к словарям (coins, debts и т.д.)
        this.incomingMessages = [];

        // ==========================
        // TWITCH
        // ==========================

        this.botName = "RGROMBOT";
        this.oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52"; // <-- подставь свой токен
        this.channel = "#QumosX";

        // ==========================
        // БАЛАНСЫ
        // ==========================

        this.coins = new Map();
        this.shopMoney = new Map();

        // ==========================
        // СИСТЕМА ДОЛГА
        // ==========================

        this.maxDebt = 5000;
        this.debts = new Map();
        this.debtTimer = new Map();
        this.casinoDebtBlock = new Map();
        this.debtTime = 600; // 10 минут
        this.debtPercent = 20;

        // ==========================
        // БОНУСЫ
        // ==========================

        this.luckBonus = new Map();
        this.vipBonus = new Map();
        this.doubleBonus = new Map();
        this.shieldBonus = new Map();
        this.freeSpin = new Map();

        // ==========================
        // СОХРАНЕНИЯ
        // ==========================

        this.saveFile = "./CasinoPlayers.txt";
        this.casinoBankFile = "./CasinoBank.txt";
        this.SaveSeparator = ';';

        // ==========================
        // БАНК КАЗИНО
        // ==========================

        this.casinoBank = 0;
        this.casinoPercent = 5;
        this.shopPercent = 5;

        // ==========================
        // ВЛАДЕЛЬЦЫ
        // ==========================

        this.owners = new Set([
            "qumosx",
            "gospod_bomzhik"
        ]);

        // ==========================
        // АНТИ СПАМ
        // ==========================

        this.casinoTimer = new Map();
        this.casinoCooldown = 30;

        this.commandTimer = new Map();
        this.commandCooldown = 3;

        // ==========================
        // СОСТОЯНИЕ
        // ==========================

        this.casinoClosedByOwner = false;

        // ==========================
        // СЛОТЫ
        // ==========================

        this.slots = [
            "🍒", "🍋", "🍉", "⭐", "💎"
        ];
    }

    // Эмуляция Unity Lifecycle Start
    Start() {
        this.LoadData();
        this.LoadCasinoBank();
        this.Connect();

        // Запуск аналога Update и проверки таймеров в Node.js
        setInterval(() => {
            this.Update();
        }, 50); // каждые 50мс
    }

    // Эмуляция Unity Lifecycle OnDestroy
    OnDestroy() {
        this.running = false;

        try { if (this.client) this.client.destroy(); } catch (e) { }
    }

    // ==========================
    // ГЛАВНЫЙ ЦИКЛ
    // ==========================

    Update() {
        // Разбираем накопленные сообщения из чата на главном потоке
        let processedThisFrame = 0;
        while (processedThisFrame < 50 && this.incomingMessages.length > 0) {
            let message = this.incomingMessages.shift();
            try {
                if (message.includes("PRIVMSG")) {
                    this.Command(message);
                }
            } catch (e) {
                console.error("Command error: " + e.message);
            }

            processedThisFrame++;
        }

        // Проверка долгов по таймеру
        let players = Array.from(this.debtTimer.keys());

        for (let user of players) {
            if (!this.debts.has(user)) continue;
            if (this.debts.get(user) <= 0) continue;

            let passed = (Date.now() / 1000) - this.debtTimer.get(user);

            if (passed >= this.debtTime) {
                this.casinoDebtBlock.set(user, true);
            }
        }
    }

    // ==========================
    // ПОДКЛЮЧЕНИЕ TWITCH
    // ==========================

    Connect() {
        try {
            this.client = new net.Socket();
            this.client.setKeepAlive(true, 0);
            
            // Настройка Render.com: используем переменные среды порта для веб-сервера, 
            // чтобы Render не закрывал процесс по таймауту (требование платформы)
            const http = require('http');
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Bot is running on Render.com!\n');
            });
            const PORT = process.env.PORT || 3000;
            server.listen(PORT, () => {
                console.log(`HTTP server is listening on port ${PORT} for Render.com`);
            });

            this.client.connect(6667, "irc.chat.twitch.tv", () => {
                this.client.write("PASS " + this.oauth + "\r\n");
                this.client.write("NICK " + this.botName + "\r\n");
                this.client.write("JOIN " + this.channel + "\r\n");
            });

            this.running = true;

            let buffer = "";
            this.client.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split("\r\n");
                buffer = lines.pop(); // оставляем неполную строку в буфере

                for (let message of lines) {
                    this.ReadChat(message);
                }
            });

            this.client.on('error', (e) => {
                console.error("Twitch ошибка: " + e.message);
            });

            console.log("🎰 Казино подключено!");
        } catch (e) {
            console.error("Twitch ошибка: " + e.message);
        }
    }

    // ==========================
    // ЧТЕНИЕ ЧАТА (фоновый поток / асинхронный обработчик)
    // ==========================

    ReadChat(message) {
        try {
            if (!message) return;

            if (message.startsWith("PING")) {
                this.client.write("PONG :tmi.twitch.tv\r\n");
                return;
            }

            if (message.includes("PRIVMSG")) {
                // Не трогаем словари здесь — только кладём в очередь,
                // обработка идёт в Update() на главном потоке
                this.incomingMessages.push(message);
            }
        } catch (e) {
            console.error("Chat error: " + e.message);
        }
    }

    // ==========================
    // ОБРАБОТКА КОМАНД (главный поток)
    // ==========================

    Command(message) {
        let exclaimIndex = message.indexOf("!");
        let colonSpaceIndex = message.indexOf(" :");

        if (exclaimIndex <= 1 || colonSpaceIndex < 0) return;

        let user = message.substring(1, exclaimIndex).toLowerCase();
        let text = message.substring(colonSpaceIndex + 2).toLowerCase().replace(/[\r\n]+$/, '');

        // ==========================
        // СОЗДАНИЕ ИГРОКА
        // ==========================

        if (!this.coins.has(user)) {
            this.coins.set(user, 1000);
            this.shopMoney.set(user, 0);
            this.debts.set(user, 0);
            this.casinoDebtBlock.set(user, false);

            this.SaveData();
        }

        if (!this.debts.has(user)) this.debts.set(user, 0);
        if (!this.casinoDebtBlock.has(user)) this.casinoDebtBlock.set(user, false);
        if (!this.shopMoney.has(user)) this.shopMoney.set(user, 0);

        // ==========================
        // АНТИ СПАМ КОМАНД
        // ==========================

        if (this.commandTimer.has(user)) {
            let passed = (Date.now() / 1000) - this.commandTimer.get(user);
            if (passed < this.commandCooldown) return;
        }

        this.commandTimer.set(user, Date.now() / 1000);

        // ==========================
        // БАЛАНС
        // ==========================

        if (text === "!баланс") {
            this.Send("💰 " + user + " у тебя " + this.coins.get(user) + " крышек.");
            return;
        }

        // ==========================
        // МОЙ ДОЛГ
        // ==========================

        if (text === "!мойдолг") {
            if (this.debts.get(user) <= 0) {
                this.Send("✅ " + user + " у тебя нет долга.");
            } else {
                let passed = 0;
                if (this.debtTimer.has(user)) {
                    passed = (Date.now() / 1000) - this.debtTimer.get(user);
                }

                let left = Math.floor(this.debtTime - passed);
                if (left < 0) left = 0;

                this.Send("💳 " + user + " долг: " + this.debts.get(user) + " крышек | ⏳ осталось " + left + " сек.");
            }

            return;
        }

        // ==========================
        // ВЗЯТЬ ДОЛГ
        // ==========================

        if (text === "!долг") {
            if (this.debts.get(user) > 0) {
                this.Send("❌ " + user + " у тебя уже есть долг " + this.debts.get(user) + " крышек.");
                return;
            }

            this.debts.set(user, this.maxDebt);
            this.coins.set(user, this.coins.get(user) + this.maxDebt);
            this.debtTimer.set(user, Date.now() / 1000);
            this.casinoDebtBlock.set(user, false);

            this.SaveData();

            this.Send("💳 " + user + " получил долг " + this.maxDebt + " крышек. У тебя есть 10 минут на погашение.");
            return;
        }

        // ==========================
        // ПОГАСИТЬ ДОЛГ
        // ==========================

        if (text === "!погаситьдолг") {
            if (this.debts.get(user) <= 0) {
                this.Send("✅ " + user + " у тебя нет долга.");
                return;
            }

            let payment = Math.min(this.coins.get(user), this.debts.get(user));

            if (payment <= 0) {
                this.Send("❌ У тебя нет крышек.");
                return;
            }

            this.coins.set(user, this.coins.get(user) - payment);
            this.debts.set(user, this.debts.get(user) - payment);

            if (this.debts.get(user) <= 0) {
                this.debts.set(user, 0);
                this.casinoDebtBlock.set(user, false);
                this.debtTimer.delete(user);

                this.Send("✅ " + user + " полностью погасил долг! Казино снова открыто.");
            } else {
                this.Send("💳 " + user + " выплатил " + payment + " крышек. Осталось: " + this.debts.get(user));
            }

            this.SaveData();
            return;
        }

        // ==========================
        // ПЕРЕДАЧА КРЫШЕК
        // ==========================

        if (text.startsWith("!передать")) {
            let data = text.split(' ');

            // Формат: !передать <ник> <сумма>
            if (data.length < 3) {
                this.Send("❌ Используй: !передать ник сумма");
                return;
            }

            let target = data[1].replace(/^@/, '');

            let amount = parseInt(data[2], 10);
            if (isNaN(amount) || amount <= 0) {
                this.Send("❌ Сумма должна быть положительным числом.");
                return;
            }

            if (target === user) {
                this.Send("❌ Нельзя передать крышки самому себе.");
                return;
            }

            if (!this.coins.has(target)) {
                this.Send("❌ Игрок " + target + " ещё не был в казино.");
                return;
            }

            if (this.coins.get(user) < amount) {
                this.Send("❌ " + user + " недостаточно крышек.");
                return;
            }

            this.coins.set(user, this.coins.get(user) - amount);
            this.coins.set(target, this.coins.get(target) + amount);

            this.SaveData();

            this.Send("💸 " + user + " передал " + amount + " крышек игроку " + target);
            return;
        }

        // ==========================
        // ИГРА В КАЗИНО
        // ==========================

        if (text.startsWith("!каз")) {
            if (this.casinoDebtBlock.get(user)) {
                this.Send("🔒 " + user + " тебе закрыто казино. Погаси долг " + this.debts.get(user) + " крышек.");
                return;
            }

            if (this.casinoClosedByOwner) {
                this.Send("🔒 Казино закрыто владельцем.");
                return;
            }

            if (!this.IsCasinoOpen()) {
                this.Send("🔒 Казино работает с 10:00 до 23:59.");
                return;
            }

            let now = Date.now() / 1000;

            if (this.casinoTimer.has(user)) {
                let passed = now - this.casinoTimer.get(user);

                if (passed < this.casinoCooldown) {
                    let wait = Math.floor(this.casinoCooldown - passed);
                    this.Send("⏳ " + user + " подожди " + wait + " секунд.");
                    return;
                }
            }

            this.casinoTimer.set(user, now);

            let bet = 100;
            let betData = text.split(' ');

            if (betData.length > 1) {
                let parsedBet = parseInt(betData[1], 10);
                if (!isNaN(parsedBet)) bet = parsedBet;
            }

            if (bet <= 0) bet = 100;

            let usedFreeSpin = false;

            if (this.freeSpin.has(user) && this.freeSpin.get(user) > 0) {
                usedFreeSpin = true;
                this.freeSpin.set(user, this.freeSpin.get(user) - 1);
            } else {
                if (this.coins.get(user) < bet) {
                    this.Send("❌ " + user + " недостаточно крышек.");
                    return;
                }

                this.coins.set(user, this.coins.get(user) - bet);
            }

            let a = this.slots[Math.floor(Math.random() * this.slots.length)];
            let b = this.slots[Math.floor(Math.random() * this.slots.length)];
            let c = this.slots[Math.floor(Math.random() * this.slots.length)];

            let win = 0;

            if (a === b && b === c) {
                win = bet * 10;
            } else if (a === b || a === c || b === c) {
                win = bet * 3;
            }

            // VIP
            if (this.vipBonus.has(user) && this.vipBonus.get(user) > 0) {
                if (win === 0) win = bet * 2;
                this.vipBonus.set(user, this.vipBonus.get(user) - 1);
            }

            // Удача — небольшой шанс превратить проигрыш в утешительный приз
            if (win === 0 && this.luckBonus.has(user) && this.luckBonus.get(user) > 0) {
                if (Math.floor(Math.random() * 100) < 30) {
                    win = bet;
                }
                this.luckBonus.set(user, this.luckBonus.get(user) - 1);
            }

            // Double
            if (win > 0 && this.doubleBonus.has(user) && this.doubleBonus.get(user) > 0) {
                win *= 2;
                this.doubleBonus.set(user, this.doubleBonus.get(user) - 1);
            }

            let spinTag = usedFreeSpin ? "🎰(free) " : "";

            // Проигрыш
            if (win === 0) {
                if (this.shieldBonus.has(user) && this.shieldBonus.get(user) > 0) {
                    this.shieldBonus.set(user, this.shieldBonus.get(user) - 1);

                    if (!usedFreeSpin) this.coins.set(user, this.coins.get(user) + bet);

                    this.SaveData();

                    this.Send("🛡 " + user + " использовал защиту! Ставка возвращена.");
                    return;
                }

                this.SaveData();

                this.Send(spinTag + user + " [" + a + " | " + b + " | " + c + "] проиграл " + (usedFreeSpin ? 0 : bet) + " крышек.");
                return;
            }

            // Налоги
            let casinoTax = Math.floor(win * this.casinoPercent / 100);
            let shopTax = Math.floor(win * this.shopPercent / 100);
            let playerWin = win - casinoTax - shopTax;

            // Выплата долга
            let debtPayment = 0;

            if (this.debts.get(user) > 0) {
                debtPayment = Math.floor(playerWin * this.debtPercent / 100);

                if (debtPayment > this.debts.get(user)) debtPayment = this.debts.get(user);

                this.debts.set(user, this.debts.get(user) - debtPayment);
                playerWin -= debtPayment;

                if (this.debts.get(user) <= 0) {
                    this.debts.set(user, 0);
                    this.casinoDebtBlock.set(user, false);
                    this.debtTimer.delete(user);

                    this.Send("🎉 " + user + " полностью закрыл долг!");
                }
            }

            this.casinoBank += casinoTax;
            this.shopMoney.set(user, this.shopMoney.get(user) + shopTax);
            this.coins.set(user, this.coins.get(user) + playerWin);

            this.SaveData();
            this.SaveCasinoBank();

            this.Send(spinTag + user + " [" + a + " | " + b + " | " + c + "] выиграл " + win +
                 " 💰 | получил +" + playerWin +
                 " | 💳 долг -" + debtPayment +
                 " | 🏦 казино +" + casinoTax +
                 " | 🛒 магазин +" + shopTax);

            return;
        }

        // ==========================
        // СЧЁТ МАГАЗИНА
        // ==========================

        if (text === "!магазинсчёт") {
            this.Send("🛒 " + user + " счёт магазина: " + this.shopMoney.get(user) + " 💰");
            return;
        }

        // ==========================
        // МАГАЗИН
        // ==========================

        if (text === "!магазин") {
            this.Send("🛒 Магазин казино: 🍀 luck - 5000 | 💎 vip - 15000 | 🔥 double - 20000 | 🛡 shield - 8000 | 🎰 spin - 3000");
            return;
        }

        // ==========================
        // ПОКУПКА БОНУСОВ
        // ==========================

        if (text.startsWith("!купить")) {
            let buy = text.split(' ');

            if (buy.length < 2) {
                this.Send("❌ Используй: !купить название");
                return;
            }

            let item = buy[1];

            if (item === "luck") {
                this.BuyBonus(user, 5000, this.luckBonus, "🍀 Удача");
            } else if (item === "vip") {
                this.BuyBonus(user, 15000, this.vipBonus, "💎 VIP казино");
            } else if (item === "double") {
                this.BuyBonus(user, 20000, this.doubleBonus, "🔥 Двойной куш");
            } else if (item === "shield") {
                this.BuyBonus(user, 8000, this.shieldBonus, "🛡 Защита");
            } else if (item === "spin") {
                this.BuyBonus(user, 3000, this.freeSpin, "🎰 Бесплатный спин");
            } else {
                this.Send("❌ Такого товара нет.");
            }

            return;
        }

        // ==========================
        // ИНВЕНТАРЬ
        // ==========================

        if (text === "!инвентарь") {
            let inv = "🎒 " + user + ": ";
            let empty = true;

            if (this.luckBonus.has(user) && this.luckBonus.get(user) > 0) {
                inv += "🍀luck x" + this.luckBonus.get(user) + " ";
                empty = false;
            }

            if (this.vipBonus.has(user) && this.vipBonus.get(user) > 0) {
                inv += "💎vip x" + this.vipBonus.get(user) + " ";
                empty = false;
            }

            if (this.doubleBonus.has(user) && this.doubleBonus.get(user) > 0) {
                inv += "🔥double x" + this.doubleBonus.get(user) + " ";
                empty = false;
            }

            if (this.shieldBonus.has(user) && this.shieldBonus.get(user) > 0) {
                inv += "🛡shield x" + this.shieldBonus.get(user) + " ";
                empty = false;
            }

            if (this.freeSpin.has(user) && this.freeSpin.get(user) > 0) {
                inv += "🎰spin x" + this.freeSpin.get(user) + " ";
                empty = false;
            }

            if (empty) inv += "пусто";

            this.Send(inv);
            return;
        }

        // ==========================
        // ОТКРЫТЬ КАЗИНО
        // ==========================

        if (text === "!открытьказино") {
            if (!this.owners.has(user)) {
                this.Send("❌ Нет прав.");
                return;
            }

            this.casinoClosedByOwner = false;
            this.Send("🎰 Казино открыто. Владелец: " + user);
            return;
        }

        // ==========================
        // ЗАКРЫТЬ КАЗИНО
        // ==========================

        if (text === "!закрытьказино") {
            if (!this.owners.has(user)) {
                this.Send("❌ Нет прав.");
                return;
            }

            this.casinoClosedByOwner = true;
            this.Send("🔒 Казино закрыто. Владелец: " + user);
            return;
        }

        // ==========================
        // СТАТУС КАЗИНО
        // ==========================

        if (text === "!статусказино") {
            if (this.casinoClosedByOwner) {
                this.Send("🔒 Казино закрыто владельцем.");
            } else if (this.IsCasinoOpen()) {
                this.Send("🎰 Казино открыто!");
            } else {
                this.Send("🔒 Казино работает с 10:00 до 23:59.");
            }

            return;
        }

        // ==========================
        // ТОП
        // ==========================

        if (text === "!топ") {
            this.ShowTop();
            return;
        }
    }

    // ==========================
    // ВРЕМЯ РАБОТЫ КАЗИНО
    // ==========================

    IsCasinoOpen() {
        let hour = new Date().getHours();
        return hour >= 10 && hour <= 23;
    }

    // ==========================
    // ОТПРАВКА СООБЩЕНИЙ В ЧАТ
    // ==========================

    Send(text) {
        try {
            if (this.client) {
                this.client.write("PRIVMSG " + this.channel + " :" + text + "\r\n");
            }
        } catch (e) {
            console.error("Send error: " + e.message);
        }
    }

    // ==========================
    // ПОКУПКА БОНУСА
    // ==========================

    BuyBonus(user, price, bonus, name) {
        if (this.coins.get(user) < price) {
            this.Send("❌ Недостаточно крышек.");
            return;
        }

        this.coins.set(user, this.coins.get(user) - price);

        if (!bonus.has(user)) bonus.set(user, 0);

        bonus.set(user, bonus.get(user) + 1);

        this.SaveData();

        this.Send("✅ " + user + " купил " + name);
    }

    // ==========================
    // ТОП ИГРОКОВ
    // ==========================

    ShowTop() {
        let top = Array.from(this.coins.entries());

        top.sort((a, b) => b[1] - a[1]);

        let result = "👑 Топ казино: ";
        let place = 1;

        for (let player of top) {
            result += "🏅 " + player[0] + "(" + player[1] + ") ";
            place++;
            if (place > 5) break;
        }

        this.Send(result);
    }

    // ==========================
    // СОХРАНЕНИЕ / ЗАГРУЗКА ИГРОКОВ
    // ==========================
    // Формат строки: user;coins;shopMoney;debt;debtTimer;casinoDebtBlock;luck;vip;double;shield;spin

    SaveData() {
        try {
            let lines = [];

            for (let [user, coinVal] of this.coins.entries()) {
                let shopVal = this.shopMoney.has(user) ? this.shopMoney.get(user) : 0;
                let debtVal = this.debts.has(user) ? this.debts.get(user) : 0;
                let timerVal = this.debtTimer.has(user) ? this.debtTimer.get(user) : 0;
                let blockVal = this.casinoDebtBlock.has(user) && this.casinoDebtBlock.get(user);
                let luckVal = this.luckBonus.has(user) ? this.luckBonus.get(user) : 0;
                let vipVal = this.vipBonus.has(user) ? this.vipBonus.get(user) : 0;
                let doubleVal = this.doubleBonus.has(user) ? this.doubleBonus.get(user) : 0;
                let shieldVal = this.shieldBonus.has(user) ? this.shieldBonus.get(user) : 0;
                let spinVal = this.freeSpin.has(user) ? this.freeSpin.get(user) : 0;

                lines.push([
                    user,
                    coinVal.toString(),
                    shopVal.toString(),
                    debtVal.toString(),
                    timerVal.toString(),
                    blockVal.toString(),
                    luckVal.toString(),
                    vipVal.toString(),
                    doubleVal.toString(),
                    shieldVal.toString(),
                    spinVal.toString()
                ].join(this.SaveSeparator));
            }

            fs.writeFileSync(this.saveFile, lines.join("\n"), 'utf8');
        } catch (e) {
            console.error("SaveData error: " + e.message);
        }
    }

    LoadData() {
        try {
            if (!fs.existsSync(this.saveFile)) return;

            let fileContent = fs.readFileSync(this.saveFile, 'utf8');
            let lines = fileContent.split(/\r?\n/);

            for (let line of lines) {
                if (!line || line.trim() === "") continue;

                let parts = line.split(this.SaveSeparator);
                if (parts.length < 4) continue;

                let user = parts[0];

                this.coins.set(user, this.ParseIntSafe(parts, 1, 1000));
                this.shopMoney.set(user, this.ParseIntSafe(parts, 2, 0));
                this.debts.set(user, this.ParseIntSafe(parts, 3, 0));

                if (parts.length > 4) {
                    let timerVal = parseFloat(parts[4]);
                    if (!isNaN(timerVal) && timerVal > 0) this.debtTimer.set(user, timerVal);
                }

                if (parts.length > 5) {
                    let blockVal = parts[5] === 'true';
                    this.casinoDebtBlock.set(user, blockVal);
                } else {
                    this.casinoDebtBlock.set(user, false);
                }

                if (parts.length > 6) this.luckBonus.set(user, this.ParseIntSafe(parts, 6, 0));
                if (parts.length > 7) this.vipBonus.set(user, this.ParseIntSafe(parts, 7, 0));
                if (parts.length > 8) this.doubleBonus.set(user, this.ParseIntSafe(parts, 8, 0));
                if (parts.length > 9) this.shieldBonus.set(user, this.ParseIntSafe(parts, 9, 0));
                if (parts.length > 10) this.freeSpin.set(user, this.ParseIntSafe(parts, 10, 0));
            }
        } catch (e) {
            console.error("LoadData error: " + e.message);
        }
    }

    ParseIntSafe(parts, index, fallback) {
        if (index >= parts.length) return fallback;
        let val = parseInt(parts[index], 10);
        return isNaN(val) ? fallback : val;
    }

    // ==========================
    // СОХРАНЕНИЕ / ЗАГРУЗКА БАНКА КАЗИНО
    // ==========================

    SaveCasinoBank() {
        try {
            fs.writeFileSync(this.casinoBankFile, this.casinoBank.toString(), 'utf8');
        } catch (e) {
            console.error("SaveCasinoBank error: " + e.message);
        }
    }

    LoadCasinoBank() {
        try {
            if (!fs.existsSync(this.casinoBankFile)) return;

            let content = fs.readFileSync(this.casinoBankFile, 'utf8').trim();

            let bankVal = parseInt(content, 10);
            if (!isNaN(bankVal)) {
                this.casinoBank = bankVal;
            }
        } catch (e) {
            console.error("LoadCasinoBank error: " + e.message);
        }
    }
}

// Запуск бота при старте скрипта (для Node.js)
const casinoBot = new TwitchCasino();
casinoBot.Start();