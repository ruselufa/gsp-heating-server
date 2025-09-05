# GSP Heating Server

Сервер управления системой отопления для проекта GSP. Построен на NestJS с использованием MQTT для связи с устройствами и WebSocket для передачи данных в реальном времени.

## Особенности

- 🔥 **Управление отоплением**: Автоматическое и ручное управление системами отопления
- 🌡️ **Датчики температуры**: Мониторинг температуры и влажности в помещениях
- 📡 **MQTT интеграция**: Связь с устройствами через MQTT брокер
- ⚡ **WebSocket**: Передача данных в реальном времени
- 🛡️ **Безопасность**: Аварийные остановки и мониторинг состояния
- 🎯 **Селективные подписки**: Клиенты могут подписываться только на нужные устройства

## Архитектура

### Основные модули

1. **HeatingModule** - Управление системами отопления
   - Автоматическое регулирование температуры
   - Управление насосами и клапанами
   - Аварийные остановки

2. **TemperatureSensorModule** - Работа с датчиками температуры
   - Чтение показаний температуры и влажности
   - Мониторинг состояния датчиков

3. **MqttModule** - Связь с устройствами
   - Подключение к MQTT брокеру
   - Подписка на топики устройств
   - Отправка команд управления

4. **WebSocketModule** - Передача данных в реальном времени
   - Общий WebSocket для всех событий
   - Селективный WebSocket для подписки на конкретные устройства

## Установка и запуск

### Требования

- Node.js 18+
- npm или yarn
- MQTT брокер (например, Mosquitto)

### Установка зависимостей

\`\`\`bash
npm install
\`\`\`

### Переменные окружения

Создайте файл \`.env\` в корне проекта:

\`\`\`env
# MQTT настройки
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Порт сервера
PORT=3001
\`\`\`

### Запуск в режиме разработки

\`\`\`bash
npm run start:dev
\`\`\`

### Сборка для продакшена

\`\`\`bash
npm run build
npm run start:prod
\`\`\`

### Docker

\`\`\`bash
docker build -t gsp-heating-server .
docker run -p 3001:3001 -e MQTT_BROKER_URL=mqtt://your-broker:1883 gsp-heating-server
\`\`\`

## API Endpoints

### Системы отопления

- \`GET /heating\` - Получить все системы отопления
- \`GET /heating/stats\` - Статистика системы
- \`GET /heating/:heatingId\` - Получить конкретную систему
- \`POST /heating/:heatingId/control\` - Управление системой
- \`PUT /heating/:heatingId/temperature\` - Установить температуру
- \`POST /heating/:heatingId/auto-control/enable\` - Включить автоуправление
- \`POST /heating/:heatingId/auto-control/disable\` - Отключить автоуправление
- \`POST /heating/:heatingId/emergency-stop\` - Аварийная остановка

### Датчики температуры

- \`GET /temperature-sensors\` - Получить все датчики
- \`GET /temperature-sensors/:sensorId\` - Получить конкретный датчик
- \`GET /temperature-sensors/:sensorId/temperature\` - Получить температуру
- \`GET /temperature-sensors/:sensorId/humidity\` - Получить влажность

## WebSocket Events

### Подключение

\`\`\`javascript
// Обычный WebSocket
const socket = io('http://localhost:3001');

// Селективный WebSocket
const selectiveSocket = io('http://localhost:3001/heating-selective');
\`\`\`

### События системы отопления

- \`heating:temperature:updated\` - Обновление температуры
- \`heating:setpoint:changed\` - Изменение уставки
- \`heating:pump:speed:changed\` - Изменение скорости насоса
- \`heating:valve:state:changed\` - Изменение состояния клапана
- \`heating:alarm\` - Аварийное сообщение
- \`heating:emergency:stop\` - Аварийная остановка

### События датчиков

- \`temperature:sensor:updated\` - Обновление данных датчика

### Селективные подписки

\`\`\`javascript
// Подписка на системы отопления
selectiveSocket.emit('subscribeToHeating', ['HT01', 'HT02']);

// Подписка на датчики температуры
selectiveSocket.emit('subscribeToTemperatureSensors', ['DHT80', 'DHT81']);

// Управление системой отопления
selectiveSocket.emit('heating:command', {
  heatingId: 'HT01',
  command: 'SET_TEMPERATURE',
  value: 22
});
\`\`\`

## Конфигурация устройств

### Системы отопления

Конфигурация систем отопления находится в \`src/devices/heating/heating.config.ts\`:

\`\`\`typescript
export const heatingConfigs: Record<string, HeatingConfig> = {
  HT01: {
    deviceName: 'HT_reg01',
    relayModule: 'wb-mr6c_200',
    tempModule: 'wb-m1w2_201',
    deviceRealName: 'Управление отоплением 01',
    temperatureSource: {
      type: 'dht',
      sourceId: 'DHT80',
    },
    topics: {
      DO_OPEN: '/devices/wb-mr6c_200/controls/K1',
      DO_CLOSE: '/devices/wb-mr6c_200/controls/K2',
      // ... другие топики
    },
    // ... настройки температуры и таймингов
  },
  // ... другие системы
};
\`\`\`

### Датчики температуры

Конфигурация датчиков в \`src/devices/temperature-sensor/temperature-sensor.config.ts\`:

\`\`\`typescript
export const temperatureSensorConfigs: Record<string, TemperatureSensorConfig> = {
  DHT80: {
    deviceName: 'DHT80',
    sensorModule: 'wb-m1w2_204',
    deviceRealName: 'Датчик температуры 80',
    topics: {
      TEMPERATURE: '/devices/wb-m1w2_204/controls/External Sensor 1',
      HUMIDITY: '/devices/wb-m1w2_204/controls/External Sensor 2',
    },
  },
  // ... другие датчики
};
\`\`\`

## Логика работы

### Автоматическое управление отоплением

1. Система получает показания температуры от датчиков
2. Сравнивает с заданной уставкой температуры
3. При необходимости регулирует:
   - Скорость насоса (0-3)
   - Состояние клапана (открыт/закрыт)

### Защитные функции

- **Защита от перегрева**: Автоматическая остановка при превышении максимальной температуры
- **Защита от замерзания**: Принудительное включение при критически низкой температуре
- **Аварийные остановки**: Ручная и автоматическая остановка системы
- **Мониторинг связи**: Отслеживание состояния подключения устройств

## Разработка

### Структура проекта

\`\`\`
src/
├── devices/
│   ├── heating/          # Модуль управления отоплением
│   ├── temperature-sensor/ # Модуль датчиков температуры
│   └── interfaces/       # Интерфейсы TypeScript
├── mqtt/                 # MQTT модуль
├── websocket/           # WebSocket модули
├── app.module.ts        # Главный модуль приложения
└── main.ts             # Точка входа
\`\`\`

### Команды разработки

\`\`\`bash
# Запуск в режиме разработки
npm run start:dev

# Сборка
npm run build

# Линтинг
npm run lint

# Форматирование кода
npm run format

# Тесты
npm run test
\`\`\`

## Лицензия

UNLICENSED
