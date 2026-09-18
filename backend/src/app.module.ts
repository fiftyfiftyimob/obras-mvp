import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ObrasModule } from './obras/obras.module';
import { FrentesModule } from './frentes/frentes.module';
import { ServicosModule } from './servicos/servicos.module';
import { EquipesModule } from './equipes/equipes.module';
import { ColaboradoresModule } from './colaboradores/colaboradores.module';
import { TarefasModule } from './tarefas/tarefas.module';
import { EvolucoesModule } from './evolucoes/evolucoes.module';
import { LocalizacoesModule } from './localizacoes/localizacoes.module';
import { RdosModule } from './rdos/rdos.module';

@Module({
  imports: [
    AuthModule,
    UsuariosModule,
    ObrasModule,
    FrentesModule,
    ServicosModule,
    EquipesModule,
    ColaboradoresModule,
    TarefasModule,
    EvolucoesModule,
    LocalizacoesModule,
    RdosModule,
  ],
})
export class AppModule {}
