import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class AppController {
  @Get()
  home(@Res() res: Response) {
   res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome - TechBox</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: linear-gradient(to right, black, grey);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: white;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }

          h1 {
            font-size: 3em;
            margin-bottom: 0.3em;
          }

          p {
            font-size: 1.2em;
            max-width: 600px;
            padding: 0 20px;
          }

          .card {
            background-color: rgba(255, 255, 255, 0.1);
            padding: 2rem 3rem;
            border-radius: 15px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
            backdrop-filter: blur(10px);
          }

          @media (max-width: 600px) {
            h1 {
              font-size: 2em;
            }

            .card {
              padding: 1.5rem 1.5rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Welcome to Code Blue Saas BackEnd</h1>
        </div>
      </body>
      </html>
    `);
  }
}