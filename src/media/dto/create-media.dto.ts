import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Payload for persisting an uploaded file against a case, in the
 * case_activities shape. `userId` is taken from the JWT, never the body.
 */
export class CreateMediaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  caseId: number;

  // The media link/content (e.g. the Drive webViewLink from POST /drive/upload).
  @IsString()
  @IsNotEmpty()
  message: string;

  // Optional category / file type (e.g. 'PNG', 'PDF'). Defaults to 'MEDIA'.
  @IsOptional()
  @IsString()
  type?: string;
}
