import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObraDto } from './dto/create-obra.dto';
import { UpdateObraDto } from './dto/update-obra.dto';

@Injectable()
export class ObrasService {
  constructor(private readonly prisma: PrismaService) {}

  create(usuarioId: number, createObraDto: CreateObraDto) {
    const estado = createObraDto.estado?.toUpperCase();

    return this.prisma.obra.create({
      data: {
        ...createObraDto,
        estado,
        responsavelId: usuarioId,
      },
    });
  }

  findAll(usuarioId: number) {
    return this.prisma.obra.findMany({
      where: {
        responsavelId: usuarioId,
        ativo: true,
      },
      orderBy: {
        criadoEm: 'desc',
      },
    });
  }

  async findOne(id: number, usuarioId: number) {
    const obra = await this.prisma.obra.findFirst({
      where: {
        id,
        responsavelId: usuarioId,
        ativo: true,
      },
    });

    if (!obra) {
      throw new NotFoundException('Obra não encontrada');
    }

    return obra;
  }

  async update(id: number, usuarioId: number, updateObraDto: UpdateObraDto) {
    await this.findOne(id, usuarioId);
    const estado = updateObraDto.estado?.toUpperCase();

    return this.prisma.obra.update({
      where: { id },
      data: {
        ...updateObraDto,
        ...(estado ? { estado } : {}),
      },
    });
  }

  async remove(id: number, usuarioId: number) {
    await this.findOne(id, usuarioId);

    return this.prisma.obra.update({
      where: { id },
      data: { ativo: false },
    });
  }
}
