import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Public read: the Next.js analyze route fetches this server-side (no user
  // token), and the admin panel reads it too. A prompt isn't sensitive.
  @Get('ai-analysis-prompt')
  getAiPrompt() {
    return this.settings.getAiPrompt();
  }

  // Editing is restricted to admins and owners.
  @Patch('ai-analysis-prompt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER', 'Owner')
  setAiPrompt(@Body() body: any, @Request() req: any) {
    return this.settings.setAiPrompt(body?.prompt, req.user?.sub);
  }

  @Delete('ai-analysis-prompt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OWNER', 'Owner')
  resetAiPrompt() {
    return this.settings.resetAiPrompt();
  }
}
