import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateObraDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  nome: string;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  endereco?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  cidade?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  estado?: string;

  @IsOptional()
  @IsString()
  @Length(2, 150)
  clienteNome?: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  clienteContato?: string;
}
