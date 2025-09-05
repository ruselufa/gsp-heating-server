import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
	const logger = new Logger('Bootstrap');
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'warn', 'log', 'debug', 'verbose'],
	});

	app.enableCors({
		origin: ['http://localhost:5173', 'http://localhost:3000'],
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		credentials: true,
	});

	const port = process.env.PORT ?? 3001; // Используем другой порт для отопления
	await app.listen(port);
	logger.log(`Heating Server is running on: http://localhost:${port}`);
}

bootstrap().catch((err) => {
	console.error('Ошибка запуска приложения отопления:', err);
	process.exit(1);
});
