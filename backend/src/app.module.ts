import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, UsuariosModule, AuthModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
