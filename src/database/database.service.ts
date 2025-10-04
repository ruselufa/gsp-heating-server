import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit {
	private readonly logger = new Logger(DatabaseService.name);
	private pool: Pool;

	async onModuleInit() {
		this.pool = new Pool({
			host: process.env.DB_HOST || 'localhost',
			port: parseInt(process.env.DB_PORT || '5432'),
			database: process.env.DB_NAME || 'gsp_db',
			user: process.env.DB_USER || 'gsp_user',
			password: process.env.DB_PASSWORD || 'gsp_password',
			max: 20, // Максимум соединений в пуле
			idleTimeoutMillis: 30000, // Закрывать соединения после 30 секунд бездействия
			connectionTimeoutMillis: 2000, // Таймаут подключения 2 секунды
		});

		// Тестируем подключение
		try {
			const client = await this.pool.connect();
			this.logger.log('✅ Подключение к PostgreSQL установлено');
			client.release();
		} catch (error) {
			this.logger.error('❌ Ошибка подключения к PostgreSQL:', error);
		}
	}

	async getClient(): Promise<PoolClient> {
		return await this.pool.connect();
	}

	// Методы для работы с системными настройками
	async getSystemSetting(key: string): Promise<string | null> {
		const client = await this.getClient();
		try {
			const result = await client.query(
				'SELECT value FROM system_settings WHERE key = $1',
				[key]
			);
			return result.rows.length > 0 ? result.rows[0].value : null;
		} finally {
			client.release();
		}
	}

	async setSystemSetting(key: string, value: string, description?: string): Promise<void> {
		const client = await this.getClient();
		try {
			await client.query(`
				INSERT INTO system_settings (key, value, description) 
				VALUES ($1, $2, $3)
				ON CONFLICT (key) 
				DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
			`, [key, value, description]);
			this.logger.log(`Настройка ${key} обновлена: ${value}`);
		} finally {
			client.release();
		}
	}

	// Методы для работы с настройками отопления
	async getHeatingSetting(heatingId: string, settingKey: string): Promise<string | null> {
		const client = await this.getClient();
		try {
			const result = await client.query(
				'SELECT setting_value FROM heating_settings WHERE heating_id = $1 AND setting_key = $2',
				[heatingId, settingKey]
			);
			return result.rows.length > 0 ? result.rows[0].setting_value : null;
		} finally {
			client.release();
		}
	}

	async setHeatingSetting(heatingId: string, settingKey: string, settingValue: string): Promise<void> {
		const client = await this.getClient();
		try {
			await client.query(`
				INSERT INTO heating_settings (heating_id, setting_key, setting_value) 
				VALUES ($1, $2, $3)
				ON CONFLICT (heating_id, setting_key) 
				DO UPDATE SET setting_value = EXCLUDED.setting_value
			`, [heatingId, settingKey, settingValue]);
			this.logger.log(`Настройка ${settingKey} для ${heatingId} обновлена: ${settingValue}`);
		} finally {
			client.release();
		}
	}

	async getAllHeatingSettings(heatingId: string): Promise<Record<string, string>> {
		const client = await this.getClient();
		try {
			const result = await client.query(
				'SELECT setting_key, setting_value FROM heating_settings WHERE heating_id = $1',
				[heatingId]
			);
			
			const settings: Record<string, string> = {};
			result.rows.forEach(row => {
				settings[row.setting_key] = row.setting_value;
			});
			return settings;
		} finally {
			client.release();
		}
	}

	async onModuleDestroy() {
		if (this.pool) {
			await this.pool.end();
			this.logger.log('Соединение с PostgreSQL закрыто');
		}
	}
}
