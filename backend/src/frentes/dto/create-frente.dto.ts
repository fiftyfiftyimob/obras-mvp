import { IsInt, IsNotEmpty, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateFrenteDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  nome: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  nivel?: number;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  descricao?: string;
}
