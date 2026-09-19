export class CreateUsuarioDto {
  nome: string;
  telefone: string;
  email?: string;
  senha: string;
  perfil: 'gestor' | 'estagiario' | 'operario';
}
