import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FrentesService } from './frentes.service';
import { CreateFrenteDto } from './dto/create-frente.dto';
import { UpdateFrenteDto } from './dto/update-frente.dto';

@Controller('obras/:obraId/frentes')
@UseGuards(AuthGuard('jwt'))
export class FrentesController {
  constructor(private readonly frentesService: FrentesService) {}

  @Post()
  create(
    @Request() req,
    @Param('obraId', ParseIntPipe) obraId: number,
    @Body() createFrenteDto: CreateFrenteDto,
  ) {
    return this.frentesService.create(obraId, req.user.id, createFrenteDto);
  }

  @Get()
  findAll(
    @Request() req,
    @Param('obraId', ParseIntPipe) obraId: number,
  ) {
    return this.frentesService.findAll(obraId, req.user.id);
  }

  @Get(':id')
  findOne(
    @Request() req,
    @Param('obraId', ParseIntPipe) obraId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.frentesService.findOne(id, obraId, req.user.id);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('obraId', ParseIntPipe) obraId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFrenteDto: UpdateFrenteDto,
  ) {
    return this.frentesService.update(id, obraId, req.user.id, updateFrenteDto);
  }

  @Delete(':id')
  remove(
    @Request() req,
    @Param('obraId', ParseIntPipe) obraId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.frentesService.remove(id, obraId, req.user.id);
  }
}
