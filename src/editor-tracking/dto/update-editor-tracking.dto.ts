import { PartialType } from '@nestjs/mapped-types';
import { CreateEditorTrackingDto } from './create-editor-tracking.dto';

export class UpdateEditorTrackingDto extends PartialType(
  CreateEditorTrackingDto,
) {}