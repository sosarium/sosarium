import * as compare from '@/plugins/compare';
import * as massImport from '@/plugins/import';
import * as pack from '@/plugins/pack';
import * as sample from '@/plugins/sample';

import type { Plugin } from './types';

export const PLUGINS: Plugin[] = [pack, compare, massImport, sample];
