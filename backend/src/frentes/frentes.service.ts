import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFrenteDto } from './dto/create-frente.dto';
import { UpdateFrenteDto } from './dto/update-frente.dto';

@Injectable()
export class FrentesService {
  constructor(private readonly prisma: PrismaService) {}

  private async garantirObraDoUsuario(obraId: number, usuarioId: number) {
    const obra = await this.prisma.obra.findFirst({
      where: {
        id: obraId,
        responsavelId: usuarioId,
        ativo: true,
      },
    });

    if (!obra) {
      throw new NotFoundException('Obra não encontrada');
    }

    return obra;
  }

  async create(obraId: number, usuarioId: number, createFrenteDto: CreateFrenteDto) {
    await this.garantirObraDoUsuario(obraId, usuarioId);

    return this.prisma.frente.create({
      data: {
        ...createFrenteDto,
        obraId,
      },
    });
  }

  async findAll(obraId: number, usuarioId: number) {
    await this.garantirObraDoUsuario(obraId, usuarioId);

    return this.prisma.frente.findMany({
      where: {
        obraId,
        ativo: true,
      },
      orderBy: [{ nivel: 'asc' }, { nome: 'asc' }],
    });
  }

  async findOne(id: number, obraId: number, usuarioId: number) {
    await this.garantirObraDoUsuario(obraId, usuarioId);

    const frente = await this.prisma.frente.findFirst({
      where: {
        id,
        obraId,
        ativo: true,
      },
    });

    if (!frente) {
      throw new NotFoundException('Frente de serviço não encontrada');
    }

    return frente;
  }

  async update(
    id: number,
    obraId: number,
    usuarioId: number,
    updateFrenteDto: UpdateFrenteDto,
  ) {
    await this.findOne(id, obraId, usuarioId);

    return this.prisma.frente.update({
      where: { id },
      data: updateFrenteDto,
    });
  }

  async remove(id: number, obraId: number, usuarioId: number) {
    await this.findOne(id, obraId, usuarioId);

    return this.prisma.frente.update({
      where: { id },
      data: { ativo: false },
    });
  }
}
