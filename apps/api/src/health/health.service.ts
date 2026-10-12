import { Injectable } from '@nestjs/common';
import { appVersion } from '../version.js';

export interface Health {
  status: 'ok';
  version: string;
}

@Injectable()
export class HealthService {
  check(): Health {
    return { status: 'ok', version: appVersion };
  }
}
