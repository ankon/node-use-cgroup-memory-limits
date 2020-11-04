#!/usr/bin/env node

import { spawn } from 'child_process';

import { findExtraNodeOptions } from './node-options';
import { isMaxOldSpaceSizeOption } from './utils';

const env = process.env;
const nodeOptions = env.NODE_OPTIONS ?? '';
const hasExplicitMemoryLimitInNodeOptions = nodeOptions
	.split(/\s/)
	.some(isMaxOldSpaceSizeOption);
const argv = process.argv.slice(2);
const hasExplicitMemoryLimitInArgv = argv
	.some(isMaxOldSpaceSizeOption);
if (!hasExplicitMemoryLimitInNodeOptions && !hasExplicitMemoryLimitInArgv) {
	const extraNodeOptions = findExtraNodeOptions();
	argv.push(...extraNodeOptions);
}

spawn(process.execPath, argv, {env, stdio: 'inherit'});
