import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function logMemory(step: string) {
  const mem = process.memoryUsage();

  console.log(`\n===== ${step} =====`);
  console.log(`RSS: ${Math.round(mem.rss / 1024 / 1024)} MB`);
  console.log(`Heap Total: ${Math.round(mem.heapTotal / 1024 / 1024)} MB`);
  console.log(`Heap Used: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
  console.log(`External: ${Math.round(mem.external / 1024 / 1024)} MB`);
  console.log('====================\n');
}

async function bootstrap() {
  try {
    console.log('STEP 1: Bootstrap started');
    logMemory('Before NestFactory.create');

    const app = await NestFactory.create(AppModule);

    console.log('STEP 2: App created');
    logMemory('After NestFactory.create');

    app.enableCors();

    console.log('STEP 3: CORS enabled');
    logMemory('After enableCors');

    const port = process.env.PORT ?? 3000;

    console.log(`STEP 4: Starting server on port ${port}`);
    logMemory('Before app.listen');

    await app.listen(port);

    console.log(`STEP 5: Server listening on port ${port}`);
    logMemory('After app.listen');
  } catch (error) {
    console.error('BOOTSTRAP ERROR:', error);
    logMemory('Error State');
    throw error;
  }
}

bootstrap();