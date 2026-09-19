export class UpdateUsuarioDto {
  nome?: string;
  telefone?: string;
  email?: string;
  senha?: string;
  perfil?: 'gestor' | 'estagiario' | 'operario';
  ativo?: boolean;
}
