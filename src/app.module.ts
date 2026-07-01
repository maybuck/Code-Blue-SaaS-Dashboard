import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { PermissionsModule } from './permissions/permissions.module';
import { DriveModule } from './drive/drive.module';
import { MediaModule } from './media/media.module';
import { AgenciesModule } from './agencies/agencies.module';
import { StatusesModule } from './statuses/statuses.module';
import { UploadModule } from './uploads/upload.module';
import { CaseMediaModule } from './case-media/case-media.module';
import { EditorTrackingModule } from './editor-tracking/editor-tracking.module';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    CasesModule,
    PermissionsModule,
    DriveModule,
    MediaModule,
    AgenciesModule,
    UploadModule,
    StatusesModule,
    CaseMediaModule,
    EditorTrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
