import { IsInt, IsString } from 'class-validator';

export class CreateCaseMediaDto {
  @IsInt()
  caseId: number;

  @IsInt()
  uploadedById: number;

  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsString()
  mediaType: string;
}