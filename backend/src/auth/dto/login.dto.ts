import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  telefone: string;

  @IsString()
  @MinLength(6)
  senha: string;
}
