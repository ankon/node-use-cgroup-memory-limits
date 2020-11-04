#!/usr/bin/env node

import { spawn } from 'child_process';

import { getSpawnOptions } from './node-options';

const { env, argv } = getSpawnOptions(process.env, process.argv.slice(2));

spawn(process.execPath, argv, {env, stdio: 'inherit'});
