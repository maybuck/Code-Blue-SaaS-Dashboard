import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('signup')
  signup(@Body() body: any) {
    return this.auth.signup(body);
  }

  @Post('login')
  login(@Body() body: any) {
    return this.auth.login(body.email, body.password, body.rememberMe);
  }
}