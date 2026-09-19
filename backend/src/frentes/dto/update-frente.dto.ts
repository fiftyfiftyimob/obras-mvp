import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateFrenteDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  nome?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  nivel?: number;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  descricao?: string;
}
