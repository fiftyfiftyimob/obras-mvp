import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'obras-mvp-backend', timestamp: new Date().toISOString() };
  }

  @Get()
  root() {
    return { message: 'Obras MVP API no ar' };
  }
}
