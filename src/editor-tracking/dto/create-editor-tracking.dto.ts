import { IsBoolean, IsDateString, IsInt, IsOptional } from 'class-validator';

export class CreateEditorTrackingDto {
  @IsInt()
  caseId: number;

  @IsOptional()
  @IsDateString()
  dateAssigned?: Date;

  @IsOptional()
  @IsInt()
  writerId?: number;

  @IsOptional()
  @IsInt()
  editorId?: number;

  @IsOptional()
  @IsInt()
  editorStatusId?: number;

  @IsOptional()
  @IsBoolean()
  editorPaid?: boolean;

  @IsOptional()
  @IsDateString()
  editorPaidDate?: Date;

  @IsOptional()
  @IsBoolean()
  researcherPaid?: boolean;

  @IsOptional()
  @IsDateString()
  researcherPaidDate?: Date;
}