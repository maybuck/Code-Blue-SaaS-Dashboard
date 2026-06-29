import { PartialType } from '@nestjs/mapped-types';
import { CreateCaseMediaDto } from './create-case-media.dto';

export class UpdateCaseMediaDto extends PartialType(CreateCaseMediaDto) {}