using UnityEngine;
using System;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Collections.Generic;

public class TwitchAutoReply : MonoBehaviour
{
    [Header("Настройки Twitch")]
    public string botName = "RGROMBOT";
    public string oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";

    public string channel1 = "Blind_Mdfk";
    public string channel2 = "vctivanova";
    public string channel3 = "QumosX";
    public string channel4 = "r0magr0m";

    private TcpClient client;
    private StreamReader reader;
    private StreamWriter writer;
    private Thread chatThread;

    // Множество ключей пользователей ("user_channel")
    private HashSet<string> users = new HashSet<string>();
    private readonly object fileLock = new object();

    private string saveFile;

    // Уникальные приветствия для каждого канала
    private Dictionary<string, string> channelGreetings = new Dictionary<string, string>()
    {
        { "blind_mdfk", "👋 Привет, @{user}! Добро пожаловать к Blind_Mdfk на стрим!" },
        { "vctivanova", "✨ О, приветик, @{user}! Рады видеть тебя у vctivanova!" },
        { "qumosx", "🔥 Салют, @{user}! Залетай на стрим к QumosX!" },
        { "r0magr0m", "🍞 Здарова, @{user}! Добро пожаловать на канал r0magr0m!" }
    };

    private HashSet<string> ignoredBots = new HashSet<string>()
    {
        "streamelements",
        "nightbot",
        "moobot",
        "wizebot",
        "fossabot",
        "streamlabs",
        "botrix",
        "soundalerts",
        "deepbot",
        "phantombot",
        "rgrombot",
        "jeetbot",
        "creatisbot",
        "qumosx",
        "r0magr0m",
        "romkagr0m",
        "vctivanova",
        "blind_mdfk"
    };

    private HashSet<string> owners = new HashSet<string>()
    {
        "blind_mdfk",
        "qumosx"
    };

    void Start()
    {
        // Используем persistentDataPath для гарантированного доступа на запись
        saveFile = Path.Combine(Application.persistentDataPath, "greeted_users.txt");

        LoadUsers();
        Connect();
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

            writer.WriteLine("JOIN #" + channel1.ToLower());
            writer.WriteLine("JOIN #" + channel2.ToLower());
            writer.WriteLine("JOIN #" + channel3.ToLower());
            writer.WriteLine("JOIN #" + channel4.ToLower());

            Debug.Log("✅ Приветствия включены!");

            chatThread = new Thread(ReadChat) { IsBackground = true };
            chatThread.Start();
        }
        catch (Exception e)
        {
            Debug.LogError("❌ Ошибка подключения: " + e.Message);
        }
    }

    void ReadChat()
    {
        while (client != null && client.Connected)
        {
            try
            {
                string line = reader.ReadLine();
                if (line == null) continue;

                if (line.StartsWith("PING"))
                {
                    writer.WriteLine("PONG :tmi.twitch.tv");
                    continue;
                }

                if (line.Contains("PRIVMSG"))
                {
                    string currentChannel = "";
                    int channelStart = line.IndexOf("#");

                    if (channelStart >= 0)
                    {
                        int channelEnd = line.IndexOf(" ", channelStart);
                        if (channelEnd > channelStart)
                        {
                            currentChannel = line.Substring(channelStart + 1, channelEnd - channelStart - 1).ToLower();
                        }
                    }

                    int userEnd = line.IndexOf('!');
                    if (userEnd <= 1) continue;
                    
                    string user = line.Substring(1, userEnd - 1).ToLower().Trim();

                    // Игнорируем бота, владельцев и других ботов
                    if (user == botName.ToLower() || owners.Contains(user) || ignoredBots.Contains(user))
                        continue;

                    // Уникальный ключ: пользователь + канал
                    string userKey = user + "_" + currentChannel;

                    lock (fileLock)
                    {
                        if (users.Contains(userKey))
                            continue;

                        users.Add(userKey);
                        SaveUsers();
                    }

                    // Формирование уникального приветствия
                    string greetingText;
                    if (channelGreetings.ContainsKey(currentChannel))
                    {
                        greetingText = channelGreetings[currentChannel].Replace("{user}", user);
                    }
                    else
                    {
                        greetingText = $"👋 Привет, {user}! Добро пожаловать на стрим!";
                    }

                    SendChatMessage(greetingText, currentChannel);
                }
            }
            catch (Exception e)
            {
                Debug.LogError("Ошибка чтения чата: " + e.Message);
                break;
            }
        }
    }

    void LoadUsers()
    {
        lock (fileLock)
        {
            if (File.Exists(saveFile))
            {
                string[] data = File.ReadAllLines(saveFile);
                foreach (string user in data)
                {
                    string trimmed = user.Trim();
                    if (!string.IsNullOrEmpty(trimmed))
                    {
                        users.Add(trimmed);
                    }
                }
                Debug.Log("📜 Загружено раннее приветствованных пользователей: " + users.Count);
            }
        }
    }

    void SaveUsers()
    {
        lock (fileLock)
        {
            try
            {
                File.WriteAllLines(saveFile, users);
            }
            catch (Exception ex)
            {
                Debug.LogError("❌ Ошибка сохранения списка пользователей: " + ex.Message);
            }
        }
    }

    void SendChatMessage(string text, string channel)
    {
        if (string.IsNullOrEmpty(channel) || writer == null) return;

        writer.WriteLine($"PRIVMSG #{channel} :{text}");
        Debug.Log($"💬 Приветствие отправлено в #{channel} для пользователя!");
    }

    void OnApplicationQuit()
    {
        SaveUsers();

        if (chatThread != null && chatThread.IsAlive)
            chatThread.Abort();

        writer?.Close();
        reader?.Close();
        client?.Close();
    }
}