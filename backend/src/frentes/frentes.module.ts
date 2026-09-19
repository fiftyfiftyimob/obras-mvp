import { Module } from '@nestjs/common';
import { FrentesController } from './frentes.controller';
import { FrentesService } from './frentes.service';

@Module({
  controllers: [FrentesController],
  providers: [FrentesService],
})
export class FrentesModule {}
