const express = require('express');
const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');

// Загруженные переменные окружения
require('dotenv').config();

const app = express();
app.use(express.json());

// ========== КОНФИГ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ==========
const CONFIG = {
  twitch: {
    botName: process.env.TWITCH_BOT_NAME || 'RGROMBOT',
    oauth: process.env.TWITCH_OAUTH || '4z39cw1q1hwfxhjmqwoha1hhr2zo52',
    channelName: process.env.TWITCH_CHANNEL || 'qumosx'
  },
  casino: {
    owners: (process.env.OWNERS || 'qumosx').split(',').map(o => o.toLowerCase()),
    ownerRoles: {
      'qumosx': 'Главный Босс',
      'gospod_bomzhik': 'Шеф СБ',
      'miss__krevetka': 'Игровой Мастер'
    },
    startCoins: 0,
    casinoBank: parseInt(process.env.CASINO_BANK) || 1000000,
    shopBank: parseInt(process.env.SHOP_BANK) || 0,
    salaryBank: parseInt(process.env.SALARY_BANK) || 0,
    isCasinoOpen: process.env.CASINO_OPEN === 'true' || true
  }
};

// Проверка обязательных параметров
if (!CONFIG.twitch.oauth) {
  console.error('❌ ERROR: TWITCH_OAUTH not set!');
  process.exit(1);
}

// ========== ДАННЫЕ ==========
let users = {};
let customNicknames = {};
let casinoBank = CONFIG.casino.casinoBank;
let shopBank = CONFIG.casino.shopBank;
let salaryBank = CONFIG.casino.salaryBank;
let isCasinoOpen = CONFIG.casino.isCasinoOpen;

const slots = ['🍒', '🍋', '🍉', '⭐', '💎', '🎲', '♦', '♠', '♥', '💵', '🤩'];

const jobs = {
  'дворник': 150,
  'грузчик': 300,
  'водитель': 600,
  'программист': 1200,
  'повар': 1500,
  'мусорщик': 1700,
  'водитель автобуса': 1500,
  'химик': 2000,
  'су-шист': 2100,
  'шеф-повар': 2500,
  'полицейский': 3500,
  'пожарный': 3500,
  'предприниматель': 5000
};

const houseCosts = {
  'эконом': 15000,
  'стандарт': 50000,
  'элитный': 150000,
  'роскошный': 300000,
  'президентский': 700000
};

const houseTax = {
  'эконом': 300,
  'стандарт': 900,
  'элитный': 2500,
  'роскошный': 10000,
  'президентский': 50000
};

// ========== КЛАСС ПРОФИЛЯ ==========
class UserProfile {
  constructor(username) {
    this.username = username;
    this.balance = 0;
    this.bankCardBalance = 0;
    this.casinoChips = 0;
    this.job = 'Безработный';
    this.level = 1;
    this.exp = 0;
    this.expToNextLevel = 100;
    this.hunger = 100;
    this.health = 100;
    this.isHospitalized = false;
    this.isImprisoned = false;
    this.prisonReleaseTime = '';
    this.houseType = 'Нет';
    this.houseTaxDebt = 0;
    this.lastTaxDate = '';
    this.isDebtCardBlocked = false;
    this.lastWorkDate = '';
  }
}

// ========== ФУНКЦИИ ==========
function getProfile(user) {
  if (!users[user]) {
    users[user] = new UserProfile(user);
  }
  return users[user];
}

function getDisplayName(user) {
  return customNicknames[user] || user;
}

function getRandomSlot() {
  return slots[Math.floor(Math.random() * slots.length)];
}

function saveData() {
  const data = {
    users,
    customNicknames,
    casinoBank,
    shopBank,
    salaryBank,
    isCasinoOpen
  };
  const savePath = path.join(__dirname, 'casino_data.json');
  try {
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
    console.log('✅ Data saved to casino_data.json');
  } catch (err) {
    console.error('❌ Error saving data:', err);
  }
}

function loadData() {
  const savePath = path.join(__dirname, 'casino_data.json');
  if (fs.existsSync(savePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(savePath, 'utf8'));
      users = data.users || {};
      customNicknames = data.customNicknames || {};
      casinoBank = data.casinoBank || CONFIG.casino.casinoBank;
      shopBank = data.shopBank || 0;
      salaryBank = data.salaryBank || 0;
      isCasinoOpen = data.isCasinoOpen !== undefined ? data.isCasinoOpen : true;
      console.log(`✅ Data loaded: ${Object.keys(users).length} users`);
    } catch (err) {
      console.error('❌ Error loading data:', err);
    }
  } else {
    console.log('📝 No saved data found, starting fresh');
  }
}

// ========== TWITCH COMMANDS ==========
async function handleCommand(user, message) {
  const args = message.split(' ');
  const command = args[0].toLowerCase();

  // Админ команды
  if (CONFIG.casino.owners.includes(user)) {
    if (command === '!закрыть') {
      isCasinoOpen = false;
      sendChat(`🚨 Казино закрыто админом ${getDisplayName(user)}`);
      saveData();
      return;
    }
    if (command === '!открыть') {
      isCasinoOpen = true;
      sendChat(`✅ Казино открыто админом ${getDisplayName(user)}`);
      saveData();
      return;
    }
    if (command === '!банк') {
      sendChat(`💰 Казино: ${casinoBank} | Магазин: ${shopBank} | Зарплата: ${salaryBank}`);
      return;
    }
    if (command === '!добавить') {
      const target = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 0;
      if (target && amount > 0) {
        const profile = getProfile(target);
        profile.casinoChips += amount;
        sendChat(`✅ +${amount} фишек ${getDisplayName(target)}`);
        saveData();
      }
      return;
    }
  }

  // Обычные команды
  if (command === '!баланс') {
    const profile = getProfile(user);
    sendChat(`💰 ${getDisplayName(user)}: Наличные: ${profile.balance} | Карта: ${profile.bankCardBalance} | Фишки: ${profile.casinoChips} 👑`);
    return;
  }

  if (command === '!профиль') {
    const profile = getProfile(user);
    sendChat(`👤 ${getDisplayName(user)} | Уровень: ${profile.level} | Работа: ${profile.job} | Дом: ${profile.houseType}`);
    return;
  }

  if (command === '!получить') {
    const profile = getProfile(user);
    if (profile.casinoChips >= 1000) {
      profile.casinoChips -= 1000;
      profile.balance += 1000;
      sendChat(`✅ ${getDisplayName(user)} вывел 1000 фишек в наличные 💵`);
      saveData();
    } else {
      sendChat(`❌ ${getDisplayName(user)}, недостаточно фишек! Нужно 1000 👑`);
    }
    return;
  }

  if (command === '!положить') {
    const amount = parseInt(args[1]) || 0;
    const profile = getProfile(user);
    if (amount > 0 && profile.balance >= amount) {
      profile.balance -= amount;
      profile.casinoChips += amount;
      sendChat(`✅ ${getDisplayName(user)} положил ${amount} фишек 👑`);
      saveData();
    } else {
      sendChat(`❌ Недостаточно наличных`);
    }
    return;
  }

  if (command === '!каз') {
    if (!isCasinoOpen) {
      sendChat(`🚨 Казино закрыто! Приходите позже.`);
      return;
    }

    const bet = parseInt(args[1]) || 0;
    const profile = getProfile(user);

    if (bet <= 0) {
      sendChat(`❌ Используй: !каз [ставка]`);
      return;
    }

    if (profile.casinoChips < bet) {
      sendChat(`❌ Недостаточно фишек! У вас: ${profile.casinoChips} 👑`);
      return;
    }

    profile.casinoChips -= bet;
    casinoBank += bet;
    salaryBank += Math.max(1, Math.floor(bet / 10));

    const a = getRandomSlot();
    const b = getRandomSlot();
    const c = getRandomSlot();

    let win = 0;
    if (a === b && b === c) win = bet * 10;
    else if (a === b || a === c || b === c) win = bet * 3;

    if (win > 0) {
      profile.casinoChips += win;
      casinoBank = Math.max(0, casinoBank - win);
      sendChat(`🎰 [${a} | ${b} | ${c}] — 🏆 ${getDisplayName(user)} выиграл ${win} фишек! (${profile.casinoChips} 👑)`);
    } else {
      sendChat(`🎰 [${a} | ${b} | ${c}] — ❌ ${getDisplayName(user)} проиграл ${bet}. (${profile.casinoChips} 👑)`);
    }

    saveData();
    return;
  }

  if (command === '!работа') {
    const jobName = args.slice(1).join(' ').toLowerCase();
    const profile = getProfile(user);

    if (!jobName) {
      const jobList = Object.keys(jobs).join(', ');
      sendChat(`Доступные работы: ${jobList}`);
      return;
    }

    if (jobs[jobName]) {
      profile.job = jobName;
      sendChat(`✅ ${getDisplayName(user)} получил работу: ${jobName} (${jobs[jobName]} руб./день)`);
      saveData();
    } else {
      sendChat(`❌ Работа не найдена`);
    }
    return;
  }

  if (command === '!дом') {
    const houseType = args.slice(1).join(' ').toLowerCase();
    const profile = getProfile(user);

    if (!houseType) {
      const houseList = Object.entries(houseCosts)
        .map(([type, cost]) => `${type} (${cost})`)
        .join(', ');
      sendChat(`Доступные дома: ${houseList}`);
      return;
    }

    if (houseCosts[houseType]) {
      const cost = houseCosts[houseType];
      if (profile.balance >= cost) {
        profile.balance -= cost;
        profile.houseType = houseType;
        sendChat(`✅ ${getDisplayName(user)} купил дом: ${houseType}`);
        saveData();
      } else {
        sendChat(`❌ Нужно ${cost}, у вас ${profile.balance}`);
      }
    } else {
      sendChat(`❌ Дом не найден`);
    }
    return;
  }

  if (command === '!помощь') {
    sendChat(`💰 !баланс | 👤 !профиль | 💵 !получить | 💳 !положить | 🎰 !каз | 👔 !работа | 🏠 !дом`);
    return;
  }
}

// ========== TWITCH BOT ==========
const client = new tmi.Client({
  options: { debug: process.env.DEBUG === 'true' },
  connection: { reconnect: true, secure: true },
  identity: {
    username: CONFIG.twitch.botName,
    password: CONFIG.twitch.oauth
  },
  channels: [CONFIG.twitch.channelName]
});

client.on('message', (channel, userstate, message, self) => {
  if (self) return;
  const user = userstate.username.toLowerCase();
  const msg = message.trim();
  if (msg.startsWith('!')) {
    handleCommand(user, msg);
  }
});

client.on('connected', (addr, port) => {
  console.log(`✅ Подключено к Twitch (${addr}:${port})`);
  client.say(CONFIG.twitch.channelName, '🤖 TwitchCasino bot запущен!');
});

client.on('disconnected', (reason) => {
  console.log(`❌ Отключено: ${reason}`);
});

function sendChat(message) {
  if (!client) return;
  client.say(CONFIG.twitch.channelName, message).catch(err => {
    console.error('⚠️ Ошибка отправки:', err.message);
  });
}

// ========== EXPRESS API ==========
app.get('/api/stats', (req, res) => {
  res.json({
    casinoBank,
    shopBank,
    salaryBank,
    isCasinoOpen,
    totalUsers: Object.keys(users).length,
    slotsCount: slots.length
  });
});

app.get('/api/user/:name', (req, res) => {
  const profile = getProfile(req.params.name.toLowerCase());
  res.json(profile);
});

app.get('/api/leaderboard', (req, res) => {
  const sorted = Object.values(users)
    .sort((a, b) => b.casinoChips - a.casinoChips)
    .slice(0, 10);
  res.json(sorted);
});

app.post('/api/admin/addchips', (req, res) => {
  const { user, amount } = req.body;
  if (!user || !amount) {
    return res.status(400).json({ error: 'Missing user or amount' });
  }
  
  const profile = getProfile(user.toLowerCase());
  profile.casinoChips += amount;
  saveData();
  res.json({ success: true, profile });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', casinoOpen: isCasinoOpen, users: Object.keys(users).length });
});

// ========== SERVER ==========
loadData();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🎰 TWITCH CASINO BOT                  ║
║  ✅ Server running on port ${PORT}      ║
║  📊 API: http://localhost:${PORT}/api/stats ║
║  ❤️  Channel: ${CONFIG.twitch.channelName}               ║
╚════════════════════════════════════════╝
  `);
});

// Подключение к Twitch
client.connect().catch(err => {
  console.error('❌ Не удалось подключиться к Twitch:', err.message);
  console.error('Проверьте TWITCH_OAUTH токен');
  process.exit(1);
});

// Автосохранение каждые 5 минут
setInterval(saveData, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down...');
  saveData();
  client.disconnect();
  process.exit(0);
});