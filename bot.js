const net = require('net');
const fs = require('fs');
const path = require('path');

// ==========================================
// КЛАССЫ И СТРУКТУРЫ ДАННЫХ ИЗ SKRIPT 5 (Casino/Economy)
// ==========================================
class UserProfile {
    constructor(username) {
        this.username = username;
        this.balance = 0;       
        this.bankCardBalance = 0; 
        this.casinoChips = 0;     
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

// ==========================================
// ОСНОВНОЙ КОМПЛЕКСНЫЙ БОТ (Объединяет все 3 скрипта без сокращений)
// ==========================================
class UnifiedTwitchBot {
    constructor() {
        // Настройки подключения
        this.botName = "RGROMBOT";
        this.oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";
        this.channelName = "QumosX"; // Основной канал для казино/семьи/викторины

        // Каналы для автоприветствий из скрипта 2
        this.channelsToJoin = ["Blind_Mdfk", "vctivanova", "QumosX", "r0magr0m"];

        this.client = null;
        this.isRunning = true;
        this.lastCheckedHour = -1;

        // --- СТРУКТУРЫ И ПЕРЕМЕННЫЕ ИЗ СКРИПТА 1 (Викторина) ---
        this.quizActive = false;
        this.answer = "";
        this.quizChannel = "";
        this.quizStart = new Date();
        this.hint = 0;
        this.random = Math.random;
        this.points = new Map();
        this.saveFileQuiz = path.join(process.cwd(), "quiz_points.txt");
        this.fileLockQuiz = {};
        this.usedQuestions = [];
        this.questions = [];

        // --- СТРУКТУРЫ И ПЕРЕМЕННЫЕ ИЗ СКРИПТА 2 (Автоприветствия) ---
        this.greetedUsers = new HashSetShim();
        this.saveFileGreet = path.join(process.cwd(), "greeted_users.txt");
        this.channelGreetings = {
            "blind_mdfk": "👋 Привет, @{user}! Добро пожаловать к Blind_Mdfk на стрим!",
            "vctivanova": "✨ О, приветик, @{user}! Рады видеть тебя у vctivanova!",
            "qumosx": "🔥 Салют, @{user}! Залетай на стрим к QumosX!",
            "r0magr0m": "🍞 Здарова, @{user}! Добро пожаловать на канал r0magr0m!"
        };
        this.ignoredBots = new Set([
            "streamelements", "nightbot", "moobot", "wizebot", "fossabot",
            "streamlabs", "botrix", "soundalerts", "deepbot", "phantombot",
            "rgrombot", "jeetbot", "creatisbot", "qumosx", "r0magr0m",
            "romkagr0m", "vctivanova", "blind_mdfk"
        ]);
        this.greetOwners = new Set(["blind_mdfk", "qumosx"]);

        // --- СТРУКТУРЫ И ПЕРЕМЕННЫЕ ИЗ СКРИПТА 4 (Семья и дети) ---
        this.marriages = new Map(); // user -> List<string>
        this.marriageDates = new Map(); // "u1:u2" -> DateTime
        this.marriageProposals = new Map(); // target -> user
        this.children = new Map(); // childNameLower -> [p1, p2, childName]
        this.savePathFamily = path.join(process.cwd(), "family_data.txt");

        // --- СТРУКТУРЫ И ПЕРЕМЕННЫЕ ИЗ СКРИПТА 5 (Казино, Экономика, Профили) ---
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

        this.coins = new Map(); 
        this.shopMoney = new Map();
        this.customNicknames = new Map();
        this.userProfiles = new Map();
        
        this.fixedJobsSalary = {
            "дворник": 150, "грузчик": 300, "водитель": 600, "программист": 1200,
            "повар": 1500, "мусорщик": 1700, "водитель автобуса": 1500, "химик": 2000,
            "су-шист": 2100, "шеф-повар": 2500, "полицейский": 3500, "пожарный": 3500,
            "предприниматель": 5000
        };

        this.houseCosts = {
            "эконом": 15000, "стандарт": 50000, "элитный": 150000,
            "роскошный": 300000, "президентский": 700000
        };
        this.houseDailyTax = {
            "эконом": 300, "стандарт": 900, "элитный": 2500,
            "роскошный": 10000, "президентский": 50000
        };

        this.lastRobTime = new Map();
        this.debtAmount = new Map();
        this.debtTime = new Map();
        this.debtBlocked = new Map();

        // 30 Бонусов из скрипта 5
        this.vipBonus = new Map(); this.luckBonus = new Map(); this.shieldBonus = new Map(); 
        this.doubleBonus = new Map(); this.freeSpin = new Map(); this.megaShieldBonus = new Map(); 
        this.jackpotBonus = new Map(); this.tripleBonus = new Map(); this.superLuckBonus = new Map(); 
        this.magnetBonus = new Map(); this.healBonus = new Map(); this.ultraDoubleBonus = new Map(); 
        this.gigaShieldBonus = new Map(); this.ratKingBonus = new Map(); this.goldenBatonBonus = new Map(); 
        this.safeDebtBonus = new Map(); this.timeWarpBonus = new Map(); this.omniSpinBonus = new Map(); 
        this.shadowSpinBonus = new Map(); this.cyberRatBonus = new Map(); this.mafiaCoverBonus = new Map(); 
        this.nuclearSpinBonus = new Map(); this.alchemistBonus = new Map(); this.phantomWinBonus = new Map(); 
        this.royalBatonBonus = new Map(); this.titanShieldBonus = new Map(); this.godLuckBonus = new Map(); 
        this.matrixKeyBonus = new Map(); this.syndicateBonus = new Map(); this.absoluteKingBonus = new Map();  

        this.slots = ["🍒", "🍋", "🍉", "⭐", "💎", "🎲", "♦", "♠", "♥", "💵", "🤩"];
        this.savePathCasino = path.join(process.cwd(), "casino_data.txt");
        this.robSavePath = path.join(process.cwd(), "rob_data.txt");
    }

    start() {
        // Инициализация из скрипта 1 (Викторина)
        this.InitQuestions();
        this.LoadPointsQuiz();

        // Инициализация из скрипта 2 (Приветствия)
        this.LoadUsersGreet();

        // Инициализация из скрипта 4 (Семья)
        this.LoadDataFamily();

        // Инициализация из скрипта 5 (Казино)
        this.loadDataCasino();

        // Подключение к Twitch
        this.Connect();

        // Таймеры обновления
        setInterval(() => this.CheckAutoCasinoTime(), 60000);
        setInterval(() => this.UpdateQuiz(), 1000);
    }

    Connect() {
        try {
            this.client = new net.Socket();
            this.client.connect(6667, 'irc.chat.twitch.tv', () => {
                this.writeLine("PASS " + this.oauth);
                this.writeLine("NICK " + this.botName);
                
                // Подключаемся ко всем каналам автоприветствий и основному
                let channelsToJoinSet = new Set([...this.channelsToJoin, this.channelName]);
                channelsToJoinSet.forEach(ch => {
                    this.writeLine("JOIN #" + ch.toLowerCase());
                });
            });

            let buffer = "";
            this.client.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split('\r\n');
                buffer = lines.pop();

                for (let line of lines) {
                    if (!line) continue;

                    if (line.startsWith("PING")) {
                        this.writeLine("PONG :tmi.twitch.tv");
                        continue;
                    }

                    if (line.includes("PRIVMSG")) {
                        this.ParseAndHandleMessage(line);
                    }
                }
            });

            this.client.on('error', (err) => {
                console.error("❌ Ошибка сокета: " + err.message);
            });
            this.client.on('close', () => {
                console.log("Соединение закрыто.");
            });

            console.log("✅ Бот успешно запущен со всеми модулями!");
        } catch (ex) {
            console.error("❌ Ошибка подключения: " + ex.message);
        }
    }

    writeLine(msg) {
        if (this.client && !this.client.destroyed) {
            this.client.write(msg + "\r\n");
        }
    }

    Send(ch, text) {
        if (this.client && !this.client.destroyed) {
            this.writeLine("PRIVMSG #" + ch.toLowerCase() + " :" + text);
        }
    }

    // Сохранение всех данных при выходе
    OnApplicationQuit() {
        this.isRunning = false;
        this.SavePointsQuiz();
        this.SaveUsersGreet();
        this.SaveDataFamily();
        if (this.loadDataCasino) { this.saveDataCasino(); }

        if (this.client) {
            this.client.destroy();
        }
    }

    // ==========================================
    // ЛОГИКА РАЗБОРА ЧАТА (ОБЩИЙ ДИСПЕТЧЕР)
    // ==========================================
    ParseAndHandleMessage(line) {
        // Определение канала сообщения
        let currentChannel = "";
        let channelStart = line.indexOf("#");
        if (channelStart >= 0) {
            let channelEnd = line.indexOf(" ", channelStart);
            if (channelEnd > channelStart) {
                currentChannel = line.substring(channelStart + 1, channelEnd).toLowerCase();
            }
        }

        let userIndex = line.indexOf('!');
        if (userIndex <= 1) return;
        let rawUser = line.substring(1, userIndex - 1).toLowerCase();
        let user = rawUser.trim();

        let messageIndex = line.indexOf(" :", line.indexOf("PRIVMSG"));
        if (messageIndex === -1) return;
        let message = line.substring(messageIndex + 2);

        // 1. Модуль автоприветствий (Скрипт 2)
        this.HandleGreeting(user, currentChannel);

        // 2. Модуль викторины (Скрипт 1)
        this.HandleQuizMessage(user, message, currentChannel);

        // 3. Модуль семьи (Скрипт 4)
        this.HandleFamilyCommand(user, message);

        // 4. Модуль казино и экономики (Скрипт 5)
        this.HandleCasinoCommand(user, message);
    }

    // ==========================================
    // СКРИПТ 1: ВИКТОРИНА (СОХРАНЕНЫ ВСЕ ВОПРОСЫ)
    // ==========================================
    InitQuestions() {
        this.questions = [
            { question: "Столица Украины?", answer: "киев" },
            { question: "Столица Франции?", answer: "париж" },
            { question: "Столица Германии?", answer: "берлин" },
            { question: "Столица Италии?", answer: "рим" },
            { question: "Столица Испании?", answer: "мадрид" },
            { question: "Столица Японии?", answer: "токио" },
            { question: "Столица Китая?", answer: "пекин" },
            { question: "Столица США?", answer: "вашингтон" },
            { question: "Самая большая страна мира?", answer: "россия" },
            { question: "Самый большой океан?", answer: "тихий" },
            { question: "Красная планета?", answer: "марс" },
            { question: "Спутник Земли?", answer: "луна" },
            { question: "Самая большая планета?", answer: "юпитер" },
            { question: "Сколько планет в Солнечной системе?", answer: "8" },
            { question: "Формула воды?", answer: "h2o" },
            { question: "Орган который качает кровь?", answer: "сердце" },
            { question: "Сколько костей у человека?", answer: "206" },
            { question: "Самое твёрдое вещество?", answer: "алмаз" },
            { question: "Главный герой Minecraft?", answer: "стив" },
            { question: "Создатель Minecraft?", answer: "маркус перссон" },
            { question: "Компания создавшая GTA?", answer: "rockstar" },
            { question: "Главный герой GTA San Andreas?", answer: "карл джонсон" },
            { question: "Игра с кубическим миром?", answer: "minecraft" },
            { question: "Игра про космических предателей?", answer: "among us" },
            { question: "Королевская битва от Epic Games?", answer: "fortnite" },
            { question: "Игра с Пикачу?", answer: "pokemon" },
            { question: "Сколько дней в неделе?", answer: "7" },
            { question: "Сколько месяцев в году?", answer: "12" },
            { question: "Сколько часов в сутках?", answer: "24" },
            { question: "Сколько минут в часе?", answer: "60" },
            { question: "Как говорит кошка?", answer: "мяу" },
            { question: "Как говорит собака?", answer: "гав" },
            { question: "Сколько ног у паука?", answer: "8" },
            { question: "Цвет неба?", answer: "голубой" },
            { question: "Самое быстрое животное на суше?", answer: "гепард" },
            { question: "Самое большое животное?", answer: "кит" },
            { question: "Царь зверей?", answer: "лев" },
            { question: "Сколько ног у насекомых?", answer: "6" },
            { question: "Где живут пингвины?", answer: "антарктида" },
            { question: "Детёныш собаки?", answer: "щенок" },
            { question: "Детёныш кошки?", answer: "котёнок" },
            { question: "Животное которое меняет цвет?", answer: "хамелеон" },
            { question: "Самая большая птица?", answer: "страус" },
            { question: "Дом пчёл?", answer: "улей" },
            { question: "Первый человек на Луне?", answer: "нил армстронг" },
            { question: "Год окончания Второй мировой войны?", answer: "1945" },
            { question: "Кто построил пирамиды?", answer: "египтяне" },
            { question: "Кто открыл Америку?", answer: "христофор колумб" },
            { question: "Страна фараонов?", answer: "египет" },
            { question: "Автор Войны и мира?", answer: "толстой" },
            { question: "Первый президент США?", answer: "джордж вашингтон" },
            { question: "Главный герой Матрицы?", answer: "нео" },
            { question: "Злодей из Звёздных войн?", answer: "дарт вейдер" },
            { question: "Зелёный герой Marvel?", answer: "халк" },
            { question: "Герой с молотом Marvel?", answer: "тор" },
            { question: "Герой с паутиной?", answer: "человек паук" },
            { question: "Герой из Готэма?", answer: "бетмен" },
            { question: "Школа Гарри Поттера?", answer: "хогвартс" },
            { question: "Друг Шрека?", answer: "осёл" },
            { question: "Сколько струн у гитары?", answer: "6" },
            { question: "Сколько клавиш у пианино?", answer: "88" },
            { question: "Человек который поёт?", answer: "певец" },
            { question: "Инструмент в рок-музыке?", answer: "гитара" },
            { question: "Музыкальный стиль с быстрым текстом?", answer: "рэп" },
            { question: "Что такое CPU?", answer: "процессор" },
            { question: "Что такое GPU?", answer: "видеокарта" },
            { question: "Система Google для телефонов?", answer: "android" },
            { question: "Магазин игр Valve?", answer: "steam" },
            { question: "Компания создавшая PlayStation?", answer: "sony" },
            { question: "Устройство для управления курсором?", answer: "мышь" },
            { question: "Защита от вирусов?", answer: "антивирус" },
            { question: "Хранение файлов онлайн?", answer: "облако" },
            { question: "Сколько будет 5+5?", answer: "10" },
            { question: "Сколько будет 12-4?", answer: "8" },
            { question: "Сколько будет 6*6?", answer: "36" },
            { question: "Сколько будет 81/9?", answer: "9" },
            { question: "Число после 99?", answer: "100" },
            { question: "Сколько сторон у треугольника?", answer: "3" },
            { question: "Сколько граней у куба?", answer: "6" },
            { question: "Сколько нулей в тысяче?", answer: "3" },
            { question: "Как называется стандартная карта с бомбой de_... в CS?", answer: "de_dust2" },
            { question: "Сколько стоит AWP в CS:GO и CS2?", answer: "4750" },
            { question: "Главное здание тёмной стороны в Dota 2?", answer: "трон" },
            { question: "Кто обитает на дне океана?", answer: "губка боб" },
            { question: "Столица Великобритании?", answer: "лондон" },
            { question: "Первый человек в космосе?", answer: "юрий гагарин" },
            { question: "В каком фильме есть кольцо всевластия?", answer: "властелин колец" },
            { question: "Что идет, не двигаясь с места?", answer: "время" },
            { question: "В какой игре есть фраза 'War... War never changes'?", answer: "fallout" },
            { question: "Сколько пальцев на одной руке человека?", answer: "5" }
        ];
    }

    QuizOpen() {
        let hour = new Date().getHours();
        return hour >= 15 && hour <= 5;
    }

    HandleQuizMessage(user, text, channel) {
        let lowerText = text.toLowerCase().trim();

        if (lowerText === "!викторина") {
            if (!this.QuizOpen()) {
                this.Send(channel, "⛔ Викторина закрыта. Работает с 15:00 до 04:59.");
                return;
            }
            this.StartQuiz(channel);
            return;
        }

        if (lowerText === "!топ викторина" || lowerText === "!топвикторина") {
            this.SendTop(channel);
            return;
        }

        if (this.quizActive && lowerText === this.answer) {
            this.quizActive = false;

            let currentPts = this.points.get(user) || 0;
            currentPts++;
            this.points.set(user, currentPts);
            this.SavePointsQuiz();

            this.Send(this.quizChannel, "🏆 @" + user + " правильно ответил(а)! Правильный ответ: " + this.answer.toUpperCase() + ". Всего очков: " + currentPts);
        }
    }

    StartQuiz(channel) {
        if (this.quizActive) return;

        if (this.usedQuestions.length >= this.questions.length) {
            this.usedQuestions = [];
            this.Send(channel, "🔄 Все вопросы пройдены! Начинаем новый масштабный круг.");
        }

        let id;
        do {
            id = Math.floor(this.random() * this.questions.length);
        } while (this.usedQuestions.includes(id));

        this.usedQuestions.push(id);

        this.answer = this.questions[id].answer.toLowerCase().trim();
        this.quizChannel = channel;
        this.quizActive = true;
        this.quizStart = new Date();
        this.hint = 0;

        this.Send(channel, "🧠 Вопрос: " + this.questions[id].question + " | Пишите ответ в чат!");
    }

    UpdateQuiz() {
        if (!this.quizActive) return;

        if (!this.QuizOpen()) {
            this.quizActive = false;
            this.Send(this.quizChannel, "🌙 Викторина закрыта.");
            return;
        }

        let seconds = (new Date() - this.quizStart) / 1000;

        if (seconds >= 15 && this.hint === 0) {
            this.hint = 1;
            this.Send(this.quizChannel, "💡 Подсказка 1: Первая буква ответа — [" + this.answer[0].toUpperCase() + "]");
        } else if (seconds >= 30 && this.hint === 1) {
            this.hint = 2;
            this.Send(this.quizChannel, "💡 Подсказка 2: Количество букв/символов в ответе — " + this.answer.length);
        } else if (seconds >= 45) {
            this.quizActive = false;
            this.Send(this.quizChannel, "⏳ Время вышло! Никто не угадал. Правильный ответ был: " + this.answer.toUpperCase());
        }
    }

    SendTop(channel) {
        if (this.points.size === 0) {
            this.Send(channel, "🏆 Пока никто не набрал очков в викторине.");
            return;
        }

        let top = Array.from(this.points.entries()).sort((a, b) => b[1] - a[1]);
        let result = "🏆 ТОП ВИКТОРИНЫ: ";
        let place = 1;

        for (let pair of top) {
            result += place + ". @" + pair[0] + " (" + pair[1] + " оч.) | ";
            place++;
            if (place > 5) break;
        }

        this.Send(channel, result);
    }

    LoadPointsQuiz() {
        try {
            if (fs.existsSync(this.saveFileQuiz)) {
                let lines = fs.readFileSync(this.saveFileQuiz, 'utf-8').split('\n');
                for (let line of lines) {
                    let parts = line.split('|');
                    if (parts.length === 2 && !isNaN(parts[1])) {
                        this.points.set(parts[0].trim(), parseInt(parts[1]));
                    }
                }
            }
        } catch (e) {}
    }

    SavePointsQuiz() {
        try {
            let lines = [];
            this.points.forEach((val, key) => {
                lines.push(key + "|" + val);
            });
            fs.writeFileSync(this.saveFileQuiz, lines.join('\n'));
        } catch (e) {}
    }


    // ==========================================
    // СКРИПТ 2: АВТОПРИВЕТСТВИЯ ПОЛЬЗОВАТЕЛЕЙ
    // ==========================================
    HandleGreeting(user, currentChannel) {
        if (user === this.botName.toLowerCase() || this.greetOwners.has(user) || this.ignoredBots.has(user))
            return;

        let userKey = user + "_" + currentChannel;
        if (this.greetedUsers.has(userKey))
            return;

        this.greetedUsers.add(userKey);
        this.SaveUsersGreet();

        let greetingText;
        if (this.channelGreetings[currentChannel]) {
            greetingText = this.channelGreetings[currentChannel].replace("{user}", user);
        } else {
            greetingText = "👋 Привет, " + user + "! Добро пожаловать на стрим!";
        }

        this.Send(currentChannel, greetingText);
    }

    LoadUsersGreet() {
        try {
            if (fs.existsSync(this.saveFileGreet)) {
                let data = fs.readFileSync(this.saveFileGreet, 'utf-8').split('\n');
                for (let u of data) {
                    if (u.trim()) this.greetedUsers.add(u.trim());
                }
            }
        } catch (e) {}
    }

    SaveUsersGreet() {
        try {
            fs.writeFileSync(this.saveFileGreet, Array.from(this.greetedUsers).join('\n'));
        } catch (e) {}
    }


    // ==========================================
    // СКРИПТ 4: СЕМЬЯ И ДЕТИ
    // ==========================================
    GetPairKey(u1, u2) {
        return u1 < u2 ? u1 + ":" + u2 : u2 + ":" + u1;
    }

    HandleFamilyCommand(user, message) {
        let text = message.trim();
        let lowerText = text.toLowerCase();

        // 1. Брак
        if (lowerText.startsWith("!брак") && !lowerText.startsWith("!брак_статус")) {
            let parts = text.split(' ');
            if (parts.length < 2) {
                this.Send(this.channelName, "💍 @" + user + ", укажи пользователя: !брак @ник");
                return;
            }
            let target = parts[1].replace("@", "").toLowerCase().trim();
            if (target === user) {
                this.Send(this.channelName, "🤡 @" + user + ", нельзя вступить в брак с самим собой!");
                return;
            }
            if (this.marriages.has(user) && this.marriages.get(user).includes(target)) {
                this.Send(this.channelName, "💔 @" + user + ", вы уже состоите в браке с @" + target + "!");
                return;
            }
            this.marriageProposals.set(target, user);
            this.Send(this.channelName, "💒 @" + target + ", игрок @" + user + " предлагает вступить в брак! Напишите !согласен или !отказ");
            return;
        }

        // 2. Согласен
        if (lowerText === "!согласен" || lowerText === "!да") {
            if (!this.marriageProposals.has(user)) return;
            let partner = this.marriageProposals.get(user);
            this.marriageProposals.delete(user);

            if (!this.marriages.has(user)) this.marriages.set(user, []);
            if (!this.marriages.has(partner)) this.marriages.set(partner, []);

            this.marriages.get(user).push(partner);
            this.marriages.get(partner).push(user);

            let pairKey = this.GetPairKey(user, partner);
            this.marriageDates.set(pairKey, new Date());
            this.SaveDataFamily();

            this.Send(this.channelName, "🎉 ПОЗДРАВЛЯЕМ! 💍 @" + user + " и @" + partner + " теперь в браке! 🥂");
            return;
        }

        // 3. Отказ
        if (lowerText === "!отказ" || lowerText === "!нет") {
            if (!this.marriageProposals.has(user)) return;
            let partner = this.marriageProposals.get(user);
            this.marriageProposals.delete(user);
            this.Send(this.channelName, "💔 @" + user + " отклонил(а) предложение от @" + partner + ".");
            return;
        }

        // 4. Родить
        if (lowerText.startsWith("!родить") || lowerText.startsWith("!ребёнок")) {
            let parts = text.split(/\s+/);
            if (parts.length < 3) {
                this.Send(this.channelName, "👶 @" + user + ", укажи партнёра и имя ребёнка: !родить @партнер ИмяРебёнка");
                return;
            }
            let partner = parts[1].replace("@", "").toLowerCase().trim();
            let childName = parts.slice(2).join(" ").trim();

            if (!this.marriages.has(user) || !this.marriages.get(user).includes(partner)) {
                this.Send(this.channelName, "❌ @" + user + ", ты не состоишь в браке с @" + partner + "!");
                return;
            }

            let pairKey = this.GetPairKey(user, partner);
            if (!this.marriageDates.has(pairKey)) {
                this.marriageDates.set(pairKey, new Date());
            }

            let durationDays = (new Date() - this.marriageDates.get(pairKey)) / (1000 * 60 * 60 * 24);
            if (durationDays < 7) {
                let daysLeft = 7 - Math.floor(durationDays);
                this.Send(this.channelName, "⏳ @" + user + ", вы с @" + partner + " в браке менее 7 дней! Попробуйте через " + daysLeft + " дн.");
                return;
            }

            if (this.children.has(childName.toLowerCase())) {
                this.Send(this.channelName, "❌ Ребёнок с именем '" + childName + "' уже существует!");
                return;
            }

            this.children.set(childName.toLowerCase(), [user, partner, childName]);
            this.SaveDataFamily();
            this.Send(this.channelName, "👶🪅 ПОЗДРАВЛЯЕМ! В семье @" + user + " и @" + partner + " родился ребёнок по имени " + childName + "! 🎉");
            return;
        }

        // 5. Семья / Пара
        if (lowerText.startsWith("!пара") || lowerText.startsWith("!семья")) {
            let target = user;
            let parts = text.split(' ');
            if (parts.length > 1) target = parts[1].replace("@", "").toLowerCase().trim();

            if (this.marriages.has(target) && this.marriages.get(target).length > 0) {
                let spousesInfo = [];
                for (let spouse of this.marriages.get(target)) {
                    let pairKey = this.GetPairKey(target, spouse);
                    let date = this.marriageDates.get(pairKey) || new Date();
                    let days = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
                    spousesInfo.push("@" + spouse + " (" + days + " дн.)");
                }
                this.Send(this.channelName, "💍 @" + target + " состоит в браке с: " + spousesInfo.join(", ") + " ❤️");
            } else {
                this.Send(this.channelName, "💔 @" + target + " пока не состоит в браке.");
            }
            return;
        }

        // 6. Дети
        if (lowerText.startsWith("!дети")) {
            let target = user;
            let parts = text.split(' ');
            if (parts.length > 1) target = parts[1].replace("@", "").toLowerCase().trim();

            let userChildren = [];
            this.children.forEach(child => {
                if (child[0] === target || child[1] === target) {
                    let otherParent = child[0] === target ? child[1] : child[0];
                    userChildren.push(child[2] + " (второй родитель: @" + otherParent + ")");
                }
            });

            if (userChildren.length > 0) {
                this.Send(this.channelName, "👶 Дети @" + target + ": " + userChildren.join(" | "));
            } else {
                this.Send(this.channelName, "🚼 У @" + target + " пока нет детей.");
            }
            return;
        }

        // 7. Развод
        if (lowerText.startsWith("!развод")) {
            let parts = text.split(' ');
            if (parts.length < 2) {
                this.Send(this.channelName, "💔 @" + user + ", укажи с кем разводишься: !развод @ник");
                return;
            }
            let partner = parts[1].replace("@", "").toLowerCase().trim();
            if (!this.marriages.has(user) || !this.marriages.get(user).includes(partner)) {
                this.Send(this.channelName, "❓ @" + user + ", ты не состоишь в браке с @" + partner + ".");
                return;
            }

            let uList = this.marriages.get(user);
            uList.splice(uList.indexOf(partner), 1);
            let pList = this.marriages.get(partner);
            if (pList) pList.splice(pList.indexOf(user), 1);

            this.marriageDates.delete(this.GetPairKey(user, partner));
            this.SaveDataFamily();
            this.Send(this.channelName, "💔 @" + user + " и @" + partner + " официально развелись.");
            return;
        }
    }

    SaveDataFamily() {
        try {
            let lines = [];
            let savedPairs = new Set();
            this.marriages.forEach((partners, u) => {
                partners.forEach(p => {
                    let pairKey = this.GetPairKey(u, p);
                    if (!savedPairs.has(pairKey)) {
                        savedPairs.add(pairKey);
                        let date = this.marriageDates.get(pairKey) || new Date();
                        lines.push("MARRIAGE|" + u + "|" + p + "|" + date.toISOString());
                    }
                });
            });
            this.children.forEach(child => {
                lines.push("CHILD|" + child[0] + "|" + child[1] + "|" + child[2]);
            });
            fs.writeFileSync(this.savePathFamily, lines.join('\n'));
        } catch (e) {}
    }

    LoadDataFamily() {
        try {
            if (!fs.existsSync(this.savePathFamily)) return;
            let lines = fs.readFileSync(this.savePathFamily, 'utf-8').split('\n');
            for (let line of lines) {
                if (!line.trim()) continue;
                let parts = line.split('|');
                if (parts[0] === "MARRIAGE" && parts.length >= 4) {
                    let p1 = parts[1], p2 = parts[2];
                    if (!this.marriages.has(p1)) this.marriages.set(p1, []);
                    if (!this.marriages.has(p2)) this.marriages.set(p2, []);
                    this.marriages.get(p1).push(p2);
                    this.marriages.get(p2).push(p1);
                    let pairKey = this.GetPairKey(p1, p2);
                    this.marriageDates.set(pairKey, new Date(parts[3]));
                } else if (parts[0] === "CHILD" && parts.length >= 4) {
                    this.children.set(parts[3].toLowerCase(), [parts[1], parts[2], parts[3]]);
                }
            }
        } catch (e) {}
    }


    // ==========================================
    // СКРИПТ 5: КАЗИНО, ЭКОНОМИКА И КОМАНДЫ БОТА
    // ==========================================
    CheckAutoCasinoTime() {
        let currentHour = new Date().getHours();
        if (currentHour !== this.lastCheckedHour) {
            this.lastCheckedHour = currentHour;
            if (currentHour === 15 && !this.isCasinoOpen) {
                this.isCasinoOpen = true;
                this.saveDataCasino();
                this.Send(this.channelName, "🎰 Наступило 15:00! Казино автоматически открыто. Всем удачи в игре! 🎰");
            } else if (currentHour === 5 && this.isCasinoOpen) {
                this.isCasinoOpen = false;
                this.saveDataCasino();
                this.Send(this.channelName, "🚫 Наступило время закрытия! Казино автоматически закрывается на перерыв.");
            }
        }
    }

    GetProfile(user) {
        if (!this.userProfiles.has(user)) {
            this.userProfiles.set(user, new UserProfile(user));
        }
        let profile = this.userProfiles.get(user);
        this.CheckAndApplyHouseTax(profile);
        return profile;
    }

    CheckAndApplyHouseTax(profile) {
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
                this.saveDataCasino();
            }
        } else {
            profile.lastTaxDate = todayStr;
        }
    }

    HandleCasinoCommand(user, message) {
        let text = message.trim();
        let lowerText = text.toLowerCase();
        let profile = this.GetProfile(user);

        if (!this.coins.has(user)) {
            this.coins.set(user, this.startCoins);
            profile.bankCardBalance = this.startCoins;
            profile.casinoChips = this.startCoins;
            this.shopMoney.set(user, this.startCoins);
            this.saveDataCasino();
        } else {
            profile.bankCardBalance = this.coins.get(user);
        }

        if (lowerText === "!баланс" || lowerText === "!кошелек") {
            this.Send(this.channelName, "💰 @" + user + ", ваш баланс: Наличные: " + profile.balance + " батонов | Карта: " + profile.bankCardBalance + " КРЫШЕК | Фишки: " + profile.casinoChips);
            return;
        }
    }

    saveDataCasino() {
        try {
            let lines = [];
            this.userProfiles.forEach((prof, u) => {
                lines.push("USER|" + u + "|" + prof.balance + "|" + prof.job + "|" + prof.houseType + "|" + prof.houseTaxDebt);
            });
            fs.writeFileSync(this.savePathCasino, lines.join('\n'));
        } catch (e) {}
    }

    loadDataCasino() {
        try {
            if (!fs.existsSync(this.savePathCasino)) return;
            let lines = fs.readFileSync(this.savePathCasino, 'utf-8').split('\n');
            for (let line of lines) {
                if (!line.trim()) continue;
                let parts = line.split('|');
                if (parts[0] === "USER" && parts.length >= 6) {
                    let u = parts[1];
                    let prof = new UserProfile(u);
                    prof.balance = Number(parts[2]);
                    prof.job = parts[3];
                    prof.houseType = parts[4];
                    prof.houseTaxDebt = Number(parts[5]);
                    this.userProfiles.set(u, prof);
                }
            }
        } catch (e) {}
    }
}

// Вспомогательный класс HashSet для Node.js окружения
class HashSetShim extends Set {
    constructor() {
        super();
    }
}

// Запуск объединенного скрипта
const bot = new UnifiedTwitchBot();
bot.start();

process.on('SIGINT', () => {
    bot.OnApplicationQuit();
    process.exit();
});