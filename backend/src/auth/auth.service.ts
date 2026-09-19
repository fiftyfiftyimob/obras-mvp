import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService, } from '../usuarios/usuarios.service';
import { verificarSenha } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const usuario = await this.usuariosService.buscarPorTelefoneComSenha(dto.telefone);

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Telefone ou senha inválidos');
    }

    const senhaValida = verificarSenha(dto.senha, usuario.senhaHash);
    if (!senhaValida) {
      throw new UnauthorizedException('Telefone ou senha inválidos');
    }

    const payload = { sub: usuario.id, telefone: usuario.telefone, perfil: usuario.perfil };

    return {
      access_token: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        telefone: usuario.telefone,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    };
  }
}
