import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AgenciesModule } from './agencies/agencies.module';
import { StatusesModule } from './statuses/statuses.module';
import { UploadModule } from './uploads/upload.module';
import { CaseMediaModule } from './case-media/case-media.module';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    CasesModule,
    PermissionsModule,
    AgenciesModule,
    UploadModule,
    StatusesModule,
    CaseMediaModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
