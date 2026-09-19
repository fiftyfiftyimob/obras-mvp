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
import { ObrasService } from './obras.service';
import { CreateObraDto } from './dto/create-obra.dto';
import { UpdateObraDto } from './dto/update-obra.dto';

@Controller('obras')
@UseGuards(AuthGuard('jwt'))
export class ObrasController {
  constructor(private readonly obrasService: ObrasService) {}

  @Post()
  create(@Request() req, @Body() createObraDto: CreateObraDto) {
    return this.obrasService.create(req.user.id, createObraDto);
  }

  @Get()
  findAll(@Request() req) {
    return this.obrasService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.obrasService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateObraDto: UpdateObraDto,
  ) {
    return this.obrasService.update(id, req.user.id, updateObraDto);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.obrasService.remove(id, req.user.id);
  }
}
