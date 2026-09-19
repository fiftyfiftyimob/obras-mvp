import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarSenha(senha: string, senhaHash: string): boolean {
  const [salt, hash] = senhaHash.split(':');
  if (!salt || !hash) return false;
  const hashTentativa = scryptSync(senha, salt, 64);
  const hashArmazenado = Buffer.from(hash, 'hex');
  if (hashTentativa.length !== hashArmazenado.length) return false;
  return timingSafeEqual(hashTentativa, hashArmazenado);
}

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CreateUsuarioDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { telefone: dto.telefone } });
    if (existente) {
      throw new ConflictException('Já existe um usuário com esse telefone');
    }

    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        telefone: dto.telefone,
        email: dto.email,
        senhaHash: hashSenha(dto.senha),
        perfil: dto.perfil,
      },
    });

    return this.semSenha(usuario);
  }

  async listar() {
    const usuarios = await this.prisma.usuario.findMany({ orderBy: { criadoEm: 'desc' } });
    return usuarios.map((u) => this.semSenha(u));
  }

  async buscarPorId(id: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    return this.semSenha(usuario);
  }

  async buscarPorTelefoneComSenha(telefone: string) {
    return this.prisma.usuario.findUnique({ where: { telefone } });
  }

  async atualizar(id: number, dto: UpdateUsuarioDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    const data: Record<string, unknown> = { ...dto };
    if (dto.senha) {
      data.senhaHash = hashSenha(dto.senha);
      delete data.senha;
    }

    const atualizado = await this.prisma.usuario.update({ where: { id }, data });
    return this.semSenha(atualizado);
  }

  async remover(id: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    await this.prisma.usuario.update({ where: { id }, data: { ativo: false } });
    return { message: 'Usuário desativado' };
  }

  private semSenha(usuario: any) {
    const { senhaHash, ...resto } = usuario;
    return resto;
  }
}
