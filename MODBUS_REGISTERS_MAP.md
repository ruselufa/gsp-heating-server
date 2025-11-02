# Карта Modbus регистров для Heating системы

**Сервер**: gsp-heating-server  
**Порт**: 8503  
**Протокол**: Modbus TCP  
**Роль**: Slave (сервер отвечает на запросы от OPC)

## Общая информация

Каждое устройство Heating имеет уникальный **Unit ID** и использует **одинаковую** карту регистров.

### Список устройств

| Device ID | Unit ID | Описание | Статус |
|-----------|---------|----------|--------|
| HT01 | 1 | Управление отоплением 01 | Активно |
| HT02 | 2 | Управление отоплением 02 | Активно |
| HT03 | 3 | Управление отоплением 03 | Активно |
| HT04 | 4 | Управление отоплением 04 | Резерв |
| ... | 5-30 | Зарезервировано для расширения | - |

**Пример**: Чтобы прочитать температуру HT01, используйте `Unit ID = 1`  
**Пример**: Чтобы прочитать температуру HT02, используйте `Unit ID = 2`

---

## 1. Discrete Inputs (FC02 - Read Only)

**Назначение**: Статусные биты (только чтение)  
**Функция Modbus**: FC02 (Read Discrete Inputs)

### Адрес 0-15 (объединенные биты)

| Бит | Название | Описание | Тип |
|-----|----------|----------|-----|
| 0 | IS_ONLINE | Устройство в сети (1=онлайн, 0=офлайн) | bool |
| 1 | IS_WORKING | Система работает (1=работает, 0=не работает) | bool |
| 2 | IS_EMERGENCY_STOP | Аварийная остановка (1=авария, 0=норма) | bool |
| 3 | TEMP_SENSOR_ERROR | Ошибка датчика температуры | bool |
| 4 | PID_ACTIVE | PID регулятор активен | bool |
| 5 | FREEZE_PROTECTION | Защита от замерзания активна | bool |
| 6 | OVERHEAT_PROTECTION | Защита от перегрева активна | bool |
| 7 | VALVE_OPEN | Клапан открыт (1=открыт, 0=закрыт) | bool |
| 8-15 | RESERVED | Зарезервировано | - |

### Примеры чтения (Python)

```python
from pyModbusTCP.client import ModbusClient

client = ModbusClient(host="192.168.1.XX", port=8503, unit_id=1)

# Прочитать все статусные биты HT01
status_bits = client.read_discrete_inputs(0, 16)

print(f"IS_ONLINE: {status_bits[0]}")
print(f"IS_WORKING: {status_bits[1]}")
print(f"IS_EMERGENCY_STOP: {status_bits[2]}")
print(f"VALVE_OPEN: {status_bits[7]}")
```

---

## 2. Coils (FC01/FC05/FC15 - Read/Write)

**Назначение**: Управляющие биты (чтение и запись)  
**Функции Modbus**: FC01 (Read Coils), FC05 (Write Single Coil), FC15 (Write Multiple Coils)

### Адрес 0-15 (объединенные биты)

| Бит | Название | Описание | Тип | R/W |
|-----|----------|----------|-----|-----|
| 0 | AUTO_CONTROL_ENABLED | Автоуправление включено (1=вкл, 0=выкл) | bool | RW |
| 1 | MANUAL_OVERRIDE | Ручное управление (1=вкл, 0=авто) | bool | RW |
| 2-15 | RESERVED | Зарезервировано | - | - |

### Примеры записи (Python)

```python
# Включить автоуправление для HT01
client.unit_id = 1
client.write_single_coil(0, True)  # Бит 0 = AUTO_CONTROL_ENABLED

# Выключить автоуправление для HT02
client.unit_id = 2
client.write_single_coil(0, False)
```

---

## 3. Input Registers (FC04 - Read Only)

**Назначение**: Входные данные с датчиков (только чтение)  
**Функция Modbus**: FC04 (Read Input Registers)  
**Формат**: INT16 или UINT16 (16-bit)

| Адрес | Регистр | Тип | Описание | Единицы | Scale |
|-------|---------|-----|----------|---------|-------|
| 0 | CURRENT_TEMP | INT16 | Текущая температура | °C | x10 |
| 1 | CURRENT_FAN_SPEED | UINT16 | Скорость вентилятора | 0-30 | - |
| 2 | VALVE_STATE | UINT16 | Состояние клапана | 0/1 | - |
| 3 | PID_OUTPUT | INT16 | Выход PID регулятора | % | x10 |

### Преобразование значений

**Температура (INT16 x10)**:
- Сырое значение: `225` → Температура: `22.5°C`
- Сырое значение: `32768` → Отрицательная температура: `-32768 = -3276.8°C`
- Формула: `temperature = value / 10.0` (с учетом знака INT16)

**Состояние клапана**:
- `0` = Закрыт
- `1` = Открыт

### Примеры чтения (Python)

```python
client.unit_id = 1

# Прочитать все Input Registers для HT01
input_regs = client.read_input_registers(0, 4)

# Преобразовать температуру (INT16 x10)
temp_raw = input_regs[0]
if temp_raw >= 32768:
    temp_raw = temp_raw - 65536  # Обработка отрицательных значений
temperature = temp_raw / 10.0

print(f"Текущая температура: {temperature}°C")
print(f"Скорость вентилятора: {input_regs[1]}")
print(f"Клапан: {'Открыт' if input_regs[2] == 1 else 'Закрыт'}")
print(f"PID выход: {input_regs[3] / 10.0}%")
```

---

## 4. Holding Registers (FC03/FC06/FC16 - Read/Write)

**Назначение**: Уставки и команды управления (чтение и запись)  
**Функции Modbus**: FC03 (Read), FC06 (Write Single), FC16 (Write Multiple)

| Адрес | Регистр | Тип | Описание | Единицы | Scale | R/W |
|-------|---------|-----|----------|---------|-------|-----|
| 0 | SETPOINT_TEMP | INT16 | Уставка температуры | °C | x10 | RW |
| 1 | HYSTERESIS | UINT16 | Гистерезис | °C | x10 | RW |
| 2 | TEMP_LOW | INT16 | Нижняя граница температуры | °C | x10 | RW |
| 3 | TEMP_HIGH | INT16 | Верхняя граница температуры | °C | x10 | RW |
| 4 | TEMP_FREEZE_LIMIT | INT16 | Защита от замерзания | °C | x10 | RW |
| 5 | TEMP_OVERHEAT_LIMIT | INT16 | Защита от перегрева | °C | x10 | RW |
| 10 | COMMAND | UINT16 | Команда управления | код | - | W |
| 11 | COMMAND_PARAM_1 | UINT16 | Параметр команды 1 | - | - | W |
| 12 | COMMAND_PARAM_2 | UINT16 | Параметр команды 2 | - | - | W |
| 20-24 | DEVICE_NAME | STRING | Имя устройства | ASCII | - | R |

### Примеры записи (Python)

```python
client.unit_id = 1

# Установить уставку температуры 22.5°C для HT01
client.write_single_register(0, 225)  # 22.5 * 10 = 225

# Установить гистерезис 0.5°C
client.write_single_register(1, 5)  # 0.5 * 10 = 5

# Прочитать текущую уставку
setpoint_raw = client.read_holding_registers(0, 1)[0]
setpoint = setpoint_raw / 10.0
print(f"Уставка температуры: {setpoint}°C")
```

---

## 5. Команды управления

Команды записываются в **Holding Register 10** (COMMAND).

| Код | Команда | Описание | Параметры |
|-----|---------|----------|-----------|
| 0 | NOP | Нет операции | - |
| 1 | ENABLE_AUTO_CONTROL | Включить автоуправление | - |
| 2 | DISABLE_AUTO_CONTROL | Выключить автоуправление | - |
| 3 | SET_TEMPERATURE | Установить уставку температуры | PARAM_1: температура x10 |
| 4 | SET_FAN_SPEED | Установить скорость вентилятора | PARAM_1: скорость (0-30) |
| 5 | EMERGENCY_STOP | Аварийная остановка | - |
| 6 | RESET_EMERGENCY | Сброс аварийной остановки | - |

### Алгоритм выполнения команды

1. Записать параметры в регистры 11-12 (если требуется)
2. Записать код команды в регистр 10
3. Сервер автоматически выполнит команду и сбросит регистр 10 в 0

### Примеры команд (Python)

**Включить автоуправление:**
```python
client.unit_id = 1
client.write_single_register(10, 1)  # Команда ENABLE_AUTO_CONTROL
```

**Установить температуру 23.5°C:**
```python
client.unit_id = 1
client.write_single_register(11, 235)  # PARAM_1 = 23.5 * 10 = 235
client.write_single_register(10, 3)    # Команда SET_TEMPERATURE
```

**Установить скорость вентилятора 25:**
```python
client.unit_id = 1
client.write_single_register(11, 25)  # PARAM_1 = 25
client.write_single_register(10, 4)   # Команда SET_FAN_SPEED
```

**Аварийная остановка:**
```python
client.unit_id = 1
client.write_single_register(10, 5)  # Команда EMERGENCY_STOP
```

---

## 6. Полный пример работы

```python
from pyModbusTCP.client import ModbusClient
import time

# Подключение к Modbus Slave
client = ModbusClient(host="192.168.1.XX", port=8503)

def monitor_heating(unit_id, device_name):
    """Мониторинг одного устройства Heating"""
    client.unit_id = unit_id
    
    print(f"\n=== Мониторинг {device_name} (Unit ID: {unit_id}) ===")
    
    # 1. Читаем статусы (Discrete Inputs)
    status = client.read_discrete_inputs(0, 16)
    print(f"Онлайн: {status[0]}")
    print(f"Работает: {status[1]}")
    print(f"Авария: {status[2]}")
    
    # 2. Читаем датчики (Input Registers)
    sensors = client.read_input_registers(0, 4)
    temp = sensors[0] / 10.0 if sensors[0] < 32768 else (sensors[0] - 65536) / 10.0
    print(f"Температура: {temp}°C")
    print(f"Скорость вентилятора: {sensors[1]}")
    
    # 3. Читаем уставки (Holding Registers)
    setpoint_raw = client.read_holding_registers(0, 1)[0]
    setpoint = setpoint_raw / 10.0 if setpoint_raw < 32768 else (setpoint_raw - 65536) / 10.0
    print(f"Уставка: {setpoint}°C")
    
    # 4. Включаем автоконтроль (если выключен)
    coils = client.read_coils(0, 1)
    if not coils[0]:
        print("Включаем автоконтроль...")
        client.write_single_coil(0, True)
    
    # 5. Изменяем уставку температуры
    new_setpoint = 22.5
    print(f"Устанавливаем новую уставку: {new_setpoint}°C")
    client.write_single_register(11, int(new_setpoint * 10))
    client.write_single_register(10, 3)  # Команда SET_TEMPERATURE
    
    time.sleep(0.5)
    
    # 6. Проверяем, что уставка изменилась
    new_setpoint_raw = client.read_holding_registers(0, 1)[0]
    new_setpoint_actual = new_setpoint_raw / 10.0
    print(f"Новая уставка установлена: {new_setpoint_actual}°C")

# Мониторинг всех устройств
monitor_heating(1, "HT01")
monitor_heating(2, "HT02")
monitor_heating(3, "HT03")
```

---

## 7. Диагностика и отладка

### Проверка подключения

```python
from pyModbusTCP.client import ModbusClient

client = ModbusClient(host="192.168.1.XX", port=8503, unit_id=1, timeout=5)

if client.is_open:
    print("✅ Подключено к Modbus Slave")
else:
    print("❌ Ошибка подключения")
```

### Часто встречающиеся ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| Connection timeout | Сервер недоступен или порт закрыт | Проверить IP адрес, порт 8503, firewall |
| Invalid Unit ID | Unit ID не существует | Использовать Unit ID 1-3 (HT01-HT03) |
| Invalid address | Неверный адрес регистра | Проверить карту регистров |
| Permission denied | Попытка записи в Read-Only регистр | Использовать только R/W регистры для записи |

---

## 8. Конфигурация OPC сервера

### Настройки подключения

- **Тип**: Modbus TCP
- **IP адрес**: 192.168.1.XX
- **Порт**: 8503
- **Тайм-аут**: 5000 мс
- **Интервал опроса**: 1000 мс (рекомендуется)

### Теги для создания

```
HT01_Online             -> Discrete Input 0, Unit ID 1
HT01_Working            -> Discrete Input 1, Unit ID 1
HT01_CurrentTemp        -> Input Register 0, Unit ID 1, Scale /10
HT01_SetpointTemp       -> Holding Register 0, Unit ID 1, Scale /10, RW
HT01_AutoControl        -> Coil 0, Unit ID 1, RW

HT02_Online             -> Discrete Input 0, Unit ID 2
HT02_Working            -> Discrete Input 1, Unit ID 2
... (аналогично для HT02)
```

---

## 9. Дополнительная информация

### Двусторонняя синхронизация

- ✅ Изменения с веб-интерфейса автоматически отражаются в Modbus регистрах
- ✅ Изменения от OPC сервера автоматически отражаются на веб-интерфейсе
- ✅ Все операции логируются на сервере

### Производительность

- Рекомендуемый интервал опроса: **1000 мс** (1 секунда)
- Максимальное количество одновременных подключений: **10**
- Время отклика на запрос: **< 50 мс**

### Поддержка

Для вопросов и поддержки обращайтесь к разработчику системы.

---

**Дата создания**: 2025-10-11  
**Версия**: 1.0  
**Сервер**: gsp-heating-server

