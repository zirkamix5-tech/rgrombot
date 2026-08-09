import java.io.*;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class TwitchFamilySystem {

    // Настройки Twitch
    private String botName = "RGROMBOTt";
    private String oauth = "oauth:4z39cw1q1hwfxhjmqwoha1hhr2zo52";
    private String channelName = "QumosX";

    private Socket twitchClient;
    private BufferedReader reader;
    private BufferedWriter writer;
    private Thread readThread;
    private volatile boolean isRunning = true; // Флаг для безопасной остановки потока

    // Шведская семья: у пользователя может быть список супругов
    private Map<String, List<stringForMap>> marriages = new HashMap<>(); // Используем вспомогательный или заменяем на List<String>
    // Заменим списки на стандартные Java коллекции с обертками строк
    private Map<String, List<String>> marriagesMap = new HashMap<>();
    
    // Даты свадеб: ключ = "user1:user2", значение = дата
    private Map<String, LocalDateTime> marriageDates = new HashMap<>();
    
    // Предложения брака (кому -> кто)
    private Map<String, String> marriageProposals = new HashMap<>();

    // Список детей: имя ребёнка -> список ников родителей
    private Map<String, List<String>> children = new HashMap<>();

    private String savePath;

    public static void main(String[] args) {
        TwitchFamilySystem bot = new TwitchFamilySystem();
        bot.start();
    }

    public void start() {
        savePath = "family_data.txt";
        LoadData();
        ConnectToTwitch();

        // Держим приложение запущенным
        Runtime.getRuntime().addShutdownHook(new Thread(this::OnApplicationQuit));
    }

    void ConnectToTwitch() {
        try {
            twitchClient = new Socket("irc.chat.twitch.tv", 6667);
            reader = new BufferedReader(new InputStreamReader(twitchClient.getInputStream(), StandardCharsets.UTF_8));
            writer = new BufferedWriter(new OutputStreamWriter(twitchClient.getOutputStream(), StandardCharsets.UTF_8));

            writer.write("PASS " + oauth + "\r\n");
            writer.write("NICK " + botName + "\r\n");
            writer.write("JOIN #" + channelName.toLowerCase() + "\r\n");
            writer.flush();

            isRunning = true;
            readThread = new Thread(this::ReadChat);
            readThread.setDaemon(true);
            readThread.start();

            System.out.println("✅ Система семей и детей подключена к Twitch!");
        } catch (Exception ex) {
            System.err.println("❌ Ошибка подключения: " + ex.getMessage());
        }
    }

    void ReadChat() {
        while (isRunning && twitchClient != null && !twitchClient.isClosed()) {
            try {
                if (reader.ready()) {
                    String line = reader.readLine();
                    if (line == null || line.isEmpty()) continue;

                    if (line.startsWith("PING")) {
                        writer.write("PONG :tmi.twitch.tv\r\n");
                        writer.flush();
                        continue;
                    }

                    if (line.contains("PRIVMSG")) {
                        int userIndex = line.indexOf('!');
                        if (userIndex > 1) {
                            String user = line.substring(1, userIndex).toLowerCase();
                            int messageIndex = line.indexOf(" :", line.indexOf("PRIVMSG"));
                            if (messageIndex != -1) {
                                String message = line.substring(messageIndex + 2);
                                Command(user, message);
                            }
                        }
                    }
                } else {
                    Thread.sleep(100);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception ex) {
                if (isRunning) {
                    System.err.println("Ошибка чтения чата: " + ex.getMessage());
                }
            }
        }
    }

    void Send(String msg) {
        if (writer != null && twitchClient != null && !twitchClient.isClosed()) {
            try {
                writer.write("PRIVMSG #" + channelName.toLowerCase() + " :" + msg + "\r\n");
                writer.flush();
            } catch (Exception ex) {
                System.err.println("Ошибка отправки сообщения: " + ex.getMessage());
            }
        }
    }

    private String GetPairKey(String u1, String u2) {
        return u1.compareTo(u2) < 0 ? u1 + ":" + u2 : u2 + ":" + u1;
    }

    void Command(String user, String message) {
        String text = message.trim();
        String lowerText = text.toLowerCase();

        // 1. Предложение брака: !брак @ник
        if (lowerText.startsWith("!брак") && !lowerText.startsWith("!брак_статус")) {
            String[] parts = text.split(" ");
            if (parts.length < 2) {
                Send("💍 @" + user + ", укажи пользователя: !брак @ник");
                return;
            }

            String target = parts[1].replace("@", "").toLowerCase().trim();

            if (target.equals(user)) {
                Send("🤡 @" + user + ", нельзя вступить в брак с самим собой!");
                return;
            }

            if (marriagesMap.containsKey(user) && marriagesMap.get(user).contains(target)) {
                Send("💔 @" + user + ", вы уже состоите в браке с @" + target + "!");
                return;
            }

            marriageProposals.put(target, user);
            Send("💒 @" + target + ", игрок @" + user + " предлагает вступить в брак! Напишите !согласен или !отказ");
            return;
        }

        // 2. Принятие предложения: !согласен
        if (lowerText.equals("!согласен") || lowerText.equals("!да")) {
            if (!marriageProposals.containsKey(user)) {
                Send("❓ @" + user + ", вам никто не делал предложений.");
                return;
            }

            String partner = marriageProposals.get(user);
            marriageProposals.remove(user);

            marriagesMap.computeIfAbsent(user, k -> new ArrayList<>());
            marriagesMap.computeIfAbsent(partner, k -> new ArrayList<>());

            if (!marriagesMap.get(user).contains(partner)) marriagesMap.get(user).add(partner);
            if (!marriagesMap.get(partner).contains(user)) marriagesMap.get(partner).add(user);

            String pairKey = GetPairKey(user, partner);
            marriageDates.put(pairKey, LocalDateTime.now());

            SaveData();
            Send("🎉 ПОЗДРАВЛЯЕМ! 💍 @" + user + " и @" + partner + " теперь в браке! 🥂");
            return;
        }

        // 3. Отказ: !отказ
        if (lowerText.equals("!отказ") || lowerText.equals("!нет")) {
            if (!marriageProposals.containsKey(user)) {
                Send("❓ @" + user + ", вам никто не делал предложений.");
                return;
            }

            String partner = marriageProposals.get(user);
            marriageProposals.remove(user);
            Send("💔 @" + user + " отклонил(а) предложение от @" + partner + ".");
            return;
        }

        // 4. Рождение ребёнка: !родить @партнер ИмяРебёнка
        if (lowerText.startsWith("!родить") || lowerText.startsWith("!ребёнок")) {
            String[] parts = text.split("\\s+");
            if (parts.length < 3) {
                Send("👶 @" + user + ", укажи партнёра и имя ребёнка: !родить @партнер ИмяРебёнка");
                return;
            }

            String partner = parts[1].replace("@", "").toLowerCase().trim();
            
            // Сборка имени ребёнка из оставшихся частей
            StringBuilder childNameBuilder = new StringBuilder();
            for (int i = 2; i < parts.length; i++) {
                childNameBuilder.append(parts[i]);
                if (i < parts.length - 1) childNameBuilder.append(" ");
            }
            String childName = childNameBuilder.toString().trim();

            if (!marriagesMap.containsKey(user) || !marriagesMap.get(user).contains(partner)) {
                Send("❌ @" + user + ", ты не состоишь в браке с @" + partner + "!");
                return;
            }

            String pairKey = GetPairKey(user, partner);
            if (!marriageDates.containsKey(pairKey)) {
                marriageDates.put(pairKey, LocalDateTime.now());
            }

            Duration duration = Duration.between(marriageDates.get(pairKey), LocalDateTime.now());
            long totalDays = duration.toDays();
            if (totalDays < 7) {
                long daysLeft = 7 - totalDays;
                Send("⏳ @" + user + ", вы с @" + partner + " в браке менее 7 дней! Попробуйте через " + daysLeft + " дн.");
                return;
            }

            if (children.containsKey(childName.toLowerCase())) {
                Send("❌ Ребёнок с именем '" + childName + "' уже существует!");
                return;
            }

            List<String> childData = new ArrayList<>();
            childData.add(user);
            childData.add(partner);
            childData.add(childName);
            children.put(childName.toLowerCase(), childData);
            SaveData();

            Send("👶🪅 ПОЗДРАВЛЯЕМ! В семье @" + user + " и @" + partner + " родился ребёнок по имени " + childName + "! 🎉");
            return;
        }

        // 5. Проверка семьи: !семья или !пара [@ник]
        if (lowerText.startsWith("!пара") || lowerText.startsWith("!семья")) {
            String target = user;
            String[] parts = text.split(" ");
            if (parts.length > 1) target = parts[1].replace("@", "").toLowerCase().trim();

            if (marriagesMap.containsKey(target) && !marriagesMap.get(target).isEmpty()) {
                List<String> spousesInfo = new ArrayList<>();
                for (String spouse : marriagesMap.get(target)) {
                    String pairKey = GetPairKey(target, spouse);
                    LocalDateTime date = marriageDates.getOrDefault(pairKey, LocalDateTime.now());
                    long days = Duration.between(date, LocalDateTime.now()).toDays();
                    spousesInfo.add("@" + spouse + " (" + days + " дн.)");
                }

                Send("💍 @" + target + " состоит в браке с: " + String.join(", ", spousesInfo) + " ❤️");
            } else {
                Send("💔 @" + target + " пока не состоит в браке.");
            }
            return;
        }

        // 6. Просмотр детей: !дети [@ник]
        if (lowerText.startsWith("!дети")) {
            String target = user;
            String[] parts = text.split(" ");
            if (parts.length > 1) target = parts[1].replace("@", "").toLowerCase().trim();

            List<String> userChildren = new ArrayList<>();
            for (List<String> child : children.values()) {
                if (child.get(0).equals(target) || child.get(1).equals(target)) {
                    String otherParent = child.get(0).equals(target) ? child.get(1) : child.get(0);
                    userChildren.add(child.get(2) + " (второй родитель: @" + otherParent + ")");
                }
            }

            if (!userChildren.isEmpty()) {
                Send("👶 Дети @" + target + ": " + String.join(" | ", userChildren));
            } else {
                Send("🚼 У @" + target + " пока нет детей.");
            }
            return;
        }

        // 7. Развод: !развод @ник
        if (lowerText.startsWith("!развод")) {
            String[] parts = text.split(" ");
            if (parts.length < 2) {
                Send("💔 @" + user + ", укажи с кем разводишься: !развод @ник");
                return;
            }

            String partner = parts[1].replace("@", "").toLowerCase().trim();

            if (!marriagesMap.containsKey(user) || !marriagesMap.get(user).contains(partner)) {
                Send("❓ @" + user + ", ты не состоишь в браке с @" + partner + ".");
                return;
            }

            marriagesMap.get(user).remove(partner);
            marriagesMap.get(partner).remove(user);
            marriageDates.remove(GetPairKey(user, partner));

            SaveData();
            Send("💔 @" + user + " и @" + partner + " официально развелись.");
            return;
        }
    }

    void SaveData() {
        List<String> lines = new ArrayList<>();

        // Сохранение браков
        Set<String> savedPairs = new HashSet<>();
        for (Map.Entry<String, List<String>> pair : marriagesMap.entrySet()) {
            for (String partner : pair.getValue()) {
                String pairKey = GetPairKey(pair.getKey(), partner);
                if (!savedPairs.contains(pairKey)) {
                    savedPairs.add(pairKey);
                    LocalDateTime date = marriageDates.getOrDefault(pairKey, LocalDateTime.now());
                    lines.add("MARRIAGE|" + pair.getKey() + "|" + partner + "|" + date.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                }
            }
        }

        // Сохранение детей
        for (List<String> child : children.values()) {
            lines.add("CHILD|" + child.get(0) + "|" + child.get(1) + "|" + child.get(2));
        }

        try {
            Files.write(new File(savePath).toPath(), lines, StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("Ошибка сохранения данных: " + e.getMessage());
        }
    }

    void LoadData() {
        File file = new File(savePath);
        if (!file.exists()) return;

        marriagesMap.clear();
        marriageDates.clear();
        children.clear();

        try {
            List<String> lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);

            for (String line : lines) {
                if (line == null || line.isEmpty()) continue;
                String[] parts = line.split("\\|");

                if (parts[0].equals("MARRIAGE") && parts.length >= 4) {
                    String p1 = parts[1];
                    String p2 = parts[2];

                    marriagesMap.computeIfAbsent(p1, k -> new ArrayList<>());
                    marriagesMap.computeIfAbsent(p2, k -> new ArrayList<>());

                    if (!marriagesMap.get(p1).contains(p2)) marriagesMap.get(p1).add(p2);
                    if (!marriagesMap.get(p2).contains(p1)) marriagesMap.get(p2).add(p1);

                    String pairKey = GetPairKey(p1, p2);
                    try {
                        LocalDateTime parsedDate = LocalDateTime.parse(parts[3], DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                        marriageDates.put(pairKey, parsedDate);
                    } catch (Exception ignored) {
                        marriageDates.put(pairKey, LocalDateTime.now());
                    }
                } else if (parts[0].equals("CHILD") && parts.length >= 4) {
                    List<String> childData = new ArrayList<>();
                    childData.add(parts[1]);
                    childData.add(parts[2]);
                    childData.add(parts[3]);
                    children.put(parts[3].toLowerCase(), childData);
                }
            }
        } catch (IOException e) {
            System.err.println("Ошибка загрузки данных: " + e.getMessage());
        }
    }

    void OnApplicationQuit() {
        isRunning = false;
        SaveData();

        try {
            if (readThread != null) {
                readThread.interrupt();
            }
        } catch (Exception ignored) {
        }

        try {
            if (twitchClient != null) {
                twitchClient.close();
            }
        } catch (IOException ignored) {
        }
    }
}