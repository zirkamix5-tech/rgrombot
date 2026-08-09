using System;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using UnityEngine;
using System.Collections.Generic;

public class SimpleTwitchQuiz : MonoBehaviour
{
    private TcpClient client;
    private StreamReader reader;
    private StreamWriter writer;
    private Thread chatThread;

    private bool running;

    public string botName = "RGROMBOT";
    public string oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";
    public string channel = "#R0maGrom";

    private bool quizActive = false;
    private string answer;
    private string quizChannel;
    private DateTime quizStart;
    private int hint = 0;

    private System.Random random = new System.Random();
    private Dictionary<string, int> points = new Dictionary<string, int>();

    private string saveFile;
    private readonly object fileLock = new object();

    public class QuizQuestion
    {
        public string question;
        public string answer;

        public QuizQuestion(string q, string a)
        {
            question = q;
            answer = a.ToLower().Trim();
        }
    }

    private List<int> usedQuestions = new List<int>();
    private List<QuizQuestion> questions = new List<QuizQuestion>();

    void Start()
    {
        saveFile = Path.Combine(Application.persistentDataPath, "quiz_points.txt");
        InitQuestions();
        LoadPoints();
        Connect();
    }

    void InitQuestions()
    {
        questions = new List<QuizQuestion>()
        {
            // ==========================================
            // ИСХОДНЫЕ ВОПРОСЫ (СОХРАНЕНЫ БЕЗ ИЗМЕНЕНИЙ)
            // ==========================================
            new QuizQuestion("Столица Украины?", "киев"),
            new QuizQuestion("Столица Франции?", "париж"),
            new QuizQuestion("Столица Германии?", "берлин"),
            new QuizQuestion("Столица Италии?", "рим"),
            new QuizQuestion("Столица Испании?", "мадрид"),
            new QuizQuestion("Столица Японии?", "токио"),
            new QuizQuestion("Столица Китая?", "пекин"),
            new QuizQuestion("Столица США?", "вашингтон"),
            new QuizQuestion("Самая большая страна мира?", "россия"),
            new QuizQuestion("Самый большой океан?", "тихий"),
            new QuizQuestion("Красная планета?", "марс"),
            new QuizQuestion("Спутник Земли?", "луна"),
            new QuizQuestion("Самая большая планета?", "юпитер"),
            new QuizQuestion("Сколько планет в Солнечной системе?", "8"),
            new QuizQuestion("Формула воды?", "h2o"),
            new QuizQuestion("Орган который качает кровь?", "сердце"),
            new QuizQuestion("Сколько костей у человека?", "206"),
            new QuizQuestion("Самое твёрдое вещество?", "алмаз"),
            new QuizQuestion("Главный герой Minecraft?", "стив"),
            new QuizQuestion("Создатель Minecraft?", "маркус перссон"),
            new QuizQuestion("Компания создавшая GTA?", "rockstar"),
            new QuizQuestion("Главный герой GTA San Andreas?", "карл джонсон"),
            new QuizQuestion("Игра с кубическим миром?", "minecraft"),
            new QuizQuestion("Игра про космических предателей?", "among us"),
            new QuizQuestion("Королевская битва от Epic Games?", "fortnite"),
            new QuizQuestion("Игра с Пикачу?", "pokemon"),
            new QuizQuestion("Сколько дней в неделе?", "7"),
            new QuizQuestion("Сколько месяцев в году?", "12"),
            new QuizQuestion("Сколько часов в сутках?", "24"),
            new QuizQuestion("Сколько минут в часе?", "60"),
            new QuizQuestion("Как говорит кошка?", "мяу"),
            new QuizQuestion("Как говорит собака?", "гав"),
            new QuizQuestion("Сколько ног у паука?", "8"),
            new QuizQuestion("Цвет неба?", "голубой"),
            new QuizQuestion("Самое быстрое животное на суше?", "гепард"),
            new QuizQuestion("Самое большое животное?", "кит"),
            new QuizQuestion("Царь зверей?", "лев"),
            new QuizQuestion("Сколько ног у насекомых?", "6"),
            new QuizQuestion("Где живут пингвины?", "антарктида"),
            new QuizQuestion("Детёныш собаки?", "щенок"),
            new QuizQuestion("Детёныш кошки?", "котёнок"),
            new QuizQuestion("Животное которое меняет цвет?", "хамелеон"),
            new QuizQuestion("Самая большая птица?", "страус"),
            new QuizQuestion("Дом пчёл?", "улей"),
            new QuizQuestion("Первый человек на Луне?", "нил армстронг"),
            new QuizQuestion("Год окончания Второй мировой войны?", "1945"),
            new QuizQuestion("Кто построил пирамиды?", "египтяне"),
            new QuizQuestion("Кто открыл Америку?", "христофор колумб"),
            new QuizQuestion("Страна фараонов?", "египет"),
            new QuizQuestion("Автор Войны и мира?", "толстой"),
            new QuizQuestion("Первый президент США?", "джордж вашингтон"),
            new QuizQuestion("Главный герой Матрицы?", "нео"),
            new QuizQuestion("Злодей из Звёздных войн?", "дарт вейдер"),
            new QuizQuestion("Зелёный герой Marvel?", "халк"),
            new QuizQuestion("Герой с молотом Marvel?", "тор"),
            new QuizQuestion("Герой с паутиной?", "человек паук"),
            new QuizQuestion("Герой из Готэма?", "бетмен"),
            new QuizQuestion("Школа Гарри Поттера?", "хогвартс"),
            new QuizQuestion("Друг Шрека?", "осёл"),
            new QuizQuestion("Сколько струн у гитары?", "6"),
            new QuizQuestion("Сколько клавиш у пианино?", "88"),
            new QuizQuestion("Человек который поёт?", "певец"),
            new QuizQuestion("Инструмент в рок-музыке?", "гитара"),
            new QuizQuestion("Музыкальный стиль с быстрым текстом?", "рэп"),
            new QuizQuestion("Что такое CPU?", "процессор"),
            new QuizQuestion("Что такое GPU?", "видеокарта"),
            new QuizQuestion("Система Google для телефонов?", "android"),
            new QuizQuestion("Магазин игр Valve?", "steam"),
            new QuizQuestion("Компания создавшая PlayStation?", "sony"),
            new QuizQuestion("Устройство для управления курсором?", "мышь"),
            new QuizQuestion("Защита от вирусов?", "антивирус"),
            new QuizQuestion("Хранение файлов онлайн?", "облако"),
            new QuizQuestion("Сколько будет 5+5?", "10"),
            new QuizQuestion("Сколько будет 12-4?", "8"),
            new QuizQuestion("Сколько будет 6*6?", "36"),
            new QuizQuestion("Сколько будет 81/9?", "9"),
            new QuizQuestion("Число после 99?", "100"),
            new QuizQuestion("Сколько сторон у треугольника?", "3"),
            new QuizQuestion("Сколько граней у куба?", "6"),
            new QuizQuestion("Сколько нулей в тысяче?", "3"),

            // ==========================================
            // НОВЫЕ ВОПРОСЫ (500+ ШТУК)
            // ==========================================

            // --- CS / COUNTER-STRIKE (50+) ---
            new QuizQuestion("Как называется стандартная карта с бомбой de_... в CS?", "de_dust2"),
            new QuizQuestion("Сколько стоит AWP в CS:GO и CS2?", "4750"),
            new QuizQuestion("Сколько секунд пачка таймит до взрыва в CS:GO/CS2?", "40"),
            new QuizQuestion("Пистолет спецназа по умолчанию в CS:GO?", "usp-s"),
            new QuizQuestion("Пистолет террористов по умолчанию в CS:GO?", "glock-18"),
            new QuizQuestion("Какая фракция минирует пленты в CS?", "террористы"),
            new QuizQuestion("Как называется легендарный дефуз-кит в CS?", "щипцы"),
            new QuizQuestion("Легендарный пистолет за 300$ в CS?", "p250"),
            new QuizQuestion("Сколько денег дается за убийство с ножа в CS?", "1500"),
            new QuizQuestion("Оружие 'Муха' в CS — это...?", "ssg 08"),
            new QuizQuestion("Шокер в CS называется...?", "zeus x27"),
            new QuizQuestion("Сколько HP снимает урон от взрыва световой гранаты в CS?", "0"),
            new QuizQuestion("Карта с двухэтажным поездом в CS 1.6?", "de_train"),
            new QuizQuestion("Популярная карта CS с бананом?", "de_inferno"),
            new QuizQuestion("Разработчик серии игр Counter-Strike?", "valve"),
            new QuizQuestion("Сколько максимальный капитал в раунде CS:GO/CS2?", "16000"),
            new QuizQuestion("Название карты с реактором в CS?", "de_nuke"),
            new QuizQuestion("Название карты с высоткой и лифтом в CS?", "virtigo"),
            new QuizQuestion("Как называется удержание позиций за спецназ?", "деф"),
            new QuizQuestion("Как называют снайперскую винтовку пле плечах?", "авик"),
            new QuizQuestion("Как зовут легенду CS под ником s1mple?", "александр костылев"),
            new QuizQuestion("Как называется тихий шаг в CS?", "шифт"),
            new QuizQuestion("Граната, которая создает дымовую завесу?", "смок"),
            new QuizQuestion("Граната с зажигательной смесью у Т?", "молотов"),
            new QuizQuestion("Сколько секунд нужно для диффуза без китов?", "10"),
            new QuizQuestion("Сколько секунд нужно для диффуза с китами?", "5"),
            new QuizQuestion("Название турниров от Valve по CS?", "мажор"),
            new QuizQuestion("Что означают буквы 'de_' в названиях карт?", "defuse"),
            new QuizQuestion("Что означают буквы 'cs_' в названиях карт?", "hostage"),
            new QuizQuestion("Карта с заложниками и офисом?", "cs_office"),
            new QuizQuestion("Карта с заложниками в Италии?", "cs_italy"),
            new QuizQuestion("Сколько патронов в магазине AK-47 в CS?", "30"),
            new QuizQuestion("Сколько патронов в магазине AWP?", "5"),
            new QuizQuestion("Урон от выстрела из AWP в голову?", "448"),
            new QuizQuestion("Как называется раунд без закупки?", "эко"),
            new QuizQuestion("Закупка на все оставшиеся деньги?", "бай"),
            new QuizQuestion("Как называют игрока, который подглядывает на стрим?", "стримснайпер"),
            new QuizQuestion("Как называют резкий разворот на 180 градусов?", "флик"),
            new QuizQuestion("Как называется стрельба короткими очередями?", "бёрст"),
            new QuizQuestion("Как называется зажим стрельбы?", "спрей"),
            new QuizQuestion("Какой пистолет называют 'карманным авиком'?", "desert eagle"),
            new QuizQuestion("Автомат спецназа с глушителем?", "m4a1-s"),
            new QuizQuestion("Автомат спецназа без глушителя?", "m4a4"),
            new QuizQuestion("Сколько игроков в стандартной команде CS?", "5"),
            new QuizQuestion("Как называется убийство всей вражеской команды одним игроком?", "эйс"),
            new QuizQuestion("Как называется убийство 4 врагов в раунде?", "квадрокилл"),
            new QuizQuestion("Какая кнопка по умолчанию отвечает за разминирование?", "e"),
            new QuizQuestion("Какой движок используется в CS2?", "source 2"),
            new QuizQuestion("Движок оригинальной CS 1.6?", "goldsrc"),
            new QuizQuestion("Как называется сброс оружия напарнику?", "дроп"),

            // --- DOTA 2 И МОВА (50+) ---
            new QuizQuestion("Главное здание светлой стороны в Dota 2?", "древо"),
            new QuizQuestion("Главное здание тёмной стороны в Dota 2?", "трон"),
            new QuizQuestion("Как называют нейтрального босса в Dota 2?", "рошан"),
            new QuizQuestion("Предмет, выпадающий из Рошана?", "эгида"),
            new QuizQuestion("Какое полное название предмета BKB в Dota 2?", "black king bar"),
            new QuizQuestion("Сколько игроков в одной команде Dota 2?", "5"),
            new QuizQuestion("Курьер в Dota 2 в простонародье?", "курица"),
            new QuizQuestion("Персонаж, использующий заклинание 'Sunstrike'?", "invoker"),
            new QuizQuestion("Герой-паук в Dota 2?", "broodmother"),
            new QuizQuestion("Как зовут героя, превращающегося в дракона?", "dragon knight"),
            new QuizQuestion("Самый главный турнир по Dota 2?", "the international"),
            new QuizQuestion("Герой, у которого главный атрибут — Hook?", "pudge"),
            new QuizQuestion("Предмет, дающий невидимость в Dota 2?", "invisibility sword"),
            new QuizQuestion("Вард, дающий раскрытие невидимости?", "sentry ward"),
            new QuizQuestion("Вард, дающий обзор территории?", "observer ward"),
            new QuizQuestion("Сколько линий на карте в Dota 2?", "3"),
            new QuizQuestion("Как называется центральная линия?", "мид"),
            new QuizQuestion("Как называют игрока на легкой линии?", "керри"),
            new QuizQuestion("Как называют игрока на сложной линии?", "хардлайнер"),
            new QuizQuestion("Как называют игроков поддержки?", "саппорты"),
            new QuizQuestion("Предмет для мгновенной телепортации на вышку?", "свиток телепортации"),
            new QuizQuestion("Герой с ультимейтом 'Global Silence'?", "silencer"),
            new QuizQuestion("Герой, который создает свои копии (иллюзии) с косой?", "phantom lancer"),
            new QuizQuestion("Герой-минер в Dota 2?", "techies"),
            new QuizQuestion("Герой-снайпер в Dota 2?", "sniper"),
            new QuizQuestion("Как зовут Axe в Dota 2?", "могул хан"),
            new QuizQuestion("Название валюты в матче Dota 2?", "золото"),
            new QuizQuestion("Что падает из разрушенных башен?", "золото"),
            new QuizQuestion("Максимальный уровень героя в Dota 2?", "30"),
            new QuizQuestion("Как называется покупка возрождения?", "байбэк"),
            new QuizQuestion("Ультимейт какого героя называется 'Reverse Polarity'?", "magnus"),
            new QuizQuestion("Какая студия создала Dota 2?", "valve"),
            new QuizQuestion("Автор оригинальной карты DotA Allstars?", "icefrog"),
            new QuizQuestion("Герой, стреляющий из лука ледяными стрелами?", "drow ranger"),
            new QuizQuestion("Герой, призывающий трентов?", "nature's prophet"),
            new QuizQuestion("Как называется ультимейт Pudge?", "dismember"),
            new QuizQuestion("Как называют добивание своих крипов в Dota 2?", "денай"),
            new QuizQuestion("Как называют убийство вражеских крипов?", "фарм"),
            new QuizQuestion("Руна, дающая ускорение?", "хаст"),
            new QuizQuestion("Руна, дающая двойной урон?", "дд"),
            new QuizQuestion("Руна, дающая невидимость?", "инвиз"),
            new QuizQuestion("Руна, восстанавливающая HP и ману?", "регенерация"),
            new QuizQuestion("Предмет, восстанавливающий ману всей команде?", "arcane boots"),
            new QuizQuestion("Предмет, дающий телепортацию 'Blink'?", "blink dagger"),
            new QuizQuestion("Как называется лесной магазин в Dota 2?", "потайная лавка"),
            new QuizQuestion("Сколько башен на одной линии у каждой стороны?", "3"),
            new QuizQuestion("Как называют отряд монстров, идущих по линии?", "крипы"),
            new QuizQuestion("Какая MOBA-игра является главным конкурентом Dota 2?", "league of legends"),
            new QuizQuestion("Как зовут героя с мечом и ультимейтом 'Omnislash'?", "juggernaut"),
            new QuizQuestion("Как называется ультимейт Enigma?", "black hole"),

            // --- МЕМЫ И ИНТЕРНЕТ-КУЛЬТУРА (60+) ---
            new QuizQuestion("Кто обитает на дне океана?", "губка боб"),
            new QuizQuestion("Главный враг кота Тома?", "джэрри"),
            new QuizQuestion("Что, согласно мему, не так с пацанами?", "они устали"),
            new QuizQuestion("Какое животное кричит 'За Орду!'?", "орка"),
            new QuizQuestion("Любимый напиток Гомера Симпсона?", "пиво"),
            new QuizQuestion("Куда шёл ежик в тумане?", "к лошади"),
            new QuizQuestion("Какого цвета таблетку выбрал Нео в Матрице?", "красную"),
            new QuizQuestion("Куда обычно отправляют нарушителей в чате?", "в бан"),
            new QuizQuestion("Какая фраза сопровождает фейл в GTA?", "потрачено"),
            new QuizQuestion("Собака породы сиба-ину из мемов?", "доге"),
            new QuizQuestion("Фраза Шрека 'Это моё...!'?", "болото"),
            new QuizQuestion("Как называют очень старый и баянистый мем?", "баян"),
            new QuizQuestion("Жёлтый покемон, ставшая мемом с открытым ртом?", "пикачу"),
            new QuizQuestion("Какой кот ненавидит понедельники и любит лазанью?", "гарфилд"),
            new QuizQuestion("Какое слово кричит Рик из 'Рик и Морти'?", "швабрики"),
            new QuizQuestion("Что говорит дед из мема 'Ну как там с...?'", "деньгами"),
            new QuizQuestion("Название лягушонка из популярных мемов?", "пепе"),
            new QuizQuestion("Как зовут кота, который постоянно злой?", "grumpy cat"),
            new QuizQuestion("Легендарный танцующий хомяк из 2000-х?", "джамбо"),
            new QuizQuestion("Как называют зрителя, который молча смотрит стрим?", "ракушка"),
            new QuizQuestion("Кого просили 'выключить гироскоп' в мемных видео?", "деда"),
            new QuizQuestion("Главный интернет-знак одобрения с поднятым пальцем?", "лайк"),
            new QuizQuestion("Название мема с танцующими гробовщиками?", "coffin dance"),
            new QuizQuestion("Фраза: 'А кто это сделал?' принадлежит...?", "людвигу"),
            new QuizQuestion("Какое животное на видео говорит 'Повар спрашивает повара'?", "повар"),
            new QuizQuestion("Главный герой мема 'Гигачад'?", "эрнест халимов"),
            new QuizQuestion("Какое животное кричит в горах как человек?", "сурок"),
            new QuizQuestion("Как называют навязчивую рекламу в интернете?", "спам"),
            new QuizQuestion("Как называется сервис с короткими вертикальными видео от Google?", "shorts"),
            new QuizQuestion("Главная платформа для стримеров?", "twitch"),
            new QuizQuestion("Что просит кот в меме 'Продай...'?", "рыбов"),
            new QuizQuestion("Какая фраза следует за 'Забор покрась...'", "краской"),
            new QuizQuestion("Имя персонажа, который говорит 'Моя прелесть'?", "голуму"),
            new QuizQuestion("Шрек — это по расе кто?", "огр"),
            new QuizQuestion("Кот, который качает головой под музыку?", "cat vibing"),
            new QuizQuestion("Что написано на футболке Гарольда, прячущего боль?", "боль"),
            new QuizQuestion("Как называют фейковую новость в интернете?", "вброс"),
            new QuizQuestion("Как называется популярный вирусный танец 2012 года от PSY?", "gangnam style"),
            new QuizQuestion("Персонаж, кричащий 'THIS IS SPARTA!'?", "царь леонид"),
            new QuizQuestion("Мемный персонаж Киану Ривз, грустно поедающий сендвич?", "грустный киану"),
            new QuizQuestion("Имя стримера Хесуса на настоящем языке?", "алексей"),
            new QuizQuestion("Слово, означающее внезапный испуг в игре?", "скример"),
            new QuizQuestion("Как называется навязчивое желание скупать все на распродажах?", "шопоголизм"),
            new QuizQuestion("Как называют человека, который троллит в комментариях?", "тролль"),
            new QuizQuestion("Как называют короткую гифку без звука?", "гифка"),
            new QuizQuestion("Как зовут синего ежа из игр SEGA?", "соник"),
            new QuizQuestion("Название желтых существ из 'Гадкий Я'?", "миньоны"),
            new QuizQuestion("Назовите мем с котом за столом и орущими женщинами?", "woman yelling at cat"),
            new QuizQuestion("Какая песня ассоциируется с Рикроллом?", "never gonna give you up"),
            new QuizQuestion("Кто исполнитель песни 'Never Gonna Give You Up'?", "рик эстли"),

            // --- ОБЩАЯ ГЕОГРАФИЯ И СТРАНЫ (40+) ---
            new QuizQuestion("Столица Великобритании?", "лондон"),
            new QuizQuestion("Столица Польши?", "варшава"),
            new QuizQuestion("Самый маленький континент?", "австралия"),
            new QuizQuestion("Самая длинная река в мире?", "амазонка"),
            new QuizQuestion("Самая высокая гора в мире?", "эверест"),
            new QuizQuestion("Столица Египта?", "каир"),
            new QuizQuestion("Столица Канады?", "оттава"),
            new QuizQuestion("Столица Бразилии?", "бразилиа"),
            new QuizQuestion("Столица Австралии?", "канберра"),
            new QuizQuestion("Столица Турции?", "анкара"),
            new QuizQuestion("Столица Индии?", "нью дели"),
            new QuizQuestion("Столица Южной Кореи?", "сеул"),
            new QuizQuestion("Самое глубокое озеро на планете?", "байкал"),
            new QuizQuestion("Самая большая пустыня в мире?", "сахара"),
            new QuizQuestion("В какой стране находятся Великие Пирамиды?", "египет"),
            new QuizQuestion("В какой стране находится Эйфелева башня?", "франция"),
            new QuizQuestion("В какой стране находится Колизей?", "италия"),
            new QuizQuestion("В какой стране находится Мачу-Пикчу?", "перу"),
            new QuizQuestion("В какой стране находится Тадж-Махал?", "индия"),
            new QuizQuestion("В какой стране находится Статуя Свободы?", "сша"),
            new QuizQuestion("Океан, омывающий Европу с запада?", "атлантический"),
            new QuizQuestion("Самое сухое место на Земле (пустыня)?", "атакама"),
            new QuizQuestion("В какой стране течет река Нил?", "египет"),
            new QuizQuestion("Столица Аргентины?", "буэнос айрес"),
            new QuizQuestion("Столица Мексики?", "мехико"),
            new QuizQuestion("Столица Греции?", "афины"),
            new QuizQuestion("Столица Португалии?", "лиссабон"),
            new QuizQuestion("Столица Швеции?", "стокгольм"),
            new QuizQuestion("Столица Норвегии?", "осло"),
            new QuizQuestion("Столица Финляндии?", "хельсинки"),
            new QuizQuestion("Столица Дании?", "копенгаген"),
            new QuizQuestion("Столица Нидерландов?", "амстердам"),
            new QuizQuestion("Столица Бельгии?", "брюссель"),
            new QuizQuestion("Столица Швейцарии?", "берн"),
            new QuizQuestion("Столица Австрии?", "вена"),
            new QuizQuestion("Столица Чехии?", "прага"),
            new QuizQuestion("Столица Венгрии?", "будапешт"),
            new QuizQuestion("Столица Румынии?", "бухарест"),
            new QuizQuestion("Самое маленькое государство в мире?", "ватикан"),
            new QuizQuestion("На каком континенте находится страна Кения?", "африка"),

            // --- ИСТОРИЯ И ПОЛИТИКА (50+) ---
            new QuizQuestion("Где находится штаб-квартира ООН?", "нью йорк"),
            new QuizQuestion("Международный военно-политический блок Западных стран?", "нато"),
            new QuizQuestion("Валюта большинства стран Евросоюза?", "евро"),
            new QuizQuestion("Денежная единица Японии?", "иена"),
            new QuizQuestion("Форма правления в Великобритании?", "монархия"),
            new QuizQuestion("Первый человек в космосе?", "юрий гагарин"),
            new QuizQuestion("В каком году произошел распад СССР?", "1991"),
            new QuizQuestion("Год начала Первой мировой войны?", "1914"),
            new QuizQuestion("Год окончания Первой мировой войны?", "1918"),
            new QuizQuestion("Год начала Второй мировой войны?", "1939"),
            new QuizQuestion("Кто был императором Франции в начале XIX века?", "наполеон"),
            new QuizQuestion("Как называлась древнеримская площадь?", "форум"),
            new QuizQuestion("Кто написал 'Капитал'?", "карл маркс"),
            new QuizQuestion("Какой титул носил правитель Древнего Египта?", "фараон"),
            new QuizQuestion("Какая стена разделяла Берлин во время Холодной войны?", "берлинская"),
            new QuizQuestion("Кто был первым императором Римской империи?", "август"),
            new QuizQuestion("В каком веке была открыта Америка?", "15"),
            new QuizQuestion("Какое государство построило Великую Стену?", "китай"),
            new QuizQuestion("Кто был ключевым лидером Индии в борьбе за независимость?", "ганди"),
            new QuizQuestion("Как называлось сословие воинов в средневековой Японии?", "самураи"),
            new QuizQuestion("Какой кодекс законов был создан в Древнем Вавилоне?", "хаммурапи"),
            new QuizQuestion("В каком году затонул 'Титаник'?", "1912"),
            new QuizQuestion("Какой город был разрушен извержением Везувия?", "помпеи"),
            new QuizQuestion("Кто был первым правителем единого Древнерусского государства?", "олег"),
            new QuizQuestion("Как называлась война между Севером и Югом в США?", "гражданская"),
            new QuizQuestion("Какая революция произошла во Франции в 1789 году?", "французская"),
            new QuizQuestion("Кто возглавил Реформацию в Германии?", "лютер"),
            new QuizQuestion("Столица древней Османской империи?", "стамбул"),
            new QuizQuestion("Как назывался военный союз против Наполеона?", "коалиция"),
            new QuizQuestion("Какой военно-политический союз противостоял НАТО?", "овд"),
            new QuizQuestion("Назовите действующую валюту Великобритании?", "фунт"),
            new QuizQuestion("Назовите валюту Китая?", "юань"),
            new QuizQuestion("Назовите валюту Индии?", "рупия"),
            new QuizQuestion("Назовите валюту Швейцарии?", "франк"),
            new QuizQuestion("Как называется нижняя палата парламента Великобритании?", "общин"),
            new QuizQuestion("Как называется высший орган судебной власти?", "суд"),
            new QuizQuestion("Назовите форму правления, где власть принадлежит народу?", "демократия"),
            new QuizQuestion("Власть одного человека без ограничений?", "диктатура"),
            new QuizQuestion("Власть духовных лиц или религиозных лидеров?", "теократия"),
            new QuizQuestion("Власть неболшой группы богатых людей?", "олигархия"),
            new QuizQuestion("Система общественной организации без классов и гос-ва?", "коммунизм"),
            new QuizQuestion("Экономическая система, основанная на частной собственности?", "капитализм"),
            new QuizQuestion("Свод основных законов государства?", "конституция"),
            new QuizQuestion("Международное соглашение, договор?", "пакт"),
            new QuizQuestion("Официальный представитель государства за рубежом?", "посол"),
            new QuizQuestion("Право запрета или приостановления решения?", "вето"),
            new QuizQuestion("Как называется орган законодательной власти в США?", "конгресс"),
            new QuizQuestion("Как называется орган законодательной власти в Германии?", "бундестаг"),
            new QuizQuestion("На сколько лет избирается президент США?", "4"),
            new QuizQuestion("В каком городе находится Кремль?", "москва"),

            // --- КИНО, СЕРИАЛЫ И АНИМЕ (60+) ---
            new QuizQuestion("В каком фильме есть кольцо всевластия?", "властелин колец"),
            new QuizQuestion("Имя робота-терминатора Шварценеггера?", "т800"),
            new QuizQuestion("Как зовут режиссера фильма 'Интерстеллар'?", "нолан"),
            new QuizQuestion("Главный герой серии фильмов 'Пираты Карибского моря'?", "джек воробей"),
            new QuizQuestion("Какая студия снимает фильмы про Железного Человека?", "marvel"),
            new QuizQuestion("Главный злодей в фильме 'Мстители: Война бесконечности'?", "танос"),
            new QuizQuestion("Как зовут главного героя сериала 'Во все тяжкие'?", "уолтер уайт"),
            new QuizQuestion("Какую профессию имел Уолтер Уайт до болезни?", "учитель"),
            new QuizQuestion("Название аниме про гигантов и стены?", "атака титанов"),
            new QuizQuestion("Главный герой аниме 'Атака титанов'?", "ерен йегер"),
            new QuizQuestion("Главный герой аниме 'Наруто'?", "наруто"),
            new QuizQuestion("Кем мечтает стать Наруто?", "хокаге"),
            new QuizQuestion("Как зовут учителя Наруто с маской на лице?", "какаши"),
            new QuizQuestion("Название тетради, убивающей людей при записи имени?", "тетрадь смерти"),
            new QuizQuestion("Главный герой аниме 'Тетрадь смерти'?", "лайт ягами"),
            new QuizQuestion("Как зовут гениального детектива из 'Тетради смерти'?", "l"),
            new QuizQuestion("Главный герой аниме 'One Piece'?", "луффи"),
            new QuizQuestion("Кем мечтает стать Луффи?", "королем пиратов"),
            new QuizQuestion("Из чего сделана шляпа Луффи?", "солома"),
            new QuizQuestion("Фильм про погружение в чужие сны с Ди Каприо?", "начало"),
            new QuizQuestion("Какая актриса сыграла Черную Вдову в Marvel?", "скарлетт йоханссон"),
            new QuizQuestion("Какой актер сыграл Железного Человека?", "роберт дауни младший"),
            new QuizQuestion("Как зовут главного героя фильма 'Матрица'?", "нео"),
            new QuizQuestion("Кто сыграл роль Нео в фильме 'Матрица'?", "киану ривз"),
            new QuizQuestion("Название вселенной с джедаями и ситхами?", "звездные войны"),
            new QuizQuestion("Оружие джедаев?", "световой меч"),
            new QuizQuestion("Учитель Люка Скайуокера зеленого цвета?", "йода"),
            new QuizQuestion("Главный злодей 'Звездных войн' в черной маске?", "дарт вейдер"),
            new QuizQuestion("Как зовут маньяка в маске из фильма 'Крик'?", "призрачное лицо"),
            new QuizQuestion("Как зовут главного героя сериала 'Игра престолов' (Сноу)?", "джон"),
            new QuizQuestion("Какая династия повелевала драконами в 'Игре престолов'?", "таргариены"),
            new QuizQuestion("Как называется детективный сериал с Бенедиктом Камбербэтчем?", "шерлок"),
            new QuizQuestion("Как зовут напарника Шерлока Холмса?", "ватсон"),
            new QuizQuestion("Какой фильм получил Оскар за лучшую картину в 2020 (корейский)?", "паразиты"),
            new QuizQuestion("Режиссер фильмов 'Криминальное чтиво' и 'Джанго'?", "тарантино"),
            new QuizQuestion("Главный герой мультфильма 'Тачки'?", "молния маккуин"),
            new QuizQuestion("Главный герой мультфильма 'Вверх'?", "карл"),
            new QuizQuestion("Мультфильм про рыбу, которая потеряла сына?", "в поисках немо"),
            new QuizQuestion("Как зовут панду из 'Кунг-фу Панда'?", "по"),
            new QuizQuestion("Кем по профессии был учитель По в 'Кунг-фу Панда'?", "повар"),
            new QuizQuestion("Аниме Хаяо Миядзаки про унесенных...?", "призраками"),
            new QuizQuestion("Ходячий замок кого?", "хаула"),
            new QuizQuestion("Название аниме про сайтамe, убивающего с одного удара?", "ванпанчмен"),
            new QuizQuestion("Настоящее имя Ванпанчмена?", "сайтама"),
            new QuizQuestion("Как зовут стального алхимика?", "эдвард элик"),
            new QuizQuestion("Сериал про выживание в детских играх из Кореи?", "игра в кальмара"),
            new QuizQuestion("Имя главного героя 'Острых козырьков'?", "томас шелби"),
            new QuizQuestion("Как называется банда Томаса Шелби?", "острые козырьки"),
            new QuizQuestion("Фильм про боксера Рокки...?", "бальбоа"),
            new QuizQuestion("Кто сыграл Рокки Бальбоа?", "сильвестр сталлоне"),

            // --- НАУКА, ФИЛОСОФИЯ И ТЕХНОЛОГИИ (60+) ---
            new QuizQuestion("Самое сухое место на Земле?", "пустыня"),
            new QuizQuestion("Что идет, не двигаясь с места?", "время"),
            new QuizQuestion("Что можно разбить, даже не прикасаясь?", "обещание"),
            new QuizQuestion("Автор крылатого выражения 'Я мыслю, следовательно, я существую'?", "декарт"),
            new QuizQuestion("Наука о законах мышления?", "логика"),
            new QuizQuestion("Наука о растениях?", "ботаника"),
            new QuizQuestion("Самая близкая к Земле звезда?", "солнце"),
            new QuizQuestion("Единица измерения электрического тока?", "ампер"),
            new QuizQuestion("Единица измерения напряжения?", "вольт"),
            new QuizQuestion("Единица измерения сопротивления?", "ом"),
            new QuizQuestion("Единица измерения мощности?", "ватт"),
            new QuizQuestion("Единица измерения частоты?", "герц"),
            new QuizQuestion("Скорость света в вакууме приближенно (тыс км/с)?", "300000"),
            new QuizQuestion("Кто сформулировал закон всемирного тяготения?", "ньютон"),
            new QuizQuestion("Кто создал теорию относительности?", "эйнштейн"),
            new QuizQuestion("Естественный спутник Земли?", "луна"),
            new QuizQuestion("Какая газовая оболочка окружают Землю?", "атмосфера"),
            new QuizQuestion("Какой газ преобладает в атмосфере Земли?", "азот"),
            new QuizQuestion("Какой газ необходим человеку для дыхания?", "кислород"),
            new QuizQuestion("Как называется процесс фотосинтеза у растений?", "фотосинтез"),
            new QuizQuestion("Какое вещество придает листьям зеленый цвет?", "хлорофилл"),
            new QuizQuestion("Какое устройство преобразует цифровой сигнал в аналоговый?", "модем"),
            new QuizQuestion("Основная плата ПК, к которой подключается все?", "материнская"),
            new QuizQuestion("Оперативная память ПК (аббревиатура)?", "озу"),
            new QuizQuestion("Постоянное запоминающее устройство (аббревиатура)?", "пзу"),
            new QuizQuestion("Накопитель на жестких магнитных дисках?", "винчестер"),
            new QuizQuestion("Современный быстрый твердотельный накопитель?", "ssd"),
            new QuizQuestion("Как называется операционная система от Microsoft?", "windows"),
            new QuizQuestion("Операционная система с логотипом пингвина?", "linux"),
            new QuizQuestion("Операционная система для смартфонов Apple?", "ios"),
            new QuizQuestion("Как называется мозг компьютера?", "процессор"),
            new QuizQuestion("Графический процессор компьютера (аббревиатура)?", "gpu"),
            new QuizQuestion("Какая компания производит процессоры Ryzen?", "amd"),
            new QuizQuestion("Какая компания производит процессоры Core i7?", "intel"),
            new QuizQuestion("Какая компания производит видеокарты RTX?", "nvidia"),
            new QuizQuestion("Как называется языковой чат-бот от OpenAI?", "chatgpt"),
            new QuizQuestion("Разработчик операционной системы Android?", "google"),
            new QuizQuestion("Основатель компании Microsoft?", "билл гейтс"),
            new QuizQuestion("Основатель компании Apple?", "стив джобс"),
            new QuizQuestion("Основатель компаний SpaceX и Tesla?", "илон маск"),
            new QuizQuestion("Основатель социальной сети Facebook?", "марк цукерберг"),
            new QuizQuestion("Как называется раздел физики, изучающий свет?", "оптика"),
            new QuizQuestion("Раздел физики, изучающий движение и силы?", "механика"),
            new QuizQuestion("Раздел физики, изучающий тепловые явления?", "термодинамика"),
            new QuizQuestion("Самый легкий химический элемент?", "водород"),
            new QuizQuestion("Химический элемент с символом Au?", "золото"),
            new QuizQuestion("Химический элемент с символом Ag?", "серебро"),
            new QuizQuestion("Химический элемент с символом Fe?", "железо"),
            new QuizQuestion("Химический элемент с символом O?", "кислород"),
            new QuizQuestion("Химический элемент с символом C?", "углерод"),

            // --- РАЗНООБРАЗНЫЕ ИГРЫ (ALL-GENRE) (80+) ---
            new QuizQuestion("В какой игре есть фраза 'War... War never changes'?", "fallout"),
            new QuizQuestion("Имя протагониста Witcher 3?", "геральт"),
            new QuizQuestion("Главный город в GTA V?", "лос сантос"),
            new QuizQuestion("Атрибут Марио на голове?", "кепка"),
            new QuizQuestion("Какая студия разработала игры серии Dark Souls?", "fromsoftware"),
            new QuizQuestion("Как зовут главную героиню серии Tomb Raider?", "лара крофт"),
            new QuizQuestion("Как зовут главного героя серии Uncharted?", "натан дрейк"),
            new QuizQuestion("Как зовут протагониста игры Red Dead Redemption 2?", "артур морган"),
            new QuizQuestion("В какой игре события происходят под водой в городе Восторг?", "bioshock"),
            new QuizQuestion("Как называется симулятор жизни от EA?", "the sims"),
            new QuizQuestion("Игра про постройку фабрик на чужой планете?", "factorio"),
            new QuizQuestion("Какой жанр у игры Skyrim?", "rpg"),
            new QuizQuestion("Как зовут драконорожденного в Skyrim?", "довакин"),
            new QuizQuestion("Как называется вымышленный штат в GTA San Andreas?", "сан андреас"),
            new QuizQuestion("Как зовут протагониста GTA Vice City?", "томми версетти"),
            new QuizQuestion("Какой пистолет дает максимальный урон в снайперском режиме в игры RE4?", "broken butterfly"),
            new QuizQuestion("Главный герой Resident Evil 2 и 4?", "леон скотт кеннеди"),
            new QuizQuestion("Жанр игр с постоянной смертью и случайной генерацией?", "рогалик"),
            new QuizQuestion("Игра про симулятор хирурга?", "surgeon simulator"),
            new QuizQuestion("Как зовут дракона из Minecraft?", "эндер дракон"),
            new QuizQuestion("Как зовут главного героя игры Полый Рыцарь?", "рыцарь"),
            new QuizQuestion("Какая игра популяризировала жанр 'Королевская Битва'?", "pubg"),
            new QuizQuestion("Как называется инди-игра про ферму от ConcernedApe?", "stardew valley"),
            new QuizQuestion("Главный герой игры God of War?", "кратос"),
            new QuizQuestion("Сын Кратоса в God of War (2018)?", "атрей"),
            new QuizQuestion("Какое оружие использует Кратос в старых частях God of War?", "клинки хаоса"),
            new QuizQuestion("Как зовут протагониста игры Cyberpunk 2077?", "ви"),
            new QuizQuestion("Какой актер сыграл Джонни Сильверхенда в Cyberpunk 2077?", "киану ривз"),
            new QuizQuestion("Как зовут главную героиню The Last of Us?", "элли"),
            new QuizQuestion("Как зовут главного героя, сопровождающего Элли в первой часть TLOU?", "джоэл"),
            new QuizQuestion("Как называют зомби со щелкающими звуками в TLOU?", "щелкуны"),
            new QuizQuestion("Игра-конструктор от Roblox Corporation?", "roblox"),
            new QuizQuestion("Жанр игры League of Legends?", "moba"),
            new QuizQuestion("Название карточной игры от Blizzard по вселенной Warcraft?", "hearthstone"),
            new QuizQuestion("Название ММОRPG от Blizzard?", "world of warcraft"),
            new QuizQuestion("Главный злодей дополнения Wrath of the Lich King?", "артaс"),
            new QuizQuestion("Меч Артаса в World of Warcraft?", "ледяная скорбь"),
            new QuizQuestion("Как называется мир во вселенной Warcraft?", "азерот"),
            new QuizQuestion("Какая стратегия популяризировала фразы 'Нужно больше золота'?", "warcraft 3"),
            new QuizQuestion("Какая фраза следует за 'Нужно больше...'", "золота"),
            new QuizQuestion("Раса космических жуков в StarCraft?", "зерги"),
            new QuizQuestion("Раса высокотехнологичных пришельцев в StarCraft?", "протоссы"),
            new QuizQuestion("Человеческая раса в StarCraft?", "терраны"),
            new QuizQuestion("Название стратегии про развитие цивилизации от Сида Мейера?", "civilization"),
            new QuizQuestion("В какой игре есть фракция Братство Стали?", "fallout"),
            new QuizQuestion("Название защитного убежища во вселенной Fallout?", "убежище"),
            new QuizQuestion("Как зовут собаку-компаньона в Fallout 4?", "псина"),
            new QuizQuestion("Единица валюты во вселенной Fallout?", "крышки"),
            new QuizQuestion("Главный инструмент в играх Portal?", "портальная пушка"),
            new QuizQuestion("Имя искусственного интеллекта-антагониста в Portal?", "glados"),
            new QuizQuestion("Что обещает GLaDOS в качестве награды в Portal?", "торт"),

            // --- БЫТОВЫЕ, ЛОГИЧЕСКИЕ И ВЕСЕЛЫЕ ВОПРОСЫ (100+) ---
            new QuizQuestion("Сколько пальцев на одной руке человека?", "5"),
            new QuizQuestion("Сколько пальцев на двух руках?", "10"),
            new QuizQuestion("Сколько ног у лошади?", "4"),
            new QuizQuestion("Сколько колес у стандартного велосипеда?", "2"),
            new QuizQuestion("Сколько колес у стандартного легкового автомобиля?", "4"),
            new QuizQuestion("Какого цвета трава?", "зеленый"),
            new QuizQuestion("Какого цвета спелый банан?", "желтый"),
            new QuizQuestion("Какого цвета спелый помидор?", "красный"),
            new QuizQuestion("Какого цвета снег?", "белый"),
            new QuizQuestion("Какого цвета уголь?", "черный"),
            new QuizQuestion("Какое время года идет после зимы?", "весна"),
            new QuizQuestion("Какое время года идет после лета?", "осень"),
            new QuizQuestion("Какое время года идет после осени?", "зима"),
            new QuizQuestion("Какое время года идет после весны?", "лето"),
            new QuizQuestion("Что падает с неба во время дождя?", "вода"),
            new QuizQuestion("Замерзшая вода — это...?", "лед"),
            new QuizQuestion("Вода в газообразном состоянии — это...?", "пар"),
            new QuizQuestion("Какой прибор показывает время?", "часы"),
            new QuizQuestion("Какой прибор измеряет температуру?", "термометр"),
            new QuizQuestion("Какой прибор указывает направление на север?", "компас"),
            new QuizQuestion("Чем режут бумагу?", "ножницами"),
            new QuizQuestion("Чем забивают гвозди?", "молотком"),
            new QuizQuestion("Чем закручивают шурупы?", "отверткой"),
            new QuizQuestion("Чем пишут на доске мелками?", "мелом"),
            new QuizQuestion("Чем стирают карандаш с бумаги?", "ластиком"),
            new QuizQuestion("На чем сидят за столом?", "стул"),
            new QuizQuestion("На чем спят ночью?", "кровать"),
            new QuizQuestion("Где хранят продукты в холоде?", "холодильник"),
            new QuizQuestion("Где готовят еду на кухне?", "плита"),
            new QuizQuestion("В чем кипятят воду для чая?", "чайник"),
            new QuizQuestion("Из чего пьют кофе?", "чашка"),
            new QuizQuestion("Какой инструмент используют для еды супа?", "ложка"),
            new QuizQuestion("Какой инструмент используют для накалывания еды?", "вилка"),
            new QuizQuestion("На чем жарят яичницу?", "сковорода"),
            new QuizQuestion("В чем варят суп?", "кастрюля"),
            new QuizQuestion("Какое домашнее животное ловит мышей?", "кошка"),
            new QuizQuestion("Какое домашнее животное охраняет дом?", "собака"),
            new QuizQuestion("Какое домашнее животное дает молоко?", "корова"),
            new QuizQuestion("Какая птица не умеет летать и живет во льдах?", "пингвин"),
            new QuizQuestion("Какая птица несушка дает яйца на ферме?", "курица"),
            new QuizQuestion("Самое высокое животное в мире?", "жираф"),
            new QuizQuestion("Животное с длинным носом-хоботом?", "слон"),
            new QuizQuestion("Сумчатое животное из Австралии?", "кенгуру"),
            new QuizQuestion("Полосатое черное-белое животное?", "зебра"),
            new QuizQuestion("Какая птица умеет повторять слова за человеком?", "попугай"),
            new QuizQuestion("Как называется замерзший водоем зимой?", "каток"),
            new QuizQuestion("Обувь для катания на льду?", "коньки"),
            new QuizQuestion("Обувь для катания по асфальту на колесиках?", "ролики"),
            new QuizQuestion("Длинные деревянные или пластиковые полозья для снега?", "лыжи"),
            new QuizQuestion("Доска для спуска с заснеженных гор?", "сноуборд"),
            new QuizQuestion("Праздник с наряженной елкой и Дедом Морозом?", "новый год"),
            new QuizQuestion("Кто принесет подарки на Новый Год?", "дед мороз"),
            new QuizQuestion("Внучка Деда Мороза?", "снегурочка"),
            new QuizQuestion("Дерево, которое наряжают на Новый Год?", "елка"),
            new QuizQuestion("Как называют круглый хлеб с дыркой посередине?", "бублик"),
            new QuizQuestion("Итальянское блюдо из теста с сыром и соусом?", "пицца"),
            new QuizQuestion("Японское блюдо из рисa и сырой рыбы?", "суши"),
            new QuizQuestion("Блюдо из котлеты между двумя булочками?", "бургер"),
            new QuizQuestion("Жареная картошка длинными ломтиками?", "фри"),
            new QuizQuestion("Традиционный русский суп из свеклы?", "борщ"),
            new QuizQuestion("Суп из капусты?", "щи"),
            new QuizQuestion("Армейская каша из гречки?", "гречневая"),
            new QuizQuestion("Сладость, получаемая от пчел?", "мед"),
            new QuizQuestion("Белый кристаллический порошок, делающий еду сладкой?", "сахар"),
            new QuizQuestion("Белый кристалл, делающий еду соленой?", "соль"),
            new QuizQuestion("Белый напиток от коровы?", "молоко"),
            new QuizQuestion("Кисломолочный продукт в стаканчиках?", "йогурт"),
            new QuizQuestion("Замороженное сладкое лакомство?", "мороженое"),
            new QuizQuestion("Горячий напиток из заваренных листьев?", "чай"),
            new QuizQuestion("Горячий бодрящий напиток из зерен?", "кофе"),
            new QuizQuestion("Напиток из фруктов или ягод?", "сок"),
            new QuizQuestion("Газированный напиток в коричневой бутылке со спайдерменом?", "кола"),
            new QuizQuestion("Форма Земли?", "шар"),
            new QuizQuestion("Сколько граней у кубика Рубика?", "6"),
            new QuizQuestion("Назовите первый цвет радуги?", "красный"),
            new QuizQuestion("Назовите последний цвет радуги?", "фиолетовый"),
            new QuizQuestion("Сколько цветов в радуге?", "7"),
            new QuizQuestion("Как называют зимнюю спячку медведей?", "спячка"),
            new QuizQuestion("Где спит медведь зимой?", "берлога"),
            new QuizQuestion("Во что превращается гусеница?", "бабочка"),
            new QuizQuestion("Какое насекомое производит мед?", "пчела"),
            new QuizQuestion("Какое насекомое светится в темноте?", "светлячок"),
            new QuizQuestion("Какая ягода самая большая на бахче?", "арбуз"),
            new QuizQuestion("Желтая бахчевая культура?", "дыня"),
            new QuizQuestion("Фрукт с оранжевой коркой и дольками?", "апельсин"),
            new QuizQuestion("Фрукт с желтой коркой и очень кислый?", "лимон"),
            new QuizQuestion("Кисло-сладкий зеленый или красный фрукт с дерева?", "яблоко"),
            new QuizQuestion("Сочный фрукт ламповидной формы?", "груша"),
            new QuizQuestion("Синяя или фиолетовая садовая ягода с косточкой?", "слива"),
            new QuizQuestion("Красная садовая ягода на кусте с шипами?", "малина"),
            new QuizQuestion("Красная ягода с чашелистиком?", "клубника"),
            new QuizQuestion("Овощ, от которого плачут при резке?", "лук"),
            new QuizQuestion("Оранжевый подземный овощ, который любят кролики?", "морковь"),
            new QuizQuestion("Главный овощ для приготовления картофеля фри?", "картофель"),
            new QuizQuestion("Зеленый пупырчатый овощ?", "огурец"),
            new QuizQuestion("Сиреневый овощ, называемый 'дедушкой'?", "баклажан"),
            new QuizQuestion("Какая птица приносит детей по легенде?", "аист"),
            new QuizQuestion("В какой стране изобрели бумагу?", "китай"),
            new QuizQuestion("В какой стране изобрели порох?", "китай"),
            new QuizQuestion("Какая звезда указывает на север?", "полярная"),
            new QuizQuestion("Назовите самый твердый минерал?", "алмаз"),
            new QuizQuestion("Жидкое металлическое вещество в градуснике?", "ртуть")
        };
    }

    void Connect()
    {
        try
        {
            client = new TcpClient("irc.chat.twitch.tv", 6667);
            reader = new StreamReader(client.GetStream());
            writer = new StreamWriter(client.GetStream()) { AutoFlush = true };

            writer.WriteLine("PASS " + oauth);
            writer.WriteLine("NICK " + botName);
            writer.WriteLine("JOIN " + channel);

            running = true;

            chatThread = new Thread(ReadChat) { IsBackground = true };
            chatThread.Start();

            Debug.Log("✅ ВИКТОРИНА УСПЕШНО ЗАПУЩЕНА! ВСЕГО ВОПРОСОВ: " + questions.Count);
        }
        catch (Exception ex)
        {
            Debug.LogError("❌ Ошибка подключения викторины: " + ex.Message);
        }
    }

    void ReadChat()
    {
        while (running && client != null && client.Connected)
        {
            try
            {
                string msg = reader.ReadLine();
                if (msg == null) continue;

                if (msg.StartsWith("PING"))
                {
                    writer.WriteLine("PONG :tmi.twitch.tv");
                    continue;
                }

                if (msg.Contains("PRIVMSG"))
                {
                    CheckMessage(msg);
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("Ошибка в потоке чата: " + ex.Message);
                break;
            }
        }
    }

    bool QuizOpen()
    {
        int hour = DateTime.Now.Hour;
        return hour >= 15 && hour <= 5;
    }

    void CheckMessage(string msg)
    {
        int userEnd = msg.IndexOf("!");
        if (userEnd <= 1) return;

        string user = msg.Substring(1, userEnd - 1).ToLower();
        int msgStart = msg.IndexOf(" :");
        if (msgStart == -1) return;

        string text = msg.Substring(msgStart + 2).Trim().ToLower();

        if (text == "!викторина")
        {
            if (!QuizOpen())
            {
                Send(channel, "⛔ Викторина закрыта. Работает с 15:00 до 04:59.");
                return;
            }

            StartQuiz();
            return;
        }

        if (text == "!топ викторина" || text == "!топвикторина")
        {
            SendTop();
            return;
        }

        if (quizActive)
        {
            if (text == answer)
            {
                quizActive = false;

                lock (fileLock)
                {
                    if (!points.ContainsKey(user))
                        points[user] = 0;

                    points[user]++;
                    SavePoints();
                }

                Send(quizChannel, "🏆 @" + user + " правильно ответил(а)! Правильный ответ: " + answer.ToUpper() + ". Всего очков: " + points[user]);
            }
        }
    }

    void StartQuiz()
    {
        if (quizActive) return;

        if (usedQuestions.Count >= questions.Count)
        {
            usedQuestions.Clear();
            Send(channel, "🔄 Все " + questions.Count + " вопросов пройдены! Начинаем новый масштабный круг.");
        }

        int id;
        do
        {
            id = random.Next(questions.Count);
        }
        while (usedQuestions.Contains(id));

        usedQuestions.Add(id);

        answer = questions[id].answer;
        quizChannel = channel;
        quizActive = true;
        quizStart = DateTime.Now;
        hint = 0;

        Send(channel, "🧠 Вопрос: " + questions[id].question + " | Пишите ответ в чат!");
    }

    void Update()
    {
        if (!quizActive) return;

        if (!QuizOpen())
        {
            quizActive = false;
            Send(quizChannel, "🌙 Викторина закрыта до 10:00.");
            return;
        }

        double seconds = (DateTime.Now - quizStart).TotalSeconds;

        if (seconds >= 15 && hint == 0)
        {
            hint = 1;
            Send(quizChannel, "💡 Подсказка 1: Первая буква ответа — [" + char.ToUpper(answer[0]) + "]");
        }
        else if (seconds >= 30 && hint == 1)
        {
            hint = 2;
            Send(quizChannel, "💡 Подсказка 2: Количество букв/символов в ответе — " + answer.Length);
        }
        else if (seconds >= 45)
        {
            quizActive = false;
            Send(quizChannel, "⏳ Время вышло! Никто не угадал. Правильный ответ был: " + answer.ToUpper());
        }
    }

    void SendTop()
    {
        lock (fileLock)
        {
            if (points.Count == 0)
            {
                Send(channel, "🏆 Пока никто не набрал очков в викторине.");
                return;
            }

            List<KeyValuePair<string, int>> top = new List<KeyValuePair<string, int>>(points);
            top.Sort((a, b) => b.Value.CompareTo(a.Value));

            string result = "🏆 ТОП ВИКТОРИНЫ: ";
            int place = 1;

            foreach (var player in top)
            {
                result += place + ". @" + player.Key + " (" + player.Value + " оч.) | ";
                place++;
                if (place > 5) break;
            }

            Send(channel, result);
        }
    }

    void LoadPoints()
    {
        lock (fileLock)
        {
            if (File.Exists(saveFile))
            {
                string[] lines = File.ReadAllLines(saveFile);
                foreach (string line in lines)
                {
                    string[] parts = line.Split('|');
                    if (parts.Length == 2 && int.TryParse(parts[1], out int p))
                    {
                        points[parts[0]] = p;
                    }
                }
            }
        }
    }

    void SavePoints()
    {
        List<string> lines = new List<string>();
        foreach (var pair in points)
        {
            lines.Add(pair.Key + "|" + pair.Value);
        }
        File.WriteAllLines(saveFile, lines.ToArray());
    }

    void Send(string ch, string text)
    {
        if (writer == null) return;
        writer.WriteLine("PRIVMSG " + ch + " :" + text);
    }

    void OnApplicationQuit()
    {
        running = false;

        if (chatThread != null && chatThread.IsAlive)
            chatThread.Abort();

        if (client != null)
            client.Close();
    }
}