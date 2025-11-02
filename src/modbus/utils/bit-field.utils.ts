/**
 * Утилиты для работы с битовыми полями в 16-битных словах
 */

/**
 * Установить бит в 16-битном слове
 * @param word - исходное слово (0-65535)
 * @param bitOffset - номер бита (0-15)
 * @param value - значение бита (true/false)
 * @returns новое значение слова
 */
export function setBit(word: number, bitOffset: number, value: boolean): number {
	if (bitOffset < 0 || bitOffset > 15) {
		throw new Error(`Bit offset must be between 0 and 15, got ${bitOffset}`);
	}
	
	if (value) {
		// Установить бит в 1
		return word | (1 << bitOffset);
	} else {
		// Установить бит в 0
		return word & ~(1 << bitOffset);
	}
}

/**
 * Получить значение бита из 16-битного слова
 * @param word - слово для чтения (0-65535)
 * @param bitOffset - номер бита (0-15)
 * @returns значение бита (true/false)
 */
export function getBit(word: number, bitOffset: number): boolean {
	if (bitOffset < 0 || bitOffset > 15) {
		throw new Error(`Bit offset must be between 0 and 15, got ${bitOffset}`);
	}
	
	return ((word >> bitOffset) & 1) === 1;
}

/**
 * Упаковать массив булевых значений в 16-битное слово
 * @param bits - массив булевых значений (до 16 элементов)
 * @returns 16-битное слово
 */
export function packBitsToWord(bits: boolean[]): number {
	if (bits.length > 16) {
		throw new Error(`Cannot pack more than 16 bits into a word, got ${bits.length}`);
	}
	
	let word = 0;
	for (let i = 0; i < bits.length; i++) {
		if (bits[i]) {
			word |= (1 << i);
		}
	}
	
	return word;
}

/**
 * Распаковать 16-битное слово в массив булевых значений
 * @param word - 16-битное слово
 * @param count - количество битов для распаковки (1-16)
 * @returns массив булевых значений
 */
export function unpackWordToBits(word: number, count: number = 16): boolean[] {
	if (count < 1 || count > 16) {
		throw new Error(`Bit count must be between 1 and 16, got ${count}`);
	}
	
	const bits: boolean[] = [];
	for (let i = 0; i < count; i++) {
		bits.push(((word >> i) & 1) === 1);
	}
	
	return bits;
}

/**
 * Установить несколько битов в слове
 * @param word - исходное слово
 * @param updates - объект с обновлениями { bitOffset: value }
 * @returns новое значение слова
 */
export function setBits(word: number, updates: Record<number, boolean>): number {
	let result = word;
	for (const [bitOffset, value] of Object.entries(updates)) {
		result = setBit(result, parseInt(bitOffset), value);
	}
	return result;
}

/**
 * Получить несколько битов из слова
 * @param word - слово для чтения
 * @param bitOffsets - массив номеров битов
 * @returns объект { bitOffset: value }
 */
export function getBits(word: number, bitOffsets: number[]): Record<number, boolean> {
	const result: Record<number, boolean> = {};
	for (const bitOffset of bitOffsets) {
		result[bitOffset] = getBit(word, bitOffset);
	}
	return result;
}

/**
 * Преобразовать число в INT16 (signed 16-bit)
 * @param value - значение
 * @returns INT16 значение (-32768 до 32767)
 */
export function toInt16(value: number): number {
	// Приводим к диапазону INT16
	let result = Math.round(value) & 0xFFFF;
	// Обрабатываем знак
	if (result >= 0x8000) {
		result = result - 0x10000;
	}
	return result;
}

/**
 * Преобразовать число в UINT16 (unsigned 16-bit)
 * @param value - значение
 * @returns UINT16 значение (0 до 65535)
 */
export function toUint16(value: number): number {
	return Math.round(value) & 0xFFFF;
}

/**
 * Преобразовать INT16 в обычное число
 * @param value - INT16 значение (может быть отрицательным)
 * @returns число
 */
export function fromInt16(value: number): number {
	if (value < 0) {
		return value;
	}
	if (value >= 0x8000) {
		return value - 0x10000;
	}
	return value;
}

/**
 * Преобразовать строку в массив регистров (16-bit words)
 * @param str - строка для конвертации
 * @param registerCount - количество регистров (слов)
 * @returns массив регистров
 */
export function stringToRegisters(str: string, registerCount: number): number[] {
	const registers: number[] = [];
	const maxLength = registerCount * 2; // 2 байта на регистр
	
	// Дополняем строку пробелами до нужной длины
	const paddedStr = str.padEnd(maxLength, ' ').substring(0, maxLength);
	
	// Конвертируем по 2 символа в регистр
	for (let i = 0; i < registerCount; i++) {
		const char1 = paddedStr.charCodeAt(i * 2) || 0;
		const char2 = paddedStr.charCodeAt(i * 2 + 1) || 0;
		// Старший байт - первый символ, младший - второй
		registers.push((char1 << 8) | char2);
	}
	
	return registers;
}

/**
 * Преобразовать массив регистров в строку
 * @param registers - массив регистров
 * @returns строка
 */
export function registersToString(registers: number[]): string {
	let str = '';
	for (const reg of registers) {
		const char1 = String.fromCharCode((reg >> 8) & 0xFF);
		const char2 = String.fromCharCode(reg & 0xFF);
		str += char1 + char2;
	}
	// Убираем пробелы в конце
	return str.trimEnd();
}

/**
 * Применить масштаб к значению (для температуры x10 и т.д.)
 * @param value - исходное значение
 * @param scale - масштаб (например: 10 для x10)
 * @returns масштабированное значение
 */
export function applyScale(value: number, scale: number = 1): number {
	return Math.round(value * scale);
}

/**
 * Убрать масштаб из значения
 * @param value - масштабированное значение
 * @param scale - масштаб (например: 10 для x10)
 * @returns исходное значение
 */
export function removeScale(value: number, scale: number = 1): number {
	return value / scale;
}

