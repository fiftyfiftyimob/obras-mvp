import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { ObrasModule } from './obras/obras.module';

@Module({
  imports: [PrismaModule, UsuariosModule, AuthModule, ObrasModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
