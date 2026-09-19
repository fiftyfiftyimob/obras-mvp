import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { ObrasModule } from './obras/obras.module';
import { FrentesModule } from './frentes/frentes.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
