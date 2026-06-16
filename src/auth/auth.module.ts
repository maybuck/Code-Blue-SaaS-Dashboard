import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy/jwt.strategy';


@Module({
  imports: [
    ConfigModule, // 🔥 IMPORTANT
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    PrismaService,
    JwtStrategy,
  ],
})
export class AuthModule {}