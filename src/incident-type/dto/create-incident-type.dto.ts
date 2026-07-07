import { IsOptional, IsString } from 'class-validator';

export class CreateIncidentTypeDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}