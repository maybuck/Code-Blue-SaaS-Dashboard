import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCaseMediaDto {
  @IsInt()
  caseId: number;

  @IsInt()
  uploadedById: number;

  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsString()
  mediaType: string;
}s